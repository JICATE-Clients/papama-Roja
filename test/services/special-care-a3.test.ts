import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { getSpecialCarePoolStatement } from "@/lib/services/specialCarePool";

/**
 * Acceptance tests for Work Order A-3 (B-28 c+d) — Special Care category master
 * and Common Special Care Pool.
 *
 * The card's criteria:
 *   - ₹100 token redeemed for a ₹75 meal → ₹25 pool ledger credit, ZERO revenue
 *   - the category master is admin-editable
 *   - `special_care_multiplier` stays config-present but is provably unread by
 *     value logic (the card asks for a comment AND a test — this is the test)
 */

const ROOT = join(__dirname, "..", "..");

/** `.from().select().eq()[.gte().lte()][.lt()]` resolving to `rows`. */
function fakeLedgerClient(rows: unknown[], priorRows: unknown[] = []) {
    return {
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    // Opening-balance branch
                    lt: vi.fn().mockResolvedValue({ data: priorRows, error: null }),
                    // Windowed branch
                    gte: vi.fn().mockReturnValue({
                        lte: vi.fn().mockResolvedValue({ data: rows, error: null }),
                    }),
                    // All-time branch: awaiting the eq() result directly
                    then: (resolve: (v: unknown) => unknown) =>
                        resolve({ data: rows, error: null }),
                }),
            }),
        }),
    };
}

describe("A-3 — the ₹25 surplus goes to the pool, never to revenue", () => {
    it("posts the surplus as a pool credit", async () => {
        // A ₹100 Special Care token spent on a ₹75 meal.
        const statement = await getSpecialCarePoolStatement(
            fakeLedgerClient([
                { amount: 25, reference_type: "redemption", created_at: "2026-09-01T10:00:00Z" },
            ]) as never
        );

        expect(statement.surplus).toBe(25);
        expect(statement.closing).toBe(25);
    });

    it("routes Special Care surplus to special_care_pool and standard to revenue", () => {
        // Asserted against the redemption route's source: the branch is a single
        // conditional and this is what stops it silently reverting to revenue.
        const src = readFileSync(
            join(ROOT, "app/api/vendor/redemptions/route.ts"),
            "utf-8"
        );
        expect(src).toContain('token.token_type === "special_care"');
        expect(src).toMatch(/isSpecialCare \? "special_care_pool" : "revenue"/);
    });
});

describe("A-3 — the eight-line statement balances", () => {
    it("classifies each line and balances closing", async () => {
        const statement = await getSpecialCarePoolStatement(
            fakeLedgerClient(
                [
                    // Surplus in from two redemptions
                    { amount: 25, reference_type: "redemption", created_at: "2026-09-02T00:00:00Z" },
                    { amount: 40, reference_type: "redemption", created_at: "2026-09-03T00:00:00Z" },
                    // A meal consumed out of the pool
                    { amount: -75, reference_type: "redemption", created_at: "2026-09-04T00:00:00Z" },
                    // Tokens issued against the pool
                    { amount: -100, reference_type: "token", created_at: "2026-09-05T00:00:00Z" },
                    // An earmarked contribution in
                    { amount: 500, reference_type: "donation", created_at: "2026-09-06T00:00:00Z" },
                ],
                [{ amount: 1000 }]
            ) as never,
            { from: "2026-09-01T00:00:00Z", to: "2026-09-30T00:00:00Z" }
        );

        expect(statement.opening).toBe(1000);
        expect(statement.surplus).toBe(65);
        expect(statement.utilised).toBe(75);
        expect(statement.issued).toBe(100);
        expect(statement.contributions).toBe(500);

        // closing = opening + receipts + surplus + contributions − issued − utilised − utilisation
        expect(statement.closing).toBe(1000 + 0 + 65 + 500 - 100 - 75 - 0);
        expect(statement.closing).toBe(1390);
    });

    it("reports outflows as positive magnitudes, not negatives", async () => {
        const statement = await getSpecialCarePoolStatement(
            fakeLedgerClient([
                { amount: -100, reference_type: "token", created_at: "2026-09-05T00:00:00Z" },
            ]) as never
        );
        // A statement reads "issued: 100", never "issued: -100".
        expect(statement.issued).toBe(100);
        expect(statement.closing).toBe(-100);
    });

    it("coerces numeric strings — Postgres numeric arrives as text", async () => {
        // Summing "25" + "40" with + would concatenate to "2540".
        const statement = await getSpecialCarePoolStatement(
            fakeLedgerClient([
                { amount: "25", reference_type: "redemption", created_at: "2026-09-02T00:00:00Z" },
                { amount: "40", reference_type: "redemption", created_at: "2026-09-03T00:00:00Z" },
            ]) as never
        );
        expect(statement.surplus).toBe(65);
    });

    it("opens at zero when no period start is given", async () => {
        const statement = await getSpecialCarePoolStatement(fakeLedgerClient([]) as never);
        expect(statement.opening).toBe(0);
        expect(statement.closing).toBe(0);
    });
});

describe("A-3 — special_care_multiplier is provably unread by value logic", () => {
    /**
     * The card requires the multiplier remain config-present but demonstrably
     * dead. Special Care value is the FIXED ₹100 `special_care_token_value`, not
     * a multiple of the standard token. This test is the proof the card asks for
     * — if someone reintroduces a read, it fails.
     */
    const VALUE_LOGIC = [
        "lib/services/redemption.ts",
        "lib/services/token.ts",
        "lib/services/ledger.ts",
        "lib/services/specialCarePool.ts",
        "app/api/vendor/redemptions/route.ts",
    ];

    it.each(VALUE_LOGIC)("%s does not read special_care_multiplier", (file) => {
        const src = readFileSync(join(ROOT, file), "utf-8");
        expect(src).not.toContain("special_care_multiplier");
    });

    it("the key is still declared, so existing reads do not 404", () => {
        const src = readFileSync(join(ROOT, "lib/system-config.ts"), "utf-8");
        expect(src).toContain("special_care_multiplier");
    });
});
