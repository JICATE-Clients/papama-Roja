import { describe, expect, it, vi } from "vitest";

import {
    checkEmergencyGate,
    closureReconciles,
    computeEmergencyClosure,
} from "@/lib/services/emergencyEvent";

/**
 * Acceptance tests for Work Order E-1 (B-26 a,d,e) — emergency event entity,
 * tagging and closure reconciliation.
 *
 * The card's criteria:
 *   - cannot issue an emergency token without an ACTIVE emergency record
 *   - every emergency donation / token / redemption is queryable by Emergency ID
 *   - closure report totals reconcile
 */

const NOW = new Date("2026-09-09T12:00:00.000Z");

function emergencyRow(over: Record<string, unknown> = {}) {
    return {
        id: "em-1",
        emergency_ref: "TN-FLOOD-2026-001",
        title: "Coimbatore floods",
        status: "active",
        ends_at: "2026-09-16T00:00:00.000Z",
        scope_state_id: null,
        scope_district_id: null,
        scope_city: null,
        ...over,
    };
}

/** `.from().select().eq().maybeSingle()` */
function fakeEmergencyClient(row: unknown, error?: string) {
    return {
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue(
                        error ? { data: null, error: { message: error } } : { data: row, error: null }
                    ),
                }),
            }),
        }),
    };
}

describe("E-1 — no emergency token without an active emergency", () => {
    it("REFUSES when no Emergency ID is supplied", async () => {
        const gate = await checkEmergencyGate(fakeEmergencyClient(null) as never, null, NOW);
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toMatch(/requires an Emergency ID/i);
    });

    it("REFUSES when the emergency does not exist", async () => {
        const gate = await checkEmergencyGate(fakeEmergencyClient(null) as never, "em-x", NOW);
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toMatch(/not found/i);
    });

    it("REFUSES a closed emergency", async () => {
        const gate = await checkEmergencyGate(
            fakeEmergencyClient(emergencyRow({ status: "closed" })) as never,
            "em-1",
            NOW
        );
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toMatch(/is closed/i);
    });

    it("REFUSES a cancelled emergency", async () => {
        const gate = await checkEmergencyGate(
            fakeEmergencyClient(emergencyRow({ status: "cancelled" })) as never,
            "em-1",
            NOW
        );
        expect(gate.allowed).toBe(false);
    });

    it("REFUSES a row still flagged active whose end date has passed", async () => {
        // The clock beats the flag. Trusting the flag alone would let relaxed
        // limits run indefinitely whenever a closure job was late — exactly the
        // indefinite emergency mode CD §D-6 forbids.
        const gate = await checkEmergencyGate(
            fakeEmergencyClient(
                emergencyRow({ status: "active", ends_at: "2026-09-01T00:00:00.000Z" })
            ) as never,
            "em-1",
            NOW
        );
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toMatch(/ended on/i);
        expect(gate.reason).toMatch(/extended or closed/i);
    });

    it("FAILS CLOSED when the emergency table cannot be read", async () => {
        const gate = await checkEmergencyGate(
            fakeEmergencyClient(null, "boom") as never,
            "em-1",
            NOW
        );
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toMatch(/blocked/i);
    });

    it("ALLOWS a genuinely active emergency and returns its ref", async () => {
        const gate = await checkEmergencyGate(
            fakeEmergencyClient(emergencyRow()) as never,
            "em-1",
            NOW
        );
        expect(gate.allowed).toBe(true);
        expect(gate.emergency?.emergency_ref).toBe("TN-FLOOD-2026-001");
    });
});

/** donations then tokens, each `.select().eq()`. */
function fakeClosureClient(donations: unknown[], tokens: unknown[]) {
    return {
        from: vi.fn().mockImplementation((table: string) => ({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                    data: table === "donations" ? donations : tokens,
                    error: null,
                }),
            }),
        })),
    };
}

describe("E-1 — closure reconciliation", () => {
    it("computes funds and token counts from the tagged records", async () => {
        const figures = await computeEmergencyClosure(
            fakeClosureClient(
                [{ amount_inr: 10000 }, { amount_inr: 5000 }],
                [
                    { value_inr: 60, status: "redeemed" },
                    { value_inr: 60, status: "redeemed" },
                    { value_inr: 60, status: "in_admin_pool" },
                    { value_inr: 60, status: "expired" },
                ]
            ) as never,
            "em-1"
        );

        expect(figures.funds_received_inr).toBe(15000);
        expect(figures.tokens_issued).toBe(4);
        expect(figures.tokens_redeemed).toBe(2);
        expect(figures.funds_utilised_inr).toBe(120);
        // Pooled but unspent is COMMITTED — still promised to this emergency.
        expect(figures.funds_committed_inr).toBe(60);
        // Expired counts as unused but is not committed: that value is not
        // going to be spent under this emergency.
        expect(figures.tokens_unused).toBe(2);
        expect(figures.surplus_inr).toBe(15000 - 120 - 60);
    });

    it("reports a NEGATIVE surplus rather than hiding an overspend", async () => {
        // An emergency may spend more than it raised, funded from the general
        // pool. Clamping to zero would conceal that.
        const figures = await computeEmergencyClosure(
            fakeClosureClient(
                [{ amount_inr: 100 }],
                [
                    { value_inr: 60, status: "redeemed" },
                    { value_inr: 60, status: "redeemed" },
                ]
            ) as never,
            "em-1"
        );
        expect(figures.surplus_inr).toBe(-20);
    });

    it("coerces numeric strings — Postgres numeric arrives as text", async () => {
        const figures = await computeEmergencyClosure(
            fakeClosureClient([{ amount_inr: "5000" }], [{ value_inr: "60", status: "redeemed" }]) as never,
            "em-1"
        );
        expect(figures.funds_received_inr).toBe(5000);
        expect(figures.funds_utilised_inr).toBe(60);
    });

    it("handles an emergency with nothing tagged to it", async () => {
        const figures = await computeEmergencyClosure(fakeClosureClient([], []) as never, "em-1");
        expect(figures.tokens_issued).toBe(0);
        expect(figures.surplus_inr).toBe(0);
    });
});

describe("E-1 — a stored closure is checkable against live data", () => {
    const computed = {
        funds_received_inr: 15000,
        funds_utilised_inr: 120,
        funds_committed_inr: 60,
        tokens_issued: 4,
        tokens_redeemed: 2,
        tokens_unused: 2,
        surplus_inr: 14820,
    };

    it("reconciles when the record matches", () => {
        expect(closureReconciles(computed, computed).reconciles).toBe(true);
    });

    it("names what drifted", () => {
        // A closure is permanent, but the data behind it can move — a late
        // redemption, a corrected donation. Drift must be visible, not trusted.
        const stored = { ...computed, tokens_redeemed: 1, funds_utilised_inr: 60 };
        const result = closureReconciles(stored, computed);
        expect(result.reconciles).toBe(false);
        expect(result.differences.join(" ")).toMatch(/tokens_redeemed: recorded 1, computed 2/);
        expect(result.differences.join(" ")).toMatch(/funds_utilised_inr/);
    });

    it("treats a missing stored field as zero rather than passing it", () => {
        const result = closureReconciles({}, computed);
        expect(result.reconciles).toBe(false);
        expect(result.differences.length).toBeGreaterThan(0);
    });

    it("honours a tolerance for rounding", () => {
        const stored = { ...computed, surplus_inr: 14819.5 };
        expect(closureReconciles(stored, computed, 1).reconciles).toBe(true);
        expect(closureReconciles(stored, computed, 0).reconciles).toBe(false);
    });
});
