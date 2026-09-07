import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Common Special Care Pool statement (A-3 / B-28d, CD §D-8).
 *
 * CD §D-8 specifies an eight-line statement. The lines are not free-form
 * reporting choices — they are the client's agreed shape, and the pool must
 * demonstrably balance:
 *
 *     closing = opening + receipts + surplus + contributions - issued - utilised
 *
 * WHERE THE MONEY COMES FROM. The dominant inflow is `surplus`: a Special Care
 * token has a fixed ₹100 face value, so a ₹75 meal leaves ₹25 that is neither
 * revenue nor the Food Partner's. It returns here and funds the next
 * special-care meal.
 *
 * Every figure is derived from `ledger_entries` where ledger = 'special_care_pool'
 * — there is no separate balance column to drift out of step with the entries.
 * The sign convention is the ledger's own: credit positive, debit negative.
 */

type Client = SupabaseClient<never, never, never>;

/** CD §D-8's eight lines, all in whole rupees. */
export interface SpecialCarePoolStatement {
    /** Balance carried in at `from` (everything posted before it). */
    opening: number;
    /** Direct money into the pool — earmarked donations and transfers in. */
    receipts: number;
    /** Face value of Special Care tokens issued against the pool. */
    issued: number;
    /** Value actually consumed as meals. */
    utilised: number;
    /** ₹100 minus meal cost, returned at redemption. The main inflow. */
    surplus: number;
    /** Third-party contributions earmarked for special care. */
    contributions: number;
    /** Deployments out of the pool that are not a token issue. */
    utilisation: number;
    /** opening + inflows − outflows. */
    closing: number;
    period: { from: string | null; to: string | null };
}

/**
 * Which statement line a ledger row belongs to.
 *
 * `reference_type` alone cannot decide this — a 'redemption' row may be surplus
 * coming in or utilisation going out — so the SIGN disambiguates. Anything
 * unrecognised is deliberately funnelled into receipts/utilisation rather than
 * dropped: an unclassified row must still appear in the totals, or the statement
 * silently stops balancing and nobody can tell why.
 */
function classify(referenceType: string, amount: number): keyof SpecialCarePoolStatement | null {
    const inflow = amount > 0;
    switch (referenceType) {
        case "redemption":
            // Positive on a redemption is the ₹100-minus-meal surplus; negative
            // is the meal value actually consumed.
            return inflow ? "surplus" : "utilised";
        case "token":
            // Issuing a token commits face value out of the pool.
            return inflow ? "receipts" : "issued";
        case "donation":
        case "credit_transaction":
            return inflow ? "contributions" : "utilisation";
        default:
            return inflow ? "receipts" : "utilisation";
    }
}

interface LedgerRow {
    amount: number | string;
    reference_type: string;
    created_at: string;
}

/**
 * Build the statement for a period. Omit `from` for all-time (opening is then 0).
 *
 * Amounts are read as numeric and coerced with Number() — Postgres `numeric`
 * arrives as a string over the wire, and summing those with `+` would silently
 * concatenate instead of add.
 */
export async function getSpecialCarePoolStatement(
    client: Client,
    period: { from?: string | null; to?: string | null } = {}
): Promise<SpecialCarePoolStatement> {
    const from = period.from ?? null;
    const to = period.to ?? null;

    const statement: SpecialCarePoolStatement = {
        opening: 0,
        receipts: 0,
        issued: 0,
        utilised: 0,
        surplus: 0,
        contributions: 0,
        utilisation: 0,
        closing: 0,
        period: { from, to },
    };

    // Opening = everything posted strictly before the window starts.
    if (from) {
        const { data: priorRows, error: priorError } = await client
            .from("ledger_entries")
            .select("amount")
            .eq("ledger", "special_care_pool")
            .lt("created_at", from);
        if (priorError) throw new Error(priorError.message);
        statement.opening = ((priorRows ?? []) as { amount: number | string }[]).reduce(
            (sum, r) => sum + Number(r.amount),
            0
        );
    }

    let query = client
        .from("ledger_entries")
        .select("amount, reference_type, created_at")
        .eq("ledger", "special_care_pool");
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    for (const row of (data ?? []) as LedgerRow[]) {
        const amount = Number(row.amount);
        if (!Number.isFinite(amount) || amount === 0) continue;
        const line = classify(row.reference_type, amount);
        if (!line) continue;
        // Outflow lines are reported as positive magnitudes — a statement reads
        // "issued: 500", never "issued: -500".
        (statement[line] as number) += Math.abs(amount);
    }

    statement.closing =
        statement.opening +
        statement.receipts +
        statement.surplus +
        statement.contributions -
        statement.issued -
        statement.utilised -
        statement.utilisation;

    return statement;
}
