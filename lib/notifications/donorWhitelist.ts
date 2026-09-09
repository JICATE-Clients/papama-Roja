import "server-only";

/**
 * Donor-notification whitelist (P-1 / B-29a, CD §D-10).
 *
 * The client's core principle: **"Data available to the system ≠ data available
 * to the donor."**
 *
 * WHAT THIS FIXES. The redemption notification previously built its metadata as
 * a free object literal and put `beneficiary_category` in it — so a donor was
 * told the person who ate their meal was a `patient` or `pregnant_women`. That
 * is health information about an identifiable event, disclosed to a stranger who
 * happened to pay for a meal. CD §D-10 forbids it outright.
 *
 * WHY A BUILDER RATHER THAN A REVIEW RULE. The card requires sensitive fields be
 * "structurally unreachable", and the acceptance criterion insists the test sit
 * on the PAYLOAD BUILDER rather than on template content. A rule that says
 * "don't add category" survives exactly as long as everyone remembers it. So the
 * donor payload is now a TYPE with no slot for a category, and the builder
 * returns only the whitelisted keys. Adding a forbidden field is a compile
 * error, not a code-review catch.
 *
 * THE WHITELIST (CD §D-10, verbatim): token ID, type, value, redemption
 * date/time, Food Partner / service location at an appropriate level, Emergency
 * ID, programme name.
 *
 * NEVER DISCLOSED (CD §D-10): name, phone, photograph, Aadhaar or identity,
 * medical condition, pregnancy/postpartum status, patient/disability/
 * vulnerability category, exact residential address, individual location, or
 * anything from which health or circumstances could be inferred.
 */

/** Exactly the fields a donor-facing notification may carry. Nothing else. */
export interface DonorNotificationPayload {
    token_reference: string | null;
    token_type: string | null;
    value_inr: number | null;
    /** ISO timestamp of the redemption. */
    time: string;
    /** Alias kept for the donor UI reader, which looks for both. */
    redeemed_at: string;
    /** "City, State" — never a street, never coordinates. */
    location: string | null;
    vendor_name: string | null;
    meal_info: string | null;
    emergency_ref: string | null;
    programme: string | null;
}

/**
 * What the caller may offer. Deliberately NOT the redemption row: passing the
 * row would let a future field ride along by accident, which is precisely the
 * failure this module exists to prevent.
 */
export interface DonorPayloadInput {
    tokenReference?: string | null;
    tokenType?: string | null;
    valueInr?: number | null;
    redeemedAt: string;
    serviceCity?: string | null;
    serviceState?: string | null;
    vendorName?: string | null;
    mealInfo?: string | null;
    emergencyRef?: string | null;
    programme?: string | null;
}

/**
 * "City, State" at the level CD §D-10 permits.
 *
 * The SERVICE location, not the beneficiary's. CD's own worked example: a
 * Coimbatore-sponsored unrestricted token redeemed in Mumbai reads "Mumbai,
 * Maharashtra". Telling a donor where the meal was served says nothing about
 * where the beneficiary lives.
 *
 * Returns null rather than a partial when neither part is known — "undefined,
 * Tamil Nadu" in a donor email is worse than saying nothing.
 */
export function formatDonorLocation(
    city: string | null | undefined,
    state: string | null | undefined
): string | null {
    const c = city?.trim() || null;
    const s = state?.trim() || null;
    if (c && s) return `${c}, ${s}`;
    return c ?? s ?? null;
}

/**
 * Build a donor notification payload containing ONLY whitelisted fields.
 *
 * Every key is written out explicitly. No spread, no `...rest`, no pass-through
 * of a database row — those are the three ways a sensitive field silently
 * arrives in a donor's inbox six months from now.
 */
export function buildDonorNotificationPayload(
    input: DonorPayloadInput
): DonorNotificationPayload {
    return {
        token_reference: input.tokenReference ?? null,
        token_type: input.tokenType ?? null,
        value_inr: input.valueInr ?? null,
        time: input.redeemedAt,
        redeemed_at: input.redeemedAt,
        location: formatDonorLocation(input.serviceCity, input.serviceState),
        vendor_name: input.vendorName ?? null,
        meal_info: input.mealInfo ?? null,
        emergency_ref: input.emergencyRef ?? null,
        programme: input.programme ?? null,
    };
}

/**
 * Fields that must never appear in a donor payload (CD §D-10's stated list).
 *
 * The builder above already makes them unreachable by construction. This exists
 * for the runtime assertion below and for tests — a belt to the type system's
 * braces, because `as any` at one call site would otherwise defeat everything.
 */
export const FORBIDDEN_DONOR_FIELDS = [
    "beneficiary_category",
    "category",
    "beneficiary_id",
    "beneficiary_name",
    "full_name",
    "phone",
    "aadhaar",
    "aadhaar_hash",
    "face_hash",
    "medical_condition",
    "address",
    "pincode",
    "geo_lat",
    "geo_lng",
    "eligibility_status",
] as const;

/**
 * Assert a payload carries nothing forbidden.
 *
 * Returns the offending keys rather than throwing: a notification is not worth
 * failing a redemption over, and the caller can drop the payload while still
 * recording that something tried to leak. Throwing here would mean a privacy bug
 * became an outage at the till.
 */
export function findForbiddenFields(payload: Record<string, unknown>): string[] {
    return FORBIDDEN_DONOR_FIELDS.filter((f) => f in payload);
}
