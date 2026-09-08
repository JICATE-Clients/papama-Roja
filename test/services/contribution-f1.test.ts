import { describe, expect, it, vi } from "vitest";

import {
    checkSettlementContributionGate,
    getContributionReport,
    initialContributionStatus,
    resolveExpectedContribution,
} from "@/lib/services/contribution";

/**
 * Acceptance tests for Work Order F-1 (B-01) — ₹10 beneficiary contribution.
 * Lane 2: the Work Order requires test coverage before merge.
 *
 * The card's criteria:
 *   - redemption with ₹10 collected → status collected
 *   - emergency-waived redemption → waived with authoriser + reason
 *   - settlement containing an outstanding line → pay BLOCKED, lines NAMED
 *   - report totals reconcile
 */

/**
 * A client serving the gate's two reads:
 *   settlement_line_items .select().eq()      → line rows
 *   token_redemptions     .select().in()      → redemption rows
 */
function fakeGateClient(opts: {
    lines?: { redemption_id: string }[];
    lineError?: string;
    redemptions?: {
        id: string;
        contribution_status: string;
        contribution_expected_inr: number;
        redeemed_at: string | null;
    }[];
    redemptionError?: string;
}) {
    return {
        from: vi.fn().mockImplementation((table: string) => {
            if (table === "settlement_line_items") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockResolvedValue(
                            opts.lineError
                                ? { data: null, error: { message: opts.lineError } }
                                : { data: opts.lines ?? [], error: null }
                        ),
                    }),
                };
            }
            return {
                select: vi.fn().mockReturnValue({
                    in: vi.fn().mockResolvedValue(
                        opts.redemptionError
                            ? { data: null, error: { message: opts.redemptionError } }
                            : { data: opts.redemptions ?? [], error: null }
                    ),
                }),
            };
        }),
    };
}

describe("F-1 — settlement-release gate (CD §D-1 principle 3)", () => {
    it("BLOCKS payment when a line's contribution is outstanding, and NAMES it", async () => {
        const gate = await checkSettlementContributionGate(
            fakeGateClient({
                lines: [{ redemption_id: "red-1" }, { redemption_id: "red-2" }],
                redemptions: [
                    {
                        id: "red-1",
                        contribution_status: "collected",
                        contribution_expected_inr: 10,
                        redeemed_at: "2026-09-01T10:00:00Z",
                    },
                    {
                        id: "red-2",
                        contribution_status: "outstanding",
                        contribution_expected_inr: 10,
                        redeemed_at: "2026-09-01T11:00:00Z",
                    },
                ],
            }) as never,
            "settle-1"
        );

        expect(gate.releasable).toBe(false);
        // The admin must be told WHICH line blocks — "something is outstanding"
        // is not actionable.
        expect(gate.outstanding.map((l) => l.redemption_id)).toEqual(["red-2"]);
        expect(gate.reason).toMatch(/outstanding beneficiary contribution/i);
        expect(gate.reason).toContain("₹10");
    });

    it("RELEASES when every line is collected or waived", async () => {
        const gate = await checkSettlementContributionGate(
            fakeGateClient({
                lines: [{ redemption_id: "red-1" }, { redemption_id: "red-2" }],
                redemptions: [
                    {
                        id: "red-1",
                        contribution_status: "collected",
                        contribution_expected_inr: 10,
                        redeemed_at: null,
                    },
                    {
                        id: "red-2",
                        contribution_status: "waived",
                        contribution_expected_inr: 10,
                        redeemed_at: null,
                    },
                ],
            }) as never,
            "settle-1"
        );

        expect(gate.releasable).toBe(true);
        expect(gate.outstanding).toEqual([]);
    });

    it("a waiver alone unblocks a settlement — principle 3's exception", async () => {
        const gate = await checkSettlementContributionGate(
            fakeGateClient({
                lines: [{ redemption_id: "red-1" }],
                redemptions: [
                    {
                        id: "red-1",
                        contribution_status: "waived",
                        contribution_expected_inr: 10,
                        redeemed_at: null,
                    },
                ],
            }) as never,
            "settle-1"
        );
        expect(gate.releasable).toBe(true);
    });

    it("releases a settlement with no lines", async () => {
        const gate = await checkSettlementContributionGate(
            fakeGateClient({ lines: [] }) as never,
            "settle-empty"
        );
        expect(gate.releasable).toBe(true);
        expect(gate.reason).toMatch(/no lines/i);
    });

    it("FAILS CLOSED when the lines cannot be read", async () => {
        // Paying wrongly is unrecoverable; refusing to pay is inconvenient.
        const gate = await checkSettlementContributionGate(
            fakeGateClient({ lineError: "boom" }) as never,
            "settle-1"
        );
        expect(gate.releasable).toBe(false);
        expect(gate.reason).toMatch(/blocked/i);
    });

    it("FAILS CLOSED when contribution status cannot be read", async () => {
        const gate = await checkSettlementContributionGate(
            fakeGateClient({
                lines: [{ redemption_id: "red-1" }],
                redemptionError: "boom",
            }) as never,
            "settle-1"
        );
        expect(gate.releasable).toBe(false);
    });

    it("treats a line whose redemption row is MISSING as outstanding", async () => {
        // Silence is not consent when money is leaving.
        const gate = await checkSettlementContributionGate(
            fakeGateClient({
                lines: [{ redemption_id: "red-1" }, { redemption_id: "ghost" }],
                redemptions: [
                    {
                        id: "red-1",
                        contribution_status: "collected",
                        contribution_expected_inr: 10,
                        redeemed_at: null,
                    },
                ],
            }) as never,
            "settle-1"
        );
        expect(gate.releasable).toBe(false);
        expect(gate.outstanding.map((l) => l.redemption_id)).toContain("ghost");
    });
});

describe("F-1 — expected contribution and initial status", () => {
    it("uses the configured policy value", () => {
        expect(resolveExpectedContribution(10)).toBe(10);
    });

    it("returns 0 when the policy is unset — never invent a charge", () => {
        expect(resolveExpectedContribution(null)).toBe(0);
        expect(resolveExpectedContribution(0)).toBe(0);
        expect(resolveExpectedContribution(Number.NaN)).toBe(0);
    });

    it("starts OUTSTANDING when something is expected, even if paid at the counter", () => {
        // The Food Partner holds it as pApAmA's agent (principle 2). It is not
        // pApAmA's money until remitted AND reconciled — marking it collected at
        // the till would release settlements against money never received.
        expect(initialContributionStatus(10)).toBe("outstanding");
    });

    it("starts COLLECTED when nothing is expected", () => {
        // Otherwise a zero-contribution redemption sits outstanding forever and
        // blocks its settlement permanently.
        expect(initialContributionStatus(0)).toBe("collected");
    });
});

/** `.select()` then optional `.gte().lte()`, per table. */
function fakeReportClient(redemptions: unknown[], remittances: unknown[]) {
    const build = (rows: unknown[]) => ({
        select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({ data: rows, error: null }),
            }),
            then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
        }),
    });
    return {
        from: vi.fn().mockImplementation((table: string) =>
            table === "token_redemptions" ? build(redemptions) : build(remittances)
        ),
    };
}

describe("F-1 — contribution report reconciles", () => {
    it("splits expected across collected / outstanding / waived and totals correctly", async () => {
        const report = await getContributionReport(
            fakeReportClient(
                [
                    { contribution_expected_inr: 10, contribution_status: "collected", co_pay_inr: 10 },
                    { contribution_expected_inr: 10, contribution_status: "collected", co_pay_inr: 10 },
                    { contribution_expected_inr: 10, contribution_status: "outstanding", co_pay_inr: 10 },
                    { contribution_expected_inr: 10, contribution_status: "waived", co_pay_inr: 0 },
                ],
                [{ declared_amount_inr: 20, status: "reconciled" }]
            ) as never,
            { from: "2026-09-01T00:00:00Z", to: "2026-09-30T00:00:00Z" }
        );

        expect(report.expected).toBe(40);
        expect(report.received_reconciled).toBe(20);
        expect(report.outstanding).toBe(10);
        expect(report.waived).toBe(10);
        expect(report.remitted).toBe(20);

        // Every rupee expected is accounted for in exactly one bucket.
        expect(report.received_reconciled + report.outstanding + report.waived).toBe(
            report.expected
        );
        // Settled = pApAmA has it, or has formally excused it.
        expect(report.finally_settled).toBe(30);
    });

    it("keeps expected and collected separate so a shortfall is visible", async () => {
        // Expected ₹10 but the beneficiary gave ₹0: collapsing these into one
        // figure would hide the gap entirely.
        const report = await getContributionReport(
            fakeReportClient(
                [{ contribution_expected_inr: 10, contribution_status: "outstanding", co_pay_inr: 0 }],
                []
            ) as never
        );
        expect(report.expected).toBe(10);
        expect(report.collected).toBe(0);
    });
});
