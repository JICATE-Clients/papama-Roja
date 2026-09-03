import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, type AppUser } from "@/lib/auth";

/**
 * Tests for the campaigns page's API surface.
 *
 * Two things are worth pinning beyond the usual guard checks:
 *   - Raised totals are SUMMED FROM `donations`, and only from completed ones.
 *     `campaigns.raised_tokens` is a dead counter (its only writer is dead code
 *     targeting the pre-rename `token_types` table), so reading it would report
 *     a permanent zero dressed up as a real figure.
 *   - `category` is now an enum matching the m14 CHECK constraint. It used to be
 *     `z.string().max(50)`, so a bad value passed Zod and died in Postgres as a
 *     500 — including the `"emergency"` the route's own comment recommended.
 *
 * REAL: defineRoute, the matrix, the Zod schemas. MOCKED: auth, both clients,
 * audit.
 */

vi.mock("@/lib/auth", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/auth")>();
    return { ...actual, requireAppUser: vi.fn() };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/services/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import { requireAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET, PATCH, POST } from "@/app/api/admin/campaigns/route";

const requireAppUserMock = vi.mocked(requireAppUser);
const createClientMock = vi.mocked(createClient);
const createAdminClientMock = vi.mocked(createAdminClient);

function makeUser(role: AppUser["role"]): AppUser {
    return { id: "00000000-0000-0000-0000-000000000001", email: "u@papama.test", role, donor_id: null };
}

const CAMPAIGN = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Flood shelter meals",
    description: "",
    organization_name: "Cuddalore Relief Trust",
    category: "Disaster Relief",
    location: "Cuddalore",
    target_tokens: 500,
    token_price_inr: 50,
    status: "active",
    created_at: "2026-08-01T10:00:00.000Z",
};

/**
 * Session-client double keyed by table. `donations` honours `.eq("status", …)`
 * so the "only completed donations count" assertion is a real filter, not a
 * fixture that happens to hold only completed rows.
 */
function fakeClient(tables: Record<string, Record<string, unknown>[]>) {
    const captured: { table?: string; payload?: Record<string, unknown> } = {};

    const from = vi.fn((table: string) => {
        let rows = [...(tables[table] ?? [])];
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
            select: vi.fn(() => chain),
            eq: vi.fn((col: string, val: unknown) => {
                rows = rows.filter((r) => r[col] === val);
                return chain;
            }),
            in: vi.fn((col: string, vals: unknown[]) => {
                rows = rows.filter((r) => vals.includes(r[col]));
                return chain;
            }),
            order: vi.fn(() => chain),
            limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
            maybeSingle: vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error: null })),
            update: vi.fn((payload: Record<string, unknown>) => {
                captured.table = table;
                captured.payload = payload;
                return { eq: vi.fn(() => Promise.resolve({ error: null })) };
            }),
            insert: vi.fn((payload: Record<string, unknown>) => {
                captured.table = table;
                captured.payload = payload;
                return {
                    select: vi.fn(() => ({
                        single: vi.fn(() =>
                            Promise.resolve({ data: { id: "new-campaign" }, error: null })
                        ),
                    })),
                };
            }),
            then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
        });
        return chain;
    });

    return { client: { from } as never, captured };
}

const get = () => new NextRequest("http://localhost/api/admin/campaigns");
const body = (method: "POST" | "PATCH", payload: Record<string, unknown>) =>
    new NextRequest("http://localhost/api/admin/campaigns", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
    });

describe("GET /api/admin/campaigns", () => {
    beforeEach(() => vi.clearAllMocks());

    it("sums raised totals from completed donations only", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client } = fakeClient({
            campaigns: [CAMPAIGN],
            donations: [
                { campaign_id: CAMPAIGN.id, amount_inr: 1000, token_amount: 20, status: "completed" },
                { campaign_id: CAMPAIGN.id, amount_inr: 500, token_amount: 10, status: "completed" },
                // Neither of these has been paid, so neither counts.
                { campaign_id: CAMPAIGN.id, amount_inr: 9999, token_amount: 99, status: "pending" },
                { campaign_id: CAMPAIGN.id, amount_inr: 8888, token_amount: 88, status: "failed" },
            ],
        });
        createClientMock.mockResolvedValue(client);

        const res = await GET(get());
        const b = await res.json();

        expect(res.status).toBe(200);
        expect(b.campaigns[0]).toMatchObject({
            id: CAMPAIGN.id,
            raised_inr: 1500,
            raised_tokens: 30,
            donation_count: 2,
        });
        expect(b.attributed_donations).toBe(2);
    });

    it("reports zero attribution when no donation carries a campaign", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("compliance"));
        const { client } = fakeClient({
            campaigns: [CAMPAIGN],
            donations: [
                { campaign_id: null, amount_inr: 1000, token_amount: 20, status: "completed" },
            ],
        });
        createClientMock.mockResolvedValue(client);

        const res = await GET(get());
        const b = await res.json();

        // The live donate flow never sets campaign_id — this is today's real
        // shape, and the page keys its warning off attributed_donations.
        expect(b.attributed_donations).toBe(0);
        expect(b.campaigns[0].raised_inr).toBe(0);
    });

    it("returns 403 for a donor", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("donor"));

        const res = await GET(get());

        expect(res.status).toBe(403);
    });
});

describe("POST /api/admin/campaigns", () => {
    beforeEach(() => vi.clearAllMocks());

    it("creates a campaign in an allowed category", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client, captured } = fakeClient({ campaigns: [] });
        createClientMock.mockResolvedValue(client);

        const res = await POST(
            body("POST", {
                title: "Flood shelter meals",
                organization_name: "Cuddalore Relief Trust",
                category: "Disaster Relief",
                token_price_inr: 50,
                target_tokens: 500,
            })
        );

        expect(res.status).toBe(200);
        expect(captured.payload).toMatchObject({
            category: "Disaster Relief",
            target_tokens: 500,
            token_price_inr: 50,
        });
    });

    it("rejects a category the table's CHECK constraint would refuse", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client, captured } = fakeClient({ campaigns: [] });
        createClientMock.mockResolvedValue(client);

        // The route's own comment used to recommend exactly this value.
        const res = await POST(
            body("POST", {
                title: "Cyclone appeal",
                organization_name: "Relief Trust",
                category: "emergency",
                token_price_inr: 50,
            })
        );

        expect(res.status).toBe(400);
        expect(captured.payload).toBeUndefined();
    });

    it("returns 403 for compliance (read-only on this feature)", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("compliance"));

        const res = await POST(
            body("POST", {
                title: "X",
                organization_name: "Y",
                category: "School",
                token_price_inr: 10,
            })
        );

        expect(res.status).toBe(403);
    });
});

describe("PATCH /api/admin/campaigns", () => {
    beforeEach(() => vi.clearAllMocks());

    it("pauses an active campaign", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client, captured } = fakeClient({ campaigns: [CAMPAIGN] });
        createAdminClientMock.mockReturnValue(client);

        const res = await PATCH(body("PATCH", { campaign_id: CAMPAIGN.id, status: "paused" }));

        expect(res.status).toBe(200);
        expect(captured.payload).toMatchObject({ status: "paused" });
    });

    it("refuses to reopen a completed campaign", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client, captured } = fakeClient({
            campaigns: [{ ...CAMPAIGN, status: "completed" }],
        });
        createAdminClientMock.mockReturnValue(client);

        const res = await PATCH(body("PATCH", { campaign_id: CAMPAIGN.id, status: "active" }));

        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/cannot be reopened/i);
        expect(captured.payload).toBeUndefined();
    });

    it("refuses a no-op transition", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client } = fakeClient({ campaigns: [CAMPAIGN] });
        createAdminClientMock.mockReturnValue(client);

        const res = await PATCH(body("PATCH", { campaign_id: CAMPAIGN.id, status: "active" }));

        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/already/i);
    });

    it("404s an unknown campaign", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client } = fakeClient({ campaigns: [] });
        createAdminClientMock.mockReturnValue(client);

        const res = await PATCH(
            body("PATCH", { campaign_id: "22222222-2222-4222-8222-222222222222", status: "paused" })
        );

        expect(res.status).toBe(404);
    });

    it("returns 401 when unauthenticated", async () => {
        requireAppUserMock.mockRejectedValue(new UnauthorizedError());

        const res = await PATCH(body("PATCH", { campaign_id: CAMPAIGN.id, status: "paused" }));

        expect(res.status).toBe(401);
    });
});
