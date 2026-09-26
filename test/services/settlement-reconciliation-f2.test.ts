import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildThreeWayReconciliation, type ReconciliationLine } from "@/lib/services/settlementReconciliation";

/**
 * F-2 (g) and (h) — the checker's evidence view and three-way reconciliation
 * (CD §D-4: "platform transaction records / settlement claim / financial &
 * contribution records … with the ₹10 figures visible").
 */

function line(over: Partial<ReconciliationLine> = {}): ReconciliationLine {
    return {
        redemption_id: "red-1",
        amount_inr: 50,
        menu_value_inr: 50,
        contribution_expected_inr: 10,
        contribution_status: "collected",
        waiver_reason: null,
        waiver_authorised_by: null,
        ...over,
    };
}

describe("F-2 (h) — three-way reconciliation", () => {
    it("reconciles when all three sides agree", () => {
        const r = buildThreeWayReconciliation({
            claimedAmountInr: 100,
            headerLineItems: 2,
            lines: [line(), line({ redemption_id: "red-2" })],
        });
        expect(r.matches).toBe(true);
        expect(r.mismatches).toEqual([]);
        expect(r.platform.meal_value_inr).toBe(100);
        expect(r.claim.line_total_inr).toBe(100);
        expect(r.contribution.expected_inr).toBe(20);
        expect(r.contribution.received_inr).toBe(20);
    });

    it("catches a claim that does not match its own lines", () => {
        const r = buildThreeWayReconciliation({
            claimedAmountInr: 500, // claims far more than the lines total
            headerLineItems: 1,
            lines: [line()],
        });
        expect(r.matches).toBe(false);
        expect(r.mismatches.join(" ")).toMatch(/claims ₹500 but its lines total ₹50/);
    });

    it("catches a line count that does not match the lines attached", () => {
        const r = buildThreeWayReconciliation({
            claimedAmountInr: 50,
            headerLineItems: 7,
            lines: [line()],
        });
        expect(r.matches).toBe(false);
        expect(r.mismatches.join(" ")).toMatch(/7 line item\(s\) but 1 are attached/);
    });

    it("catches a line claiming more than the meal was worth", () => {
        const r = buildThreeWayReconciliation({
            claimedAmountInr: 80,
            headerLineItems: 1,
            lines: [line({ amount_inr: 80, menu_value_inr: 50 })],
        });
        expect(r.matches).toBe(false);
        expect(r.mismatches.join(" ")).toMatch(/claim more than the meal value/);
    });

    it("shows CD §D-1's five figures, splitting received, waived and outstanding", () => {
        const r = buildThreeWayReconciliation({
            claimedAmountInr: 150,
            headerLineItems: 3,
            lines: [
                line({ contribution_status: "collected" }),
                line({ redemption_id: "red-2", contribution_status: "waived" }),
                line({ redemption_id: "red-3", contribution_status: "outstanding" }),
            ],
        });
        expect(r.contribution.expected_inr).toBe(30);
        expect(r.contribution.received_inr).toBe(10);
        expect(r.contribution.waived_inr).toBe(10);
        expect(r.contribution.outstanding_inr).toBe(10);
        expect(r.matches).toBe(true); // the figures add up; outstanding is the GATE's job (F-1)
    });

    it("NEVER nets the contribution off the payout — CD §D-1 principle 1", () => {
        // Deducting the ₹10 would quietly make the Food Partner fund pApAmA's
        // contribution. Final payable must equal the meal payout.
        const r = buildThreeWayReconciliation({
            claimedAmountInr: 50,
            headerLineItems: 1,
            lines: [line()],
        });
        expect(r.contribution.final_payable_inr).toBe(50);
    });

    it("does not invent a mismatch out of rupee arithmetic", () => {
        const r = buildThreeWayReconciliation({
            claimedAmountInr: 100.1,
            headerLineItems: 3,
            lines: [
                line({ amount_inr: 33.37, menu_value_inr: 33.37 }),
                line({ redemption_id: "red-2", amount_inr: 33.37, menu_value_inr: 33.37 }),
                line({ redemption_id: "red-3", amount_inr: 33.36, menu_value_inr: 33.36 }),
            ],
        });
        expect(r.matches).toBe(true);
    });

    it("handles a settlement with no lines without crashing", () => {
        const r = buildThreeWayReconciliation({ claimedAmountInr: 0, headerLineItems: 0, lines: [] });
        expect(r.matches).toBe(true);
        expect(r.contribution.final_payable_inr).toBe(0);
    });
});

describe("F-2 (g) — the checker's evidence view carries the contribution columns", () => {
    // Asserted on the source because the criterion is about what the CHECKER can
    // see on the screen they approve from — a service test cannot show that.
    const api = readFileSync("app/api/admin/settlements/[id]/route.ts", "utf8");
    const page = readFileSync("app/admin/settlements/page.tsx", "utf8");

    it("the settlement detail API returns per-line contribution status", () => {
        expect(api).toContain("contribution_status");
        expect(api).toContain("contribution_expected_inr");
    });

    it("the API returns who authorised each waiver, and why", () => {
        expect(api).toContain("contribution_waivers");
        expect(api).toContain("waiver_reason");
        expect(api).toContain("waiver_authorised_by");
    });

    it("the checker's drawer renders the contribution column and the reconciliation", () => {
        expect(page).toContain("Contribution");
        expect(page).toContain("Three-way reconciliation");
        expect(page).toContain("waiver_reason");
    });
});
