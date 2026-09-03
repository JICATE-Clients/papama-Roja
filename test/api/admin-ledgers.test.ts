import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, type AppUser } from "@/lib/auth";

/**
 * Tests for the ledger view's API surface (addon #18).
 *
 * The `?ledger=` mode now returns the entries alongside the running balance —
 * a total with no rows behind it cannot be checked, which is the whole point of
 * the page. The list path reads through the SESSION client so RLS stays the
 * enforcement point; a test pins that the service-role client is never
 * constructed there, since doing so would bypass the row policies outright.
 *
 * REAL: defineRoute, the permission matrix, the query schema, the service.
 * MOCKED: auth and both Supabase clients.
 */

vi.mock("@/lib/auth", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/auth")>();
    return { ...actual, requireAppUser: vi.fn() };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { requireAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET as ledgersGET } from "@/app/api/admin/ledgers/route";
import { GET as reconcileGET } from "@/app/api/admin/ledgers/reconcile/route";

const requireAppUserMock = vi.mocked(requireAppUser);
const createClientMock = vi.mocked(createClient);
const createAdminClientMock = vi.mocked(createAdminClient);

function makeUser(role: AppUser["role"]): AppUser {
    return { id: "00000000-0000-0000-0000-000000000001", email: "u@papama.test", role, donor_id: null };
}

type Row = { ledger?: string; amount: number; [k: string]: unknown };

/**
 * Supabase double whose `.eq()` filters the fixture rows the way Postgres
 * would, so a balance really is the sum of the rows the query selected rather
 * than of everything the fixture holds.
 */
function fakeClient(rows: Row[]) {
    const from = vi.fn(() => {
        let filtered = [...rows];
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
            select: vi.fn(() => chain),
            eq: vi.fn((col: string, val: unknown) => {
                filtered = filtered.filter((r) => r[col] === val);
                return chain;
            }),
            order: vi.fn(() => chain),
            limit: vi.fn(() => Promise.resolve({ data: filtered, error: null })),
            then: (resolve: (v: unknown) => void) => resolve({ data: filtered, error: null }),
        });
        return chain;
    });
    return { from } as unknown as Awaited<ReturnType<typeof createClient>>;
}

const ENTRIES: Row[] = [
    {
        id: "l1",
        ledger: "donation",
        amount: 1000,
        reference_type: "donation",
        reference_id: "ref-1",
        description: "gift credited",
        created_at: "2026-08-01T10:00:00.000Z",
    },
    {
        id: "l2",
        ledger: "vendor_payable",
        amount: 400,
        reference_type: "redemption",
        reference_id: "ref-2",
        description: "meal approved",
        created_at: "2026-08-02T10:00:00.000Z",
    },
    {
        id: "l3",
        ledger: "revenue",
        amount: 600,
        reference_type: "credit_transaction",
        reference_id: "ref-3",
        description: "forfeited balance",
        created_at: "2026-08-03T10:00:00.000Z",
    },
];

const req = (qs: string) => new NextRequest(`http://localhost/api/admin/ledgers${qs}`);

describe("GET /api/admin/ledgers", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns one ledger's balance AND its entries", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        createClientMock.mockResolvedValue(fakeClient(ENTRIES));

        const res = await ledgersGET(req("?ledger=donation"));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ ledger: "donation", balance: 1000 });
        expect(body.entries).toHaveLength(1);
        expect(body.entries[0]).toMatchObject({ id: "l1", reference_type: "donation" });
    });

    it("reads through the session client, never the service-role one", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        createClientMock.mockResolvedValue(fakeClient(ENTRIES));

        const res = await ledgersGET(req("?ledger=vendor_payable"));

        expect(res.status).toBe(200);
        // RLS, not this handler, is what scopes a reader. Reaching for the
        // service-role client here would bypass the vendor-own policy outright.
        expect(createAdminClientMock).not.toHaveBeenCalled();
    });

    /**
     * The matrix gives a vendor `read: "own"` on this feature, but defineRoute
     * asserts scope "all" here, so a vendor is refused before RLS is ever
     * consulted — the `ledger_entries_select_vendor_own` policy is currently
     * unreachable through this route. Pinned as the CURRENT behaviour, not as
     * the desired one: a vendor-facing payable view would be a route under
     * /api/vendor, and adding one is a product decision, not a test fix.
     */
    it("refuses a vendor today, despite the matrix granting read:own", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("vendor"));

        const res = await ledgersGET(req("?ledger=vendor_payable"));

        expect(res.status).toBe(403);
    });

    it("traces one reference", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("compliance"));
        createClientMock.mockResolvedValue(fakeClient(ENTRIES));

        const res = await ledgersGET(req("?reference_type=redemption&reference_id=ref-2"));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.entries).toHaveLength(1);
        expect(body.entries[0].id).toBe("l2");
    });

    it("rejects a query naming neither a ledger nor a reference pair", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));

        const res = await ledgersGET(req(""));

        expect(res.status).toBe(400);
    });

    it("rejects a ledger name that is not one of the three", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));

        const res = await ledgersGET(req("?ledger=slush_fund"));

        expect(res.status).toBe(400);
    });

    it("returns 403 for a donor", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("donor"));

        const res = await ledgersGET(req("?ledger=donation"));

        expect(res.status).toBe(403);
    });

    it("returns 401 when unauthenticated", async () => {
        requireAppUserMock.mockRejectedValue(new UnauthorizedError());

        const res = await ledgersGET(req("?ledger=donation"));

        expect(res.status).toBe(401);
    });
});

describe("GET /api/admin/ledgers/reconcile", () => {
    beforeEach(() => vi.clearAllMocks());

    it("reports balanced when donation == vendor_payable + revenue", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        createAdminClientMock.mockReturnValue(fakeClient(ENTRIES) as never);

        const res = await reconcileGET(new NextRequest("http://localhost/api/admin/ledgers/reconcile"));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({
            donation: 1000,
            vendor_payable: 400,
            revenue: 600,
            balanced: true,
            discrepancy: 0,
        });
    });

    it("reports the discrepancy when a posting is missing", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        // The ₹600 revenue entry never posted.
        createAdminClientMock.mockReturnValue(fakeClient(ENTRIES.slice(0, 2)) as never);

        const res = await reconcileGET(new NextRequest("http://localhost/api/admin/ledgers/reconcile"));
        const body = await res.json();

        expect(body.balanced).toBe(false);
        expect(body.discrepancy).toBe(600);
    });

    it("returns 403 for a vendor — reconciliation is system-wide, not a per-vendor slice", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("vendor"));

        const res = await reconcileGET(new NextRequest("http://localhost/api/admin/ledgers/reconcile"));

        expect(res.status).toBe(403);
        // The service-role client must not even be constructed for a denied caller.
        expect(createAdminClientMock).not.toHaveBeenCalled();
    });
});
