import { describe, expect, it } from "vitest";

import {
    checkTokenScope,
    isExpired,
    resolveActivationDate,
    resolveExpiryDate,
    type TokenScope,
} from "@/lib/services/tokenScope";
import type { ServiceLocationSnapshot } from "@/lib/services/serviceLocation";

/**
 * Acceptance tests for Work Order A-2 (B-23) and A-4 (B-32a).
 *
 * The card's stated criteria:
 *   - Coimbatore-restricted token at a Mumbai-district Food Partner → hard block
 *   - PAN_INDIA token redeems anywhere
 *   - expired token → block, and expiry is permanent
 *   - a pool token distributed on day 30 expires on day 90 from creation
 *     (day 60 from distribution)
 */

function location(over: Partial<ServiceLocationSnapshot> = {}): ServiceLocationSnapshot {
    return {
        service_city: "Coimbatore",
        service_district: "Coimbatore",
        service_state: "Tamil Nadu",
        service_pincode: "641001",
        ...over,
    };
}

function scope(over: Partial<TokenScope> = {}): TokenScope {
    return {
        geographic_scope: "PAN_INDIA",
        scope_state_name: null,
        scope_district_name: null,
        scope_city: null,
        scope_pincode: null,
        ...over,
    };
}

describe("A-2 — geographic scope at redemption", () => {
    it("PAN_INDIA redeems anywhere, including with no location known at all", () => {
        expect(checkTokenScope(scope(), location()).allowed).toBe(true);
        expect(
            checkTokenScope(
                scope(),
                location({
                    service_city: null,
                    service_district: null,
                    service_state: null,
                    service_pincode: null,
                })
            ).allowed
        ).toBe(true);
    });

    it("blocks a Coimbatore-district token at a Mumbai-district Food Partner", () => {
        const result = checkTokenScope(
            scope({ geographic_scope: "DISTRICT", scope_district_name: "Coimbatore" }),
            location({
                service_city: "Mumbai",
                service_district: "Mumbai Suburban",
                service_state: "Maharashtra",
                service_pincode: "400001",
            })
        );

        expect(result.allowed).toBe(false);
        // The vendor must be told where it IS valid, not just "denied".
        expect(result.detail).toMatch(/only in Coimbatore district/i);
    });

    it("allows the same token inside its district", () => {
        const result = checkTokenScope(
            scope({ geographic_scope: "DISTRICT", scope_district_name: "Coimbatore" }),
            location()
        );
        expect(result.allowed).toBe(true);
    });

    it("matches place names case- and spacing-insensitively", () => {
        const result = checkTokenScope(
            scope({ geographic_scope: "CITY", scope_city: "coimbatore" }),
            location({ service_city: "  COIMBATORE  " })
        );
        expect(result.allowed).toBe(true);
    });

    it("matches a state scope", () => {
        expect(
            checkTokenScope(
                scope({ geographic_scope: "STATE", scope_state_name: "Tamil Nadu" }),
                location()
            ).allowed
        ).toBe(true);
        expect(
            checkTokenScope(
                scope({ geographic_scope: "STATE", scope_state_name: "Tamil Nadu" }),
                location({ service_state: "Kerala" })
            ).allowed
        ).toBe(false);
    });

    it("matches a PIN scope exactly", () => {
        expect(
            checkTokenScope(
                scope({ geographic_scope: "PIN", scope_pincode: "641001" }),
                location()
            ).allowed
        ).toBe(true);
        // A neighbouring PIN is a different PIN — no prefix matching.
        expect(
            checkTokenScope(
                scope({ geographic_scope: "PIN", scope_pincode: "641001" }),
                location({ service_pincode: "641002" })
            ).allowed
        ).toBe(false);
    });

    it("FAILS CLOSED when the service location is unknown", () => {
        // Otherwise every restriction is bypassable by a Food Partner whose
        // address is incomplete.
        const result = checkTokenScope(
            scope({ geographic_scope: "DISTRICT", scope_district_name: "Coimbatore" }),
            location({ service_district: null })
        );
        expect(result.allowed).toBe(false);
    });

    it("FAILS CLOSED when a restricted token names no place", () => {
        const result = checkTokenScope(scope({ geographic_scope: "DISTRICT" }), location());
        expect(result.allowed).toBe(false);
        expect(result.detail).toMatch(/names no district/i);
    });

    it("FAILS CLOSED on an unrecognised scope value", () => {
        const result = checkTokenScope(
            scope({ geographic_scope: "GALAXY" as never }),
            location()
        );
        expect(result.allowed).toBe(false);
    });
});

describe("A-2 / A-4 — per-mode activation and 60-day validity", () => {
    const DAY = 86_400_000;
    const created = new Date("2026-01-01T00:00:00.000Z");

    it("DONOR_CONTROLLED activates at creation", () => {
        const activated = resolveActivationDate({
            distribution_mode: "DONOR_CONTROLLED",
            minted_at: created.toISOString(),
            created_at: created.toISOString(),
            distributed_at: null,
        });
        expect(activated).toBe(created.toISOString());
        expect(resolveExpiryDate(activated, 60)).toBe(
            new Date(created.getTime() + 60 * DAY).toISOString()
        );
    });

    it("PAPAMA_DISTRIBUTED has NO activation while it sits in the pool", () => {
        // The point of the split: a pool token must not burn validity unissued.
        const activated = resolveActivationDate({
            distribution_mode: "PAPAMA_DISTRIBUTED",
            minted_at: created.toISOString(),
            created_at: created.toISOString(),
            distributed_at: null,
        });
        expect(activated).toBeNull();
        expect(resolveExpiryDate(activated, 60)).toBeNull();
    });

    it("the card's worked example: distributed on day 30 → expires day 90 from creation", () => {
        const distributed = new Date(created.getTime() + 30 * DAY);

        const activated = resolveActivationDate({
            distribution_mode: "PAPAMA_DISTRIBUTED",
            minted_at: created.toISOString(),
            created_at: created.toISOString(),
            distributed_at: distributed.toISOString(),
        });
        const expiry = resolveExpiryDate(activated, 60);

        // 60 days from DISTRIBUTION…
        expect(expiry).toBe(new Date(distributed.getTime() + 60 * DAY).toISOString());
        // …which is 90 days from CREATION.
        expect(expiry).toBe(new Date(created.getTime() + 90 * DAY).toISOString());
    });

    it("the two modes expire on different dates from the same creation date", () => {
        const distributed = new Date(created.getTime() + 30 * DAY);
        const donor = resolveExpiryDate(
            resolveActivationDate({
                distribution_mode: "DONOR_CONTROLLED",
                minted_at: created.toISOString(),
                created_at: created.toISOString(),
                distributed_at: distributed.toISOString(),
            }),
            60
        );
        const pool = resolveExpiryDate(
            resolveActivationDate({
                distribution_mode: "PAPAMA_DISTRIBUTED",
                minted_at: created.toISOString(),
                created_at: created.toISOString(),
                distributed_at: distributed.toISOString(),
            }),
            60
        );
        expect(donor).not.toBe(pool);
    });
});

describe("A-2 — expiry is permanent", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");

    it("an elapsed expiry is expired", () => {
        expect(isExpired("2026-05-31T23:59:59.000Z", now)).toBe(true);
    });

    it("expiry at exactly now counts as expired (boundary is inclusive)", () => {
        expect(isExpired(now.toISOString(), now)).toBe(true);
    });

    it("a future expiry is not expired", () => {
        expect(isExpired("2026-06-02T00:00:00.000Z", now)).toBe(false);
    });

    it("a NULL expiry is NOT expired — the clock has not started", () => {
        // An undistributed pool token. Treating null as expired would kill every
        // token waiting in the pool.
        expect(isExpired(null, now)).toBe(false);
    });
});
