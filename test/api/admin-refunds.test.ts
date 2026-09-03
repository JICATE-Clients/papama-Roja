import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, type AppUser } from "@/lib/auth";

/**
 * Behaviour tests for the refund screens' API surface (addon #14/#20):
 *   - GET /api/admin/payment-failures resolves donor names and marks which
 *     failures already carry a refund request, never emitting a donor UUID.
 *   - GET /api/admin/refunds carries the originating failure's reason.
 *   - POST /api/admin/payment-failures accepts a donation_id alone and reads the
 *     donor + amount off that donation; a guest donation has no donor to refund.
 *   - GET /api/donor/refund-request is pinned to the caller's own donor id and
 *     hides failures that already have a request.
 *
 * REAL: defineRoute, the permission matrix, the Zod schemas, the donor/amount
 * derivation in lib/services/refund. MOCKED: auth, both Supabase clients, audit.
 */

vi.mock("@/lib/auth", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/auth")>();
    return { ...actual, requireAppUser: vi.fn() };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/services/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/donor/server-identity", () => ({ resolveDonorId: vi.fn(async () => "donor-1") }));

import { requireAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
    GET as failuresGET,
    PATCH as failuresPATCH,
    POST as failuresPOST,
} from "@/app/api/admin/payment-failures/route";
import { GET as refundsGET } from "@/app/api/admin/refunds/route";
import { GET as donorRefundsGET } from "@/app/api/donor/refund-request/route";

const requireAppUserMock = vi.mocked(requireAppUser);
const createClientMock = vi.mocked(createClient);
const createAdminClientMock = vi.mocked(createAdminClient);

function makeUser(role: AppUser["role"]): AppUser {
    return { id: "00000000-0000-0000-0000-000000000001", email: "u@papama.test", role, donor_id: null };
}

/** Session client: `.from().select().order().limit()` resolves to `rows`. */
function fakeReadClient(rows: unknown[]) {
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));
    return { from } as unknown as Awaited<ReturnType<typeof createClient>>;
}

/**
 * Admin client keyed by table name. Each entry supplies the rows that table's
 * query resolves to; `capture` records what was inserted where.
 */
function fakeAdminClient(tables: Record<string, unknown[]>) {
    const captured: {
        table?: string;
        payload?: Record<string, unknown>;
        update?: Record<string, unknown>;
    } = {};

    const from = vi.fn((table: string) => {
        const rows = tables[table] ?? [];
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            in: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
            single: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
            update: vi.fn((payload: Record<string, unknown>) => {
                captured.table = table;
                captured.update = payload;
                return { eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) };
            }),
            insert: vi.fn((payload: Record<string, unknown>) => {
                captured.table = table;
                captured.payload = payload;
                return {
                    select: vi.fn(() => ({
                        single: vi.fn().mockResolvedValue({ data: { id: "pf-new" }, error: null }),
                    })),
                };
            }),
            // `await chain` (no terminal method) resolves to the rows.
            then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
        });
        return chain;
    });

    return { client: { from } as never, captured };
}

const get = (url: string) => new NextRequest(url);
const post = (url: string, body: Record<string, unknown>) =>
    new NextRequest(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });

describe("GET /api/admin/payment-failures", () => {
    beforeEach(() => vi.clearAllMocks());

    it("resolves donor names, flags already-requested failures, and emits no donor uuid", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        createClientMock.mockResolvedValue(
            fakeReadClient([
                {
                    id: "pf-1",
                    donation_id: "11111111-1111-4111-8111-111111111111",
                    donor_id: "00000000-0000-0000-0000-0000000000dd",
                    amount_inr: 500,
                    reason: "duplicate_charge",
                    retry_count: 0,
                    max_retries: null,
                    status: "open",
                    notes: null,
                    created_at: "2026-08-01T10:00:00.000Z",
                    resolved_at: null,
                },
                {
                    id: "pf-2",
                    donation_id: null,
                    donor_id: "00000000-0000-0000-0000-0000000000dd",
                    amount_inr: 250,
                    reason: "gateway_failed",
                    retry_count: 1,
                    max_retries: 3,
                    status: "open",
                    notes: null,
                    created_at: "2026-08-02T10:00:00.000Z",
                    resolved_at: null,
                },
            ])
        );
        const { client } = fakeAdminClient({
            donors: [
                {
                    id: "00000000-0000-0000-0000-0000000000dd",
                    name: "Anitha R",
                    email: "anitha@example.test",
                },
            ],
            refunds: [{ payment_failure_id: "pf-2" }],
        });
        createAdminClientMock.mockReturnValue(client);

        const res = await failuresGET(get("http://localhost/api/admin/payment-failures"));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.payment_failures[0]).toMatchObject({
            id: "pf-1",
            donor_label: "Anitha R",
            amount_inr: 500,
            has_refund: false,
        });
        expect(body.payment_failures[1].has_refund).toBe(true);
        expect(JSON.stringify(body)).not.toContain("0000000000dd");
    });

    it("returns 403 for a donor (scope own, not all)", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("donor"));

        const res = await failuresGET(get("http://localhost/api/admin/payment-failures"));

        expect(res.status).toBe(403);
    });
});

describe("GET /api/admin/refunds", () => {
    beforeEach(() => vi.clearAllMocks());

    it("carries the originating failure's reason onto each row", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("compliance"));
        createClientMock.mockResolvedValue(
            fakeReadClient([
                {
                    id: "rf-1",
                    donor_id: "d-1",
                    payment_failure_id: "pf-1",
                    amount_inr: 500,
                    reason: "charged twice",
                    status: "pending",
                    decided_at: null,
                    decision_note: null,
                    created_at: "2026-08-03T10:00:00.000Z",
                },
            ])
        );
        const { client } = fakeAdminClient({
            donors: [{ id: "d-1", name: "Anitha R", email: "anitha@example.test" }],
            payment_failures: [{ id: "pf-1", reason: "duplicate_charge" }],
        });
        createAdminClientMock.mockReturnValue(client);

        const res = await refundsGET(get("http://localhost/api/admin/refunds"));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.refunds[0]).toMatchObject({
            donor_label: "Anitha R",
            payment_failure_reason: "duplicate_charge",
            status: "pending",
        });
    });
});

describe("POST /api/admin/payment-failures", () => {
    beforeEach(() => vi.clearAllMocks());

    it("reads the donor and amount off the named donation", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client, captured } = fakeAdminClient({
            donations: [{ id: "11111111-1111-4111-8111-111111111111", donor_id: "d-1", amount_inr: 750 }],
            payment_failures: [],
        });
        createAdminClientMock.mockReturnValue(client);

        const res = await failuresPOST(
            post("http://localhost/api/admin/payment-failures", {
                donation_id: "11111111-1111-4111-8111-111111111111",
                reason: "duplicate_charge",
            })
        );

        expect(res.status).toBe(200);
        expect(captured.table).toBe("payment_failures");
        expect(captured.payload).toMatchObject({
            donation_id: "11111111-1111-4111-8111-111111111111",
            donor_id: "d-1",
            amount_inr: 750,
            reason: "duplicate_charge",
        });
    });

    it("refuses a donation with no donor — there is no credit to reverse", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client, captured } = fakeAdminClient({
            donations: [{ id: "22222222-2222-4222-8222-222222222222", donor_id: null, amount_inr: 100 }],
        });
        createAdminClientMock.mockReturnValue(client);

        const res = await failuresPOST(
            post("http://localhost/api/admin/payment-failures", {
                donation_id: "22222222-2222-4222-8222-222222222222",
                reason: "gateway_failed",
            })
        );

        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/no donor/i);
        expect(captured.payload).toBeUndefined();
    });

    it("rejects a body naming neither a donation nor a donor+amount", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));

        const res = await failuresPOST(
            post("http://localhost/api/admin/payment-failures", { reason: "other" })
        );

        expect(res.status).toBe(400);
    });

    it("still accepts an explicit donor and amount with no donation", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client, captured } = fakeAdminClient({ payment_failures: [] });
        createAdminClientMock.mockReturnValue(client);

        const res = await failuresPOST(
            post("http://localhost/api/admin/payment-failures", {
                donor_id: "33333333-3333-4333-8333-333333333333",
                amount_inr: 300,
                reason: "chargeback",
            })
        );

        expect(res.status).toBe(200);
        expect(captured.payload).toMatchObject({
            donation_id: null,
            donor_id: "33333333-3333-4333-8333-333333333333",
            amount_inr: 300,
        });
    });

    it("returns 401 when unauthenticated", async () => {
        requireAppUserMock.mockRejectedValue(new UnauthorizedError());

        const res = await failuresPOST(
            post("http://localhost/api/admin/payment-failures", {
                donation_id: "11111111-1111-4111-8111-111111111111",
                reason: "other",
            })
        );

        expect(res.status).toBe(401);
    });
});

describe("PATCH /api/admin/payment-failures — dismiss", () => {
    beforeEach(() => vi.clearAllMocks());

    const patch = (payload: Record<string, unknown>) =>
        new NextRequest("http://localhost/api/admin/payment-failures", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
        });
    const PF_ID = "44444444-4444-4444-8444-444444444444";

    it("closes an open failure and appends the reason to its notes", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client, captured } = fakeAdminClient({
            payment_failures: [{ id: PF_ID, status: "open", amount_inr: 500, notes: "reported by phone" }],
            refunds: [],
        });
        createAdminClientMock.mockReturnValue(client);

        const res = await failuresPATCH(
            patch({ payment_failure_id: PF_ID, note: "bank confirmed the charge went through" })
        );

        expect(res.status).toBe(200);
        expect(captured.update).toMatchObject({ status: "dismissed" });
        // The original note survives — it is the context that makes the
        // dismissal readable later.
        expect(captured.update?.notes).toContain("reported by phone");
        expect(captured.update?.notes).toContain("bank confirmed");
    });

    it("requires a reason", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));

        const res = await failuresPATCH(patch({ payment_failure_id: PF_ID, note: "   " }));

        expect(res.status).toBe(400);
    });

    it("refuses when a refund already exists against the failure", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        // The probe for an existing refund finds one.
        const { client, captured } = fakeAdminClient({
            payment_failures: [{ id: PF_ID, status: "open", amount_inr: 500, notes: null }],
            refunds: [{ id: "rf-1" }],
        });
        createAdminClientMock.mockReturnValue(client);

        const res = await failuresPATCH(patch({ payment_failure_id: PF_ID, note: "not a real failure" }));

        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/decide the refund/i);
        expect(captured.update).toBeUndefined();
    });

    it("refuses a failure that is not open", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client } = fakeAdminClient({
            payment_failures: [{ id: PF_ID, status: "resolved", amount_inr: 500, notes: null }],
            refunds: [],
        });
        createAdminClientMock.mockReturnValue(client);

        const res = await failuresPATCH(patch({ payment_failure_id: PF_ID, note: "too late" }));

        expect(res.status).toBe(400);
    });

    it("returns 403 for compliance (read-only on this feature)", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("compliance"));

        const res = await failuresPATCH(patch({ payment_failure_id: PF_ID, note: "no" }));

        expect(res.status).toBe(403);
    });
});

describe("GET /api/donor/refund-request", () => {
    beforeEach(() => vi.clearAllMocks());

    it("hides failures that already have a request and returns the donor's refunds", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("donor"));
        const { client } = fakeAdminClient({
            payment_failures: [
                { id: "pf-1", amount_inr: 500, reason: "duplicate_charge", status: "open", created_at: "2026-08-01T10:00:00.000Z" },
                { id: "pf-2", amount_inr: 250, reason: "gateway_failed", status: "open", created_at: "2026-08-02T10:00:00.000Z" },
            ],
            refunds: [
                {
                    id: "rf-1",
                    payment_failure_id: "pf-2",
                    amount_inr: 250,
                    reason: "card charged twice",
                    status: "pending",
                    decided_at: null,
                    decision_note: null,
                    created_at: "2026-08-02T11:00:00.000Z",
                },
            ],
        });
        createAdminClientMock.mockReturnValue(client);

        const res = await donorRefundsGET(get("http://localhost/api/donor/refund-request"));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.payment_failures.map((f: { id: string }) => f.id)).toEqual(["pf-1"]);
        expect(body.refunds).toHaveLength(1);
    });

    it("returns 403 for a vendor — the matrix grants this to donors only", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("vendor"));

        const res = await donorRefundsGET(get("http://localhost/api/donor/refund-request"));

        expect(res.status).toBe(403);
    });
});
