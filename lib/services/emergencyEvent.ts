import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Emergency events: the gate, and closure reconciliation (E-1 / B-26, CD §D-6).
 *
 * Before this, "emergency mode" was a global boolean with no subject. You could
 * tell relaxed limits had been in force, but not WHICH emergency, where, on
 * whose authority, or what was spent on it. CD §D-6 requires a unique Emergency
 * ID carrying all of that, with every emergency donation and token linked to it.
 *
 * That linkage is not reporting garnish. The client's surplus rule — surplus is
 * NOT refunded to donors, but redirected down a defined hierarchy — only works
 * if you can say exactly what came in and what went out for one emergency.
 */

type Client = SupabaseClient;

export type EmergencyStatus = "active" | "closed" | "cancelled";

export interface ActiveEmergency {
    id: string;
    emergency_ref: string;
    title: string;
    ends_at: string;
    scope_state_id: string | null;
    scope_district_id: string | null;
    scope_city: string | null;
}

export interface EmergencyGateResult {
    allowed: boolean;
    emergency: ActiveEmergency | null;
    reason: string;
}

/**
 * May an emergency token be issued right now? (CD §D-6 acceptance criterion:
 * "cannot issue emergency token without an active emergency record".)
 *
 * "Active" means BOTH the status flag and the clock: a row still marked active
 * whose `ends_at` has passed is not an active emergency. Checking only the
 * status would let relaxed limits run indefinitely whenever a closure job was
 * late — exactly the indefinite emergency mode CD §D-6 forbids.
 *
 * FAILS CLOSED. An unreadable emergency table refuses issuance, because the
 * failure this guards against is relaxed verification and waived contributions
 * applied with no authorised emergency behind them.
 */
export async function checkEmergencyGate(
    client: Client,
    emergencyId: string | null | undefined,
    now: Date = new Date()
): Promise<EmergencyGateResult> {
    if (!emergencyId) {
        return {
            allowed: false,
            emergency: null,
            reason: "an emergency token requires an Emergency ID — none was supplied",
        };
    }

    const { data, error } = await client
        .from("emergencies")
        .select("id, emergency_ref, title, status, ends_at, scope_state_id, scope_district_id, scope_city")
        .eq("id", emergencyId)
        .maybeSingle();

    if (error) {
        return {
            allowed: false,
            emergency: null,
            reason: "could not verify the emergency record — issuance blocked",
        };
    }
    if (!data) {
        return { allowed: false, emergency: null, reason: "emergency not found" };
    }

    const row = data as ActiveEmergency & { status: EmergencyStatus };

    if (row.status !== "active") {
        return {
            allowed: false,
            emergency: null,
            reason: `emergency ${row.emergency_ref} is ${row.status}`,
        };
    }

    if (new Date(row.ends_at).getTime() <= now.getTime()) {
        // Status says active, the clock says otherwise. The clock wins.
        return {
            allowed: false,
            emergency: null,
            reason: `emergency ${row.emergency_ref} ended on ${row.ends_at} and must be extended or closed`,
        };
    }

    return {
        allowed: true,
        emergency: row,
        reason: `emergency ${row.emergency_ref} is active`,
    };
}

/** CD §D-6's closure reconciliation figures. */
export interface EmergencyClosureFigures {
    funds_received_inr: number;
    funds_utilised_inr: number;
    funds_committed_inr: number;
    tokens_issued: number;
    tokens_redeemed: number;
    tokens_unused: number;
    surplus_inr: number;
}

/**
 * Compute the closure figures for one emergency from its tagged records.
 *
 * Derived, never hand-entered. A closure record whose numbers someone typed is
 * not a reconciliation — the whole point is that the figures fall out of the
 * tagged donations, tokens and redemptions, so they can be re-derived and
 * checked against the stored record later.
 *
 *   funds_utilised  = value actually redeemed
 *   funds_committed = value issued as tokens but not yet redeemed and not expired
 *   surplus         = received − utilised − committed
 *
 * Surplus can legitimately be negative: an emergency may spend more than it
 * raised, funded from the general pool. That is a real state and is reported as
 * such rather than clamped to zero, which would hide the overspend.
 */
export async function computeEmergencyClosure(
    client: Client,
    emergencyId: string
): Promise<EmergencyClosureFigures> {
    const figures: EmergencyClosureFigures = {
        funds_received_inr: 0,
        funds_utilised_inr: 0,
        funds_committed_inr: 0,
        tokens_issued: 0,
        tokens_redeemed: 0,
        tokens_unused: 0,
        surplus_inr: 0,
    };

    const { data: donationRows, error: donationError } = await client
        .from("donations")
        .select("amount_inr")
        .eq("emergency_id", emergencyId);
    if (donationError) throw new Error(donationError.message);
    for (const d of (donationRows ?? []) as { amount_inr: number | string | null }[]) {
        figures.funds_received_inr += Number(d.amount_inr ?? 0);
    }

    const { data: tokenRows, error: tokenError } = await client
        .from("tokens")
        .select("value_inr, status")
        .eq("emergency_id", emergencyId);
    if (tokenError) throw new Error(tokenError.message);

    for (const t of (tokenRows ?? []) as { value_inr: number | string | null; status: string }[]) {
        const value = Number(t.value_inr ?? 0);
        figures.tokens_issued += 1;

        if (t.status === "redeemed") {
            figures.tokens_redeemed += 1;
            figures.funds_utilised_inr += value;
        } else if (t.status === "expired" || t.status === "cancelled") {
            // Expired emergency tokens are unused value. CD §D-6 keeps them with
            // full attributes for the controlled reissue process, so they are
            // counted as unused rather than quietly written off.
            figures.tokens_unused += 1;
        } else {
            // Live, pooled or distributed: issued but not yet spent. Committed,
            // not surplus — this money is still promised to this emergency.
            figures.tokens_unused += 1;
            figures.funds_committed_inr += value;
        }
    }

    figures.surplus_inr =
        figures.funds_received_inr - figures.funds_utilised_inr - figures.funds_committed_inr;

    return figures;
}

/**
 * Does a stored closure record still reconcile against the live figures?
 *
 * A closure is permanent, but the data behind it can move — a late redemption,
 * a corrected donation. This re-derives and compares so a drifted record is
 * visible rather than silently trusted.
 */
export function closureReconciles(
    stored: Partial<EmergencyClosureFigures>,
    computed: EmergencyClosureFigures,
    toleranceInr = 0
): { reconciles: boolean; differences: string[] } {
    const differences: string[] = [];
    for (const key of Object.keys(computed) as (keyof EmergencyClosureFigures)[]) {
        const storedValue = Number(stored[key] ?? 0);
        const computedValue = computed[key];
        if (Math.abs(storedValue - computedValue) > toleranceInr) {
            differences.push(`${key}: recorded ${storedValue}, computed ${computedValue}`);
        }
    }
    return { reconciles: differences.length === 0, differences };
}
