import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Acceptance tests for Work Order F-4 (B-03) — forfeited and expired value
 * return to the Meal Pool.
 *
 * The card's criteria:
 *   - ₹60 token / ₹50 meal → ₹10 pool ledger entry, revenue ledger UNTOUCHED
 *   - the expiry sweep moves value to pool-pending
 *   - analytics show pool figures
 *
 * These assert against source because the routing is a single branch in each
 * flow, and a branch is exactly the kind of thing that quietly reverts. The
 * arithmetic itself is already covered by the redemption engine's own tests.
 */

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");

describe("F-4 — standard forfeited value goes to the Meal Pool, not revenue", () => {
    const src = read("app/api/vendor/redemptions/route.ts");

    it("routes a standard token's remainder to meal_pool", () => {
        // The card's example: a ₹60 token on a ₹50 meal leaves ₹10, and that ₹10
        // is a donation that has not yet bought a meal — not income to pApAmA.
        expect(src).toMatch(/isSpecialCare \? "special_care_pool" : "meal_pool"/);
    });

    it("no longer posts a redemption remainder to revenue", () => {
        // The specific regression this card fixes.
        expect(src).not.toMatch(/ledger:\s*"revenue"/);
    });

    it("still routes Special Care surplus to its own pool (A-3 preserved)", () => {
        expect(src).toContain("special_care_pool");
        expect(src).toContain('token.token_type === "special_care"');
    });
});

describe("F-4 — expired token value reaches the pool", () => {
    const src = read("app/api/admin/tokens/expire-sweep/route.ts");

    it("posts expired value to meal_pool", () => {
        // Before this card the sweep wrote nothing: status flipped and the money
        // silently ceased to be accounted for anywhere.
        expect(src).toMatch(/ledger:\s*"meal_pool"/);
        expect(src).toContain("postLedgerEntry");
    });

    it("marks the token so a re-run cannot credit the same value twice", () => {
        expect(src).toContain("value_returned_to_pool_at");
        expect(src).toMatch(/if \(token\.value_returned_to_pool_at\) continue;/);
    });

    it("does not throw when one ledger write fails", () => {
        // The token IS expired regardless — that flip already committed. One bad
        // write must not abort the sweep and leave the rest of the batch
        // unprocessed.
        expect(src).toContain("returnFailures");
        expect(src).toMatch(/catch \(e\)/);
    });

    it("reports what was returned, not just what expired", () => {
        expect(src).toContain("returned_to_pool");
        expect(src).toContain("returned_value_inr");
    });

    it("links each pool credit back to its token", () => {
        // Per-token entries rather than one aggregate, so a pool credit is
        // always traceable to the token it came from.
        expect(src).toMatch(/referenceType:\s*"token"/);
        expect(src).toContain("value_returned_ledger_id");
    });
});

describe("F-4 — the ledger knows about both pools", () => {
    const src = read("lib/services/ledger.ts");

    it("declares meal_pool and special_care_pool as ledger streams", () => {
        expect(src).toContain('"meal_pool"');
        expect(src).toContain('"special_care_pool"');
    });

    it("documents that neither pool is revenue", () => {
        // The distinction is the whole card — a comment that says so is what
        // stops the next person "simplifying" it back.
        expect(src).toMatch(/[Nn]either is revenue/);
    });
});

describe("F-4 — analytics report pool figures", () => {
    it("exposes both pool balances", () => {
        const src = read("lib/services/analytics.ts");
        expect(src).toContain("meal_pool_inr");
        expect(src).toContain("special_care_pool_inr");
    });

    it("reads pool balances from the LEDGER, not a recomputation", () => {
        // So the dashboard and the ledger cannot disagree.
        const src = read("lib/services/analytics.ts");
        expect(src).toMatch(/\.in\("ledger", \["meal_pool", "special_care_pool"\]\)/);
    });

    it("coerces numeric strings — Postgres numeric arrives as text", () => {
        const src = read("lib/services/analytics.ts");
        expect(src).toContain("Number(row.amount)");
    });

    it("shows the Meal Pool on the admin dashboard", () => {
        const src = read("app/admin/analytics/page.tsx");
        expect(src).toContain('label="Meal Pool"');
    });
});

describe("F-4 — the vendor-facing wording", () => {
    it('says "Returned to Meal Pool", not "Forfeited"', () => {
        // Nothing is forfeited. The old wording implied the Food Partner or
        // pApAmA kept it, which is now untrue.
        const src = read("app/vendor/scan/page.tsx");
        expect(src).toContain('label: "Returned to Meal Pool"');
        expect(src).not.toMatch(/label: "Forfeited"/);
    });
});
