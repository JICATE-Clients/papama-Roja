import { describe, expect, it, vi } from "vitest";

import {
    checkCaptureWindow,
    findConflicts,
    syncOfflineBatch,
    type OfflineCapture,
} from "@/lib/services/offlineSync";

/**
 * Acceptance tests for Work Order E-4 (B-30) — controlled offline emergency
 * transactions. Design: docs/design-offline-emergency-transactions.md
 *
 * The card's stated criteria:
 *   - airplane-mode capture during an active emergency syncs to
 *     "Pending Offline Validation"
 *   - the source field is present on every record
 *   - a duplicate token across two devices flags BOTH, silently accepting
 *     neither
 *   - a normal-period offline attempt is refused
 */

/**
 * Anchored to NOW, not to wall-clock literals.
 *
 * `syncOfflineBatch` stamps `received_at` from the real clock, so a fixed
 * capture timestamp is ahead of "now" for anyone west of the author's timezone —
 * and the code then correctly rejects it as a future-dated capture. Relative
 * fixtures keep the test about the rule rather than about where it runs.
 */
const NOW = Date.now();
const HOUR = 3_600_000;
const EMERGENCY_START = new Date(NOW - 24 * HOUR).toISOString();
const EMERGENCY_END = new Date(NOW + 6 * 24 * HOUR).toISOString();
/** Comfortably inside the emergency and safely in the past. */
const DURING = new Date(NOW - 2 * HOUR).toISOString();
const RECEIVED = new Date(NOW).toISOString();

function capture(over: Partial<OfflineCapture> = {}): OfflineCapture {
    return {
        id: "11111111-1111-4111-8111-111111111111",
        token_id: "aaaaaaaa-1111-4111-8111-111111111111",
        emergency_id: "em-1",
        captured_at: DURING,
        device_reference: "device-a",
        source: "volunteer",
        ...over,
    };
}

describe("E-4 — offline capture is EMERGENCY ONLY", () => {
    it("REFUSES a capture from outside the emergency period", () => {
        // CD §D-9: normal operations have no offline path. A volunteer must not
        // be able to improvise a redemption when the connection drops on an
        // ordinary Tuesday.
        const r = checkCaptureWindow({
            capturedAt: new Date(NOW - 40 * 24 * HOUR).toISOString(), // long before the emergency
            receivedAt: RECEIVED,
            emergencyStart: EMERGENCY_START,
            emergencyEnd: EMERGENCY_END,
            maxSyncWindowHours: null,
        });
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/emergency-only/i);
    });

    it("REFUSES a capture after the emergency ended", () => {
        const r = checkCaptureWindow({
            capturedAt: new Date(NOW + 10 * 24 * HOUR).toISOString(), // after it ends
            receivedAt: new Date(NOW + 11 * 24 * HOUR).toISOString(),
            emergencyStart: EMERGENCY_START,
            emergencyEnd: EMERGENCY_END,
            maxSyncWindowHours: null,
        });
        expect(r.ok).toBe(false);
    });

    it("REFUSES when no emergency period is on record", () => {
        const r = checkCaptureWindow({
            capturedAt: DURING,
            receivedAt: RECEIVED,
            emergencyStart: null,
            emergencyEnd: null,
            maxSyncWindowHours: null,
        });
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/no emergency period/i);
    });

    it("ACCEPTS a capture inside the emergency period", () => {
        const r = checkCaptureWindow({
            capturedAt: DURING,
            receivedAt: RECEIVED,
            emergencyStart: EMERGENCY_START,
            emergencyEnd: EMERGENCY_END,
            maxSyncWindowHours: null,
        });
        expect(r.ok).toBe(true);
    });
});

describe("E-4 — the device clock is not trusted", () => {
    it("REFUSES a capture timestamped in the future", () => {
        // A device clock is a value an attacker controls. Forward-dating would
        // otherwise extend the local offline window at will.
        const r = checkCaptureWindow({
            capturedAt: new Date(NOW + 5 * 24 * HOUR).toISOString(), // forward-dated device
            receivedAt: new Date(NOW).toISOString(),
            emergencyStart: EMERGENCY_START,
            emergencyEnd: EMERGENCY_END,
            maxSyncWindowHours: null,
        });
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/device clock is wrong/i);
    });

    it("tolerates a few minutes of ordinary clock drift", () => {
        const received = Date.parse(DURING) + 60_000;
        const r = checkCaptureWindow({
            capturedAt: DURING,
            receivedAt: new Date(received).toISOString(),
            emergencyStart: EMERGENCY_START,
            emergencyEnd: EMERGENCY_END,
            maxSyncWindowHours: null,
        });
        expect(r.ok).toBe(true);
    });

    it("checks the window against the SERVER's emergency period, not the claim", () => {
        // The device supplies emergency_id; the period comes from the server.
        const r = checkCaptureWindow({
            capturedAt: DURING,
            receivedAt: RECEIVED,
            emergencyStart: new Date(NOW - HOUR).toISOString(), // server says it began AFTER the capture
            emergencyEnd: EMERGENCY_END,
            maxSyncWindowHours: null,
        });
        expect(r.ok).toBe(false);
    });
});

describe("E-4 — the sync window limit", () => {
    it("is NOT enforced when unset, and says so rather than guessing", () => {
        // Same discipline as max_tokens_per_volunteer: these four limits are the
        // client's to set (design §11). An invented default silently becomes
        // policy nobody approved.
        const r = checkCaptureWindow({
            capturedAt: DURING,
            receivedAt: new Date(NOW + 5 * 24 * HOUR).toISOString(),
            emergencyStart: EMERGENCY_START,
            emergencyEnd: EMERGENCY_END,
            maxSyncWindowHours: null,
        });
        expect(r.ok).toBe(true);
    });

    it("rejects a stale capture once a window IS configured", () => {
        const r = checkCaptureWindow({
            capturedAt: DURING,
            receivedAt: new Date(Date.parse(DURING) + 72 * HOUR).toISOString(), // 72h later
            emergencyStart: EMERGENCY_START,
            emergencyEnd: EMERGENCY_END,
            maxSyncWindowHours: 24,
        });
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/beyond the 24h sync window/i);
    });
});

describe("E-4 — duplicate detection flags BOTH, accepting neither", () => {
    it("flags both captures of the same token across two devices", () => {
        // THE card's criterion. "Earliest wins" is rejected deliberately: a
        // duplicate may be a crash retry, two volunteers helping one person, or
        // deliberate reuse, and the system cannot tell them apart. Auto-picking
        // would silently discard a genuine meal or silently accept fraud.
        const a = capture({ id: "aaaa1111-1111-4111-8111-111111111111", device_reference: "device-a" });
        const b = capture({ id: "bbbb2222-2222-4222-8222-222222222222", device_reference: "device-b" });

        const conflicts = findConflicts([a, b], new Set());

        expect(conflicts.has(a.id)).toBe(true);
        expect(conflicts.has(b.id)).toBe(true);
        expect(conflicts.size).toBe(2);
    });

    it("flags a capture whose token is already redeemed or queued", () => {
        const c = capture();
        const conflicts = findConflicts([c], new Set([c.token_id!]));
        expect(conflicts.has(c.id)).toBe(true);
    });

    it("does NOT flag distinct tokens", () => {
        const a = capture({ id: "aaaa1111-1111-4111-8111-111111111111", token_id: "tok-a" });
        const b = capture({ id: "bbbb2222-2222-4222-8222-222222222222", token_id: "tok-b" });
        expect(findConflicts([a, b], new Set()).size).toBe(0);
    });

    it("ignores captures with no token — nothing to collide on", () => {
        const a = capture({ id: "aaaa1111-1111-4111-8111-111111111111", token_id: null });
        const b = capture({ id: "bbbb2222-2222-4222-8222-222222222222", token_id: null });
        expect(findConflicts([a, b], new Set()).size).toBe(0);
    });
});

/**
 * A client answering: token_redemptions / offline_transactions lookups, the
 * device roster, emergencies, and the upsert path.
 */
function fakeSyncClient(opts: {
    redeemedTokenIds?: string[];
    priorOfflineTokenIds?: string[];
    compromisedDevices?: string[];
    emergencyPeriod?: { start: string; end: string } | null;
    upsertError?: string;
} = {}) {
    const upsert = vi.fn().mockResolvedValue({ error: opts.upsertError ? { message: opts.upsertError } : null });
    const exceptionInsert = vi.fn().mockResolvedValue({ error: null });

    const client = {
        from: vi.fn().mockImplementation((table: string) => {
            if (table === "token_redemptions") {
                return {
                    select: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({
                            data: (opts.redeemedTokenIds ?? []).map((t) => ({ token_id: t })),
                            error: null,
                        }),
                    }),
                };
            }
            if (table === "offline_transactions") {
                return {
                    select: vi.fn().mockReturnValue({
                        in: vi.fn().mockReturnValue({
                            in: vi.fn().mockResolvedValue({
                                data: (opts.priorOfflineTokenIds ?? []).map((t) => ({
                                    token_id: t,
                                    id: "prior",
                                })),
                                error: null,
                            }),
                        }),
                    }),
                    upsert,
                };
            }
            if (table === "offline_devices") {
                return {
                    select: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({
                            data: (opts.compromisedDevices ?? []).map((d) => ({
                                device_reference: d,
                                is_compromised: true,
                            })),
                            error: null,
                        }),
                    }),
                    upsert,
                };
            }
            if (table === "emergencies") {
                const period =
                    opts.emergencyPeriod === null
                        ? []
                        : [
                              {
                                  id: "em-1",
                                  activated_at: (opts.emergencyPeriod ?? {
                                      start: EMERGENCY_START,
                                  }).start,
                                  ends_at: (opts.emergencyPeriod ?? { end: EMERGENCY_END }).end,
                              },
                          ];
                return {
                    select: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({ data: period, error: null }),
                    }),
                };
            }
            return { insert: exceptionInsert, upsert };
        }),
    };
    return { client, upsert, exceptionInsert };
}

describe("E-4 — a batch syncs to Pending Offline Validation", () => {
    it("accepts an in-emergency capture for validation", async () => {
        // The card's criterion: airplane-mode capture during an active
        // emergency succeeds and lands as pending validation.
        const { client, upsert } = fakeSyncClient();
        const result = await syncOfflineBatch(client as never, [capture()], {
            maxSyncWindowHours: null,
        });

        expect(result.received).toBe(1);
        expect(result.rejected).toBe(0);
        expect(result.duplicates).toBe(0);
        expect(result.results[0].outcome).toBe("pending_offline_validation");
        expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({ status: "pending_offline_validation" }),
            expect.anything()
        );
    });

    it("NEVER writes a redemption — a capture is not a redemption", async () => {
        // The central design rule. The token is burned only when an admin
        // approves the capture through the normal engine.
        const { client } = fakeSyncClient();
        await syncOfflineBatch(client as never, [capture()], { maxSyncWindowHours: null });

        const written = client.from.mock.calls.map((c) => c[0]);
        expect(written).not.toContain("tokens");
    });

    it("records the SOURCE on every capture", async () => {
        const { client, upsert } = fakeSyncClient();
        await syncOfflineBatch(
            client as never,
            [capture({ source: "food_partner" })],
            { maxSyncWindowHours: null }
        );
        expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({ source: "food_partner" }),
            expect.anything()
        );
    });

    it("marks both sides of a duplicate and queues an exception", async () => {
        const { client, exceptionInsert } = fakeSyncClient();
        const a = capture({ id: "aaaa1111-1111-4111-8111-111111111111", device_reference: "device-a" });
        const b = capture({ id: "bbbb2222-2222-4222-8222-222222222222", device_reference: "device-b" });

        const result = await syncOfflineBatch(client as never, [a, b], {
            maxSyncWindowHours: null,
        });

        expect(result.duplicates).toBe(2);
        expect(result.results.every((r) => r.outcome === "duplicate")).toBe(true);
        // Routed to F-3's shared exception queue — "build once", as the Work
        // Order's cross-cutting note anticipated.
        expect(exceptionInsert).toHaveBeenCalledWith(
            expect.objectContaining({ exception_type: "offline_duplicate" })
        );
    });

    it("rejects captures from a device reported compromised", async () => {
        // Design §7: once a device is physically gone this is the only
        // server-side control left.
        const { client } = fakeSyncClient({ compromisedDevices: ["device-a"] });
        const result = await syncOfflineBatch(
            client as never,
            [capture({ device_reference: "device-a" })],
            { maxSyncWindowHours: null }
        );
        expect(result.rejected).toBe(1);
        expect(result.results[0].reason).toMatch(/compromised/i);
    });

    it("rejects a capture with no token reference", async () => {
        const { client } = fakeSyncClient();
        const result = await syncOfflineBatch(client as never, [capture({ token_id: null })], {
            maxSyncWindowHours: null,
        });
        expect(result.rejected).toBe(1);
    });

    it("handles an empty batch without touching the database", async () => {
        const { client } = fakeSyncClient();
        const result = await syncOfflineBatch(client as never, [], { maxSyncWindowHours: null });
        expect(result.received).toBe(0);
        expect(client.from).not.toHaveBeenCalled();
    });

    it("is idempotent — a re-uploaded batch upserts on the device-generated id", async () => {
        // A device that syncs, loses the response and retries must not create a
        // second set of claims.
        const { client, upsert } = fakeSyncClient();
        await syncOfflineBatch(client as never, [capture()], { maxSyncWindowHours: null });
        expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({ id: capture().id }),
            expect.objectContaining({ onConflict: "id" })
        );
    });
});
