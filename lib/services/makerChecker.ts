import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Settlement maker-checker controls (F-2 / B-24, CD §D-4).
 *
 * The client's core principle, verbatim:
 *   "No individual user shall have the ability to prepare, independently verify,
 *    approve and release the same Food Partner settlement. Any material change to
 *    a settlement after approval shall automatically invalidate the approval and
 *    require fresh maker-checker authorisation."
 *
 * These are pure decision functions taking a settlement snapshot and an actor,
 * so every control has a failing-path test that does not need a database. The
 * route calls them; the audit trail records the outcome.
 *
 * Segregation was previously only AUDITABLE — the log recorded who acted, but
 * nothing stopped one person doing every step. An audit trail tells you who
 * broke the rule after the money has gone; a check stops them. CD §D-4 asks for
 * system-blocked, so these run before the transition, not after.
 */

type Client = SupabaseClient<never, never, never>;

/** The settlement fields these controls need. */
export interface SettlementSnapshot {
    id: string;
    status: string;
    version: number;
    approved_version: number | null;
    locked_by: string | null;
    approved_by: string | null;
    prepared_by: string | null;
    hold_placed_by: string | null;
    hold_is_material: boolean;
    on_hold: boolean;
}

export interface ControlResult {
    allowed: boolean;
    /** Which lettered CD §D-4 control decided this, for the audit record. */
    control: string;
    reason: string;
}

const OK = (control: string, reason: string): ControlResult => ({
    allowed: true,
    control,
    reason,
});
const DENY = (control: string, reason: string): ControlResult => ({
    allowed: false,
    control,
    reason,
});

/**
 * (a) The approver must not be anyone who prepared or locked the settlement.
 *
 * Compares against BOTH prepared_by and locked_by. Checking only the locker
 * would let the same person prepare it, hand the lock to a colleague, and then
 * approve their own work — segregation defeated by one extra click.
 */
export function canApprove(s: SettlementSnapshot, actorId: string): ControlResult {
    if (s.locked_by && s.locked_by === actorId) {
        return DENY("D-4(a)", "you locked this settlement — a different user must approve it");
    }
    if (s.prepared_by && s.prepared_by === actorId) {
        return DENY("D-4(a)", "you prepared this settlement — a different user must approve it");
    }
    return OK("D-4(a)", "approver is distinct from preparer and locker");
}

/**
 * (a) + (c) Payment release.
 *
 * Two separate reasons to refuse, and both matter:
 *   - the payer must not be the approver (approval and release are distinct
 *     events per CD §D-4, so one person doing both collapses two controls);
 *   - the approval must be for the CURRENT version. An approval recorded against
 *     v1 is not an approval of v2, so a settlement amended after approval is
 *     unpayable until re-approved. This is auto-invalidation expressed as data
 *     rather than as a hope that someone notices.
 */
export function canPay(s: SettlementSnapshot, actorId: string): ControlResult {
    if (s.approved_by && s.approved_by === actorId) {
        return DENY(
            "D-4(a)",
            "you approved this settlement — a different user must release the payment"
        );
    }
    if (s.approved_version == null) {
        return DENY("D-4(c)", "settlement has no recorded approval — it cannot be paid");
    }
    if (s.approved_version !== s.version) {
        return DENY(
            "D-4(c)",
            `settlement was amended after approval (approved v${s.approved_version}, now v${s.version}) — it needs fresh approval`
        );
    }
    return OK("D-4(a)+(c)", "payer is distinct from approver and the approval is current");
}

/**
 * (c) Does this change invalidate an existing approval?
 *
 * Any change to the money or its composition is material. A note or an internal
 * label is not. When in doubt this returns TRUE — over-invalidating costs one
 * re-approval, under-invalidating pays out an amount nobody checked.
 */
export function isMaterialChange(changed: readonly string[]): boolean {
    const IMMATERIAL = new Set(["notes", "hold_note", "updated_at"]);
    return changed.some((field) => !IMMATERIAL.has(field));
}

/**
 * (e) A material hold cannot be released by the person who placed it.
 *
 * The point of a material hold is that someone independent looks again. Letting
 * the placer lift it makes it a self-service pause rather than a control.
 */
export function canReleaseHold(s: SettlementSnapshot, actorId: string): ControlResult {
    if (!s.on_hold) return DENY("D-4(e)", "settlement is not on hold");
    if (s.hold_is_material && s.hold_placed_by === actorId) {
        return DENY(
            "D-4(e)",
            "you placed this material hold — a different user must release it"
        );
    }
    return OK("D-4(e)", "hold may be released by this user");
}

/**
 * (d) Rejecting back to the maker requires a reason.
 *
 * A rejection with no reason gives the maker nothing to act on and leaves no
 * record of why the money was stopped — the reason IS the control.
 */
export function canReject(reason: string | null | undefined): ControlResult {
    if (!reason || !reason.trim()) {
        return DENY("D-4(d)", "a reason is required when returning a settlement to the maker");
    }
    return OK("D-4(d)", "rejection carries a reason");
}

/**
 * (f) The person who changed a Food Partner's bank account may not approve
 * payment to it.
 *
 * Spans two tables, so unlike the others this one reads. The window is deliberately
 * "any approved change still in effect for this vendor", not just the most recent:
 * chaining two changes to launder the requester out of the picture is precisely
 * the attack this prevents.
 *
 * FAILS CLOSED. If the change history cannot be read, payment is refused —
 * money going to the wrong account is not recoverable.
 */
export async function canPayToVendorAccount(
    client: Client,
    vendorId: string,
    actorId: string
): Promise<ControlResult> {
    const { data, error } = await client
        .from("vendor_bank_change_requests")
        .select("id, requested_by, status, effective_from")
        .eq("vendor_id", vendorId)
        .eq("status", "approved");

    if (error) {
        return DENY(
            "D-4(f)",
            "could not verify the Food Partner's bank-account change history — payment blocked"
        );
    }

    const rows = (data ?? []) as { requested_by: string | null }[];
    if (rows.some((r) => r.requested_by === actorId)) {
        return DENY(
            "D-4(f)",
            "you requested a change to this Food Partner's bank account — a different user must release payment to it"
        );
    }
    return OK("D-4(f)", "payer did not introduce this bank account");
}

/**
 * (b) Reopening an approved settlement to amend it.
 *
 * Produces the next version and clears the approval in one step, so there is no
 * window in which a settlement is both amendable and still carrying a valid
 * approval.
 */
export function reopenForAmendment(
    s: SettlementSnapshot,
    reason: string
): {
    version: number;
    approved_by: null;
    approved_version: null;
    approval_invalidated_at: string;
    approval_invalidated_reason: string;
    status: "pending";
} {
    return {
        version: s.version + 1,
        approved_by: null,
        approved_version: null,
        approval_invalidated_at: new Date().toISOString(),
        approval_invalidated_reason: reason,
        status: "pending",
    };
}
