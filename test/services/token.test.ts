import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/system-config", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/system-config")>();
    return { ...actual, getNumber: vi.fn(), getBoolean: vi.fn() };
});
vi.mock("@/app/api/_lib/tokenQr", () => ({
    deriveQrPayload: vi.fn().mockReturnValue("PAPAMA:mock-payload"),
    qrHashOf: vi.fn().mockReturnValue("mock-qr-hash"),
}));
vi.mock("@/lib/services/audit", () => ({
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    AuditError: class AuditError extends Error { name = "AuditError"; },
}));

import type { SupabaseClient } from "@supabase/supabase-js";

import { reportTokenLost, revalidateToken } from "@/lib/services/token";
import { writeAuditLog } from "@/lib/services/audit";
import { getBoolean } from "@/lib/system-config";
import { makeUser } from "@test/helpers";

/**
 * Spec references:
 * - §3.2 Token rules [M2-5]: lost-token handling (report -> block -> replace)
 * - §3.2/§7 [M2-5]: token revalidation (admin, audited, config-gated)
 */

const getBooleanMock = vi.mocked(getBoolean);

const BASE_TOKEN = {
    id: "tok-old",
    status: "live",
    serial_number: "PPM-STD-OLD",
    value_inr: 50,
    token_type: "standard",
    donor_id: "donor-1",
    beneficiary_id: null,
    campaign_id: null,
    is_emergency: false,
    expires_at: "2026-12-01T00:00:00.000Z",
};

function buildAdminForReportLoss(opts: {
    tokenRow?: Record<string, unknown> | null;
    blockedRows?: Array<{ id: string }>;
    mintResult?: { id: string; serial_number: string };
    mintError?: string;
}) {
    const tokens = {
        select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                    data: opts.tokenRow === undefined ? BASE_TOKEN : opts.tokenRow,
                    error: null,
                }),
            }),
        }),
        // Handles both call shapes: the block CAS (.eq(id).eq(status).select())
        // and the un-block rollback (.eq(id) alone, result never inspected).
        update: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockResolvedValue({
                        data: opts.blockedRows ?? [{ id: "tok-old" }],
                        error: null,
                    }),
                }),
            }),
        })),
        insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(
                    opts.mintError
                        ? { data: null, error: { message: opts.mintError } }
                        : { data: opts.mintResult ?? { id: "tok-new", serial_number: "PPM-RPL-NEW" }, error: null }
                ),
            }),
        }),
    };

    const from = vi.fn().mockImplementation((table: string) => {
        if (table === "tokens") return tokens;
        return {};
    });
    return { from } as unknown as SupabaseClient;
}

describe("reportTokenLost", () => {
    const actor = makeUser("admin", { id: "admin-1" });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("blocks the old token and mints a same-value replacement", async () => {
        const client = buildAdminForReportLoss({});
        const result = await reportTokenLost({ tokenId: "tok-old" }, actor, client);

        expect(result.old_token_id).toBe("tok-old");
        expect(result.new_token_id).toBe("tok-new");
        expect(result.new_serial).toBe("PPM-RPL-NEW");
        expect(result.value_inr).toBe(50);
    });

    it("writes an audit log", async () => {
        const client = buildAdminForReportLoss({});
        await reportTokenLost({ tokenId: "tok-old", reason: "left in an auto" }, actor, client);

        expect(writeAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({ action: "token.report_lost", entity_table: "tokens" }),
            client
        );
    });

    it("rejects when the token is not found", async () => {
        const client = buildAdminForReportLoss({ tokenRow: null });
        await expect(reportTokenLost({ tokenId: "missing" }, actor, client)).rejects.toThrow(
            "token not found"
        );
    });

    it("rejects a token that isn't live/distributed", async () => {
        const client = buildAdminForReportLoss({ tokenRow: { ...BASE_TOKEN, status: "redeemed" } });
        await expect(reportTokenLost({ tokenId: "tok-old" }, actor, client)).rejects.toThrow(
            /only a live\/distributed token/
        );
    });

    it("rejects an ownership mismatch as not-found (donor self-service)", async () => {
        const client = buildAdminForReportLoss({});
        await expect(
            reportTokenLost({ tokenId: "tok-old", expectedDonorId: "someone-else" }, actor, client)
        ).rejects.toThrow("token not found");
    });

    it("throws when the concurrent block CAS loses (status changed underneath)", async () => {
        const client = buildAdminForReportLoss({ blockedRows: [] });
        await expect(reportTokenLost({ tokenId: "tok-old" }, actor, client)).rejects.toThrow(
            /concurrently/
        );
    });

    it("rolls back the block and rethrows when minting the replacement fails", async () => {
        const client = buildAdminForReportLoss({ mintError: "insert failed" });
        await expect(reportTokenLost({ tokenId: "tok-old" }, actor, client)).rejects.toThrow(
            "insert failed"
        );
    });
});


describe("revalidateToken — RETIRED (A-2 / B-23)", () => {
    const actor = makeUser("admin", { id: "admin-1" });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * The client retired revalidation on 18 Aug 2026. It reactivated the SAME
     * token, which contradicts "expired = permanently non-redeemable" — it left
     * a QR in circulation that was supposed to be dead. The replacement is a
     * controlled reissue: a new token, new QR, permanently linked to the
     * original.
     *
     * These tests assert the RETIREMENT, and deliberately replace the old
     * behaviour tests (audit written, status restored, expiry extended) — those
     * described behaviour that must no longer be possible.
     */
    it("refuses unconditionally, whatever the token's state", async () => {
        await expect(revalidateToken("tok-1", actor)).rejects.toThrow(/retired/i);
    });

    it("points the caller at the controlled reissue instead of just refusing", async () => {
        await expect(revalidateToken("tok-1", actor)).rejects.toThrow(/reissue/i);
    });

    it("cannot be re-enabled by flipping token_revalidation_allowed", async () => {
        // The config key is forced false by migration 20260907000004, but a
        // config an admin can toggle is not a retirement. The refusal is in
        // code and reads no config at all — so it holds even if the key is
        // somehow set back to true.
        getBooleanMock.mockResolvedValue(true);
        await expect(revalidateToken("tok-1", actor)).rejects.toThrow(/retired/i);
        expect(getBooleanMock).not.toHaveBeenCalled();
    });

    it("writes no audit row — nothing happened to audit", async () => {
        await expect(revalidateToken("tok-1", actor)).rejects.toThrow();
        expect(writeAuditLog).not.toHaveBeenCalled();
    });
});
