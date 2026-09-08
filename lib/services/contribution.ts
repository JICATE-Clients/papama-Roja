import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ₹10 beneficiary contribution — status, waivers, the settlement gate and the
 * report (F-1 / B-01, CD §D-1).
 *
 * The client's four principles, which every function here exists to enforce:
 *   1. The ₹10 is a contribution to pApAmA. It is NOT Food Partner revenue.
 *   2. The Food Partner collects it only as pApAmA's authorised agent.
 *   3. A settlement is released only after the ₹10 is received/reconciled —
 *      unless an authorised waiver was recorded.
 *   4. Waiver recording and reconciliation must exist in Phase 1.
 *
 * The separation matters. CD §D-1's worked example: a ₹50 meal means ₹50 to the
 * Food Partner AND ₹10 to pApAmA — "the two remain completely separate". So the
 * contribution is never netted off a settlement. Deducting it would be less code
 * and would quietly make the partner fund the contribution, which is precisely
 * what principle 1 forbids.
 */

type Client = SupabaseClient<never, never, never>;

export type ContributionStatus = "collected" | "waived" | "outstanding";

/** A settlement line whose contribution is still unresolved. */
export interface OutstandingLine {
    redemption_id: string;
    expected_inr: number;
    redeemed_at: string | null;
}

export interface SettlementGateResult {
    /** True when every line is either reconciled or waived. */
    releasable: boolean;
    /** The lines blocking release — NAMED, per the card's acceptance criterion. */
    outstanding: OutstandingLine[];
    /** Message for the admin attempting the payment. */
    reason: string;
}

/**
 * May this settlement move to `paid`? (CD §D-1 principle 3.)
 *
 * FAILS CLOSED. A settlement whose lines cannot be read is not releasable: the
 * failure mode of guessing wrong is paying a Food Partner for meals whose
 * contributions were never collected, and that money is not recoverable once
 * sent. Refusing to pay is inconvenient; paying wrongly is a loss.
 *
 * Returns the blocking lines rather than a bare boolean because the card
 * requires the admin be told WHICH lines block, not merely that something does.
 */
export async function checkSettlementContributionGate(
    client: Client,
    settlementId: string
): Promise<SettlementGateResult> {
    const { data: lineRows, error: lineError } = await client
        .from("settlement_line_items")
        .select("redemption_id")
        .eq("settlement_id", settlementId);

    if (lineError) {
        return {
            releasable: false,
            outstanding: [],
            reason: "could not read settlement lines — payment blocked",
        };
    }

    const redemptionIds = ((lineRows ?? []) as { redemption_id: string }[]).map(
        (r) => r.redemption_id
    );

    // A settlement with no lines has nothing owed against it. Releasable, and
    // treated separately so an empty list is never mistaken for a read failure.
    if (redemptionIds.length === 0) {
        return { releasable: true, outstanding: [], reason: "no lines to check" };
    }

    const { data: redemptionRows, error: redemptionError } = await client
        .from("token_redemptions")
        .select("id, contribution_status, contribution_expected_inr, redeemed_at")
        .in("id", redemptionIds);

    if (redemptionError) {
        return {
            releasable: false,
            outstanding: [],
            reason: "could not read contribution status — payment blocked",
        };
    }

    const rows = (redemptionRows ?? []) as {
        id: string;
        contribution_status: ContributionStatus;
        contribution_expected_inr: number;
        redeemed_at: string | null;
    }[];

    // A line whose redemption could not be read at all is outstanding by
    // default — silence is not consent when money is leaving.
    const seen = new Set(rows.map((r) => r.id));
    const missing = redemptionIds.filter((id) => !seen.has(id));

    const outstanding: OutstandingLine[] = [
        ...rows
            .filter((r) => r.contribution_status === "outstanding")
            .map((r) => ({
                redemption_id: r.id,
                expected_inr: r.contribution_expected_inr,
                redeemed_at: r.redeemed_at,
            })),
        ...missing.map((id) => ({ redemption_id: id, expected_inr: 0, redeemed_at: null })),
    ];

    if (outstanding.length === 0) {
        return {
            releasable: true,
            outstanding: [],
            reason: "every line is reconciled or waived",
        };
    }

    const total = outstanding.reduce((sum, l) => sum + l.expected_inr, 0);
    return {
        releasable: false,
        outstanding,
        reason:
            `${outstanding.length} ${outstanding.length === 1 ? "line has" : "lines have"} ` +
            `an outstanding beneficiary contribution (₹${total}) — reconcile or waive before paying`,
    };
}

/**
 * What contribution applies to a redemption, given policy.
 *
 * Returns 0 when the policy value is unset. That is deliberate: an unset config
 * must never be guessed at, and charging a beneficiary an invented amount is far
 * worse than charging nothing. It also keeps the settlement gate open rather
 * than blocking every settlement on a config nobody has set yet.
 */
export function resolveExpectedContribution(policyValueInr: number | null): number {
    if (policyValueInr == null || !Number.isFinite(policyValueInr) || policyValueInr <= 0) {
        return 0;
    }
    return Math.floor(policyValueInr);
}

/**
 * Status at redemption time, before any remittance has happened.
 *
 * Nothing expected → 'collected' (settled by definition — it must not sit
 * outstanding and block a settlement forever). Something expected → always
 * 'outstanding', even when the beneficiary handed over the cash: the Food
 * Partner holds it as pApAmA's agent (principle 2) and it is not pApAmA's until
 * remitted AND reconciled. Marking it collected at the counter would release
 * settlements against money pApAmA has not received.
 */
export function initialContributionStatus(expectedInr: number): ContributionStatus {
    return expectedInr > 0 ? "outstanding" : "collected";
}

/** CD §D-1's seven report lines. */
export interface ContributionReport {
    expected: number;
    collected: number;
    remitted: number;
    received_reconciled: number;
    outstanding: number;
    waived: number;
    finally_settled: number;
    period: { from: string | null; to: string | null };
}

/**
 * The contribution report (CD §D-1).
 *
 * `expected` is the sum of what policy said was due. `collected` is what
 * beneficiaries actually handed over (the existing co_pay_inr). Those two differ
 * deliberately: the gap between them is the shortfall, and collapsing them into
 * one figure would hide it.
 */
export async function getContributionReport(
    client: Client,
    period: { from?: string | null; to?: string | null } = {}
): Promise<ContributionReport> {
    const from = period.from ?? null;
    const to = period.to ?? null;

    const report: ContributionReport = {
        expected: 0,
        collected: 0,
        remitted: 0,
        received_reconciled: 0,
        outstanding: 0,
        waived: 0,
        finally_settled: 0,
        period: { from, to },
    };

    let query = client
        .from("token_redemptions")
        .select("contribution_expected_inr, contribution_status, co_pay_inr, redeemed_at");
    if (from) query = query.gte("redeemed_at", from);
    if (to) query = query.lte("redeemed_at", to);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    for (const raw of (data ?? []) as {
        contribution_expected_inr: number | string | null;
        contribution_status: ContributionStatus;
        co_pay_inr: number | string | null;
    }[]) {
        const expected = Number(raw.contribution_expected_inr ?? 0);
        const collected = Number(raw.co_pay_inr ?? 0);

        report.expected += expected;
        report.collected += collected;

        switch (raw.contribution_status) {
            case "waived":
                report.waived += expected;
                break;
            case "outstanding":
                report.outstanding += expected;
                break;
            case "collected":
                report.received_reconciled += expected;
                break;
        }
    }

    // Remitted is what Food Partners have DECLARED; received_reconciled above is
    // what pApAmA has confirmed. They are separate on purpose — a declaration is
    // not a receipt.
    let remittanceQuery = client
        .from("contribution_remittances")
        .select("declared_amount_inr, received_amount_inr, status, period_start");
    if (from) remittanceQuery = remittanceQuery.gte("period_start", from);
    if (to) remittanceQuery = remittanceQuery.lte("period_start", to);

    const { data: remittances, error: remittanceError } = await remittanceQuery;
    if (remittanceError) throw new Error(remittanceError.message);

    for (const r of (remittances ?? []) as {
        declared_amount_inr: number | string | null;
        status: string;
    }[]) {
        report.remitted += Number(r.declared_amount_inr ?? 0);
    }

    // A contribution is finally settled when pApAmA has it, or has formally
    // excused it. Both close the obligation.
    report.finally_settled = report.received_reconciled + report.waived;

    return report;
}
