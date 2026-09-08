import { describe, expect, it, vi } from "vitest";

import {
    drawSample,
    flagException,
    recordAuditSelection,
    resolveSampleSize,
    tierForRiskStatus,
} from "@/lib/services/riskAudit";

/**
 * Acceptance tests for Work Order F-3 (B-25) — risk-based audit framework.
 *
 * The card's criteria:
 *   - a cycle with 3 settlements selects ≥ 1
 *   - an admin cannot delete a selection row
 *   - a reissue transaction auto-appears in the exception queue
 *   - audit records are immutable
 *
 * CD §D-5's principle: "10% random audit is the baseline, not the ceiling."
 */

describe("F-3 — minimum one settlement per cycle", () => {
    it("a cycle of 3 at 10% selects 1, not 0", () => {
        // THE card's headline criterion. 10% of 3 rounds to zero, so a small
        // pilot would audit nothing at all while appearing to have a policy.
        expect(resolveSampleSize({ populationCount: 3, rate: 0.1 })).toBe(1);
    });

    it("still selects 1 when the rate is unset", () => {
        // The floor is a policy commitment in its own right — a missing config
        // must not silently switch auditing off.
        expect(resolveSampleSize({ populationCount: 3, rate: null })).toBe(1);
    });

    it("still selects 1 when the rate is zero", () => {
        expect(resolveSampleSize({ populationCount: 5, rate: 0 })).toBe(1);
    });

    it("selects nothing from an empty population", () => {
        // A floor of one cannot conjure a settlement that does not exist.
        expect(resolveSampleSize({ populationCount: 0, rate: 0.1 })).toBe(0);
    });

    it("rounds UP rather than to nearest", () => {
        // 10% of 15 is 1.5. Auditing 1 of 15 under-delivers on a 10% commitment.
        expect(resolveSampleSize({ populationCount: 15, rate: 0.1 })).toBe(2);
    });

    it("applies the baseline at scale", () => {
        expect(resolveSampleSize({ populationCount: 100, rate: 0.1 })).toBe(10);
    });

    it("never exceeds the population", () => {
        expect(resolveSampleSize({ populationCount: 4, rate: 5 })).toBe(4);
    });
});

describe("F-3 — risk tiers (10% is the baseline, not the ceiling)", () => {
    it("high risk means 100% review", () => {
        expect(tierForRiskStatus("high")).toBe("full");
        expect(resolveSampleSize({ populationCount: 20, rate: 0.1, tier: "full" })).toBe(20);
    });

    it("medium risk means enhanced review, well above the baseline", () => {
        expect(tierForRiskStatus("medium")).toBe("enhanced");
        expect(resolveSampleSize({ populationCount: 20, rate: 0.1, tier: "enhanced" })).toBe(10);
    });

    it("low and normal sit at the baseline", () => {
        expect(tierForRiskStatus("normal")).toBe("normal");
        expect(tierForRiskStatus("low")).toBe("normal");
        expect(resolveSampleSize({ populationCount: 20, rate: 0.1, tier: "normal" })).toBe(2);
    });
});

describe("F-3 — sampling draws without replacement", () => {
    it("returns exactly the requested count, all distinct", () => {
        const population = Array.from({ length: 50 }, (_, i) => `s-${i}`);
        const sample = drawSample(population, 10);
        expect(sample).toHaveLength(10);
        expect(new Set(sample).size).toBe(10);
    });

    it("never returns more than the population holds", () => {
        expect(drawSample(["a", "b"], 10)).toHaveLength(2);
    });

    it("does not mutate the population it was given", () => {
        const population = ["a", "b", "c"];
        drawSample(population, 2);
        expect(population).toEqual(["a", "b", "c"]);
    });
});

/** insert().select().single() for the selection header, insert() for items. */
function fakeSelectionClient(opts: { selectionId?: string; headerError?: string } = {}) {
    const itemInsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
        from: vi.fn().mockImplementation((table: string) => {
            if (table === "settlement_audit_selections") {
                return {
                    insert: vi.fn().mockReturnValue({
                        select: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue(
                                opts.headerError
                                    ? { data: null, error: { message: opts.headerError } }
                                    : { data: { id: opts.selectionId ?? "sel-1" }, error: null }
                            ),
                        }),
                    }),
                };
            }
            return { insert: itemInsert };
        }),
    };
    return { client, itemInsert };
}

describe("F-3 — the permanent selection record", () => {
    it("records population, sample size and rate so the draw is provable", async () => {
        const { client } = fakeSelectionClient();
        const result = await recordAuditSelection(client as never, {
            cycleRef: "2026-09-CYCLE-1",
            populationIds: ["s-1", "s-2", "s-3"],
            rate: 0.1,
        });

        expect(result.selectionId).toBe("sel-1");
        expect(result.populationCount).toBe(3);
        // The minimum-one rule, end to end.
        expect(result.selected).toHaveLength(1);
    });

    it("writes the selected settlements as linked items", async () => {
        const { client, itemInsert } = fakeSelectionClient();
        await recordAuditSelection(client as never, {
            cycleRef: "2026-09-CYCLE-1",
            populationIds: ["s-1", "s-2", "s-3", "s-4", "s-5"],
            rate: 0.5,
        });
        expect(itemInsert).toHaveBeenCalledTimes(1);
        const rows = itemInsert.mock.calls[0][0] as { selection_id: string }[];
        expect(rows).toHaveLength(3); // ceil(5 * 0.5)
        expect(rows.every((r) => r.selection_id === "sel-1")).toBe(true);
    });

    it("reports a header failure instead of silently auditing nothing", async () => {
        const { client } = fakeSelectionClient({ headerError: "boom" });
        const result = await recordAuditSelection(client as never, {
            cycleRef: "c1",
            populationIds: ["s-1"],
            rate: 0.1,
        });
        expect(result.selectionId).toBeNull();
        expect(result.error).toBe("boom");
    });
});

/** insert() resolving to a supabase-shaped result. */
function fakeQueueClient(error?: { message: string; code?: string }) {
    const insert = vi.fn().mockResolvedValue({ error: error ?? null });
    return { client: { from: vi.fn().mockReturnValue({ insert }) }, insert };
}

describe("F-3 — exception queue", () => {
    it("queues a token reissue with its entity reference", async () => {
        const { client, insert } = fakeQueueClient();
        const result = await flagException(client as never, {
            exceptionType: "token_reissue",
            entityTable: "tokens",
            entityId: "tok-new",
            detail: "replaced tok-old",
        });

        expect(result.queued).toBe(true);
        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({
                exception_type: "token_reissue",
                entity_table: "tokens",
                entity_id: "tok-new",
            })
        );
    });

    it("treats an already-queued duplicate as a no-op, not a failure", async () => {
        // A retried write must not inflate the queue or the statistics from it.
        const { client } = fakeQueueClient({ message: "duplicate key", code: "23505" });
        const result = await flagException(client as never, {
            exceptionType: "token_reissue",
            entityTable: "tokens",
            entityId: "tok-new",
        });
        expect(result.queued).toBe(false);
        expect(result.reason).toBe("already queued");
    });

    it("NEVER THROWS when the insert fails", async () => {
        // Called mid-flow from a reissue or bank change: failing to queue must
        // not roll back an otherwise valid operation.
        const { client } = fakeQueueClient({ message: "db down" });
        await expect(
            flagException(client as never, {
                exceptionType: "bank_account_change",
                entityTable: "vendors",
                entityId: "v-1",
            })
        ).resolves.toEqual({ queued: false, reason: "db down" });
    });

    it("NEVER THROWS when the client itself blows up", async () => {
        const exploding = {
            from: vi.fn().mockImplementation(() => {
                throw new Error("connection lost");
            }),
        };
        await expect(
            flagException(exploding as never, {
                exceptionType: "reversal",
                entityTable: "settlements",
                entityId: "s-1",
            })
        ).resolves.toMatchObject({ queued: false });
    });

    it("carries emergency_id so E-3 can filter the queue by emergency", async () => {
        const { client, insert } = fakeQueueClient();
        await flagException(client as never, {
            exceptionType: "emergency_pattern",
            entityTable: "token_redemptions",
            entityId: "r-1",
            emergencyId: "em-1",
        });
        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({ emergency_id: "em-1" })
        );
    });
});
