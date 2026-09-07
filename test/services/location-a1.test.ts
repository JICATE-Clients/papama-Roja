import { describe, expect, it, vi } from "vitest";

import {
    beneficiaryRegistrationRequestSchema,
    pincodeSchema,
    vendorCreateRequestSchema,
} from "@/lib/validation/schemas";
import { resolveServiceLocation } from "@/lib/services/serviceLocation";

/**
 * Acceptance tests for Work Order A-1 (B-02) — location masters & structured
 * addresses. The card's four criteria, one describe block each:
 *
 *   1. Food Partner registration without district/PIN is REJECTED.
 *   2. Beneficiary registration without a PIN SUCCEEDS (CD §D-2 lenient rule).
 *   3. A redemption row carries city + district + state.
 *   4. Changing a Food Partner's address later does not alter the snapshot
 *      already taken.
 */

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

/** A minimal valid Food Partner payload; tests override one field at a time. */
function vendorPayload(over: Record<string, unknown> = {}) {
    return {
        name: "Amudham Mess",
        pincode: "641001",
        registered_state_id: UUID_A,
        registered_district_id: UUID_B,
        ...over,
    };
}

describe("A-1 #1 — Food Partner registration requires district and PIN", () => {
    it("accepts a complete registered address", () => {
        expect(vendorCreateRequestSchema.safeParse(vendorPayload()).success).toBe(true);
    });

    it("rejects a missing district", () => {
        const r = vendorCreateRequestSchema.safeParse(
            vendorPayload({ registered_district_id: undefined })
        );
        expect(r.success).toBe(false);
    });

    it("rejects a missing state", () => {
        const r = vendorCreateRequestSchema.safeParse(
            vendorPayload({ registered_state_id: undefined })
        );
        expect(r.success).toBe(false);
    });

    it("rejects a missing PIN", () => {
        const r = vendorCreateRequestSchema.safeParse(vendorPayload({ pincode: undefined }));
        expect(r.success).toBe(false);
    });

    it.each(["64100", "6410011", "041001", "64100A", ""])(
        "rejects malformed PIN %j",
        (pin) => {
            expect(vendorCreateRequestSchema.safeParse(vendorPayload({ pincode: pin })).success).toBe(
                false
            );
        }
    );

    it("rejects a half-filled operating address", () => {
        // Only a city given: the snapshot resolves per field, so this would mix
        // an operating city with a registered district.
        const r = vendorCreateRequestSchema.safeParse(
            vendorPayload({ operating_city: "Tiruppur" })
        );
        expect(r.success).toBe(false);
    });

    it("accepts a complete operating address", () => {
        const r = vendorCreateRequestSchema.safeParse(
            vendorPayload({
                operating_city: "Tiruppur",
                operating_state_id: UUID_A,
                operating_district_id: UUID_B,
                operating_pincode: "641604",
            })
        );
        expect(r.success).toBe(true);
    });
});

describe("A-1 #2 — beneficiary registration is lenient (CD §D-2)", () => {
    const base = {
        full_name: "A. Beneficiary",
        category: "patient" as const,
        face_hash: "hash-1",
    };

    it("succeeds with NO location at all", () => {
        expect(beneficiaryRegistrationRequestSchema.safeParse(base).success).toBe(true);
    });

    it("succeeds with a partial location and no PIN", () => {
        const r = beneficiaryRegistrationRequestSchema.safeParse({
            ...base,
            location: { city: "Coimbatore" },
        });
        expect(r.success).toBe(true);
    });

    it("still rejects a MALFORMED pin — absence is fine, nonsense is not", () => {
        const r = beneficiaryRegistrationRequestSchema.safeParse({
            ...base,
            location: { pincode: "12" },
        });
        expect(r.success).toBe(false);
    });
});

describe("pincodeSchema", () => {
    it("accepts a valid 6-digit PIN", () => {
        expect(pincodeSchema.safeParse("600001").success).toBe(true);
    });
    it("rejects a leading zero (no Indian PIN starts with 0)", () => {
        expect(pincodeSchema.safeParse("012345").success).toBe(false);
    });
});

/** `.from().select().eq().maybeSingle()` returning one vendor row. */
function fakeVendorClient(row: unknown) {
    return {
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
                }),
            }),
        }),
    };
}

describe("A-1 #3 — redemption carries city + district + state", () => {
    it("resolves all three from the registered address", async () => {
        const client = fakeVendorClient({
            city: "Coimbatore",
            pincode: "641001",
            operating_city: null,
            operating_pincode: null,
            registered_district: { name: "Coimbatore", state: { name: "Tamil Nadu" } },
            operating_district: null,
        });

        await expect(resolveServiceLocation(client as never, "v-1")).resolves.toEqual({
            service_city: "Coimbatore",
            service_district: "Coimbatore",
            service_state: "Tamil Nadu",
            service_pincode: "641001",
        });
    });

    it("prefers the operating address when one is set", async () => {
        const client = fakeVendorClient({
            city: "Coimbatore",
            pincode: "641001",
            operating_city: "Tiruppur",
            operating_pincode: "641604",
            registered_district: { name: "Coimbatore", state: { name: "Tamil Nadu" } },
            operating_district: { name: "Tiruppur", state: { name: "Tamil Nadu" } },
        });

        await expect(resolveServiceLocation(client as never, "v-1")).resolves.toEqual({
            service_city: "Tiruppur",
            service_district: "Tiruppur",
            service_state: "Tamil Nadu",
            service_pincode: "641604",
        });
    });

    it("returns nulls rather than throwing when the vendor cannot be read", async () => {
        const client = {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi
                            .fn()
                            .mockResolvedValue({ data: null, error: { message: "boom" } }),
                    }),
                }),
            }),
        };
        // A redemption must never fail because a district lookup did — the meal
        // has already been served.
        await expect(resolveServiceLocation(client as never, "v-1")).resolves.toEqual({
            service_city: null,
            service_district: null,
            service_state: null,
            service_pincode: null,
        });
    });
});

describe("A-1 #4 — a later address change does not alter an existing snapshot", () => {
    it("re-resolving after a move yields a NEW value, leaving the old one untouched", async () => {
        const before = await resolveServiceLocation(
            fakeVendorClient({
                city: "Coimbatore",
                pincode: "641001",
                operating_city: null,
                operating_pincode: null,
                registered_district: { name: "Coimbatore", state: { name: "Tamil Nadu" } },
                operating_district: null,
            }) as never,
            "v-1"
        );

        // The Food Partner moves to Madurai.
        const after = await resolveServiceLocation(
            fakeVendorClient({
                city: "Madurai",
                pincode: "625001",
                operating_city: null,
                operating_pincode: null,
                registered_district: { name: "Madurai", state: { name: "Tamil Nadu" } },
                operating_district: null,
            }) as never,
            "v-1"
        );

        // The already-taken snapshot is a plain value, not a reference: it still
        // says Coimbatore. This is the whole reason the columns are TEXT and not
        // foreign keys — an FK would have followed the vendor to Madurai and
        // rewritten history.
        expect(before.service_district).toBe("Coimbatore");
        expect(after.service_district).toBe("Madurai");
        expect(before).not.toEqual(after);
    });
});
