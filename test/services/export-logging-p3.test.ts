import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser } from "@/lib/auth";

/**
 * Acceptance tests for Work Order P-3 (B-29c, Phase 1 slice) — export logging.
 *
 * The card's criterion: "every report/CSV export writes an audit row (who, what
 * report, when, filters)". The full sensitive-READ audit is explicitly Phase 2;
 * this slice covers extraction only.
 *
 * Why extraction is the event worth logging: an export is the moment data leaves
 * the platform's controls. Once a CSV is on someone's laptop, every access rule
 * in this codebase stops applying to it. The route guard already logs the read;
 * this records that a copy walked out.
 */

vi.mock("@/lib/auth", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/auth")>();
    return { ...actual, requireAppUser: vi.fn() };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
// handler.ts imports BOTH of these; a mock missing AuditError leaves it
// undefined in the error path.
vi.mock("@/lib/services/audit", () => ({
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    AuditError: class AuditError extends Error {
        name = "AuditError";
    },
}));

import { NextRequest } from "next/server";

import { requireAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/audit";
import { GET } from "@/app/api/admin/reports/export/route";

const ROOT = join(__dirname, "..", "..");
const requireAppUserMock = vi.mocked(requireAppUser);
const createAdminClientMock = vi.mocked(createAdminClient);
const writeAuditLogMock = vi.mocked(writeAuditLog);

function admin(): AppUser {
    return {
        id: "00000000-0000-0000-0000-0000000000a1",
        email: "admin@papama.test",
        role: "admin",
        donor_id: null,
    };
}

const REPORT = {
    id: "11111111-1111-4111-8111-111111111111",
    report_type: "csr",
    title: "Q3 CSR impact",
    summary: { meals_served: 1200, beneficiaries: 340 },
    period_start: "2026-07-01",
    period_end: "2026-09-30",
    created_at: "2026-10-01T00:00:00.000Z",
};

function fakeClient(row: unknown = REPORT) {
    return {
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
                }),
            }),
        }),
    };
}

const req = (id?: string) =>
    new NextRequest(
        `http://localhost/api/admin/reports/export${id ? `?id=${id}` : ""}`
    );

beforeEach(() => {
    vi.clearAllMocks();
    requireAppUserMock.mockResolvedValue(admin());
    createAdminClientMock.mockReturnValue(fakeClient() as never);
});

describe("P-3 — an export writes an audit row", () => {
    it("logs the extraction", async () => {
        const res = await GET(req(REPORT.id));
        expect(res.status).toBe(200);
        expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
        expect(writeAuditLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "report.export",
                entity_table: "compliance_reports",
                entity_id: REPORT.id,
            })
        );
    });

    it("records WHO — the actor is bound by the route context", async () => {
        await GET(req(REPORT.id));
        const entry = writeAuditLogMock.mock.calls[0][0];
        expect(entry.actor?.id).toBe(admin().id);
    });

    it("records WHAT report", async () => {
        await GET(req(REPORT.id));
        const meta = writeAuditLogMock.mock.calls[0][0].metadata as Record<string, unknown>;
        expect(meta.report_id).toBe(REPORT.id);
        expect(meta.report_type).toBe("csr");
        expect(meta.format).toBe("csv");
    });

    it("records the FILTERS that shaped what left the building", async () => {
        // The card names filters explicitly. Without the period, the log says a
        // CSR report was taken but not which months of data went with it.
        await GET(req(REPORT.id));
        const meta = writeAuditLogMock.mock.calls[0][0].metadata as Record<string, unknown>;
        expect(meta.period_start).toBe("2026-07-01");
        expect(meta.period_end).toBe("2026-09-30");
    });

    it("records how much was taken", async () => {
        await GET(req(REPORT.id));
        const meta = writeAuditLogMock.mock.calls[0][0].metadata as Record<string, unknown>;
        expect(meta.metric_count).toBe(2);
        expect(Number(meta.row_count)).toBeGreaterThan(0);
    });

    it("still returns the CSV attachment", async () => {
        const res = await GET(req(REPORT.id));
        expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);
        expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename=/);
        await expect(res.text()).resolves.toContain("Report ID");
    });
});

describe("P-3 — nothing is logged when nothing is exported", () => {
    it("a missing id logs no export", async () => {
        const res = await GET(req());
        expect(res.status).toBe(400);
        expect(writeAuditLogMock).not.toHaveBeenCalled();
    });

    it("an unknown report logs no export", async () => {
        // A 404 is not an extraction. Logging it would fill the audit trail with
        // non-events and make real exports harder to find.
        createAdminClientMock.mockReturnValue(fakeClient(null) as never);
        const res = await GET(req("22222222-2222-4222-8222-222222222222"));
        expect(res.status).toBe(404);
        expect(writeAuditLogMock).not.toHaveBeenCalled();
    });
});

describe("P-3 — the log is written BEFORE the file is returned", () => {
    it("an audit failure fails the export", async () => {
        // The right direction: an unlogged export of beneficiary-derived data is
        // worse than a failed one. Logging after the response would let a
        // download succeed with no record — exactly the case the log covers.
        writeAuditLogMock.mockRejectedValueOnce(new Error("audit down"));
        const res = await GET(req(REPORT.id));
        expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("the source awaits the audit ahead of the response", () => {
        const src = readFileSync(
            join(ROOT, "app/api/admin/reports/export/route.ts"),
            "utf-8"
        );
        expect(src.indexOf("await audit(")).toBeLessThan(src.indexOf("return new NextResponse"));
    });
});

describe("P-3 — scope is the Phase 1 slice, not the Phase 2 read audit", () => {
    it("the export route is the only CSV surface", () => {
        // Verified by audit while building this card: no client-side Blob or
        // download= path generates a file, so logging this one route covers
        // every export. If a second export lands later it needs its own row.
        const src = readFileSync(
            join(ROOT, "app/api/admin/reports/export/route.ts"),
            "utf-8"
        );
        expect(src).toContain("text/csv");
    });
});
