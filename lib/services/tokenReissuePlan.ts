/**
 * The pure decisions behind a controlled reissue (A-2 / B-23, CD §D-2A).
 * No I/O, so every rule is testable without a database.
 */

export interface ReissueSource {
    id: string;
    serial_number: string;
    status: string;
    token_type: string;
    value_inr: number;
    donor_id: string | null;
    donation_id: string | null;
    campaign_id: string | null;
    beneficiary_id: string | null;
    is_emergency: boolean;
    emergency_id: string | null;
    distribution_mode: "PAPAMA_DISTRIBUTED" | "DONOR_CONTROLLED";
    geographic_scope: string;
    scope_state_id: string | null;
    scope_district_id: string | null;
    scope_city: string | null;
    scope_pincode: string | null;
    area_lock: string | null;
    special_care_category_id: string | null;
    redeemed_at: string | null;
    value_returned_to_pool_at: string | null;
}

/** A reason short enough to be meaningless is not a reason. */
export const MIN_REISSUE_REASON = 10;

export interface ReissueNewToken {
    token_type: string;
    value_inr: number;
    status: "live" | "in_admin_pool";
    distribution_mode: ReissueSource["distribution_mode"];
    donor_id: string | null;
    donation_id: string | null;
    campaign_id: string | null;
    beneficiary_id: null;
    is_emergency: boolean;
    emergency_id: string | null;
    geographic_scope: string;
    scope_state_id: string | null;
    scope_district_id: string | null;
    scope_city: string | null;
    scope_pincode: string | null;
    area_lock: string | null;
    special_care_category_id: string | null;
    activated_at: string | null;
    expires_at: string | null;
    replacement_for_token_id: string;
    reissue_reason: string;
    reissued_at: string;
}

export type ReissuePlan =
    | { ok: false; error: string }
    | {
          ok: true;
          reason: string;
          /** Value to draw back out of the Meal Pool (0 if it never went in). */
          poolDebitInr: number;
          newToken: ReissueNewToken;
      };

export function planReissue(input: {
    original: ReissueSource;
    existingReplacementSerial: string | null;
    reason: string;
    expiryDays: number | null;
    now: string;
}): ReissuePlan {
    const { original } = input;
    const reason = input.reason.trim();

    // Only EXPIRED tokens are reissued. A live token needs nothing; a blocked
    // (lost) one already has the lost-token replacement; a redeemed one was used.
    if (original.status !== "expired") {
        return {
            ok: false,
            error: `only an expired token can be reissued (status is '${original.status}')`,
        };
    }
    if (original.redeemed_at) {
        return { ok: false, error: "this token was redeemed — there is no unused value to reissue" };
    }
    if (input.existingReplacementSerial) {
        return {
            ok: false,
            error: `this token has already been reissued as ${input.existingReplacementSerial}`,
        };
    }
    if (reason.length < MIN_REISSUE_REASON) {
        return {
            ok: false,
            error: `a reason of at least ${MIN_REISSUE_REASON} characters is required to approve a reissue`,
        };
    }
    if (!(original.value_inr > 0)) {
        return { ok: false, error: "this token carries no value to reissue" };
    }

    // Per-mode dates, confirmed 18 Aug:
    //   DONOR_CONTROLLED   — validity starts now, when it is issued again.
    //   PAPAMA_DISTRIBUTED — goes back to the pool UNACTIVATED; its 60 days
    //                        start only when it is distributed to someone.
    // A pool token that expired after distribution returns to the pool too: the
    // beneficiary did not use it, and reassigning to them is a fresh decision.
    const donorControlled = original.distribution_mode === "DONOR_CONTROLLED";
    let activatedAt: string | null = null;
    let expiresAt: string | null = null;
    if (donorControlled) {
        if (input.expiryDays == null || !(input.expiryDays > 0)) {
            return {
                ok: false,
                error: "token_expiry_days is not set — a donor-controlled token cannot be reissued without a validity period",
            };
        }
        activatedAt = input.now;
        expiresAt = new Date(Date.parse(input.now) + input.expiryDays * 86_400_000).toISOString();
    }

    return {
        ok: true,
        reason,
        poolDebitInr: original.value_returned_to_pool_at ? original.value_inr : 0,
        newToken: {
            token_type: original.token_type,
            value_inr: original.value_inr,
            status: donorControlled ? "live" : "in_admin_pool",
            // Immutable per token (A-4); a reissue keeps the grant's mode.
            distribution_mode: original.distribution_mode,
            donor_id: original.donor_id,
            donation_id: original.donation_id,
            campaign_id: original.campaign_id,
            beneficiary_id: null,
            is_emergency: original.is_emergency,
            emergency_id: original.emergency_id,
            // Scope is part of what the donor paid for — it carries over.
            geographic_scope: original.geographic_scope,
            scope_state_id: original.scope_state_id,
            scope_district_id: original.scope_district_id,
            scope_city: original.scope_city,
            scope_pincode: original.scope_pincode,
            area_lock: original.area_lock,
            special_care_category_id: original.special_care_category_id,
            activated_at: activatedAt,
            expires_at: expiresAt,
            replacement_for_token_id: original.id,
            reissue_reason: reason,
            reissued_at: input.now,
        },
    };
}
