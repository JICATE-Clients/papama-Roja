import { describe, expect, it } from "vitest";

import {
    buildCapture,
    canCapture,
    chunk,
    idsToForget,
    type OfflineAuthorisation,
} from "@/lib/offline/captureRules";

/**
 * E-4 (B-30) — the on-device decisions: when a till may record offline, what
 * the record carries, and what the device may forget after a sync.
 */
const NOW = new Date();
const HOUR = 3_600_000;

function auth(over: Partial<OfflineAuthorisation> = {}): OfflineAuthorisation {
    return {
        authorised: true,
        emergency_id: "em-1",
        emergency_ref: "EM-2026-001",
        expires_at: new Date(NOW.getTime() + 24 * HOUR).toISOString(),
        waiver_enabled: true,
        source: "food_partner",
        food_partner_id: "vendor-1",
        issued_at: NOW.toISOString(),
        ...over,
    };
}

describe("E-4 device — may this till record offline?", () => {
    it("REFUSES a device that never connected during the emergency", () => {
        expect(canCapture(null, NOW, 0, null).allowed).toBe(false);
    });

    it("REFUSES once the cached authorisation has expired", () => {
        const d = canCapture(auth({ expires_at: new Date(NOW.getTime() - 1).toISOString() }), NOW, 0, null);
        expect(d.allowed).toBe(false);
        if (!d.allowed) expect(d.reason).toMatch(/expired/);
    });

    it("REFUSES an unreadable expiry rather than treating it as open-ended", () => {
        expect(canCapture(auth({ expires_at: "not-a-date" }), NOW, 0, null).allowed).toBe(false);
    });

    it("does NOT enforce a pending cap that has not been set", () => {
        expect(canCapture(auth(), NOW, 10_000, null).allowed).toBe(true);
    });

    it("enforces a pending cap once one is set", () => {
        expect(canCapture(auth(), NOW, 5, 5).allowed).toBe(false);
        expect(canCapture(auth(), NOW, 4, 5).allowed).toBe(true);
    });
});

describe("E-4 device — what a record carries", () => {
    const c = buildCapture({
        id: "cap-1",
        qrHash: "f".repeat(64),
        auth: auth(),
        deviceReference: "dev-1",
        now: NOW,
    });

    it("carries the hash and no raw payload", () => {
        expect(c.qr_hash).toBe("f".repeat(64));
        expect(JSON.stringify(c)).not.toMatch(/PAPAMA:/);
        expect(c.token_id).toBeNull();
    });

    it("carries no beneficiary identifier and no face data", () => {
        expect(Object.keys(c)).not.toContain("beneficiary_identifier");
        expect(JSON.stringify(c)).not.toMatch(/face|embedding|liveness/i);
    });

    it("stamps the emergency, source and waiver from the authorisation", () => {
        expect(c.emergency_id).toBe("em-1");
        expect(c.source).toBe("food_partner");
        expect(c.waiver_status).toBe(true);
    });
});

describe("E-4 device — what may be forgotten after a sync", () => {
    const ids = ["a", "b", "c"];

    it("forgets NOTHING on a failed request", () => {
        expect(idsToForget(500, { results: [{ id: "a" }] }, ids)).toEqual([]);
        expect(idsToForget(400, null, ids)).toEqual([]);
    });

    it("forgets only what the server confirmed it recorded", () => {
        expect(idsToForget(200, { results: [{ id: "a" }, { id: "c" }] }, ids)).toEqual(["a", "c"]);
    });

    it("forgets nothing when the response has no results", () => {
        expect(idsToForget(200, {}, ids)).toEqual([]);
    });

    it("never forgets an id it did not upload", () => {
        expect(idsToForget(200, { results: [{ id: "zzz" }] }, ids)).toEqual([]);
    });

    it("uploads in batches the server accepts", () => {
        expect(chunk(Array.from({ length: 450 }, (_, i) => i), 200).map((b) => b.length)).toEqual([200, 200, 50]);
    });
});
