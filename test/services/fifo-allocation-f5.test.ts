import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { allocatePooledTokens } from "@/lib/volunteer/allocation";

/**
 * Acceptance tests for Work Order F-5 (B-32b) — FIFO allocation honouring
 * geographic scope and token type.
 *
 * The card's criteria:
 *   - two pool tokens, older allocated first
 *   - a scope-restricted older token is SKIPPED for an out-of-scope volunteer
 *     zone, with the skip LOGGED
 *   - donor-controlled tokens never enter the queue ("already structural — add
 *     test")
 *
 * FIFO ordering and the scope predicate live in Postgres (the allocation must be
 * atomic under a row lock), so the ordering itself is asserted against the SQL,
 * and the TypeScript surface — which is what carries the skip count out to the
 * audit log — is tested directly.
 */

const ROOT = join(__dirname, "..", "..");
const SQL = readFileSync(
    join(ROOT, "supabase/migrations/20260907000010_fifo_scope_aware_allocation.sql"),
    "utf-8"
);

/** volunteers lookup, then the RPC. */
function fakeClient(opts: {
    status?: string;
    userId?: string | null;
    rows?: { token_id: string; skipped_count: number | null }[];
    rpcError?: string;
}) {
    const rpc = vi.fn().mockResolvedValue(
        opts.rpcError
            ? { data: null, error: { message: opts.rpcError } }
            : { data: opts.rows ?? [], error: null }
    );
    return {
        client: {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: {
                                user_id: opts.userId === undefined ? "u-1" : opts.userId,
                                status: opts.status ?? "active",
                            },
                            error: null,
                        }),
                    }),
                }),
            }),
            rpc,
        },
        rpc,
    };
}

beforeEach(() => vi.clearAllMocks());

describe("F-5 — FIFO ordering", () => {
    it("claims the OLDEST pool tokens first", () => {
        expect(SQL).toMatch(/order by t\.minted_at asc/);
    });

    it("keeps the concurrent-safe claim (SKIP LOCKED)", () => {
        // Two simultaneous allocations must grab distinct rows rather than
        // fighting over the same oldest token.
        expect(SQL).toMatch(/for update skip locked/);
    });
});

describe("F-5 — geographic scope is honoured", () => {
    it("filters the claim by the scope predicate", () => {
        expect(SQL).toContain("token_scope_allows_volunteer");
    });

    it("PAN_INDIA tokens are allocatable to anyone", () => {
        expect(SQL).toMatch(/when 'PAN_INDIA' then true/);
    });

    it("a NULL volunteer location is NOT a wildcard", () => {
        // Handing over a token that cannot be redeemed in the volunteer's zone
        // consumes their holding cap and then fails at the till.
        expect(SQL).toMatch(/p_district_id is not null and p_district_id = t\.scope_district_id/);
        expect(SQL).toMatch(/p_state_id\s+is not null and p_state_id\s+= t\.scope_state_id/);
    });

    it("an unrecognised scope refuses rather than falls through to allowed", () => {
        expect(SQL).toMatch(/else false/);
    });

    it("distinguishes an empty pool from a scope-blocked pool in the error", () => {
        // Those need completely different fixes: mint more tokens, versus fix
        // this volunteer's district.
        expect(SQL).toMatch(/eligible after geographic scope/);
    });
});

describe("F-5 — donor-controlled tokens never enter the queue", () => {
    it("the claim excludes them explicitly", () => {
        // The card calls this "already structural" because such tokens never
        // reach in_admin_pool. Structural-by-accident is one refactor away from
        // broken, so the predicate states it.
        expect(SQL).toMatch(/t\.distribution_mode = 'PAPAMA_DISTRIBUTED'/);
    });

    it("excludes them from the eligibility counts too", () => {
        // Otherwise the skip count would be inflated by tokens that were never
        // candidates in the first place.
        const occurrences = SQL.match(/t\.distribution_mode = 'PAPAMA_DISTRIBUTED'/g) ?? [];
        expect(occurrences.length).toBeGreaterThanOrEqual(3);
    });
});

describe("F-5 — token type is honoured", () => {
    it("filters by token_type", () => {
        // A Special Care token is issued against a specific need (CD §D-8) and
        // must not be swept up in a general allocation.
        expect(SQL).toMatch(/t\.token_type = p_token_type::public\.token_type/);
    });

    it("defaults a general allocation to standard tokens", () => {
        expect(SQL).toMatch(/p_token_type\s+text default 'standard'/);
    });
});

describe("F-5 — the skip is LOGGED, not silent", () => {
    it("surfaces the skip count from the RPC", async () => {
        const { client } = fakeClient({
            rows: [
                { token_id: "t-1", skipped_count: 3 },
                { token_id: "t-2", skipped_count: 3 },
            ],
        });

        const result = await allocatePooledTokens(
            client as never,
            "vol-1",
            2,
            "admin_to_volunteer"
        );

        expect(result.movedIds).toEqual(["t-1", "t-2"]);
        // A silent skip is indistinguishable from an empty pool.
        expect(result.skippedForScope).toBe(3);
    });

    it("reports zero skipped when nothing was passed over", async () => {
        const { client } = fakeClient({ rows: [{ token_id: "t-1", skipped_count: 0 }] });
        const result = await allocatePooledTokens(
            client as never,
            "vol-1",
            1,
            "admin_to_volunteer"
        );
        expect(result.skippedForScope).toBe(0);
    });

    it("treats a NULL skip count as zero rather than NaN", async () => {
        // Postgres can hand back null; Number(null) is 0 but Number(undefined)
        // is NaN, and a NaN in an audit row is worse than a wrong number.
        const { client } = fakeClient({ rows: [{ token_id: "t-1", skipped_count: null }] });
        const result = await allocatePooledTokens(
            client as never,
            "vol-1",
            1,
            "admin_to_volunteer"
        );
        expect(result.skippedForScope).toBe(0);
    });

    it("handles an empty allocation without throwing on the skip count", async () => {
        const { client } = fakeClient({ rows: [] });
        const result = await allocatePooledTokens(
            client as never,
            "vol-1",
            1,
            "admin_to_volunteer"
        );
        expect(result.movedIds).toEqual([]);
        expect(result.skippedForScope).toBe(0);
    });

    it("passes the token type through to the RPC", async () => {
        const { client, rpc } = fakeClient({ rows: [{ token_id: "t-1", skipped_count: 0 }] });
        await allocatePooledTokens(client as never, "vol-1", 1, "admin_to_volunteer");
        expect(rpc).toHaveBeenCalledWith(
            "allocate_pooled_tokens",
            expect.objectContaining({ p_token_type: "standard" })
        );
    });

    it("surfaces a scope-exhausted pool as a 400, not a 500", async () => {
        const { client } = fakeClient({
            rpcError: "admin pool has fewer than 2 allocatable token(s) for this volunteer",
        });
        await expect(
            allocatePooledTokens(client as never, "vol-1", 2, "admin_to_volunteer")
        ).rejects.toThrow(/allocatable token/);
    });

    it("refuses a non-active volunteer before touching the pool", async () => {
        const { client, rpc } = fakeClient({ status: "suspended" });
        await expect(
            allocatePooledTokens(client as never, "vol-1", 1, "admin_to_volunteer")
        ).rejects.toThrow(/suspended/);
        expect(rpc).not.toHaveBeenCalled();
    });
});

describe("F-5 — both allocation channels log the skip", () => {
    it("the admin-assignment route records skipped_for_scope", () => {
        const src = readFileSync(
            join(ROOT, "app/api/admin/volunteers/[id]/allocate/route.ts"),
            "utf-8"
        );
        expect(src).toContain("skipped_for_scope");
    });

    it("the request-grant route records it too", () => {
        // CD §D-10A covers BOTH channels — without this the §3b path would
        // silently discard the count and only half the criterion would hold.
        const src = readFileSync(
            join(ROOT, "app/api/admin/volunteer-requests/[id]/decide/route.ts"),
            "utf-8"
        );
        expect(src).toContain("skipped_for_scope");
    });

    it("decide_volunteer_request returns the skip count", () => {
        expect(SQL).toMatch(/skipped_for_scope integer/);
    });
});
