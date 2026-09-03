import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, type AppUser } from "@/lib/auth";

/**
 * Behaviour tests for /api/admin/vendors beyond the shared guard smoke test in
 * admin-guard.test.ts:
 *   - GET derives `has_login` from `owner_id` (never exposing the UUID itself).
 *   - POST pre-registers an UNCLAIMED outlet: owner_id null, pending/pending, no
 *     bank fields, one audit row.
 *   - POST refuses a duplicate FSSAI licence (no DB unique constraint backs it).
 *   - POST is matrix-gated on `vendor_management/create` — vendor_manager may,
 *     compliance (read-only on this feature) may not.
 *
 * REAL: defineRoute, the permission matrix, the Zod create schema, the insert
 * payload shaping. MOCKED: auth, both Supabase clients, the audit writer.
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
import { writeAuditLog } from "@/lib/services/audit";
import { GET, POST } from "@/app/api/admin/vendors/route";

const requireAppUserMock = vi.mocked(requireAppUser);
const createClientMock = vi.mocked(createClient);
const createAdminClientMock = vi.mocked(createAdminClient);
const writeAuditLogMock = vi.mocked(writeAuditLog);

function makeUser(role: AppUser["role"]): AppUser {
    return { id: "00000000-0000-0000-0000-000000000001", email: "u@papama.test", role, donor_id: null };
}

/** Read client: `.from().select().order().range()` resolves to `rows`. */
function fakeReadClient(rows: unknown[]) {
    const range = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn(() => ({ range }));
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));
    return { from } as unknown as Awaited<ReturnType<typeof createClient>>;
}

/**
 * Admin client for POST. `existing` is what the FSSAI duplicate probe finds
 * (null = free); `inserted` is the row the insert returns. The insert payload is
 * captured so the test can assert on what actually reaches the table.
 */
function fakeAdminClient(existing: unknown, inserted: unknown) {
    const captured: { payload?: Record<string, unknown> } = {};

    const probeChain = {
        select: vi.fn(() => probeChain),
        eq: vi.fn(() => probeChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
        insert: vi.fn((payload: Record<string, unknown>) => {
            captured.payload = payload;
            return {
                select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: inserted, error: null }),
                })),
            };
        }),
    };

    const from = vi.fn(() => probeChain);
    return { client: { from } as never, captured };
}

const postReq = (body: Record<string, unknown>) =>
    new NextRequest("http://localhost/api/admin/vendors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });

const CREATED = { id: "v-new", name: "Anna's Kitchen", status: "pending", kyc_status: "pending" };

describe("GET /api/admin/vendors — has_login", () => {
    beforeEach(() => vi.clearAllMocks());

    it("reports has_login true/false from owner_id without leaking the uuid", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        createClientMock.mockResolvedValue(
            fakeReadClient([
                {
                    id: "v1",
                    name: "Claimed Outlet",
                    status: "approved",
                    kyc_status: "verified",
                    fssai_license: null,
                    gst_number: null,
                    geo_lat: null,
                    geo_lng: null,
                    hygiene_rating: null,
                    created_at: "2026-06-20T10:00:00.000Z",
                    owner_id: "00000000-0000-0000-0000-0000000000aa",
                },
                {
                    id: "v2",
                    name: "Pre-registered Outlet",
                    status: "pending",
                    kyc_status: "pending",
                    fssai_license: null,
                    gst_number: null,
                    geo_lat: null,
                    geo_lng: null,
                    hygiene_rating: null,
                    created_at: "2026-06-21T10:00:00.000Z",
                    owner_id: null,
                },
            ])
        );

        const res = await GET(new NextRequest("http://localhost/api/admin/vendors"));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.vendors[0].has_login).toBe(true);
        expect(body.vendors[1].has_login).toBe(false);
        expect(JSON.stringify(body)).not.toContain("0000000000aa");
    });
});

describe("POST /api/admin/vendors — pre-registration", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns 403 for compliance (read-only on vendor_management)", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("compliance"));

        const res = await POST(postReq({ name: "Anna's Kitchen" }));

        expect(res.status).toBe(403);
    });

    it("allows vendor_manager (matrix grants create)", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("vendor_manager"));
        const { client } = fakeAdminClient(null, CREATED);
        createAdminClientMock.mockReturnValue(client);

        const res = await POST(postReq({ name: "Anna's Kitchen" }));

        expect(res.status).toBe(200);
    });

    it("returns 401 when unauthenticated", async () => {
        requireAppUserMock.mockRejectedValue(new UnauthorizedError());

        const res = await POST(postReq({ name: "Anna's Kitchen" }));

        expect(res.status).toBe(401);
    });

    it("rejects a body with no business name", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));

        const res = await POST(postReq({ city: "Chennai" }));

        expect(res.status).toBe(400);
    });

    it("rejects a half-set coordinate pair", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));

        const res = await POST(postReq({ name: "Anna's Kitchen", geo_lat: 13.08 }));

        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/latitude and longitude/i);
    });

    it("creates an unclaimed pending outlet and audits it", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client, captured } = fakeAdminClient(null, CREATED);
        createAdminClientMock.mockReturnValue(client);

        const res = await POST(
            postReq({
                name: "Anna's Kitchen",
                city: "Chennai",
                phone: "9876543210",
                geo_lat: 13.08268,
                geo_lng: 80.27072,
            })
        );
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ vendor_id: "v-new", status: "pending", kyc_status: "pending" });

        // Unclaimed, unapproved, and carrying no settlement destination.
        expect(captured.payload).toMatchObject({
            owner_id: null,
            name: "Anna's Kitchen",
            city: "Chennai",
            status: "pending",
            kyc_status: "pending",
            geo_lat: 13.08268,
            geo_lng: 80.27072,
        });
        expect(captured.payload).not.toHaveProperty("bank_account_number");
        expect(captured.payload).not.toHaveProperty("bank_ifsc");

        expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
        expect(writeAuditLogMock.mock.calls[0][0]).toMatchObject({
            action: "vendor.create",
            entity_table: "vendors",
            entity_id: "v-new",
        });
    });

    it("refuses a duplicate FSSAI licence and writes nothing", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        const { client, captured } = fakeAdminClient({ id: "v-old", name: "Existing Outlet" }, CREATED);
        createAdminClientMock.mockReturnValue(client);

        const res = await POST(postReq({ name: "Anna's Kitchen", fssai_license: "FSSAI-123" }));

        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain("Existing Outlet");
        expect(captured.payload).toBeUndefined();
        expect(writeAuditLogMock).not.toHaveBeenCalled();
    });
});
