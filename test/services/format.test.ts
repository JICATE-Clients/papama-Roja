import { describe, expect, it } from "vitest";

import { inr, inrPlain, shortDate, shortDateTime } from "@/lib/format";

/**
 * The display formatters are shared by 18 files across all four consoles, so a
 * regression here is visible on every money figure in the product.
 *
 * The cases that matter are the Indian digit grouping (₹1,25,000 — not the
 * ₹125,000 a default `toLocaleString` would give on an en-US runtime) and the
 * null/NaN guards, because several call sites read straight from query strings
 * and optional API fields.
 */
describe("inr", () => {
    it("groups the Indian way — last three digits, then pairs", () => {
        expect(inr(125000)).toBe("₹1,25,000");
        expect(inr(1000)).toBe("₹1,000");
        expect(inr(100000)).toBe("₹1,00,000");
        expect(inr(10000000)).toBe("₹1,00,00,000");
    });

    it("leaves small amounts alone", () => {
        expect(inr(0)).toBe("₹0");
        expect(inr(50)).toBe("₹50");
        expect(inr(999)).toBe("₹999");
    });

    it("rounds rather than showing paise", () => {
        expect(inr(1234.56)).toBe("₹1,235");
    });

    it("never renders NaN or undefined to the donor", () => {
        expect(inr(null)).toBe("₹0");
        expect(inr(undefined)).toBe("₹0");
        expect(inr(Number.NaN)).toBe("₹0");
        expect(inr(Number.POSITIVE_INFINITY)).toBe("₹0");
    });

    it("keeps negatives signed — credit conversions show as debits", () => {
        expect(inr(-500)).toBe("₹-500");
    });
});

describe("inrPlain", () => {
    it("is inr without the symbol", () => {
        expect(inrPlain(125000)).toBe("1,25,000");
        expect(inrPlain(null)).toBe("0");
    });
});

describe("shortDate", () => {
    it("renders an unambiguous day-month-year", () => {
        expect(shortDate("2026-08-14T09:20:00Z")).toMatch(/^14 Aug 2026$/);
    });

    it("falls back to a dash rather than 'Invalid Date'", () => {
        expect(shortDate(null)).toBe("—");
        expect(shortDate(undefined)).toBe("—");
        expect(shortDate("")).toBe("—");
        expect(shortDate("not-a-date")).toBe("—");
    });
});

describe("shortDateTime", () => {
    it("keeps the clock but drops the seconds", () => {
        const out = shortDateTime("2026-08-14T09:20:00Z");
        expect(out).toContain("14 Aug 2026");
        expect(out).not.toMatch(/:\d\d:\d\d/);
    });

    it("shares the dash fallback", () => {
        expect(shortDateTime(null)).toBe("—");
        expect(shortDateTime("nonsense")).toBe("—");
    });
});
