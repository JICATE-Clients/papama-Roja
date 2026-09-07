import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser } from "@/lib/auth";

/**
 * Acceptance tests for Work Order Lane 0 (quick fixes).
 *
 * Q-1 (B-10) — `co_contribution_max` hard ceiling of 10:
 *     PATCH 11 → 400; PATCH 10 → stored; audit row written.
 * Q-3 (B-14) — reason on config-change audit:
 *     reason present → lands in audit metadata; absent → key omitted entirely.
 * Q-4 (B-06) — go-live readiness classification:
 *     an unset mandatory key is reported; a key set to "0" is NOT (zero is a
 *     legitimate policy value, not an absence).
 *
 * REAL: defineRoute, the permission matrix, the Zod schema, the ceiling and
 * readiness logic. MOCKED: auth, Supabase clients, the audit writer.
 */

vi.mock("@/lib/auth", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/auth")>();
    return { ...actual, requireAppUser: vi.fn() };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/services/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import { requireAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/audit";
import { PATCH } from "@/app/api/admin/system-config/route";
import { findUnsetMandatoryConfig, GO_LIVE_MANDATORY_KEYS } from "@/lib/services/go-live";

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

/**
 * `.from('system_config')` supporting both the route's read
 * (`.select().eq().single()`) and its write (`.update().eq()`).
 */
function fakeConfigClient(row: { key: string; value: string | null; value_type: string }) {
    const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
    });
    return {
        client: {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: row, error: null }),
                    }),
                }),
                update,
            }),
        },
        update,
    };
}

function patchReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/admin/system-config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    requireAppUserMock.mockResolvedValue(admin());
});

describe("Q-1 — co_contribution_max hard ceiling of 10", () => {
    it("rejects 11 with 400 and writes nothing", async () => {
        const { client, update } = fakeConfigClient({
            key: "co_contribution_max",
            value: "5",
            value_type: "number",
        });
        createAdminClientMock.mockReturnValue(client as never);

        const res = await PATCH(patchReq({ key: "co_contribution_max", value: 11 }));

        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toMatchObject({
            error: expect.stringContaining("cannot exceed 10"),
        });
        expect(update).not.toHaveBeenCalled();
        expect(writeAuditLogMock).not.toHaveBeenCalled();
    });

    it("accepts exactly 10, stores it, and audits the change", async () => {
        const { client, update } = fakeConfigClient({
            key: "co_contribution_max",
            value: "5",
            value_type: "number",
        });
        createAdminClientMock.mockReturnValue(client as never);

        const res = await PATCH(patchReq({ key: "co_contribution_max", value: 10 }));

        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toMatchObject({ ok: true, value: "10" });
        expect(update).toHaveBeenCalledWith(expect.objectContaining({ value: "10" }));
        expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    });

    it("leaves other numeric keys uncapped", async () => {
        const { client, update } = fakeConfigClient({
            key: "standard_token_value",
            value: "60",
            value_type: "number",
        });
        createAdminClientMock.mockReturnValue(client as never);

        const res = await PATCH(patchReq({ key: "standard_token_value", value: 250 }));

        expect(res.status).toBe(200);
        expect(update).toHaveBeenCalledWith(expect.objectContaining({ value: "250" }));
    });

    it("still rejects a negative value", async () => {
        const { client } = fakeConfigClient({
            key: "co_contribution_max",
            value: "5",
            value_type: "number",
        });
        createAdminClientMock.mockReturnValue(client as never);

        const res = await PATCH(patchReq({ key: "co_contribution_max", value: -1 }));
        expect(res.status).toBe(400);
    });
});

describe("Q-3 — reason on the config-change audit", () => {
    it("stores a supplied reason in audit metadata", async () => {
        const { client } = fakeConfigClient({
            key: "co_contribution_max",
            value: "5",
            value_type: "number",
        });
        createAdminClientMock.mockReturnValue(client as never);

        await PATCH(
            patchReq({
                key: "co_contribution_max",
                value: 10,
                reason: "Client decision D-1 — ₹10 contribution approved",
            })
        );

        expect(writeAuditLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "system_config.update",
                metadata: expect.objectContaining({
                    from: "5",
                    to: "10",
                    reason: "Client decision D-1 — ₹10 contribution approved",
                }),
            })
        );
    });

    it("omits the reason key entirely when none is given", async () => {
        const { client } = fakeConfigClient({
            key: "co_contribution_max",
            value: "5",
            value_type: "number",
        });
        createAdminClientMock.mockReturnValue(client as never);

        await PATCH(patchReq({ key: "co_contribution_max", value: 10 }));

        const metadata = writeAuditLogMock.mock.calls[0][0].metadata as Record<string, unknown>;
        expect(metadata).not.toHaveProperty("reason");
    });
});

describe("Q-4 — go-live readiness", () => {
    function fakeReadClient(rows: { key: string; value: string | null }[]) {
        return {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    in: vi.fn().mockResolvedValue({ data: rows, error: null }),
                }),
            }),
        };
    }

    /** Every mandatory key present and set, used as the "all clear" baseline. */
    function allSet() {
        return GO_LIVE_MANDATORY_KEYS.map((k) => ({ key: k.key, value: "1" }));
    }

    it("names standard_token_value when it is NULL", async () => {
        const rows = allSet().map((r) =>
            r.key === "standard_token_value" ? { ...r, value: null } : r
        );
        const unset = await findUnsetMandatoryConfig(fakeReadClient(rows) as never);

        expect(unset.map((u) => u.key)).toEqual(["standard_token_value"]);
        expect(unset[0].consequence).toMatch(/cannot be minted/i);
    });

    it("reports nothing once every mandatory key is set", async () => {
        const unset = await findUnsetMandatoryConfig(fakeReadClient(allSet()) as never);
        expect(unset).toEqual([]);
    });

    it("treats a value of 0 as SET, not missing", async () => {
        const rows = allSet().map((r) =>
            r.key === "meal_cooldown_hours" ? { ...r, value: "0" } : r
        );
        const unset = await findUnsetMandatoryConfig(fakeReadClient(rows) as never);
        expect(unset).toEqual([]);
    });

    it("treats a missing row as unset", async () => {
        const rows = allSet().filter((r) => r.key !== "max_tokens_per_volunteer");
        const unset = await findUnsetMandatoryConfig(fakeReadClient(rows) as never);
        expect(unset.map((u) => u.key)).toEqual(["max_tokens_per_volunteer"]);
    });

    it("returns nothing on a read error rather than throwing", async () => {
        const failing = {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    in: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
                }),
            }),
        };
        await expect(findUnsetMandatoryConfig(failing as never)).resolves.toEqual([]);
    });
});
