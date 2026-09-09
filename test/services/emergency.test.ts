import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/system-config", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/system-config")>();
    return { ...actual, getNumber: vi.fn() };
});
vi.mock("@/app/api/_lib/tokenQr", () => ({
    deriveQrPayload: vi.fn().mockReturnValue("PAPAMA:mock-payload"),
    qrHashOf: vi.fn().mockReturnValue("mock-qr-hash"),
}));
vi.mock("@/lib/services/audit", () => ({
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    AuditError: class AuditError extends Error { name = "AuditError"; },
}));

import {
    issueEmergencyToken,
    activateEmergencyOverride,
    revertEmergencyOverride,
} from "@/lib/services/emergency";
import { getNumber, MissingConfigError } from "@/lib/system-config";
import { writeAuditLog } from "@/lib/services/audit";
import { makeUser } from "@test/helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Spec references:
 * - §3.3 Disaster & emergency — emergency token minting
 * - §7 emergency_mode_max_duration_days = 30
 * - §7.1 — every emergency action must be fully audited
 */

const getNumberMock = vi.mocked(getNumber);

/**
 * E-1 (B-26): issueEmergencyToken now gates on an ACTIVE emergency record, so
 * the fake client must answer the `emergencies` lookup. Defaults to a live
 * emergency; pass `emergency: null` to exercise the refusal.
 */
const ACTIVE_EMERGENCY = {
    id: "em-1",
    emergency_ref: "TN-FLOOD-2026-001",
    title: "Test emergency",
    status: "active",
    ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    scope_state_id: null,
    scope_district_id: null,
    scope_city: null,
};

function buildAdmin(opts: {
    mintResult?: { id: string; serial_number: string };
    mintError?: string;
    grantResult?: { id: string };
    grantError?: string;
    emergency?: Record<string, unknown> | null;
}) {
    const from = vi.fn().mockImplementation((table: string) => {
        if (table === "emergencies") {
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: opts.emergency === undefined ? ACTIVE_EMERGENCY : opts.emergency,
                            error: null,
                        }),
                    }),
                }),
            };
        }
        if (table === "tokens") {
            const single = vi.fn().mockResolvedValue(
                opts.mintError
                    ? { data: null, error: { message: opts.mintError } }
                    : { data: opts.mintResult ?? { id: "tok-1", serial_number: "PPM-EMG-TEST" }, error: null }
            );
            return {
                insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
                delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            };
        }
        if (table === "emergency_token_grants") {
            const single = vi.fn().mockResolvedValue(
                opts.grantError
                    ? { data: null, error: { message: opts.grantError } }
                    : { data: opts.grantResult ?? { id: "grant-1" }, error: null }
            );
            return {
                insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
            };
        }
        return {};
    });
    return { from } as unknown as SupabaseClient;
}

describe("issueEmergencyToken", () => {
    const admin = makeUser("admin", { id: "admin-1" });

    beforeEach(() => {
        vi.clearAllMocks();
        getNumberMock.mockImplementation(async (key: string) => {
            if (key === "standard_token_value") return 50;
            if (key === "token_expiry_days") return 30;
            throw new MissingConfigError(key, "missing");
        });
    });

    it("mints a token and returns result", async () => {
        const client = buildAdmin({});
        const result = await issueEmergencyToken({ emergencyId: "em-1" }, admin, client);

        expect(result.token_id).toBe("tok-1");
        expect(result.serial_number).toBe("PPM-EMG-TEST");
        expect(result.value_inr).toBe(50);
        expect(result.grant_id).toBe("grant-1");
    });

    it("writes an audit log", async () => {
        const client = buildAdmin({});
        await issueEmergencyToken({ emergencyId: "em-1", reason: "Flood relief" }, admin, client);

        expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: "emergency.token.grant",
            entity_table: "tokens",
        }));
    });

    it("throws when standard_token_value is unset", async () => {
        getNumberMock.mockRejectedValue(new MissingConfigError("standard_token_value", "missing"));
        const client = buildAdmin({});

        await expect(issueEmergencyToken({ emergencyId: "em-1" }, admin, client)).rejects.toThrow();
    });

    it("throws when mint fails", async () => {
        const client = buildAdmin({ mintError: "insert failed" });

        await expect(issueEmergencyToken({ emergencyId: "em-1" }, admin, client)).rejects.toThrow("insert failed");
    });

    it("rolls back token when grant recording fails", async () => {
        const client = buildAdmin({ grantError: "grant insert failed" });

        await expect(issueEmergencyToken({ emergencyId: "em-1" }, admin, client)).rejects.toThrow("grant insert failed");
        // Token delete should have been called for rollback
        expect(client.from).toHaveBeenCalledWith("tokens");
    });

    it("passes reason to grant trail", async () => {
        const client = buildAdmin({});
        await issueEmergencyToken({ emergencyId: "em-1", reason: "Cyclone Michaung" }, admin, client);

        expect(client.from).toHaveBeenCalledWith("emergency_token_grants");
    });

    // --- E-1 (B-26) gate: no emergency token without an active emergency ----
    it("REFUSES to mint without an Emergency ID", async () => {
        const client = buildAdmin({});
        await expect(issueEmergencyToken({}, admin, client)).rejects.toThrow(
            /requires an Emergency ID/i
        );
        // Nothing was minted — the gate runs before any write.
        expect(client.from).not.toHaveBeenCalledWith("tokens");
    });

    it("REFUSES when the named emergency does not exist", async () => {
        const client = buildAdmin({ emergency: null });
        await expect(issueEmergencyToken({ emergencyId: "em-x" }, admin, client)).rejects.toThrow(
            /not found/i
        );
        expect(client.from).not.toHaveBeenCalledWith("tokens");
    });

    it("REFUSES when the emergency is closed", async () => {
        const client = buildAdmin({ emergency: { ...ACTIVE_EMERGENCY, status: "closed" } });
        await expect(issueEmergencyToken({ emergencyId: "em-1" }, admin, client)).rejects.toThrow(
            /is closed/i
        );
    });

    it("REFUSES when the emergency's end date has passed", async () => {
        // Relaxed limits must not outlive the emergency just because a closure
        // job was late (CD §D-6 forbids indefinite emergency mode).
        const client = buildAdmin({
            emergency: { ...ACTIVE_EMERGENCY, ends_at: "2020-01-01T00:00:00.000Z" },
        });
        await expect(issueEmergencyToken({ emergencyId: "em-1" }, admin, client)).rejects.toThrow(
            /ended on/i
        );
    });
});

// ---------------------------------------------------------------------------
// Spec-derived tests — §7, §7.1
// ---------------------------------------------------------------------------

describe("issueEmergencyToken — spec-derived", () => {
    const actor = makeUser("admin", { id: "admin-1" });

    beforeEach(() => {
        vi.clearAllMocks();
        getNumberMock.mockImplementation(async (key: string) => {
            if (key === "standard_token_value") return 50;
            if (key === "token_expiry_days") return 30;
            throw new MissingConfigError(key, "missing");
        });
    });

    it("uses standard_token_value from config for emergency minting (spec §7)", async () => {
        getNumberMock.mockImplementation(async (key: string) => {
            if (key === "standard_token_value") return 75;
            if (key === "token_expiry_days") return 30;
            throw new MissingConfigError(key, "missing");
        });
        const client = buildAdmin({});
        const result = await issueEmergencyToken({ emergencyId: "em-1" }, actor, client);

        expect(result.value_inr).toBe(75);
    });

    it("writes audit log for every emergency action (spec §7.1: fully audited)", async () => {
        const client = buildAdmin({});
        await issueEmergencyToken({ emergencyId: "em-1", reason: "Earthquake" }, actor, client);

        expect(writeAuditLog).toHaveBeenCalledTimes(1);
        expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: "emergency.token.grant",
        }));
    });
});

// ---------------------------------------------------------------------------
// activateEmergencyOverride / revertEmergencyOverride — addon #9
// ---------------------------------------------------------------------------

function buildOverrideAdmin(opts: {
    cfgRow?: { value: string | null } | null;
    insertResult?: { id: string };
    insertError?: string;
    /**
     * An already-active override for the same key, which makes the call an
     * EXTENSION rather than a fresh activation (Q-3 / B-14). Defaults to none.
     */
    activeOverride?: { id: string } | null;
}) {
    const from = vi.fn().mockImplementation((table: string) => {
        if (table === "system_config") {
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: opts.cfgRow === undefined ? { value: "6" } : opts.cfgRow,
                            error: null,
                        }),
                    }),
                }),
                update: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                }),
            };
        }
        if (table === "emergency_overrides") {
            return {
                // The extension guard's lookup: .select().eq().eq().limit().maybeSingle()
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            limit: vi.fn().mockReturnValue({
                                maybeSingle: vi.fn().mockResolvedValue({
                                    data: opts.activeOverride ?? null,
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                }),
                insert: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue(
                            opts.insertError
                                ? { data: null, error: { message: opts.insertError } }
                                : { data: opts.insertResult ?? { id: "ov-1" }, error: null }
                        ),
                    }),
                }),
            };
        }
        return {};
    });
    return { from } as unknown as SupabaseClient;
}

describe("activateEmergencyOverride", () => {
    const actor = makeUser("admin", { id: "admin-1" });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("computes expires_at from emergency_mode_max_duration_days when set", async () => {
        getNumberMock.mockResolvedValue(30);
        const admin = buildOverrideAdmin({});
        const result = await activateEmergencyOverride(
            { configKey: "emergency_max_meals_per_day", overrideValue: "5" },
            actor,
            admin
        );
        expect(result.id).toBe("ov-1");
        expect(result.expires_at).not.toBeNull();
    });

    it("leaves expires_at null when the duration config is unset (no auto-revert)", async () => {
        getNumberMock.mockRejectedValue(new MissingConfigError("emergency_mode_max_duration_days", "missing"));
        const admin = buildOverrideAdmin({});
        const result = await activateEmergencyOverride(
            { configKey: "emergency_max_meals_per_day", overrideValue: "5" },
            actor,
            admin
        );
        expect(result.expires_at).toBeNull();
    });

    it("writes an audit log capturing the previous value", async () => {
        getNumberMock.mockResolvedValue(30);
        const admin = buildOverrideAdmin({ cfgRow: { value: "3" } });
        await activateEmergencyOverride(
            { configKey: "emergency_max_meals_per_day", overrideValue: "5", reason: "flood" },
            actor,
            admin
        );
        expect(writeAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "emergency.override.activate",
                metadata: expect.objectContaining({ from: "3", to: "5" }),
            }),
            admin
        );
    });

    // --- Q-3 / B-14: extending an active override requires a reason ---------
    it("rejects an extension with no reason", async () => {
        getNumberMock.mockResolvedValue(30);
        const admin = buildOverrideAdmin({ activeOverride: { id: "ov-existing" } });
        await expect(
            activateEmergencyOverride(
                { configKey: "emergency_max_meals_per_day", overrideValue: "5" },
                actor,
                admin
            )
        ).rejects.toThrow(/already active.*requires a reason/i);
    });

    it("rejects an extension whose reason is only whitespace", async () => {
        getNumberMock.mockResolvedValue(30);
        const admin = buildOverrideAdmin({ activeOverride: { id: "ov-existing" } });
        await expect(
            activateEmergencyOverride(
                { configKey: "emergency_max_meals_per_day", overrideValue: "5", reason: "   " },
                actor,
                admin
            )
        ).rejects.toThrow(/requires a reason/i);
    });

    it("allows an extension that carries a reason", async () => {
        getNumberMock.mockResolvedValue(30);
        const admin = buildOverrideAdmin({ activeOverride: { id: "ov-existing" } });
        const result = await activateEmergencyOverride(
            {
                configKey: "emergency_max_meals_per_day",
                overrideValue: "5",
                reason: "Flood response extended — district collector request",
            },
            actor,
            admin
        );
        expect(result.id).toBe("ov-1");
    });

    it("still allows a FIRST activation with no reason", async () => {
        getNumberMock.mockResolvedValue(30);
        const admin = buildOverrideAdmin({ activeOverride: null });
        const result = await activateEmergencyOverride(
            { configKey: "emergency_max_meals_per_day", overrideValue: "5" },
            actor,
            admin
        );
        expect(result.id).toBe("ov-1");
    });

    it("throws when recording the override fails", async () => {
        getNumberMock.mockResolvedValue(30);
        const admin = buildOverrideAdmin({ insertError: "insert failed" });
        await expect(
            activateEmergencyOverride({ configKey: "x", overrideValue: "5" }, actor, admin)
        ).rejects.toThrow("insert failed");
    });
});

function buildRevertAdmin(opts: {
    overrideRow?: Record<string, unknown> | null;
    revertUpdatedRows?: Array<{ id: string }>;
}) {
    const from = vi.fn().mockImplementation((table: string) => {
        if (table === "emergency_overrides") {
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: opts.overrideRow === undefined
                                ? {
                                      id: "ov-1",
                                      config_key: "emergency_max_meals_per_day",
                                      override_value: "5",
                                      previous_value: "3",
                                      is_active: true,
                                  }
                                : opts.overrideRow,
                            error: null,
                        }),
                    }),
                }),
                update: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            select: vi.fn().mockResolvedValue({
                                data: opts.revertUpdatedRows ?? [{ id: "ov-1" }],
                                error: null,
                            }),
                        }),
                    }),
                }),
            };
        }
        if (table === "system_config") {
            return {
                update: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockResolvedValue({ error: null }),
                    }),
                }),
            };
        }
        return {};
    });
    return { from } as unknown as SupabaseClient;
}

describe("revertEmergencyOverride", () => {
    const actor = makeUser("admin", { id: "admin-1" });

    beforeEach(() => vi.clearAllMocks());

    it("reverts an active override and restores the previous value", async () => {
        const admin = buildRevertAdmin({});
        const result = await revertEmergencyOverride("ov-1", actor, admin);
        expect(result).toEqual({ id: "ov-1", reverted: true });
    });

    it("is a no-op when the override is already inactive", async () => {
        const admin = buildRevertAdmin({
            overrideRow: {
                id: "ov-1", config_key: "x", override_value: "5", previous_value: "3", is_active: false,
            },
        });
        const result = await revertEmergencyOverride("ov-1", actor, admin);
        expect(result).toEqual({ id: "ov-1", reverted: false });
    });

    it("throws when the override is not found", async () => {
        const admin = buildRevertAdmin({ overrideRow: null });
        await expect(revertEmergencyOverride("missing", actor, admin)).rejects.toThrow(
            "emergency override not found"
        );
    });

    it("returns reverted:false when the CAS update loses the race", async () => {
        const admin = buildRevertAdmin({ revertUpdatedRows: [] });
        const result = await revertEmergencyOverride("ov-1", actor, admin);
        expect(result).toEqual({ id: "ov-1", reverted: false });
    });

    it("writes an audit log on a successful revert", async () => {
        const admin = buildRevertAdmin({});
        await revertEmergencyOverride("ov-1", actor, admin);
        expect(writeAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({ action: "emergency.override.revert" }),
            admin
        );
    });
});
