import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { ForbiddenError, userHasCapability } from "@/lib/permissions";
import { checkSettlementContributionGate } from "@/lib/services/contribution";
import { postLedgerEntry } from "@/lib/services/ledger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SettlementStatus } from "@/lib/types/enums";
import {
    settlementActionRequestSchema,
    type SettlementResponse,
} from "@/lib/validation/schemas";

/**
 * GET /api/admin/settlements — vendor settlement headers (contract §8).
 *
 * Gated by `vendor_settlement/read` (admin, compliance, vendor_manager). These
 * are HEADER-ONLY records (M10): `amount`/`line_items` stay 0 until the
 * settlement_line_items work lands (Section-A-blocked). `amount` is numeric in
 * the DB, returned as a JS number. Newest period first.
 */
export const GET = defineRoute({ feature: "vendor_settlement", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("vendor_settlements")
        .select("id, vendor_id, period, amount, status, on_hold, line_item_count, settled_at, created_at")
        .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    // Resolve vendor names in one batch so the admin table shows a readable name
    // instead of a raw UUID.
    const vendorIds = [...new Set((data ?? []).map((s) => s.vendor_id as string))];
    const nameByVendor = new Map<string, string>();
    if (vendorIds.length > 0) {
        const { data: vendorRows } = await supabase
            .from("vendors")
            .select("id, name")
            .in("id", vendorIds);
        for (const v of (vendorRows ?? []) as { id: string; name: string }[]) {
            nameByVendor.set(v.id, v.name);
        }
    }

    const settlements: SettlementResponse[] = (data ?? []).map((s) => ({
        settlement_id: s.id,
        vendor_id: s.vendor_id,
        vendor_name: nameByVendor.get(s.vendor_id as string) ?? null,
        period: s.period,
        amount: Number(s.amount),
        status: s.status,
        on_hold: s.on_hold ?? false,
        line_items: s.line_item_count,
        settled_at: s.settled_at,
    }));

    return { settlements, total: settlements.length };
});

/**
 * PATCH /api/admin/settlements — admin settlement lifecycle (contract §8, spec
 * §3.1 F-2 [M2-4] approval step).
 *
 * Gated by `vendor_settlement/read` at the route level (both admin and
 * compliance hold `read:"all"`) — the real authorization is enforced per
 * action below via capability checks, because compliance's matrix cell has
 * `update:"none"` (only `caps:["approve"]`). Lifecycle: lock → approve →
 * reconcile → pay; `unlock` is the override returning a locked row to
 * pending. `pay` stamps `settled_at`. Illegal transition → 400, missing →
 * 404. Audited.
 */
type SettlementActionRule = {
    to: SettlementStatus;
    from: ReadonlyArray<SettlementStatus>;
    verb: string;
    stampsSettledAt?: boolean;
};

const SETTLEMENT_ACTION_RULES: Record<string, SettlementActionRule> = {
    lock: { to: "locked", from: ["pending"], verb: "settlement.lock" },
    unlock: { to: "pending", from: ["locked"], verb: "settlement.unlock" },
    approve: { to: "approved", from: ["locked"], verb: "settlement.approve" },
    reconcile: { to: "reconciled", from: ["approved"], verb: "settlement.reconcile" },
    pay: { to: "paid", from: ["reconciled"], verb: "settlement.pay", stampsSettledAt: true },
};

export const PATCH = defineRoute(
    { feature: "vendor_settlement", action: "read" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, settlementActionRequestSchema);

        // `approve` is compliance's capability (spec §6: "R + Approve"); admin's
        // `override` capability covers every other lifecycle/hold action. Neither
        // role gets a blanket pass — each action is checked explicitly.
        const isAdminOverride = userHasCapability(user, "vendor_settlement", "override");
        if (body.action === "approve") {
            const canApprove =
                isAdminOverride || userHasCapability(user, "vendor_settlement", "approve");
            if (!canApprove) {
                throw new ForbiddenError(`role '${user.role}' cannot approve settlements`);
            }
        } else if (!isAdminOverride) {
            throw new ForbiddenError(`role '${user.role}' cannot ${body.action} settlements`);
        }

        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("vendor_settlements")
            .select("id, status, on_hold, amount")
            .eq("id", body.settlement_id)
            .single();

        if (fetchError || !data) throw new NotFoundError("settlement not found");
        const settlement = data as {
            id: string;
            status: SettlementStatus;
            on_hold: boolean;
            amount: number;
        };
        const nowIso = new Date().toISOString();

        // HOLD / RELEASE — admin override (owner §4.8). Orthogonal to the lifecycle:
        // toggles on_hold without changing status. Hold is allowed on any non-paid
        // settlement; release lifts an existing hold.
        if (body.action === "hold" || body.action === "release") {
            if (body.action === "hold" && settlement.status === "paid") {
                throw new BadRequestError("cannot hold a settlement that is already paid");
            }
            const onHold = body.action === "hold";
            const { error: holdError } = await admin
                .from("vendor_settlements")
                .update({ on_hold: onHold, hold_note: body.note ?? null, updated_at: nowIso })
                .eq("id", body.settlement_id);
            if (holdError) throw new Error(holdError.message);

            await audit({
                action: `settlement.${body.action}`,
                entity_table: "vendor_settlements",
                entity_id: body.settlement_id,
                summary: `settlement ${onHold ? "held" : "released"}${body.note ? ` (${body.note})` : ""}`,
                metadata: { on_hold: onHold, status: settlement.status, note: body.note ?? null },
            });

            return { ok: true, id: body.settlement_id, status: settlement.status, on_hold: onHold };
        }

        // LIFECYCLE — lock / unlock / reconcile / pay (status transitions).
        const rule = SETTLEMENT_ACTION_RULES[body.action];
        if (!rule.from.includes(settlement.status)) {
            throw new BadRequestError(
                `cannot '${body.action}' a settlement whose status is '${settlement.status}'`
            );
        }
        // A held settlement cannot be paid until released (the override's whole point).
        if (body.action === "pay" && settlement.on_hold) {
            throw new BadRequestError("settlement is on hold — release it before paying");
        }

        // CONTRIBUTION GATE (F-1 / B-01, CD §D-1 principle 3): a Food Partner's
        // meal settlement is released only after the ₹10 beneficiary contribution
        // has been received/reconciled, unless an authorised waiver was recorded.
        //
        // The Food Partner collects that ₹10 as pApAmA's agent, so paying them in
        // full while the contribution is still outstanding hands over the meal
        // value AND leaves pApAmA chasing money the partner already holds. The
        // gate names the blocking lines rather than refusing opaquely — an admin
        // cannot fix "something is outstanding".
        if (body.action === "pay") {
            const gate = await checkSettlementContributionGate(admin as never, body.settlement_id);
            if (!gate.releasable) {
                const named = gate.outstanding
                    .slice(0, 10)
                    .map((l) => l.redemption_id)
                    .join(", ");
                const more =
                    gate.outstanding.length > 10
                        ? ` (+${gate.outstanding.length - 10} more)`
                        : "";
                throw new BadRequestError(
                    `${gate.reason}${named ? `: ${named}${more}` : ""}`
                );
            }
        }

        const update: Record<string, unknown> = { status: rule.to, updated_at: nowIso };
        if (rule.stampsSettledAt) update.settled_at = nowIso;

        const { error: updateError } = await admin
            .from("vendor_settlements")
            .update(update)
            .eq("id", body.settlement_id);

        if (updateError) throw new Error(updateError.message);

        // Triple-ledger financial trail (addon #18): paying a settlement clears
        // the platform's payable to this vendor — post the debit. Best-effort:
        // a ledger-posting failure must never undo the payout itself.
        if (body.action === "pay") {
            try {
                await postLedgerEntry({
                    admin,
                    ledger: "vendor_payable",
                    amountInr: -Number(settlement.amount),
                    referenceType: "settlement",
                    referenceId: body.settlement_id,
                    description: `settlement paid (${body.settlement_id})`,
                });
            } catch (e) {
                console.error("[settlements] ledger posting failed:", e);
            }
        }

        await audit({
            action: rule.verb,
            entity_table: "vendor_settlements",
            entity_id: body.settlement_id,
            summary: `settlement: ${settlement.status} → ${rule.to}${
                body.note ? ` (${body.note})` : ""
            }`,
            metadata: { from: settlement.status, to: rule.to, note: body.note ?? null },
        });

        return { ok: true, id: body.settlement_id, status: rule.to };
    }
);
