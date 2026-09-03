import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, type AppUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/auth")>();
    return { ...actual, requireAppUser: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

// Service-level mocks — these are imported by individual routes and must be
// stubbed so the handler never reaches real IO.
vi.mock("@/lib/services/analytics", () => ({ getAnalytics: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/services/fraud", () => ({ scanVendorAnomalies: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/services/csr", () => ({
    csr80gCertificatesEnabled: vi.fn().mockReturnValue(false),
    generateCsrReport: vi.fn(),
}));
vi.mock("@/lib/services/institution", () => ({
    bulkAllocateToInstitution: vi.fn(),
    institutionRedemptionReport: vi.fn(),
}));
vi.mock("@/lib/services/volunteerActivity", () => ({
    volunteerActivitySummaries: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/services/emergency", () => ({
    issueEmergencyToken: vi.fn().mockResolvedValue({
        token_id: "t1",
        serial_number: "PPM-STD-TEST-0001",
        value_inr: 50,
        grant_id: "g1",
    }),
}));
vi.mock("@/lib/donations/guest-pool", () => ({
    GUEST_POOL_EMAIL: "guest-pool@papama.test",
    getGuestPoolBalance: vi.fn().mockResolvedValue(0),
    ensureGuestPoolDonor: vi.fn(),
}));
vi.mock("@/lib/system-config", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/system-config")>();
    return {
        ...actual,
        getNumber: vi.fn().mockResolvedValue(50),
        getBoolean: vi.fn().mockResolvedValue(false),
    };
});
vi.mock("@/app/api/_lib/tokenQr", () => ({
    deriveQrPayload: vi.fn().mockReturnValue("qr-payload"),
    qrHashOf: vi.fn().mockReturnValue("qr-hash"),
}));
vi.mock("@/lib/face/embedding", () => ({
    embeddingFingerprint: vi.fn(),
    toVectorLiteral: vi.fn(),
}));
vi.mock("@/lib/face/liveness", () => ({
    assertLiveness: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { requireAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { GET as analyticsGET } from "@/app/api/admin/analytics/route";
import { GET as auditLogsGET } from "@/app/api/admin/audit-logs/route";
import { GET as beneficiariesGET } from "@/app/api/admin/beneficiaries/route";
import { GET as beneficiaryIdGET } from "@/app/api/admin/beneficiaries/[id]/route";
import { GET as beneficiaryRegsGET } from "@/app/api/admin/beneficiary-registrations/route";
import { GET as complaintsGET } from "@/app/api/admin/complaints/route";
import { GET as csrGET } from "@/app/api/admin/csr/route";
import { GET as donationsGET } from "@/app/api/admin/donations/route";
import { GET as fraudGET } from "@/app/api/admin/fraud/route";
import { POST as fraudScanPOST } from "@/app/api/admin/fraud/scan/route";
import { GET as institutionsGET } from "@/app/api/admin/institutions/route";
import { GET as mealWindowsGET } from "@/app/api/admin/meal-windows/route";
import { GET as ngoPartnersGET } from "@/app/api/admin/ngo-partners/route";
import { GET as notifTemplatesGET } from "@/app/api/admin/notification-templates/route";
import { POST as poolMintPOST } from "@/app/api/admin/pool/mint/route";
import { GET as proofsGET } from "@/app/api/admin/proofs/route";
import { GET as reportsGET } from "@/app/api/admin/reports/route";
import { GET as settlementAuditGET } from "@/app/api/admin/settlement-audit/route";
import { GET as settlementsGET } from "@/app/api/admin/settlements/route";
import { GET as systemConfigGET } from "@/app/api/admin/system-config/route";
import { GET as tokensGET } from "@/app/api/admin/tokens/route";
import { GET as vendorCapacityGET } from "@/app/api/admin/vendor-capacity/route";
import { GET as vendorFeedbackGET } from "@/app/api/admin/vendor-feedback/route";
import { GET as vendorInspectionsGET } from "@/app/api/admin/vendor-inspections/route";
import { GET as vendorMenusGET } from "@/app/api/admin/vendor-menus/route";
import { POST as vendorsPOST } from "@/app/api/admin/vendors/route";
import { GET as volunteersGET } from "@/app/api/admin/volunteers/route";
import { GET as volunteerActivityGET } from "@/app/api/admin/volunteer-activity/route";
import { GET as volunteerRequestsGET } from "@/app/api/admin/volunteer-requests/route";
import { POST as emergencyGrantPOST } from "@/app/api/admin/emergency/grant/route";

// ---------------------------------------------------------------------------
// Typed mock handles
// ---------------------------------------------------------------------------

const requireAppUserMock = vi.mocked(requireAppUser);
const createClientMock = vi.mocked(createClient);
const createAdminClientMock = vi.mocked(createAdminClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(role: AppUser["role"], overrides?: Partial<AppUser>): AppUser {
    return {
        id: "00000000-0000-0000-0000-000000000001",
        email: "u@papama.test",
        role,
        donor_id: null,
        ...overrides,
    };
}

/** Fake Supabase client whose chained calls resolve to `rows`. */
function fakeClient(rows: unknown[] = []) {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.test/photo" }, error: null });
    const storage = { from: vi.fn(() => ({ createSignedUrl })) };

    // Default single-row result (used by maybeSingle / single).
    const defaultSingle = { id: "row-1", balance_inr: 10000, donor_id: "donor-001", name: "Test" };
    const maybeSingle = vi.fn().mockResolvedValue({ data: rows[0] ?? defaultSingle, error: null });
    const single = vi.fn().mockResolvedValue({ data: rows[0] ?? defaultSingle, error: null });
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const inFilter = vi.fn().mockResolvedValue({ data: rows, error: null });
    const range = vi.fn().mockResolvedValue({ data: rows, error: null });

    // Chainable builder — every method returns the same shape so arbitrary
    // .from().select().eq().order().range() chains all resolve.
    const chain: Record<string, unknown> = {};
    const eq = vi.fn(() => chain);
    const neq = vi.fn(() => chain);
    const order = vi.fn(() => chain);
    const select = vi.fn(() => chain);
    const update = vi.fn(() => chain);
    const insert = vi.fn(() => chain);
    Object.assign(chain, {
        eq, neq, order, select, limit, range, maybeSingle, single,
        in: inFilter, update, insert,
        data: rows, error: null,
    });

    const from = vi.fn(() => chain);
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    return { from, rpc, storage } as unknown as Awaited<ReturnType<typeof createClient>>;
}

function req(url = "http://localhost/api/admin/test") {
    return new NextRequest(url);
}

// ---------------------------------------------------------------------------
// Route test table
// ---------------------------------------------------------------------------

interface RouteSpec {
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test harness accepts any defineRoute handler shape
    handler: (req: NextRequest, ctx?: any) => Promise<Response>;
    method: "GET" | "POST";
    /** URL to construct the NextRequest with (some routes parse query params). */
    url?: string;
    /** Dynamic-route context (e.g. { params: { id: "..." } }). */
    ctx?: unknown;
    /** POST body JSON, if applicable. */
    body?: Record<string, unknown>;
}

const adminRoutes: RouteSpec[] = [
    { name: "admin/analytics GET", handler: analyticsGET, method: "GET" },
    { name: "admin/audit-logs GET", handler: auditLogsGET, method: "GET" },
    { name: "admin/beneficiaries GET", handler: beneficiariesGET, method: "GET" },
    {
        name: "admin/beneficiaries/[id] GET",
        handler: beneficiaryIdGET,
        method: "GET",
        ctx: { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000099" }) },
    },
    { name: "admin/beneficiary-registrations GET", handler: beneficiaryRegsGET, method: "GET" },
    { name: "admin/complaints GET", handler: complaintsGET, method: "GET" },
    { name: "admin/csr GET", handler: csrGET, method: "GET" },
    { name: "admin/donations GET", handler: donationsGET, method: "GET" },
    { name: "admin/fraud GET", handler: fraudGET, method: "GET" },
    { name: "admin/fraud/scan POST", handler: fraudScanPOST, method: "POST" },
    { name: "admin/institutions GET", handler: institutionsGET, method: "GET" },
    { name: "admin/meal-windows GET", handler: mealWindowsGET, method: "GET" },
    { name: "admin/ngo-partners GET", handler: ngoPartnersGET, method: "GET" },
    { name: "admin/notification-templates GET", handler: notifTemplatesGET, method: "GET" },
    {
        name: "admin/pool/mint POST",
        handler: poolMintPOST,
        method: "POST",
        body: { count: 1 },
    },
    { name: "admin/proofs GET", handler: proofsGET, method: "GET" },
    { name: "admin/reports GET", handler: reportsGET, method: "GET" },
    { name: "admin/settlement-audit GET", handler: settlementAuditGET, method: "GET" },
    { name: "admin/settlements GET", handler: settlementsGET, method: "GET" },
    { name: "admin/system-config GET", handler: systemConfigGET, method: "GET" },
    { name: "admin/tokens GET", handler: tokensGET, method: "GET" },
    { name: "admin/vendor-capacity GET", handler: vendorCapacityGET, method: "GET" },
    { name: "admin/vendor-feedback GET", handler: vendorFeedbackGET, method: "GET" },
    { name: "admin/vendor-inspections GET", handler: vendorInspectionsGET, method: "GET" },
    { name: "admin/vendor-menus GET", handler: vendorMenusGET, method: "GET" },
    {
        name: "admin/vendors POST",
        handler: vendorsPOST,
        method: "POST",
        body: { name: "Pre-registered Outlet" },
    },
    { name: "admin/volunteers GET", handler: volunteersGET, method: "GET" },
    { name: "admin/volunteer-activity GET", handler: volunteerActivityGET, method: "GET" },
    { name: "admin/volunteer-requests GET", handler: volunteerRequestsGET, method: "GET" },
    {
        name: "admin/emergency/grant POST",
        handler: emergencyGrantPOST,
        method: "POST",
        body: { reason: "test disaster" },
    },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("admin API routes — auth guard", () => {
    beforeEach(() => vi.clearAllMocks());

    for (const route of adminRoutes) {
        describe(route.name, () => {
            function makeReq(): NextRequest {
                if (route.method === "POST" && route.body) {
                    return new NextRequest(route.url ?? "http://localhost/api/admin/test", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(route.body),
                    });
                }
                return new NextRequest(route.url ?? "http://localhost/api/admin/test");
            }

            it("returns 401 when unauthenticated", async () => {
                requireAppUserMock.mockRejectedValue(new UnauthorizedError());

                const res = await route.handler(makeReq(), route.ctx as never);

                expect(res.status).toBe(401);
                expect(await res.json()).toEqual({ error: "unauthorized" });
            });

            it("returns 403 for donor role", async () => {
                requireAppUserMock.mockResolvedValue(makeUser("donor"));

                const res = await route.handler(makeReq(), route.ctx as never);

                expect(res.status).toBe(403);
                expect(await res.json()).toEqual({ error: "forbidden" });
            });

            it("returns 200 for admin role", async () => {
                requireAppUserMock.mockResolvedValue(makeUser("admin"));
                const client = fakeClient([{ id: "row-1", balance_inr: 10000, name: "Test", status: "active" }]);
                createClientMock.mockResolvedValue(client);
                createAdminClientMock.mockReturnValue(client as never);

                const res = await route.handler(makeReq(), route.ctx as never);

                expect(res.status).toBe(200);
            });
        });
    }
});
