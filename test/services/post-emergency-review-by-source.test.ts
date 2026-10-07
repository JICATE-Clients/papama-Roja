import { describe, expect, it, vi } from "vitest";

import {
    CAPTURE_SOURCES,
    DEFAULT_CAPTURE_THRESHOLDS,
    detectCapturePatterns,
    runOfflineCaptureReview,
    type EmergencyCapture,
} from "@/lib/services/postEmergencyReview";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * CD §D-9 (confirmed 18 Aug) and the offline design §2: post-emergency review
 * runs SEPARATELY BY SOURCE, because a Food Partner recording at their own till
 * and a volunteer recording in a field are different risk profiles and must not
 * be pooled. These tests exist mainly to stop the two cohorts being merged back
 * together by a later convenience.
 */

let seq = 0;
function capture(over: Partial<EmergencyCapture> = {}): EmergencyCapture {
    seq += 1;
    return {
        id: `cap-${seq}`,
        source: "food_partner",
        device_reference: "till-1",
        food_partner_id: "vendor-1",
        volunteer_id: null,
        beneficiary_identifier: null,
        captured_at: "2026-10-01T10:00:00.000Z",
        received_at: "2026-10-01T10:05:00.000Z",
        waiver_status: false,
        status: "pending_offline_validation",
        ...over,
    };
}

describe("E-3 / CD §D-9 — the two sources are never pooled", () => {
    it("refuses a mixed cohort rather than silently averaging across sources", () => {
        // The failure this requirement exists to prevent. Passing both sources in
        // one list would compute every rate across a mixed population, which is
        // exactly what "must not be pooled" forbids — so it is an error, not a
        // quiet best-effort.
        const mixed = [capture({ source: "food_partner" }), capture({ source: "volunteer" })];
        expect(() => detectCapturePatterns(mixed, "food_partner")).toThrow(
            /must be reviewed separately/i
        );
    });

    it("measures a device's share against its OWN source, not the whole emergency", () => {
        // One volunteer device with 3 of 3 volunteer captures is the whole cohort,
        // even though it is a small share of the 23 captures in the emergency.
        // Pooled, it would vanish; split, it surfaces.
        const volunteer: EmergencyCapture[] = [
            capture({ source: "volunteer", device_reference: "phone-a", food_partner_id: null }),
            capture({ source: "volunteer", device_reference: "phone-a", food_partner_id: null }),
            capture({ source: "volunteer", device_reference: "phone-a", food_partner_id: null }),
            capture({ source: "volunteer", device_reference: "phone-b", food_partner_id: null }),
            capture({ source: "volunteer", device_reference: "phone-c", food_partner_id: null }),
        ];
        const flags = detectCapturePatterns(volunteer, "volunteer");
        const volume = flags.filter((f) => f.pattern === "device_volume_anomaly");
        expect(volume.length).toBeGreaterThan(0);
        expect(volume.every((f) => f.source === "volunteer")).toBe(true);
        expect(volume[0].detail).toMatch(/volunteer captures/);
    });

    it("names the source on every flag, so a reviewer never has to guess", () => {
        const flags = detectCapturePatterns(
            [
                capture({ beneficiary_identifier: "ben-1" }),
                capture({ beneficiary_identifier: "ben-1" }),
            ],
            "food_partner"
        );
        expect(flags.length).toBeGreaterThan(0);
        expect(flags.every((f) => f.source === "food_partner")).toBe(true);
    });

    it("flags an identifier used more than once within a source", () => {
        const flags = detectCapturePatterns(
            [
                capture({ beneficiary_identifier: "ben-7" }),
                capture({ beneficiary_identifier: "ben-7" }),
                capture({ beneficiary_identifier: "ben-8" }),
            ],
            "food_partner"
        );
        const reuse = flags.filter((f) => f.pattern === "identifier_reuse_offline");
        expect(reuse).toHaveLength(2);
        expect(reuse[0].detail).toMatch(/ben-7/);
    });

    it("flags a device whose captures are mostly refused", () => {
        const list = Array.from({ length: 6 }, (_, i) =>
            capture({ device_reference: "till-9", status: i < 3 ? "rejected" : "validated" })
        );
        const flags = detectCapturePatterns(list, "food_partner");
        const refused = flags.filter((f) => f.pattern === "device_rejection_rate");
        expect(refused).toHaveLength(3);
        expect(refused[0].severity).toBe("major");
    });

    it("does not compute a rate from too few captures to mean anything", () => {
        // Two captures, both refused, is 100% — and says nothing. A rate needs a
        // sample before it is a rate.
        const list = [
            capture({ device_reference: "till-2", status: "rejected" }),
            capture({ device_reference: "till-2", status: "rejected" }),
        ];
        const flags = detectCapturePatterns(list, "food_partner");
        expect(flags.filter((f) => f.pattern === "device_rejection_rate")).toHaveLength(0);
    });

    it("flags a capture that synced long after it was taken", () => {
        const flags = detectCapturePatterns(
            [
                capture({
                    captured_at: "2026-10-01T10:00:00.000Z",
                    received_at: "2026-10-04T10:00:00.000Z", // 72 hours
                }),
            ],
            "food_partner"
        );
        expect(flags.some((f) => f.pattern === "late_sync")).toBe(true);
    });

    it("says nothing about an ordinary cohort", () => {
        const list = [
            capture({ device_reference: "till-1" }),
            capture({ device_reference: "till-2" }),
            capture({ device_reference: "till-3" }),
        ];
        expect(detectCapturePatterns(list, "food_partner")).toHaveLength(0);
    });

    it("keeps thresholds conservative — a false positive is cheaper than a missed pattern", () => {
        expect(DEFAULT_CAPTURE_THRESHOLDS.minimumSampleForRate).toBeGreaterThanOrEqual(5);
        expect(DEFAULT_CAPTURE_THRESHOLDS.deviceVolumeShare).toBeGreaterThanOrEqual(0.5);
    });
});

describe("E-3 / CD §D-9 — the sweep reports per source", () => {
    function fakeClient(rows: EmergencyCapture[]) {
        const queued: { entityId: string; detail: string }[] = [];
        const client = {
            from: vi.fn((table: string) => {
                if (table === "offline_transactions") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
                        }),
                    };
                }
                // The exception queue, reached through flagException.
                return {
                    insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
                        queued.push({
                            entityId: String(row.entity_id),
                            detail: String(row.detail ?? ""),
                        });
                        return Promise.resolve({ error: null });
                    }),
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                eq: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                                }),
                            }),
                        }),
                    }),
                };
            }),
        } as unknown as SupabaseClient;
        return { client, queued };
    }

    it("returns a result for each source and never a single total", async () => {
        const rows = [
            ...Array.from({ length: 3 }, () => capture({ source: "food_partner" })),
            ...Array.from({ length: 2 }, () =>
                capture({ source: "volunteer", food_partner_id: null, device_reference: "phone-a" })
            ),
        ];
        const { client } = fakeClient(rows);
        const result = await runOfflineCaptureReview(client, "em-1");

        expect(Object.keys(result).sort()).toEqual([...CAPTURE_SOURCES].sort());
        expect(result.food_partner.scanned).toBe(3);
        expect(result.volunteer.scanned).toBe(2);
        // No `total` field exists to be read by mistake.
        expect(result as unknown as Record<string, unknown>).not.toHaveProperty("total");
    });

    it("stamps the source on the queued exception detail", async () => {
        const rows = [
            capture({ source: "volunteer", beneficiary_identifier: "ben-1", food_partner_id: null }),
            capture({ source: "volunteer", beneficiary_identifier: "ben-1", food_partner_id: null }),
        ];
        const { client, queued } = fakeClient(rows);
        await runOfflineCaptureReview(client, "em-1");
        expect(queued.length).toBeGreaterThan(0);
        expect(queued.every((q) => q.detail.startsWith("[volunteer]"))).toBe(true);
    });

    it("survives an emergency with no offline captures at all", async () => {
        const { client } = fakeClient([]);
        const result = await runOfflineCaptureReview(client, "em-1");
        for (const source of CAPTURE_SOURCES) {
            expect(result[source]).toEqual({ scanned: 0, flagged: 0, queued: 0, failures: 0 });
        }
    });

    it("never throws — closing an emergency must not fail because a review aid did", async () => {
        const broken = {
            from: vi.fn(() => {
                throw new Error("database unavailable");
            }),
        } as unknown as SupabaseClient;
        await expect(runOfflineCaptureReview(broken, "em-1")).resolves.toBeDefined();
    });
});
