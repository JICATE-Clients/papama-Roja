import { describe, expect, it } from "vitest";

import { can, hasCapability } from "@/lib/permissions";
import type { UserRole } from "@/lib/permissions/matrix";

/**
 * CD §D-9 (confirmed 18 Aug): BOTH offline routes exist — the Food Partner till
 * is primary, the volunteer app secondary — under identical controls.
 *
 * The trap these tests guard: `/api/offline/sync` used to require
 * `token_redemption/create`, which ALSO gates `/api/vendor/redemptions`. Granting
 * a volunteer that permission to let them capture offline would have handed them
 * online redemption — burning a token and raising a settlement claim — which is
 * emphatically not what the card asks for. Hence a narrow capability.
 */

const CAPTURE_ROLES: UserRole[] = ["admin", "vendor", "volunteer"];
const NO_CAPTURE_ROLES: UserRole[] = [
    "donor",
    "beneficiary",
    "compliance",
    "vendor_manager",
    "guest",
];

describe("E-4 / CD §D-9 — who may record a meal offline", () => {
    it.each(CAPTURE_ROLES)("%s holds offline_capture", (role) => {
        expect(hasCapability(role, "token_redemption", "offline_capture")).toBe(true);
    });

    it.each(NO_CAPTURE_ROLES)("%s does not hold offline_capture", (role) => {
        expect(hasCapability(role, "token_redemption", "offline_capture")).toBe(false);
    });

    it("gives a volunteer capture WITHOUT online redemption", () => {
        // The whole point of the capability. If this ever flips to true, a
        // volunteer can burn a token and raise a settlement claim from the field.
        expect(hasCapability("volunteer", "token_redemption", "offline_capture")).toBe(true);
        expect(can("volunteer", "token_redemption", "create", "own")).toBe(false);
        expect(can("volunteer", "token_redemption", "create", "all")).toBe(false);
    });

    it("leaves the Food Partner's online redemption exactly as it was", () => {
        expect(can("vendor", "token_redemption", "create", "own")).toBe(true);
        expect(hasCapability("vendor", "token_redemption", "scan_proof")).toBe(true);
    });

    it("lets a volunteer read the authorisation that decides whether to show the panel", () => {
        expect(can("volunteer", "token_redemption", "read", "own")).toBe(true);
    });

    it("does not let compliance or a vendor manager capture, though both can read", () => {
        // Oversight roles watch; they do not record meals.
        for (const role of ["compliance", "vendor_manager"] as UserRole[]) {
            expect(can(role, "token_redemption", "read", "all")).toBe(true);
            expect(hasCapability(role, "token_redemption", "offline_capture")).toBe(false);
        }
    });
});
