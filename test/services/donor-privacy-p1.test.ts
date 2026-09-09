import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    FORBIDDEN_DONOR_FIELDS,
    buildDonorNotificationPayload,
    findForbiddenFields,
    formatDonorLocation,
} from "@/lib/notifications/donorWhitelist";

/**
 * Acceptance tests for Work Order P-1 (B-29a) — donor notification whitelist.
 *
 * The card's criterion, quoted: "notification payload for a Special Care
 * redemption contains 'SPECIAL CARE' token type and 'City, State' but no
 * category/medical field — asserted by test ON THE PAYLOAD BUILDER, not just
 * template content."
 *
 * That emphasis is the point. Template wording can be correct while the metadata
 * riding underneath it leaks — which is exactly what was happening: the
 * redemption notification carried `beneficiary_category`, telling a donor that
 * the person who ate their meal was a `patient` or `pregnant_women`.
 */

const ROOT = join(__dirname, "..", "..");

describe("P-1 — the Special Care case from the card", () => {
    const payload = buildDonorNotificationPayload({
        tokenReference: "PPM-SC-001",
        tokenType: "special_care",
        valueInr: 100,
        redeemedAt: "2026-09-09T12:00:00.000Z",
        serviceCity: "Coimbatore",
        serviceState: "Tamil Nadu",
        vendorName: "Amudham Mess",
        mealInfo: "Full meals",
        programme: "Special Care",
    });

    it("carries the token type", () => {
        expect(payload.token_type).toBe("special_care");
        expect(payload.programme).toBe("Special Care");
    });

    it("carries City, State", () => {
        expect(payload.location).toBe("Coimbatore, Tamil Nadu");
    });

    it("carries NO category or medical field", () => {
        expect(findForbiddenFields(payload as unknown as Record<string, unknown>)).toEqual([]);
    });

    it("has no key that could imply health or circumstances", () => {
        // CD §D-10 forbids "anything from which health or circumstances could be
        // inferred", so the assertion is on the FULL key set, not a denylist.
        expect(Object.keys(payload).sort()).toEqual(
            [
                "emergency_ref",
                "location",
                "meal_info",
                "programme",
                "redeemed_at",
                "time",
                "token_reference",
                "token_type",
                "value_inr",
                "vendor_name",
            ].sort()
        );
    });
});

describe("P-1 — forbidden fields are structurally unreachable", () => {
    it("the builder ignores anything not on the whitelist", () => {
        // Even when a caller tries, via a cast, to smuggle one through.
        const payload = buildDonorNotificationPayload({
            redeemedAt: "2026-09-09T12:00:00.000Z",
            beneficiary_category: "patient",
            beneficiary_id: "ben-1",
            full_name: "A. Person",
            aadhaar_hash: "hash",
        } as never);

        expect(findForbiddenFields(payload as unknown as Record<string, unknown>)).toEqual([]);
        expect(JSON.stringify(payload)).not.toContain("patient");
        expect(JSON.stringify(payload)).not.toContain("A. Person");
    });

    it("findForbiddenFields catches a hand-assembled payload", () => {
        // The belt to the type system's braces: `as any` at one call site would
        // otherwise defeat everything.
        const bad = { token_reference: "x", beneficiary_category: "pregnant_women" };
        expect(findForbiddenFields(bad)).toContain("beneficiary_category");
    });

    it("the forbidden list covers CD §D-10's stated categories", () => {
        for (const field of [
            "beneficiary_category",
            "full_name",
            "phone",
            "aadhaar_hash",
            "face_hash",
            "address",
            "geo_lat",
        ]) {
            expect(FORBIDDEN_DONOR_FIELDS).toContain(field);
        }
    });
});

describe("P-1 — location is City + State, never finer", () => {
    it("formats both parts", () => {
        expect(formatDonorLocation("Mumbai", "Maharashtra")).toBe("Mumbai, Maharashtra");
    });

    it("CD's worked example: a Coimbatore token redeemed in Mumbai reads Mumbai", () => {
        // The SERVICE location, not where the token was sponsored and not where
        // the beneficiary lives.
        const payload = buildDonorNotificationPayload({
            redeemedAt: "2026-09-09T12:00:00.000Z",
            serviceCity: "Mumbai",
            serviceState: "Maharashtra",
        });
        expect(payload.location).toBe("Mumbai, Maharashtra");
    });

    it("returns null rather than a half-formed string", () => {
        // "undefined, Tamil Nadu" in a donor email is worse than saying nothing.
        expect(formatDonorLocation(null, null)).toBeNull();
        expect(formatDonorLocation("   ", null)).toBeNull();
    });

    it("degrades to whichever part is known", () => {
        expect(formatDonorLocation("Coimbatore", null)).toBe("Coimbatore");
        expect(formatDonorLocation(null, "Tamil Nadu")).toBe("Tamil Nadu");
    });

    it("never carries coordinates", () => {
        const payload = buildDonorNotificationPayload({
            redeemedAt: "2026-09-09T12:00:00.000Z",
            serviceCity: "Coimbatore",
            serviceState: "Tamil Nadu",
        });
        expect(payload).not.toHaveProperty("geo_lat");
        expect(payload).not.toHaveProperty("geo_lng");
    });
});

describe("P-1 — the redemption route uses the builder", () => {
    const src = readFileSync(join(ROOT, "app/api/vendor/redemptions/route.ts"), "utf-8");

    it("no longer puts beneficiary_category in the donor payload", () => {
        // The actual regression this card fixes. Only the explanatory comment
        // may mention it now.
        const codeOnly = src
            .split("\n")
            .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
            .join("\n");
        expect(codeOnly).not.toContain("beneficiary_category");
    });

    it("builds the payload rather than assembling an object literal", () => {
        expect(src).toContain("buildDonorNotificationPayload({");
    });

    it("passes City AND State from the A-1 service snapshot", () => {
        expect(src).toContain("serviceCity: serviceLocation.service_city");
        expect(src).toContain("serviceState: serviceLocation.service_state");
    });

    it("no longer sends the vendor's own city as the location", () => {
        // It used `v?.city`, which is the Food Partner's registered city rather
        // than the frozen service location.
        expect(src).not.toContain("location: v?.city");
    });
});

describe("P-1 — the emergency variant", () => {
    it("carries the Emergency ID but still no category", () => {
        const payload = buildDonorNotificationPayload({
            redeemedAt: "2026-09-09T12:00:00.000Z",
            tokenType: "standard",
            serviceCity: "Coimbatore",
            serviceState: "Tamil Nadu",
            emergencyRef: "TN-FLOOD-2026-001",
        });
        expect(payload.emergency_ref).toBe("TN-FLOOD-2026-001");
        expect(findForbiddenFields(payload as unknown as Record<string, unknown>)).toEqual([]);
    });
});

describe("P-1 — the three CD templates are installed verbatim", () => {
    const sql = readFileSync(
        join(ROOT, "supabase/migrations/20260907000015_donor_notification_templates.sql"),
        "utf-8"
    );

    it("installs all three kinds", () => {
        expect(sql).toContain("'redemption'");
        expect(sql).toContain("'redemption_special_care'");
        expect(sql).toContain("'redemption_emergency'");
    });

    it("reproduces CD §D-10's wording exactly", () => {
        // Not a draft to improve on — the client wrote these to say exactly
        // enough and no more.
        expect(sql).toContain(
            "Your sponsored meal token has been successfully redeemed in {{location}}."
        );
        expect(sql).toContain(
            "Your ₹100 Special Care Token has been successfully redeemed in {{location}}."
        );
        expect(sql).toContain(
            "Your sponsored emergency meal token has been successfully redeemed in {{location}}."
        );
    });

    it("no template mentions a beneficiary attribute", () => {
        const bodies = sql.match(/'[^']*successfully redeemed[^']*'/g) ?? [];
        expect(bodies.length).toBe(3);
        for (const body of bodies) {
            expect(body).not.toMatch(/categor|patient|pregnan|disabilit|medical|aadhaar|address/i);
        }
    });

    it("does not overwrite an administrator's customised wording", () => {
        // These are DEFAULTS.
        expect(sql).toContain("on conflict (kind, channel) do nothing");
    });
});
