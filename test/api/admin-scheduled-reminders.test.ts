import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, type AppUser } from "@/lib/auth";

/**
 * Tests for the scheduled-reminders read side (DIST-6), which did not exist —
 * the sweep was a POST an admin could fire but never observe.
 *
 * The assertion that matters is `due_next_sweep`: it must be true only for a
 * row still `scheduled` AND landing exactly on today+7, because that is the
 * predicate the sweep itself uses. If this drifts from the sweep, the page
 * promises reminders that never fire.
 *
 * REAL: defineRoute, the matrix, the query schema, the date arithmetic.
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
import { GET } from "@/app/api/admin/scheduled-reminders/route";

const requireAppUserMock = vi.mocked(requireAppUser);
const createClientMock = vi.mocked(createClient);
const createAdminClientMock = vi.mocked(createAdminClient);

function makeUser(role: AppUser["role"]): AppUser {
    return { id: "00000000-0000-0000-0000-000000000001", email: "u@papama.test", role, donor_id: null };
}

/** today + n days as a YYYY-MM-DD string, the same way the route computes it. */
function dayOffset(n: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

function fakeSessionClient(rows: unknown[]) {
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn(() => ({ limit }));
    const lte = vi.fn(() => ({ order }));
    const gte = vi.fn(() => ({ lte }));
    const select = vi.fn(() => ({ gte }));
    const from = vi.fn(() => ({ select }));
    return { from } as unknown as Awaited<ReturnType<typeof createClient>>;
}

function fakeAdminClient(tables: Record<string, unknown[]>) {
    const from = vi.fn((table: string) => {
        const rows = tables[table] ?? [];
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
            select: vi.fn(() => chain),
            in: vi.fn(() => chain),
            then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
        });
        return chain;
    });
    return { from } as never;
}

const TOKENS = [
    { id: "t1", serial_number: "PAP-2026-0100", donor_id: "d1", value_inr: 50 },
    { id: "t2", serial_number: "PAP-2026-0101", donor_id: "d1", value_inr: 50 },
    { id: "t3", serial_number: "PAP-2026-0102", donor_id: null, value_inr: 50 },
];
const DONORS = [{ id: "d1", name: "Anitha R" }];

const req = (qs = "") => new NextRequest(`http://localhost/api/admin/scheduled-reminders${qs}`);

describe("GET /api/admin/scheduled-reminders", () => {
    beforeEach(() => vi.clearAllMocks());

    it("flags exactly the rows the next sweep will act on", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        createClientMock.mockResolvedValue(
            fakeSessionClient([
                // Due: still scheduled, lands on today+7 — the sweep's predicate.
                { id: "s1", token_id: "t1", scheduled_for: dayOffset(7), location: "Salem", status: "scheduled", created_at: "2026-08-01T10:00:00.000Z" },
                // Already reminded: the sweep skips it (that is what makes it idempotent).
                { id: "s2", token_id: "t2", scheduled_for: dayOffset(7), location: null, status: "reminded", created_at: "2026-08-01T10:00:00.000Z" },
                // Scheduled but not at T-7d yet.
                { id: "s3", token_id: "t3", scheduled_for: dayOffset(14), location: null, status: "scheduled", created_at: "2026-08-01T10:00:00.000Z" },
            ])
        );
        createAdminClientMock.mockReturnValue(fakeAdminClient({ tokens: TOKENS, donors: DONORS }));

        const res = await GET(req());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.target_date).toBe(dayOffset(7));
        expect(body.due_next_sweep).toBe(1);
        expect(body.schedules.map((s: { id: string; due_next_sweep: boolean }) => [s.id, s.due_next_sweep])).toEqual([
            ["s1", true],
            ["s2", false],
            ["s3", false],
        ]);
    });

    it("resolves the token serial and donor name, and never emits an id", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("compliance"));
        createClientMock.mockResolvedValue(
            fakeSessionClient([
                { id: "s1", token_id: "t1", scheduled_for: dayOffset(3), location: "Salem", status: "scheduled", created_at: "2026-08-01T10:00:00.000Z" },
            ])
        );
        createAdminClientMock.mockReturnValue(fakeAdminClient({ tokens: TOKENS, donors: DONORS }));

        const res = await GET(req());
        const body = await res.json();

        expect(body.schedules[0]).toMatchObject({
            serial_number: "PAP-2026-0100",
            donor_label: "Anitha R",
            value_inr: 50,
        });
        expect(JSON.stringify(body)).not.toContain('"d1"');
    });

    it("labels a token with no donor rather than dropping the row", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        createClientMock.mockResolvedValue(
            fakeSessionClient([
                { id: "s1", token_id: "t3", scheduled_for: dayOffset(2), location: null, status: "scheduled", created_at: "2026-08-01T10:00:00.000Z" },
            ])
        );
        createAdminClientMock.mockReturnValue(fakeAdminClient({ tokens: TOKENS, donors: DONORS }));

        const res = await GET(req());
        const body = await res.json();

        expect(body.schedules).toHaveLength(1);
        expect(body.schedules[0].donor_label).toBe("Unattributed");
    });

    it("rejects a look-ahead window outside its bounds", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));

        const res = await GET(req("?days=0"));

        expect(res.status).toBe(400);
    });

    it("returns 403 for a donor — read:own does not satisfy scope all", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("donor"));

        const res = await GET(req());

        expect(res.status).toBe(403);
    });

    it("returns 401 when unauthenticated", async () => {
        requireAppUserMock.mockRejectedValue(new UnauthorizedError());

        const res = await GET(req());

        expect(res.status).toBe(401);
    });
});
