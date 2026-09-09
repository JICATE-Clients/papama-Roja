import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
    recordEmergencyWaiver,
    resolveEmergencyRelaxation,
    resolveVerificationLevel,
} from "@/lib/services/emergencyRelaxation";
import type { ServiceLocationSnapshot } from "@/lib/services/serviceLocation";

/**
 * Acceptance tests for Work Order E-2 (B-27 a–c) — emergency verification
 * relaxation and the automatic ₹10 waiver.
 *
 * The card's criteria:
 *   - emergency OFF → face skip unavailable
 *   - emergency ON  → skip recorded with a level
 *   - waived redemption shows ₹0 collected + a waiver record + FULL settlement
 *   - tags present
 */

const ROOT = join(__dirname, "..", "..");
const NOW = new Date("2026-09-09T12:00:00.000Z");

function location(over: Partial<ServiceLocationSnapshot> = {}): ServiceLocationSnapshot {
    return {
        service_city: "Coimbatore",
        service_district: "Coimbatore",
        service_state: "Tamil Nadu",
        service_pincode: "641001",
        ...over,
    };
}

function emergency(over: Record<string, unknown> = {}) {
    return {
        id: "em-1",
        emergency_ref: "TN-FLOOD-2026-001",
        ends_at: "2026-09-16T00:00:00.000Z",
        scope_state_id: null,
        scope_district_id: null,
        scope_city: null,
        contribution_waiver_enabled: true,
        verification_relaxation_enabled: true,
        ...over,
    };
}

/** `.from().select().eq().gt()` resolving to active emergencies. */
function fakeClient(rows: unknown[] | null, error?: string) {
    return {
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    gt: vi.fn().mockResolvedValue(
                        error ? { data: null, error: { message: error } } : { data: rows, error: null }
                    ),
                }),
            }),
        }),
    };
}

describe("E-2 — relaxation applies only under an authorised emergency", () => {
    it("NO relaxation when no emergency is active", async () => {
        const r = await resolveEmergencyRelaxation(fakeClient([]) as never, location(), NOW);
        expect(r.faceSkipAllowed).toBe(false);
        expect(r.contributionWaived).toBe(false);
        expect(r.emergencyId).toBeNull();
    });

    it("relaxes when an active emergency covers the location", async () => {
        const r = await resolveEmergencyRelaxation(
            fakeClient([emergency()]) as never,
            location(),
            NOW
        );
        expect(r.faceSkipAllowed).toBe(true);
        expect(r.contributionWaived).toBe(true);
        expect(r.emergencyRef).toBe("TN-FLOOD-2026-001");
    });

    it("an emergency does NOT waive contributions unless switched on", async () => {
        // Defaults are FALSE: an emergency does not decide waiver policy on the
        // administrator's behalf.
        const r = await resolveEmergencyRelaxation(
            fakeClient([emergency({ contribution_waiver_enabled: false })]) as never,
            location(),
            NOW
        );
        expect(r.emergencyId).toBe("em-1");
        expect(r.contributionWaived).toBe(false);
    });

    it("an emergency does NOT relax verification unless switched on", async () => {
        const r = await resolveEmergencyRelaxation(
            fakeClient([emergency({ verification_relaxation_enabled: false })]) as never,
            location(),
            NOW
        );
        expect(r.faceSkipAllowed).toBe(false);
    });

    it("a city-scoped emergency does not cover a different city", async () => {
        const r = await resolveEmergencyRelaxation(
            fakeClient([emergency({ scope_city: "Madurai" })]) as never,
            location({ service_city: "Coimbatore" }),
            NOW
        );
        expect(r.emergencyId).toBeNull();
    });

    it("a city-scoped emergency covers its own city, case-insensitively", async () => {
        const r = await resolveEmergencyRelaxation(
            fakeClient([emergency({ scope_city: "coimbatore" })]) as never,
            location({ service_city: "  COIMBATORE " }),
            NOW
        );
        expect(r.emergencyId).toBe("em-1");
    });

    it("an emergency with NO scope covers everywhere", async () => {
        // Opposite of the token-scope rule, deliberately: a token with no scope
        // reference is a misconfiguration that must fail closed, whereas an
        // emergency declared without a district is a nationwide emergency.
        const r = await resolveEmergencyRelaxation(
            fakeClient([emergency()]) as never,
            location({ service_city: "Mumbai", service_district: "Mumbai Suburban" }),
            NOW
        );
        expect(r.emergencyId).toBe("em-1");
    });

    it("FAILS SAFE to no relaxation when the table cannot be read", async () => {
        // The conservative direction: a beneficiary is briefly held to the
        // normal standard, rather than the platform quietly waiving
        // contributions on the strength of a failed query.
        const r = await resolveEmergencyRelaxation(fakeClient(null, "boom") as never, location(), NOW);
        expect(r.faceSkipAllowed).toBe(false);
        expect(r.contributionWaived).toBe(false);
    });

    it("FAILS SAFE when the client throws", async () => {
        const exploding = {
            from: vi.fn().mockImplementation(() => {
                throw new Error("connection lost");
            }),
        };
        const r = await resolveEmergencyRelaxation(exploding as never, location(), NOW);
        expect(r.emergencyId).toBeNull();
    });
});

describe("E-2 — verification levels (CD §D-7 Level 1/2/3)", () => {
    it("face present → enhanced, emergency or not", () => {
        expect(resolveVerificationLevel({ faceProvided: true, emergencyActive: false })).toBe(
            "enhanced"
        );
        expect(resolveVerificationLevel({ faceProvided: true, emergencyActive: true })).toBe(
            "enhanced"
        );
    });

    it("face skipped under an emergency → standard, a legitimate lower tier", () => {
        // The core controls still ran; this is not a failure.
        expect(resolveVerificationLevel({ faceProvided: false, emergencyActive: true })).toBe(
            "standard"
        );
    });

    it("face missing with NO emergency → referred for investigation", () => {
        // Should be unreachable — the handler refuses it — which is exactly why
        // it is worth flagging if it ever occurs.
        expect(resolveVerificationLevel({ faceProvided: false, emergencyActive: false })).toBe(
            "referred"
        );
    });
});

/** insert() resolving to a supabase-shaped result. */
function fakeWaiverClient(error?: { message: string; code?: string }) {
    const insert = vi.fn().mockResolvedValue({ error: error ?? null });
    return { client: { from: vi.fn().mockReturnValue({ insert }) }, insert };
}

describe("E-2 — the waiver record", () => {
    const input = {
        redemptionId: "red-1",
        vendorId: "v-1",
        mealValueInr: 50,
        contributionApplicableInr: 10,
        emergencyId: "em-1",
        emergencyRef: "TN-FLOOD-2026-001",
    };

    it("records collected=false, waived=true with the Emergency ID", async () => {
        const { client, insert } = fakeWaiverClient();
        const result = await recordEmergencyWaiver(client as never, input);

        expect(result.recorded).toBe(true);
        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({
                collected: false,
                waived: true,
                emergency_id: "em-1",
                reason_category: "emergency_auto_waiver",
            })
        );
    });

    it("leaves authorised_by NULL — a system waiver has no human authoriser", async () => {
        // Naming a person who did not decide would be worse than naming nobody.
        const { client, insert } = fakeWaiverClient();
        await recordEmergencyWaiver(client as never, input);
        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({ authorised_by: null })
        );
    });

    it("names the emergency in the reason so the decision is explicable later", async () => {
        const { client, insert } = fakeWaiverClient();
        await recordEmergencyWaiver(client as never, input);
        const row = insert.mock.calls[0][0] as { reason: string };
        expect(row.reason).toContain("TN-FLOOD-2026-001");
    });

    it("treats an existing waiver as a no-op, not a failure", async () => {
        const { client } = fakeWaiverClient({ message: "duplicate", code: "23505" });
        await expect(recordEmergencyWaiver(client as never, input)).resolves.toMatchObject({
            recorded: false,
            reason: "already waived",
        });
    });

    it("NEVER THROWS — the meal is served and the redemption committed", async () => {
        const { client } = fakeWaiverClient({ message: "db down" });
        await expect(recordEmergencyWaiver(client as never, input)).resolves.toMatchObject({
            recorded: false,
        });
    });
});

describe("E-2 — the redemption route wiring", () => {
    const src = readFileSync(join(ROOT, "app/api/vendor/redemptions/route.ts"), "utf-8");

    it("refuses a missing face when no emergency authorises it", () => {
        expect(src).toMatch(/!body\.face_capture && !relaxation\.faceSkipAllowed/);
    });

    it("records face_hash_checked truthfully rather than always true", () => {
        // It asserted verification unconditionally when a face was mandatory.
        // Writing true with no face would claim a check that never ran, and
        // post-emergency audit reads this column.
        expect(src).toContain("face_hash_checked: faceProvided");
        expect(src).not.toContain("face_hash_checked: true");
    });

    it("marks the contribution waived rather than outstanding", () => {
        expect(src).toMatch(/relaxation\.contributionWaived\s*\n?\s*\?\s*"waived"/);
    });

    it("writes CD §D-7's tagging fields", () => {
        expect(src).toContain("emergency_mode:");
        expect(src).toContain("verification_level:");
        expect(src).toContain("face_verification_skipped:");
        expect(src).toContain("contribution_waived:");
    });

    it("takes NO waiver flag from the caller — the waiver is system-indicated", () => {
        // CD §D-7: "never Food-Partner or volunteer discretion". A vendor cannot
        // ask for a waiver; the server grants it from the emergency's own policy
        // flag. Asserted on the schema's FIELD NAMES — the block's prose
        // legitimately discusses emergencies, so a bare word search would match
        // a comment and prove nothing.
        const schemaBlock = src.slice(
            src.indexOf("const createSchema"),
            src.indexOf("export const POST")
        );
        const fieldNames = [...schemaBlock.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);

        expect(fieldNames).toEqual(["qr_payload", "menu_item_id", "geo", "face_capture", "co_pay"]);
        expect(fieldNames.some((f) => /waiv|emergency/i.test(f))).toBe(false);
    });
});
