/**
 * Three-way reconciliation for a settlement — F-2 (h), CD §D-4.
 *
 * The client's wording: reconciliation across "platform transaction records /
 * settlement claim / financial & contribution records", with the ₹10 figures
 * visible (expected, received, waived, outstanding, final payable).
 *
 * WHY THREE SIDES AND NOT A TOTAL. A single payable figure cannot be checked.
 * Three independently derived views can: what pApAmA recorded happening at the
 * counter, what the settlement asks to be paid, and what the contribution
 * records say about the ₹10. A checker approves when the three agree, and knows
 * exactly which side is wrong when they do not.
 *
 * Pure — the caller reads the rows. Every figure here is derived from data, none
 * is carried over from the settlement's own claim, because a reconciliation that
 * trusts the thing being reconciled proves nothing.
 */

import type { ContributionStatus } from "@/lib/services/contribution";

export interface ReconciliationLine {
    redemption_id: string | null;
    /** What the settlement asks to pay for this line. */
    amount_inr: number;
    /** What the redemption recorded as the meal's value. */
    menu_value_inr: number | null;
    contribution_expected_inr: number;
    contribution_status: ContributionStatus;
    /** Set only when a waiver record exists for this redemption. */
    waiver_reason: string | null;
    waiver_authorised_by: string | null;
}

export interface ThreeWayReconciliation {
    /** Side 1 — what pApAmA's own transaction records say happened. */
    platform: {
        redemptions: number;
        meal_value_inr: number;
    };
    /** Side 2 — what this settlement claims. */
    claim: {
        line_items: number;
        claimed_amount_inr: number;
        /** Sum of the lines actually attached, which can differ from the header. */
        line_total_inr: number;
    };
    /** Side 3 — the ₹10 contribution position (CD §D-1's five figures). */
    contribution: {
        expected_inr: number;
        received_inr: number;
        waived_inr: number;
        outstanding_inr: number;
        /** What may be released once the gate is satisfied. */
        final_payable_inr: number;
    };
    /** Does it reconcile? Each mismatch names the sides that disagree. */
    matches: boolean;
    mismatches: string[];
}

/**
 * The ₹10 is NEVER netted off the payout (CD §D-1 principle 1: the contribution
 * is pApAmA's, not the partner's, and "the two remain completely separate").
 * So `final_payable_inr` equals the line total — deducting would quietly make
 * the Food Partner fund the contribution.
 */
export function buildThreeWayReconciliation(input: {
    claimedAmountInr: number;
    headerLineItems: number | null;
    lines: readonly ReconciliationLine[];
}): ThreeWayReconciliation {
    const lines = input.lines;

    const lineTotal = round2(lines.reduce((sum, l) => sum + Number(l.amount_inr ?? 0), 0));
    const mealValue = round2(lines.reduce((sum, l) => sum + Number(l.menu_value_inr ?? 0), 0));

    let expected = 0;
    let received = 0;
    let waived = 0;
    let outstanding = 0;
    for (const l of lines) {
        const amt = Number(l.contribution_expected_inr ?? 0);
        expected += amt;
        if (l.contribution_status === "collected") received += amt;
        else if (l.contribution_status === "waived") waived += amt;
        else outstanding += amt;
    }

    const mismatches: string[] = [];
    if (round2(input.claimedAmountInr) !== lineTotal) {
        mismatches.push(
            `the settlement claims ₹${round2(input.claimedAmountInr)} but its lines total ₹${lineTotal}`
        );
    }
    if (input.headerLineItems != null && input.headerLineItems !== lines.length) {
        mismatches.push(
            `the settlement says ${input.headerLineItems} line item(s) but ${lines.length} are attached`
        );
    }
    if (round2(expected) !== round2(received + waived + outstanding)) {
        mismatches.push("the contribution figures do not add up to the expected total");
    }
    // A line paying more than the meal was worth is the shape of an inflated
    // claim, so it is surfaced rather than left for someone to notice.
    const overclaimed = lines.filter(
        (l) => l.menu_value_inr != null && round2(Number(l.amount_inr)) > round2(Number(l.menu_value_inr))
    ).length;
    if (overclaimed > 0) {
        mismatches.push(`${overclaimed} line(s) claim more than the meal value recorded at redemption`);
    }

    return {
        platform: { redemptions: lines.filter((l) => l.redemption_id).length, meal_value_inr: mealValue },
        claim: {
            line_items: input.headerLineItems ?? lines.length,
            claimed_amount_inr: round2(input.claimedAmountInr),
            line_total_inr: lineTotal,
        },
        contribution: {
            expected_inr: round2(expected),
            received_inr: round2(received),
            waived_inr: round2(waived),
            outstanding_inr: round2(outstanding),
            final_payable_inr: lineTotal,
        },
        matches: mismatches.length === 0,
        mismatches,
    };
}

/** Rupee amounts, kept to paise so floating point never invents a mismatch. */
function round2(n: number): number {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
