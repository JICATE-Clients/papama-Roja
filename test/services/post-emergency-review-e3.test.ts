import { describe, expect, it, vi } from "vitest";

import {
    DEFAULT_THRESHOLDS,
    detectEmergencyPatterns,
    runPostEmergencyReview,
    type EmergencyRedemption,
} from "@/lib/services/postEmergencyReview";

/**
 * Acceptance tests for Work Order E-3 (B-27d) — post-emergency review queue.
 *
 * The card's criterion: "emergency closure populates the queue with FLAGGED
 * TRANSACTIONS ONLY". CD §D-7: risk-based, "normal transactions covered by the
 * regular random audit".
 *
 * That constraint is what most of these tests defend. Sweeping every emergency
 * transaction into review would be simpler and would defeat the purpose — a
 * queue of ten thousand rows is a queue nobody reads.
 */

const T0 = Date.parse("2026-09-09T10:00:00.000Z");

function redemption(over: Partial<EmergencyRedemption> = {}): EmergencyRedemption {
    return {
        id: "red-1",
        beneficiary_id: "ben-1",
        vendor_id: "v-1",
        redeemed_at: new Date(T0).toISOString(),
        contribution_waived: false,
        face_verification_skipped: false,
        service_district: "Coimbatore",
        token_value_inr: 60,
        ...over,
    };
}

/** N ordinary redemptions, all different beneficiaries, spread over days. */
function normalTraffic(count: number, vendorId = "v-1"): EmergencyRedemption[] {
    return Array.from({ length: count }, (_, i) =>
        redemption({
            id: `red-${i}`,
            beneficiary_id: `ben-${i}`,
            vendor_id: vendorId,
            redeemed_at: new Date(T0 + i * 86_400_000).toISOString(),
        })
    );
}

describe("E-3 — normal transactions do NOT reach the queue", () => {
    it("flags nothing in ordinary emergency traffic", () => {
        // The headline constraint. These are covered by F-3's 10% random sample
        // like any other transaction.
        const flags = detectEmergencyPatterns(normalTraffic(20), "Coimbatore");
        expect(flags).toEqual([]);
    });

    it("flags nothing for an empty emergency", () => {
        expect(detectEmergencyPatterns([], "Coimbatore")).toEqual([]);
    });

    it("does NOT flag a face skip on its own", () => {
        // Skipping the face is the POINT of emergency relaxation — flagging it
        // would put every emergency transaction in the queue.
        const rows = normalTraffic(20).map((r) => ({ ...r, face_verification_skipped: true }));
        expect(detectEmergencyPatterns(rows, "Coimbatore")).toEqual([]);
    });

    it("does NOT flag a waiver on its own", () => {
        // Same reasoning: the waiver is system-granted policy, not a red flag.
        // Only an anomalous RATE at one Food Partner is.
        const rows = normalTraffic(20).map((r) => ({ ...r, contribution_waived: true }));
        const flags = detectEmergencyPatterns(rows, "Coimbatore");
        // A single vendor serving everything trips volume + waiver rate, but
        // never "this transaction was waived".
        expect(flags.every((f) => f.pattern !== "waiver_on_transaction")).toBe(true);
    });
});

describe("E-3 — rapid repeats", () => {
    it("flags a second redemption by the same beneficiary within the window", () => {
        const flags = detectEmergencyPatterns(
            [
                redemption({ id: "a", redeemed_at: new Date(T0).toISOString() }),
                redemption({ id: "b", redeemed_at: new Date(T0 + 30 * 60_000).toISOString() }),
            ],
            null
        );
        const rapid = flags.filter((f) => f.pattern === "rapid_repeat");
        expect(rapid).toHaveLength(1);
        // The LATER transaction is the one under suspicion; the earlier may be
        // entirely legitimate.
        expect(rapid[0].redemptionId).toBe("b");
        expect(rapid[0].detail).toMatch(/30 minutes later/);
    });

    it("does NOT flag redemptions comfortably apart", () => {
        const flags = detectEmergencyPatterns(
            [
                redemption({ id: "a", redeemed_at: new Date(T0).toISOString() }),
                redemption({ id: "b", redeemed_at: new Date(T0 + 5 * 3_600_000).toISOString() }),
            ],
            null
        );
        expect(flags.filter((f) => f.pattern === "rapid_repeat")).toEqual([]);
    });

    it("ignores rows with no beneficiary — nothing to correlate", () => {
        const flags = detectEmergencyPatterns(
            [
                redemption({ id: "a", beneficiary_id: null }),
                redemption({ id: "b", beneficiary_id: null, redeemed_at: new Date(T0 + 60_000).toISOString() }),
            ],
            null
        );
        expect(flags.filter((f) => f.pattern === "rapid_repeat")).toEqual([]);
    });
});

describe("E-3 — same-identifier reuse", () => {
    it("flags a beneficiary redeeming repeatedly across the emergency", () => {
        const rows = Array.from({ length: DEFAULT_THRESHOLDS.identifierReuseCount }, (_, i) =>
            redemption({ id: `r-${i}`, redeemed_at: new Date(T0 + i * 86_400_000).toISOString() })
        );
        const flags = detectEmergencyPatterns(rows, null);
        const reuse = flags.filter((f) => f.pattern === "identifier_reuse");
        // ONE entry point into the pattern, not N copies of the same finding.
        expect(reuse).toHaveLength(1);
        expect(reuse[0].detail).toMatch(/redeemed 4 times/);
    });

    it("does not flag below the threshold", () => {
        const rows = Array.from({ length: DEFAULT_THRESHOLDS.identifierReuseCount - 1 }, (_, i) =>
            redemption({ id: `r-${i}`, redeemed_at: new Date(T0 + i * 86_400_000).toISOString() })
        );
        expect(detectEmergencyPatterns(rows, null).filter((f) => f.pattern === "identifier_reuse")).toEqual([]);
    });
});

describe("E-3 — vendor volume and waiver rate", () => {
    it("flags a Food Partner serving a dominant share", () => {
        const rows = [...normalTraffic(15, "v-busy"), ...normalTraffic(5, "v-quiet")].map((r, i) => ({
            ...r,
            id: `r-${i}`,
            beneficiary_id: `ben-${i}`,
        }));
        const flags = detectEmergencyPatterns(rows, null);
        const volume = flags.filter((f) => f.pattern === "vendor_volume_anomaly");
        expect(volume).toHaveLength(1);
        expect(volume[0].vendorId).toBe("v-busy");
        expect(volume[0].detail).toMatch(/75%/);
    });

    it("does NOT flag volume when there is only one Food Partner", () => {
        // A single-vendor emergency means 100% share by definition — flagging it
        // would be noise, not a finding.
        const flags = detectEmergencyPatterns(normalTraffic(20), null);
        expect(flags.filter((f) => f.pattern === "vendor_volume_anomaly")).toEqual([]);
    });

    it("requires a minimum sample before reporting a RATE", () => {
        // A vendor with 2 redemptions and 1 waiver is not a "50% waiver rate".
        const rows = [
            redemption({ id: "a", beneficiary_id: "b1", contribution_waived: true }),
            redemption({ id: "b", beneficiary_id: "b2", contribution_waived: true }),
        ];
        expect(detectEmergencyPatterns(rows, null).filter((f) => f.pattern === "waiver_pattern")).toEqual([]);
    });

    it("flags a near-total waiver rate once the sample is meaningful", () => {
        const rows = normalTraffic(12).map((r, i) => ({ ...r, contribution_waived: i < 12 }));
        const flags = detectEmergencyPatterns(rows, null);
        expect(flags.some((f) => f.pattern === "waiver_pattern")).toBe(true);
    });
});

describe("E-3 — geographic anomaly", () => {
    it("flags a redemption served outside the declared district", () => {
        const flags = detectEmergencyPatterns(
            [redemption({ id: "a", service_district: "Madurai" })],
            "Coimbatore"
        );
        const geo = flags.filter((f) => f.pattern === "geographic_anomaly");
        expect(geo).toHaveLength(1);
        // Worth a glance, not an accusation — a Food Partner may sit just over a
        // boundary.
        expect(geo[0].severity).toBe("minor");
    });

    it("does not flag inside the district, case-insensitively", () => {
        const flags = detectEmergencyPatterns(
            [redemption({ service_district: "  coimbatore " })],
            "Coimbatore"
        );
        expect(flags.filter((f) => f.pattern === "geographic_anomaly")).toEqual([]);
    });

    it("does not fire at all when the emergency declared no district", () => {
        const flags = detectEmergencyPatterns([redemption({ service_district: "Madurai" })], null);
        expect(flags.filter((f) => f.pattern === "geographic_anomaly")).toEqual([]);
    });
});

/** emergencies lookup, redemptions list, then exception_queue inserts. */
function fakeSweepClient(rows: unknown[], opts: { insertError?: string } = {}) {
    const insert = vi.fn().mockResolvedValue({ error: opts.insertError ? { message: opts.insertError } : null });
    return {
        client: {
            from: vi.fn().mockImplementation((table: string) => {
                if (table === "emergencies") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                maybeSingle: vi.fn().mockResolvedValue({
                                    data: { scope_district: { name: "Coimbatore" } },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                if (table === "token_redemptions") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
                        }),
                    };
                }
                return { insert };
            }),
        },
        insert,
    };
}

describe("E-3 — the closure sweep", () => {
    it("queues only the flagged transactions, not everything scanned", async () => {
        const rows = [
            ...normalTraffic(10),
            redemption({ id: "rapid-a", beneficiary_id: "ben-x", redeemed_at: new Date(T0).toISOString() }),
            redemption({
                id: "rapid-b",
                beneficiary_id: "ben-x",
                redeemed_at: new Date(T0 + 10 * 60_000).toISOString(),
            }),
        ];
        const { client, insert } = fakeSweepClient(rows);

        const result = await runPostEmergencyReview(client as never, "em-1");

        expect(result.scanned).toBe(12);
        expect(result.flagged).toBeGreaterThan(0);
        // The whole point: far fewer queued than scanned.
        expect(result.flagged).toBeLessThan(result.scanned);
        expect(insert).toHaveBeenCalledTimes(result.flagged);
    });

    it("tags every queued row with the Emergency ID so E-3 can filter", async () => {
        const { client, insert } = fakeSweepClient([
            redemption({ id: "a", beneficiary_id: "ben-x", redeemed_at: new Date(T0).toISOString() }),
            redemption({
                id: "b",
                beneficiary_id: "ben-x",
                redeemed_at: new Date(T0 + 60_000).toISOString(),
            }),
        ]);

        await runPostEmergencyReview(client as never, "em-1");
        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({ emergency_id: "em-1", exception_type: "emergency_pattern" })
        );
    });

    it("counts failures instead of throwing", async () => {
        // A sweep is a review aid; failing it must not block closing an
        // emergency, which is an accounting act with its own record.
        const { client } = fakeSweepClient(
            [
                redemption({ id: "a", beneficiary_id: "ben-x", redeemed_at: new Date(T0).toISOString() }),
                redemption({
                    id: "b",
                    beneficiary_id: "ben-x",
                    redeemed_at: new Date(T0 + 60_000).toISOString(),
                }),
            ],
            { insertError: "db down" }
        );

        const result = await runPostEmergencyReview(client as never, "em-1");
        expect(result.failures).toBeGreaterThan(0);
        expect(result.queued).toBe(0);
    });

    it("returns an empty result rather than throwing when nothing can be read", async () => {
        const exploding = {
            from: vi.fn().mockImplementation(() => {
                throw new Error("connection lost");
            }),
        };
        await expect(runPostEmergencyReview(exploding as never, "em-1")).resolves.toMatchObject({
            scanned: 0,
            flagged: 0,
        });
    });
});
