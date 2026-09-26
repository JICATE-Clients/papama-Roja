import { defineRoute, NotFoundError } from "@/lib/api/handler";
import type { ContributionStatus } from "@/lib/services/contribution";
import { buildThreeWayReconciliation } from "@/lib/services/settlementReconciliation";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/settlements/[id] — one settlement header + its line items, each
 * resolved to the redemption it pays for (contract §8). Powers the settlement
 * DetailDrawer so an admin can see WHAT a payout is made of — the rolled-up
 * redemptions, the per-line amounts, and the payout math reconciling to the
 * header `amount` — before locking/paying. Gated by `vendor_settlement/read`.
 */
export const GET = defineRoute<{ id: string }>(
    { feature: "vendor_settlement", action: "read" },
    async ({ params }) => {
        const admin = createAdminClient();
        const id = params.id;

        const { data: s, error } = await admin
            .from("vendor_settlements")
            .select(
                "id, vendor_id, period, status, period_start, period_end, amount, line_item_count, settled_at, notes, on_hold, hold_note, created_at"
            )
            .eq("id", id)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!s) throw new NotFoundError("settlement not found");

        const { data: vendor } = await admin
            .from("vendors")
            .select("name")
            .eq("id", s.vendor_id)
            .maybeSingle();

        const { data: lines, error: lineError } = await admin
            .from("settlement_line_items")
            .select("id, redemption_id, amount_inr, created_at")
            .eq("settlement_id", id)
            .order("created_at", { ascending: true });
        if (lineError) throw new Error(lineError.message);

        // Resolve each line's redemption (menu value / difference / co-pay) in one batch.
        const redemptionIds = (lines ?? []).map((l) => l.redemption_id).filter(Boolean) as string[];
        const redemptionById = new Map<string, Record<string, unknown>>();
        if (redemptionIds.length > 0) {
            const { data: reds } = await admin
                .from("token_redemptions")
                .select(
                    "id, token_value_inr, menu_value_inr, difference_paid_inr, co_pay_inr, redeemed_at, " +
                        // F-2 (g): the checker's evidence view must show the ₹10
                        // position per line, not only the meal figures.
                        "contribution_status, contribution_expected_inr"
                )
                .in("id", redemptionIds);
            // A concatenated select string defeats supabase-js's row inference,
            // so the shape is asserted here (same pattern as elsewhere in the repo).
            for (const r of (reds ?? []) as unknown as { id: string }[]) {
                redemptionById.set(r.id, r as unknown as Record<string, unknown>);
            }
        }

        // Waiver evidence per line (F-2 (g)): a waived contribution must show WHO
        // authorised it and WHY, on the same screen the checker approves from.
        const waiverByRedemption = new Map<string, { reason: string; authorised_by: string | null }>();
        if (redemptionIds.length > 0) {
            const { data: waivers } = await admin
                .from("contribution_waivers")
                .select("redemption_id, reason, authorised_by")
                .in("redemption_id", redemptionIds);
            const authorIds = [
                ...new Set(
                    ((waivers ?? []) as { authorised_by: string | null }[])
                        .map((w) => w.authorised_by)
                        .filter(Boolean) as string[]
                ),
            ];
            const authorName = new Map<string, string>();
            if (authorIds.length > 0) {
                const { data: us } = await admin.from("users").select("id, full_name").in("id", authorIds);
                for (const u of (us ?? []) as { id: string; full_name: string | null }[]) {
                    authorName.set(u.id, u.full_name ?? u.id);
                }
            }
            for (const w of (waivers ?? []) as {
                redemption_id: string;
                reason: string;
                authorised_by: string | null;
            }[]) {
                waiverByRedemption.set(w.redemption_id, {
                    reason: w.reason,
                    authorised_by: w.authorised_by ? (authorName.get(w.authorised_by) ?? null) : null,
                });
            }
        }

        const lineRows = (lines ?? []).map((l) => {
            const r = redemptionById.get(l.redemption_id as string) ?? {};
            return {
                line_id: l.id,
                redemption_id: l.redemption_id,
                amount_inr: Number(l.amount_inr),
                redeemed_at: (r.redeemed_at as string) ?? null,
                menu_value_inr: (r.menu_value_inr as number) ?? null,
                difference_paid_inr: (r.difference_paid_inr as number) ?? null,
                co_pay_inr: (r.co_pay_inr as number) ?? null,
                contribution_status: ((r.contribution_status as ContributionStatus) ??
                    "outstanding") as ContributionStatus,
                contribution_expected_inr: Number(r.contribution_expected_inr ?? 0),
                waiver_reason: waiverByRedemption.get(l.redemption_id as string)?.reason ?? null,
                waiver_authorised_by:
                    waiverByRedemption.get(l.redemption_id as string)?.authorised_by ?? null,
            };
        });

        // F-2 (h): three-way reconciliation — platform records vs this claim vs
        // the contribution records, with CD §D-1's five ₹10 figures.
        const reconciliation = buildThreeWayReconciliation({
            claimedAmountInr: Number(s.amount),
            headerLineItems: (s.line_item_count as number) ?? null,
            lines: lineRows,
        });
        const payoutTotal = lineRows.reduce((sum, l) => sum + l.amount_inr, 0);

        return {
            settlement: {
                settlement_id: s.id,
                vendor_id: s.vendor_id,
                vendor_name: vendor?.name ?? null,
                period: s.period,
                amount: Number(s.amount),
                status: s.status,
                on_hold: s.on_hold ?? false,
                hold_note: s.hold_note ?? null,
                line_items: s.line_item_count,
                period_start: s.period_start ?? null,
                period_end: s.period_end ?? null,
                settled_at: s.settled_at,
                created_at: s.created_at,
            },
            lines: lineRows,
            payout_total: payoutTotal,
            reconciliation,
        };
    }
);
