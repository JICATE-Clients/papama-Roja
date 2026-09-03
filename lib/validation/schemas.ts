/**
 * pApAmA — Phase 1 Types Layer (T2): Zod request/response schemas
 *
 * Mirrors the DB shape and the response shapes in
 * docs/CONTRACT_Developer_2_Admin_Backend_Module.md (authoritative for the
 * API seam Developer 1 binds to). Field names are `snake_case` to match the
 * Supabase columns and the contract exactly.
 *
 * Scope note: these are TYPES ONLY (no DB, no I/O). Schemas whose backing table
 * collides with Developer-1's existing tables (donations, credits, tokens) are
 * tagged `// Section A` — their *route wiring* waits on the mentor's collision
 * decision, but the validators are safe to define now.
 *
 * Requires the `zod` package (`npm install zod`).
 */

import { z } from "zod";

import {
    beneficiaryCategorySchema,
    beneficiaryStatusSchema,
    donationStatusSchema,
    eligibilityStatusSchema,
    escalationStatusSchema,
    fraudDetectionMethodSchema,
    fraudFlagTypeSchema,
    fraudSeveritySchema,
    fraudStatusSchema,
    kycStatusSchema,
    mealTypeSchema,
    paymentFailureReasonSchema,
    refundStatusSchema,
    registrationStatusSchema,
    reportTypeSchema,
    settlementCycleSchema,
    settlementStatusSchema,
    tokenStatusSchema,
    tokenTypeSchema,
    userRoleSchema,
    vendorStatusSchema,
    volunteerRequestStatusSchema,
} from "@/lib/validation/enums";

// --- shared primitives -----------------------------------------------------

/**
 * Positive INR amount in whole rupees (Phase-1 columns are int4). Capped at
 * ₹1,000,000 to bound a single request (matches the standalone guest/UPI route
 * schemas) and stay well inside int4 range.
 */
export const inrAmountSchema = z.number().int().nonnegative().max(1_000_000);

/** Geo point as stored in `vendors.geo` (jsonb). */
export const geoPointSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
});

/** ISO-8601 timestamp string as returned by route handlers. */
export const isoTimestampSchema = z.string().datetime({ offset: true });

/**
 * Face embedding length — the @vladmandic/human `faceres` model output (1024-d).
 * MUST match the `vector(N)` columns in migration m23. Change both together if the
 * face model is swapped.
 */
export const FACE_EMBEDDING_DIM = 1024;

/**
 * A face capture produced ON-DEVICE by the <FaceCapture> component (owner §4.6 /
 * §5.2). We only ever transmit/store the non-reversible embedding + a liveness
 * score — never a raw image. `liveness` is the anti-spoof score (0..1); the
 * redemption/enrolment routes reject captures below `system_config.face_liveness_min`.
 */
export const faceCaptureSchema = z.object({
    embedding: z
        .array(z.number().finite())
        .length(FACE_EMBEDDING_DIM, `expected a ${FACE_EMBEDDING_DIM}-d face embedding`),
    liveness: z.number().min(0).max(1),
});
export type FaceCapture = z.infer<typeof faceCaptureSchema>;

// ===========================================================================
// Donor contract (consumed by Developer 1) — Section A gated for wiring
// ===========================================================================

/** POST /api/donations/create — request. // Section A (touches donations/credit) */
export const donationCreateRequestSchema = z.object({
    token_type_id: z.string().min(1),
    // Any amount, including micro-donations below token value (owner §2.1).
    fiat_amount: inrAmountSchema.positive(),
    payment_method_id: z.string().min(1).optional(),
});
export type DonationCreateRequest = z.infer<typeof donationCreateRequestSchema>;

/** POST /api/donations/create — response. */
export const donationResponseSchema = z.object({
    donation_id: z.string(),
    status: donationStatusSchema,
    token_amount: inrAmountSchema,
    fiat_amount: inrAmountSchema,
    credit_balance: inrAmountSchema,
});
export type DonationResponse = z.infer<typeof donationResponseSchema>;

/** GET /api/donor/credits — response (shape per contract Route Handler example). */
export const creditsResponseSchema = z.object({
    credit_balance: inrAmountSchema,
    threshold: inrAmountSchema,
    threshold_reached: z.boolean(),
    withdrawable: z.literal(false), // funds are never withdrawable
    transactions: z.array(
        z.object({
            id: z.string(),
            amount: z.number().int(),
            type: z.string(),
            description: z.string(),
            timestamp: isoTimestampSchema,
        })
    ),
});
export type CreditsResponse = z.infer<typeof creditsResponseSchema>;

/**
 * POST /api/donations/create — a donor buys credit (fiat → credit). The donor is
 * taken from the session, never the client. `payment_method` is informational
 * only for now: the payment provider is an OPEN item (ASSUMPTIONS.md), so the
 * donation is recorded as completed with a placeholder ref until a real gateway
 * lands in Phase E. Token minting is a separate step (POST /api/tokens/convert).
 */
export const donationPurchaseRequestSchema = z.object({
    amount_inr: inrAmountSchema.positive(),
    payment_method: z.string().trim().min(1).max(40).optional(),
});
export type DonationPurchaseRequest = z.infer<typeof donationPurchaseRequestSchema>;

/**
 * POST /api/tokens/convert — request. // Section A (touches tokens)
 * Donor mints ONE token of a chosen amount; constrained server-side to
 * standard_token_value <= amount <= available credit (token-flow §1).
 */
export const tokenConvertRequestSchema = z.object({
    token_type_id: z.string().min(1),
    amount: inrAmountSchema.positive(),
    // Path choice immediately after mint (token-flow §2).
    distribution_path: z.enum(["use_now", "authorize_papama"]),
});
export type TokenConvertRequest = z.infer<typeof tokenConvertRequestSchema>;

/** A token as returned to the donor (GET /api/donor/tokens). */
export const tokenResponseSchema = z.object({
    token_id: z.string(),
    serial_number: z.string(),
    token_type: tokenTypeSchema,
    status: tokenStatusSchema,
    value: inrAmountSchema,
    qr_payload: z.string(), // stable signed payload consumed by Developer 1
    expires_at: isoTimestampSchema.nullable(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

/**
 * POST /api/tokens/convert — donor mints ONE token of a chosen amount from
 * credit (token-flow §1–2). Server-constrained: standard_token_value ≤ amount ≤
 * available credit; minting deducts the amount from credit. `distribution_path`
 * is the post-mint fork — `use_now` → token goes `live` (donor self-distributes),
 * `authorize_papama` → token enters the admin pool (`in_admin_pool`).
 */
export const tokenMintRequestSchema = z.object({
    token_type: tokenTypeSchema, // standard | special_care
    amount_inr: inrAmountSchema.positive(),
    distribution_path: z.enum(["use_now", "authorize_papama"]),
    special_instructions: z.string().trim().max(500).optional(),
});
export type TokenMintRequest = z.infer<typeof tokenMintRequestSchema>;

/**
 * POST /api/{admin,donor}/tokens/[id]/report-loss — spec §3.2 [M2-5]: lost
 * token blocked instantly, replacement issued referencing
 * `replacement_for_token_id`.
 */
export const tokenReportLossRequestSchema = z.object({
    reason: z.string().trim().max(500).optional(),
});
export type TokenReportLossRequest = z.infer<typeof tokenReportLossRequestSchema>;

/** POST /api/admin/tokens/[id]/revalidate — spec §3.2/§7 [M2-5]. No body. */
export const tokenRevalidateRequestSchema = z.object({}).strict();
export type TokenRevalidateRequest = z.infer<typeof tokenRevalidateRequestSchema>;

/**
 * PATCH /api/donor/profile — the signed-in donor edits their own profile
 * (donor_donation_credit/update, scope own). Both fields are optional so the
 * donor can update just one. `pan_number` is the 80G seam (donors.pan_number,
 * client Q5): nullable, and normalized/validated against the PAN format in the
 * route (empty → null). Identity of the donor is taken from the session, never
 * the client.
 */
export const donorProfilePatchSchema = z.object({
    full_name: z.string().trim().min(1).max(120).optional(),
    pan_number: z.string().nullable().optional(),
});
export type DonorProfilePatch = z.infer<typeof donorProfilePatchSchema>;

// ===========================================================================
// Beneficiary registration (BEN-1…5) — net-new, no collision
// ===========================================================================

/**
 * Beneficiary self/assisted registration request.
 * Aadhaar is OPTIONAL, never mandatory (F-5); face-hash is primary.
 * Document requirements for `disaster_affected` are // OPEN (client Q7).
 */
export const beneficiaryRegistrationRequestSchema = z.object({
    full_name: z.string().min(1),
    category: beneficiaryCategorySchema,
    face_hash: z.string().min(1), // primary identity signal
    aadhaar_hash: z.string().min(1).nullable().optional(), // optional only
    // Supporting docs (medical cert / antenatal card / hospital ref) as
    // storage references; presence rules are category-driven in the service.
    document_refs: z.array(z.string()).default([]),
    location_hint: z.string().optional(),
});
export type BeneficiaryRegistrationRequest = z.infer<typeof beneficiaryRegistrationRequestSchema>;

/**
 * GET /api/admin/beneficiaries — approved-beneficiary registry item.
 * Backed by the `beneficiaries` table, so `status` is the record-state enum
 * (active|suspended|blocked), NOT the registration_status used by the separate
 * `beneficiary_registrations` review queue. Privacy-first: identity columns are
 * exposed only as booleans (`aadhaar_linked`, `face_hash_valid`), never raw hashes.
 */
export const beneficiaryResponseSchema = z.object({
    beneficiary_id: z.string(),
    /**
     * Nullable BY DESIGN — beneficiaries.full_name is optional ("kept minimal
     * for dignity/privacy"), and most beneficiaries are non-app users who were
     * never asked for one. Callers must render a fallback, not assume a string.
     */
    full_name: z.string().nullable(),
    category: beneficiaryCategorySchema,
    status: beneficiaryStatusSchema,
    eligibility: eligibilityStatusSchema,
    aadhaar_linked: z.boolean(),
    face_hash_valid: z.boolean(),
    registered_at: isoTimestampSchema,
});
export type BeneficiaryResponse = z.infer<typeof beneficiaryResponseSchema>;

/**
 * PATCH /api/admin/beneficiaries — admin record-state control (owner §4.6).
 * `suspend` = temporary hold, `activate` = lift the hold, `block` = permanent
 * stop. Operates on the `beneficiaries.status` enum (active|suspended|blocked).
 * `reason` is recorded in the audit trail.
 */
export const beneficiaryActionSchema = z.enum(["suspend", "activate", "block"]);
export type BeneficiaryAction = z.infer<typeof beneficiaryActionSchema>;

export const beneficiaryActionRequestSchema = z.object({
    beneficiary_id: z.string().uuid(),
    action: beneficiaryActionSchema,
    reason: z.string().trim().max(500).optional(),
});
export type BeneficiaryActionRequest = z.infer<typeof beneficiaryActionRequestSchema>;

// ===========================================================================
// Redemption & validation (RED-1…7, owner §4.4–4.6) — net-new
// ===========================================================================

/**
 * Redemption attempt initiated by a vendor scan. Validation (QR, geofence,
 * cooldown, meal-limit, face-hash) runs server-side; this is just the input.
 * co_contribution is OPTIONAL and capped at system_config.co_contribution_max;
 * ₹0 must always be allowed (owner §4.4).
 */
export const redemptionRequestSchema = z.object({
    qr_payload: z.string().min(1),
    vendor_id: z.string().min(1),
    selected_items: z
        .array(z.object({ menu_item_id: z.string(), price: inrAmountSchema }))
        .min(1),
    beneficiary_face_hash: z.string().min(1),
    geo: geoPointSchema,
    co_contribution: inrAmountSchema.default(0), // 0 always valid
});
export type RedemptionRequest = z.infer<typeof redemptionRequestSchema>;

/**
 * Redemption history entry — the shape the donor dashboard + notifications use
 * (contract §7: vendor_name, location, time, meal_info, beneficiary_category).
 */
export const redemptionHistoryEntrySchema = z.object({
    redemption_id: z.string(),
    token_id: z.string(),
    vendor_name: z.string(),
    location: z.string(),
    time: isoTimestampSchema,
    meal_info: z.string(),
    beneficiary_category: beneficiaryCategorySchema,
});
export type RedemptionHistoryEntry = z.infer<typeof redemptionHistoryEntrySchema>;

// ===========================================================================
// Vendor management (contract §4) — net-new
// ===========================================================================

/**
 * GET /api/admin/vendors — list item (contract §4).
 * Nullable fields mirror the live `vendors` columns: licence/GST/geo/rating are
 * captured progressively during onboarding, so they may be unset (null) for a
 * pending vendor. `geo` composes the split `geo_lat`/`geo_lng` numeric columns.
 */
export const vendorResponseSchema = z.object({
    vendor_id: z.string(),
    name: z.string(),
    status: vendorStatusSchema,
    kyc_status: kycStatusSchema,
    fssai_license: z.string().nullable(), // client Q14; null until onboarding submits it
    gst_number: z.string().nullable(), // client Q14
    geo: geoPointSchema.nullable(), // client Q14; from geo_lat/geo_lng
    hygiene_rating: z.number().int().min(1).max(5).nullable(), // null until first rated
    created_at: isoTimestampSchema,
    // Whether an auth account is linked (vendors.owner_id is set). Self-registered
    // vendors always have one; an admin-created outlet starts unclaimed. Exposed as
    // a boolean, never the owner UUID — the admin table only needs "can they sign
    // in", and the id would be PII leaking out of a list endpoint.
    has_login: z.boolean(),
});
export type VendorResponse = z.infer<typeof vendorResponseSchema>;

/**
 * POST /api/admin/vendors — staff pre-registration of an outlet (matrix
 * `vendor_management/create`: admin + vendor_manager).
 *
 * Deliberately narrower than the public self-registration schema:
 *   - No email/password. Creating someone's login means choosing or transmitting
 *     a credential, and the email provider is still an open item (CLAUDE.md), so
 *     there is no invite to send. The row is created UNCLAIMED (owner_id null)
 *     and the vendor links their own account by self-registering later.
 *   - No bank fields. Settlement details are collected from the vendor, not
 *     typed in on their behalf.
 * Everything here is business information an admin can verify on a site visit.
 */
export const vendorCreateRequestSchema = z
    .object({
        name: z.string().trim().min(1, "business name is required").max(200),
        legal_name: z.string().trim().max(200).optional(),
        address: z.string().trim().max(500).optional(),
        city: z.string().trim().max(120).optional(),
        pincode: z.string().trim().max(12).optional(),
        phone: z.string().trim().max(32).optional(),
        email: z.string().trim().email("enter a valid email").optional(),
        emergency_contact: z.string().trim().max(120).optional(),
        fssai_license: z.string().trim().max(64).optional(),
        gst_number: z.string().trim().max(32).optional(),
        geo_lat: z.number().min(-90).max(90).nullable().optional(),
        geo_lng: z.number().min(-180).max(180).nullable().optional(),
    })
    // A half-set coordinate is worse than none: vendorDiscovery would treat the
    // outlet as unlocatable anyway, and a stray lat with no lng reads like data
    // loss rather than an omission.
    .refine((v) => (v.geo_lat == null) === (v.geo_lng == null), {
        message: "give both latitude and longitude, or neither",
        path: ["geo_lng"],
    });
export type VendorCreateRequest = z.infer<typeof vendorCreateRequestSchema>;

/**
 * PATCH /api/admin/vendors — a staff action on one vendor. The action drives a
 * server-side state machine (approve/reject/suspend/reinstate operate on
 * `status`; verify_kyc/fail_kyc operate on `kyc_status`). `reason` is recorded
 * in the audit trail (the vendors table has no reason column).
 */
export const vendorActionSchema = z.enum([
    "approve",
    "reject",
    "suspend",
    "reinstate",
    "verify_kyc",
    "fail_kyc",
]);
export type VendorAction = z.infer<typeof vendorActionSchema>;

export const vendorActionRequestSchema = z.object({
    vendor_id: z.string().uuid(),
    action: vendorActionSchema,
    reason: z.string().trim().max(500).optional(),
});
export type VendorActionRequest = z.infer<typeof vendorActionRequestSchema>;

// ===========================================================================
// Settlement (contract §8, owner §4.8) — net-new
// ===========================================================================

/** GET /api/admin/settlements — list item (contract §8). */
export const settlementResponseSchema = z.object({
    settlement_id: z.string(),
    vendor_id: z.string(),
    vendor_name: z.string().nullable(), // resolved for the admin table (UUID alone is unreadable)
    period: settlementCycleSchema,
    on_hold: z.boolean(), // admin override (owner §4.8 hold/delay); blocks `pay` while true
    amount: z.number().nonnegative(), // numeric in DB
    status: settlementStatusSchema,
    line_items: z.number().int().nonnegative(),
    settled_at: isoTimestampSchema.nullable(),
});
export type SettlementResponse = z.infer<typeof settlementResponseSchema>;

/**
 * PATCH /api/admin/settlements — admin settlement lifecycle (contract §8, owner
 * §4.8). Forward cycle lock → reconcile → pay; `unlock` is the admin override
 * that returns a locked settlement to pending. `pay` stamps `settled_at`.
 * `hold`/`release` are the admin OVERRIDE (owner §4.8): hold delays a payout (any
 * non-paid status) and blocks `pay`; release lifts it. They toggle `on_hold` and
 * do NOT change the lifecycle status. `note` is appended to the audit trail.
 */
export const settlementActionSchema = z.enum([
    "lock",
    "unlock",
    "approve",
    "reconcile",
    "pay",
    "hold",
    "release",
]);
export type SettlementAction = z.infer<typeof settlementActionSchema>;

export const settlementActionRequestSchema = z.object({
    settlement_id: z.string().uuid(),
    action: settlementActionSchema,
    note: z.string().trim().max(500).optional(),
});
export type SettlementActionRequest = z.infer<typeof settlementActionRequestSchema>;

// ===========================================================================
// Fraud (contract §9) — net-new
// ===========================================================================

/** GET /api/admin/fraud — list item (contract §9). */
export const fraudFlagResponseSchema = z.object({
    flag_id: z.string(),
    type: fraudFlagTypeSchema,
    severity: fraudSeveritySchema,
    entity: z.object({ kind: z.string(), id: z.string() }), // jsonb
    status: fraudStatusSchema,
    blocked: z.boolean(),
    created_at: isoTimestampSchema,
});
export type FraudFlagResponse = z.infer<typeof fraudFlagResponseSchema>;

/**
 * PATCH /api/admin/fraud — action an open flag, or lift a standing block.
 * `resolve` = a real issue handled (the block, if any, stands); `dismiss` = a
 * false positive (any block is cleared); `unblock` = lift the block on an
 * already-resolved (or any blocked) flag without changing its status — the only
 * way to release a block left in place by `resolve`. `notes` → `resolution_notes`.
 */
export const fraudActionSchema = z.enum(["resolve", "dismiss", "unblock"]);
export type FraudAction = z.infer<typeof fraudActionSchema>;

export const fraudActionRequestSchema = z.object({
    flag_id: z.string().uuid(),
    action: fraudActionSchema,
    notes: z.string().trim().max(500).optional(),
});
export type FraudActionRequest = z.infer<typeof fraudActionRequestSchema>;

// ===========================================================================
// System config (GET /api/admin/system-config) — net-new
// ===========================================================================

/**
 * A single config row. `value` is stored as text and coerced by the service
 * per `value_type`. NOTE: `max_tokens_per_volunteer` ships with a PLACEHOLDER
 * (unset) value pending the mentor's number (ASSUMPTIONS.md) — the schema
 * allows a null value so an unset row validates.
 */
export const systemConfigRowSchema = z.object({
    key: z.string().min(1),
    value: z.string().nullable(),
    value_type: z.enum(["number", "boolean", "string"]),
    description: z.string().optional(),
    updated_at: isoTimestampSchema,
});
export type SystemConfigRow = z.infer<typeof systemConfigRowSchema>;

export const systemConfigResponseSchema = z.object({
    config: z.array(systemConfigRowSchema),
});
export type SystemConfigResponse = z.infer<typeof systemConfigResponseSchema>;

/**
 * PATCH /api/admin/system-config — update one existing config row's value
 * (admin only). The value is validated/coerced against the row's `value_type`
 * server-side and stored as text. `null` intentionally UNSETS the row (e.g.
 * leaving `max_tokens_per_volunteer` unset) — never a guessed default.
 */
export const systemConfigUpdateRequestSchema = z.object({
    key: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});
export type SystemConfigUpdateRequest = z.infer<typeof systemConfigUpdateRequestSchema>;

// --- meal windows (addon #1) -----------------------------------------------

/**
 * A clock time as a zero-padded 24-hour 'HH:MM' string (e.g. '06:00', '18:30').
 * Stored into the Postgres `time` column; the redemption engine parses the
 * leading HH:MM (seconds optional) into minutes-of-day.
 */
export const clockTimeSchema = z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be 'HH:MM' (24-hour)");

/** A meal-window row as returned to the admin console (addon #1). */
export const mealWindowResponseSchema = z.object({
    id: z.string().uuid(),
    meal_type: mealTypeSchema,
    vendor_id: z.string().uuid().nullable(),
    vendor_name: z.string().nullable(),
    start_time: z.string(),
    end_time: z.string(),
    is_active: z.boolean(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type MealWindowResponse = z.infer<typeof mealWindowResponseSchema>;

/**
 * POST /api/admin/meal-windows — create one serving window (admin only). A null/
 * omitted `vendor_id` creates a GLOBAL/default window for the slot; a vendor_id
 * creates a per-vendor override. Overnight windows are rejected (start < end) —
 * same as the DB CHECK; split an overnight slot into two rows.
 */
export const mealWindowCreateRequestSchema = z
    .object({
        meal_type: mealTypeSchema,
        vendor_id: z.string().uuid().nullable().optional(),
        start_time: clockTimeSchema,
        end_time: clockTimeSchema,
        is_active: z.boolean().optional(),
    })
    .strict()
    .refine((v) => v.start_time < v.end_time, {
        message: "start_time must be before end_time (overnight windows are out of scope)",
        path: ["end_time"],
    });
export type MealWindowCreateRequest = z.infer<typeof mealWindowCreateRequestSchema>;

/**
 * PATCH /api/admin/meal-windows/[id] — edit / toggle one window (admin only).
 * Every field is optional (partial edit); when both times are supplied they must
 * still satisfy start < end. A times-only refine cannot see the stored value, so
 * the route re-validates the merged row against the start<end rule too.
 */
export const mealWindowUpdateRequestSchema = z
    .object({
        meal_type: mealTypeSchema.optional(),
        vendor_id: z.string().uuid().nullable().optional(),
        start_time: clockTimeSchema.optional(),
        end_time: clockTimeSchema.optional(),
        is_active: z.boolean().optional(),
    })
    .strict()
    .refine(
        (v) =>
            v.start_time === undefined ||
            v.end_time === undefined ||
            v.start_time < v.end_time,
        {
            message: "start_time must be before end_time",
            path: ["end_time"],
        }
    );
export type MealWindowUpdateRequest = z.infer<typeof mealWindowUpdateRequestSchema>;

// --- emergency / disaster relief (addon #8) --------------------------------

/**
 * POST /api/admin/emergency/grant — issue one emergency-relief token (admin
 * only). `reason` is a free-text note for the grant trail. NOTE: client Q7
 * (how a beneficiary proves they are disaster-affected) is OPEN — there is no
 * proof gating here on purpose (see lib/services/emergency.ts).
 */
export const emergencyGrantRequestSchema = z
    .object({
        reason: z.string().trim().max(500).optional(),
    })
    .strict();
export type EmergencyGrantRequest = z.infer<typeof emergencyGrantRequestSchema>;

/**
 * POST /api/admin/emergency/overrides — activate a time-boxed config override
 * during emergency mode (spec §3.3 [M1-8, M2-9], addon #9).
 */
export const emergencyOverrideActivateRequestSchema = z
    .object({
        config_key: z.string().trim().min(1),
        override_value: z.string().trim().min(1),
        reason: z.string().trim().max(500).optional(),
    })
    .strict();
export type EmergencyOverrideActivateRequest = z.infer<typeof emergencyOverrideActivateRequestSchema>;

/**
 * POST /api/admin/payment-failures — admin-logged failed/duplicate payment
 * (spec §3.1 F-10 [M2-4], addon #14). Phase 1 has no live gateway webhook, so
 * this is a manual reconciliation entry point, not an auto-detected one.
 */
export const paymentFailureCreateRequestSchema = z
    .object({
        donation_id: z.string().uuid().optional(),
        donor_id: z.string().uuid().optional(),
        amount_inr: inrAmountSchema.positive().optional(),
        reason: paymentFailureReasonSchema,
        max_retries: z.number().int().min(0).optional(),
        notes: z.string().trim().max(1000).optional(),
    })
    .strict()
    // Two ways in, because reconciliation happens from two directions. Naming a
    // `donation_id` lets the server read the donor and the amount off that
    // donation — the admin is looking at a charge that failed, and re-typing a
    // donor UUID and an amount that are already on the row is both tedious and a
    // place to make the record wrong. Naming the donor and the amount directly
    // still works for a failure with no donation row behind it.
    .refine((b) => b.donation_id != null || (b.donor_id != null && b.amount_inr != null), {
        message: "give a donation_id, or both donor_id and amount_inr",
        path: ["donation_id"],
    });
export type PaymentFailureCreateRequest = z.infer<typeof paymentFailureCreateRequestSchema>;

/**
 * PATCH /api/admin/payment-failures — close a logged failure without a refund.
 *
 * `dismissed` was a status nothing could ever set: only refund approval moved a
 * row, and only to `resolved`. A failure logged by mistake, or one the bank later
 * confirms went through fine, stayed `open` forever AND kept offering the donor a
 * refund path. The note is required — a dismissal with no reason is indis-
 * tinguishable from a row someone lost interest in.
 */
export const paymentFailureDismissRequestSchema = z
    .object({
        payment_failure_id: z.string().uuid(),
        note: z.string().trim().min(1, "say why this is being dismissed").max(1000),
    })
    .strict();
export type PaymentFailureDismissRequest = z.infer<typeof paymentFailureDismissRequestSchema>;

/** POST /api/donor/refund-request — donor self-initiates against an open payment_failures row. */
export const refundRequestSchema = z
    .object({
        payment_failure_id: z.string().uuid(),
        amount_inr: inrAmountSchema.positive(),
        reason: z.string().trim().min(1).max(1000),
    })
    .strict();
export type RefundRequest = z.infer<typeof refundRequestSchema>;

/** PATCH /api/admin/refunds/[id] — admin approve/reject decision. */
export const refundDecisionRequestSchema = z
    .object({
        decision: z.enum(["approve", "reject"]),
        note: z.string().trim().max(500).optional(),
    })
    .strict()
    .refine((b) => b.decision !== "reject" || (b.note && b.note.length > 0), {
        message: "a note is required to reject a refund",
        path: ["note"],
    });
export type RefundDecisionRequest = z.infer<typeof refundDecisionRequestSchema>;

/**
 * GET /api/admin/payment-failures — one logged failure as the admin table reads
 * it. `donor_label` is resolved server-side for the same reason the donations
 * list resolves one: a UUID is unreadable in a table, and the id itself is PII
 * that a list endpoint has no reason to hand out.
 */
export const paymentFailureResponseSchema = z.object({
    id: z.string(),
    donation_id: z.string().nullable(),
    donor_label: z.string(),
    amount_inr: z.number(),
    reason: paymentFailureReasonSchema,
    retry_count: z.number().int(),
    max_retries: z.number().int().nullable(),
    status: z.enum(["open", "resolved", "dismissed"]),
    notes: z.string().nullable(),
    created_at: isoTimestampSchema,
    resolved_at: isoTimestampSchema.nullable(),
    /** Whether a refund request already exists against this failure. */
    has_refund: z.boolean(),
});
export type PaymentFailureResponse = z.infer<typeof paymentFailureResponseSchema>;

/**
 * GET /api/admin/refunds — one refund request as the admin table reads it. The
 * originating failure's reason travels with the row: deciding a refund without
 * seeing WHY the payment failed is deciding it blind, and it saves a join in
 * every consumer.
 */
export const refundResponseSchema = z.object({
    id: z.string(),
    donor_label: z.string(),
    payment_failure_id: z.string(),
    payment_failure_reason: paymentFailureReasonSchema.nullable(),
    amount_inr: z.number(),
    reason: z.string(),
    status: refundStatusSchema,
    decided_at: isoTimestampSchema.nullable(),
    decision_note: z.string().nullable(),
    created_at: isoTimestampSchema,
});
export type RefundResponse = z.infer<typeof refundResponseSchema>;

/**
 * The four categories the `campaigns` table's CHECK constraint accepts
 * (migration m14). This was `z.string().max(50)`, which let any value through
 * Zod and then failed in Postgres as a 500 — the route's own comment even told
 * callers to pass `"emergency"`, which the constraint rejects. Disaster relief
 * IS the emergency category; there is no separate one.
 */
export const campaignCategorySchema = z.enum([
    "School",
    "Orphanage",
    "Disaster Relief",
    "Community Kitchen",
]);
export type CampaignCategory = z.infer<typeof campaignCategorySchema>;

/** The lifecycle a campaign moves through (m14 CHECK on `status`). */
export const campaignStatusSchema = z.enum(["active", "paused", "completed"]);
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

/** POST /api/admin/campaigns — minimal campaign creation (addon #9). */
export const campaignCreateRequestSchema = z
    .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).optional(),
        organization_name: z.string().trim().min(1).max(200),
        category: campaignCategorySchema,
        location: z.string().trim().max(200).optional(),
        target_tokens: z.number().int().min(0).optional(),
        token_price_inr: z.number().int().positive(),
    })
    .strict();
export type CampaignCreateRequest = z.infer<typeof campaignCreateRequestSchema>;

/** PATCH /api/admin/campaigns — move one campaign along its lifecycle. */
export const campaignStatusRequestSchema = z
    .object({
        campaign_id: z.string().uuid(),
        status: campaignStatusSchema,
    })
    .strict();
export type CampaignStatusRequest = z.infer<typeof campaignStatusRequestSchema>;

/**
 * GET /api/admin/campaigns — one campaign as the admin table reads it.
 *
 * `raised_inr` / `raised_tokens` are SUMMED FROM `donations`, not read from the
 * `campaigns.raised_tokens` column. That column is a leftover from the donor
 * module's old `token_types` table and nothing in the live system increments it
 * — the only writer, `lib/donor/services/creditService.ts`, is dead code that
 * still targets the pre-rename table. Reporting a stored counter that is
 * permanently zero would be worse than reporting nothing.
 */
export const campaignResponseSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    organization_name: z.string(),
    category: z.string(),
    location: z.string().nullable(),
    target_tokens: z.number().int(),
    token_price_inr: z.number().int(),
    status: campaignStatusSchema,
    created_at: isoTimestampSchema,
    /** Summed from completed donations carrying this campaign_id. */
    raised_inr: z.number(),
    raised_tokens: z.number().int(),
    donation_count: z.number().int(),
});
export type CampaignResponse = z.infer<typeof campaignResponseSchema>;

// ===========================================================================
// Admin-only response schemas — net-new Dev-2 tables (M07–M13). Field names &
// nullability mirror the live columns exactly so the route handlers stay honest.
// ===========================================================================

/** GET /api/admin/audit — one append-only audit_logs row (M08, contract §10). */
export const auditLogResponseSchema = z.object({
    id: z.string(),
    actor_id: z.string().nullable(), // null = system/service action
    actor_role: userRoleSchema.nullable(), // role snapshot at action time
    action: z.string(),
    entity_table: z.string(),
    entity_id: z.string().nullable(),
    summary: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    created_at: isoTimestampSchema,
});
export type AuditLogResponse = z.infer<typeof auditLogResponseSchema>;

/** GET /api/admin/ngo-partners — partner NGO registry row (M13). */
export const ngoPartnerResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    registration_number: z.string().nullable(),
    focus_area: z.string().nullable(),
    contact_person: z.string().nullable(),
    contact_email: z.string().nullable(),
    contact_phone: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    contact_user_id: z.string().nullable(),
    status: z.enum(["active", "inactive", "suspended"]), // text+CHECK; ngo_status enum is a later slice
    notes: z.string().nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type NgoPartnerResponse = z.infer<typeof ngoPartnerResponseSchema>;

/** GET /api/admin/vendor-escalations — vendor dispute/appeal thread (M10, contract §4). */
export const vendorEscalationResponseSchema = z.object({
    id: z.string(),
    vendor_id: z.string(),
    raised_by: z.string().nullable(),
    assigned_to: z.string().nullable(),
    subject: z.string(),
    description: z.string().nullable(),
    status: escalationStatusSchema,
    resolution: z.string().nullable(),
    resolved_at: isoTimestampSchema.nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type VendorEscalationResponse = z.infer<typeof vendorEscalationResponseSchema>;

/** GET /api/admin/volunteers — volunteers registry row (M09). */
export const volunteerResponseSchema = z.object({
    id: z.string(),
    user_id: z.string(),
    full_name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    status: z.enum(["pending", "active", "inactive", "suspended", "rejected"]), // text+CHECK; volunteer status enum is a later slice
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type VolunteerResponse = z.infer<typeof volunteerResponseSchema>;

/**
 * PATCH /api/admin/volunteers — admin registry-status control. `approve` =
 * accept a self-registered (pending) volunteer, `reject` = decline one,
 * `suspend` = temporary hold, `deactivate` = retire, `activate` = restore.
 * Operates on the `volunteers.status` text+CHECK value
 * (pending|active|inactive|suspended|rejected). `reason` is recorded in the audit
 * trail. NOTE: token allocation / grant decisions and the
 * `max_tokens_per_volunteer` limit are a separate token-flow slice (they mutate
 * the tokens table), not part of this status control.
 */
export const volunteerActionSchema = z.enum([
    "approve",
    "reject",
    "suspend",
    "deactivate",
    "activate",
]);
export type VolunteerAction = z.infer<typeof volunteerActionSchema>;

export const volunteerActionRequestSchema = z.object({
    volunteer_id: z.string().uuid(),
    action: volunteerActionSchema,
    reason: z.string().trim().max(500).optional(),
});
export type VolunteerActionRequest = z.infer<typeof volunteerActionRequestSchema>;

/**
 * POST /api/admin/volunteers — admin-initiated volunteer onboarding. Mirrors the
 * vendor self-register payload shape (email + password) but is admin-only: the
 * route creates a confirmed auth user, flips users.role → 'volunteer' (the
 * donor-provisioning trigger defaults new users to 'donor'), and inserts the
 * linked `volunteers` row with status 'active'. `full_name` is stored on the
 * profile; `phone` is optional contact metadata.
 */
export const volunteerCreateRequestSchema = z.object({
    email: z.string().trim().email("a valid email is required"),
    password: z.string().min(6, "password must be at least 6 characters"),
    full_name: z.string().trim().min(1, "the volunteer's name is required").max(120),
    phone: z.string().trim().max(40).optional(),
});
export type VolunteerCreateRequest = z.infer<typeof volunteerCreateRequestSchema>;

/** GET /api/admin/volunteer-token-requests — allocation request queue row (M09, token-flow §3b). */
export const volunteerTokenRequestResponseSchema = z.object({
    id: z.string(),
    volunteer_id: z.string(),
    requested_count: z.number().int().nonnegative(),
    status: volunteerRequestStatusSchema,
    decided_by: z.string().nullable(),
    decided_count: z.number().int().nonnegative().nullable(),
    notes: z.string().nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type VolunteerTokenRequestResponse = z.infer<typeof volunteerTokenRequestResponseSchema>;

/** GET /api/admin/reports — generated compliance/CSR report row (M11, contract §10). */
export const complianceReportResponseSchema = z.object({
    id: z.string(),
    report_type: reportTypeSchema,
    title: z.string().nullable(),
    params: z.record(z.string(), z.unknown()), // jsonb
    summary: z.record(z.string(), z.unknown()), // jsonb
    file_url: z.string().nullable(),
    period_start: z.string().nullable(), // date (YYYY-MM-DD)
    period_end: z.string().nullable(),
    generated_by: z.string().nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type ComplianceReportResponse = z.infer<typeof complianceReportResponseSchema>;

/**
 * POST /api/admin/reports — generate a report by aggregating live data into a
 * `compliance_reports` row (admin only). Optional period (YYYY-MM-DD) filters the
 * aggregation window. File export (PDF/CSV to storage) is a later slice; for now
 * the computed `summary` jsonb is the report payload.
 */
const reportDateString = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date");

export const reportGenerateRequestSchema = z
    .object({
        report_type: reportTypeSchema,
        title: z.string().trim().max(200).optional(),
        period_start: reportDateString.optional(),
        period_end: reportDateString.optional(),
    })
    .refine(
        (r) => !r.period_start || !r.period_end || r.period_start <= r.period_end,
        { message: "period_start must be on or before period_end", path: ["period_start"] }
    );
export type ReportGenerateRequest = z.infer<typeof reportGenerateRequestSchema>;

/**
 * Richer fraud_flags row (M12) — superset of fraudFlagResponseSchema above with
 * the resolution + detection-method columns the admin fraud console needs.
 */
export const fraudFlagDetailResponseSchema = z.object({
    id: z.string(),
    flag_type: fraudFlagTypeSchema,
    severity: fraudSeveritySchema,
    status: fraudStatusSchema,
    detection_method: fraudDetectionMethodSchema.nullable(),
    entity: z.object({ kind: z.string(), id: z.string() }), // jsonb polymorphic target
    /** Human label for entity.id — vendor name or token serial. Null when the
     *  kind has nothing to resolve to (face, redemption, thank_you). */
    entity_label: z.string().nullable(),
    blocked: z.boolean(),
    resolved_by: z.string().nullable(),
    resolution_notes: z.string().nullable(),
    resolved_at: isoTimestampSchema.nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type FraudFlagDetailResponse = z.infer<typeof fraudFlagDetailResponseSchema>;

// --- generic envelopes -----------------------------------------------------

/**
 * Standard mutation acknowledgement. Routes that change state return this so
 * Developer 1 always gets a well-shaped, non-null body (contract "Never Return
 * a Null Body"). `id` is the affected row where applicable.
 */
export const mutationAckSchema = z.object({
    ok: z.literal(true),
    id: z.string().optional(),
});
export type MutationAck = z.infer<typeof mutationAckSchema>;

/**
 * Build a `{ <key>: T[], total: number }` list-envelope schema. Use empty arrays
 * as defaults so a list route never returns null (contract). e.g.
 *   const vendorListSchema = listResponseSchema("vendors", vendorResponseSchema);
 */
export function listResponseSchema<T extends z.ZodTypeAny>(key: string, item: T) {
    return z.object({
        [key]: z.array(item).default([]),
        total: z.number().int().nonnegative().default(0),
    });
}

// --- addon #11: institution token allocations ------------------------------

/** GET /api/admin/institutions — a bulk-allocation ledger row (addon #11). */
export const institutionAllocationResponseSchema = z.object({
    id: z.string(),
    ngo_partner_id: z.string(),
    institution_name: z.string().nullable(), // joined from ngo_partners for display
    token_count: z.number().int(),
    allocated_by: z.string().nullable(),
    status: z.enum(["pending", "allocated", "cancelled"]),
    notes: z.string().nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type InstitutionAllocationResponse = z.infer<typeof institutionAllocationResponseSchema>;

/** POST /api/admin/institutions — bulk-allocate pooled tokens to an institution. */
export const institutionAllocateRequestSchema = z.object({
    ngo_partner_id: z.string().uuid(),
    count: z.number().int().positive().max(10_000),
    notes: z.string().trim().max(500).optional(),
});
export type InstitutionAllocateRequest = z.infer<typeof institutionAllocateRequestSchema>;

// --- addon #7: corporate CSR donor profiles --------------------------------

/** GET/POST /api/donor/csr — the signed-in donor's corporate CSR profile (addon #7). */
export const corporateCsrProfileResponseSchema = z.object({
    id: z.string(),
    donor_id: z.string(),
    company_name: z.string(),
    cin: z.string().nullable(),
    registration_number: z.string().nullable(),
    csr_focus_area: z.string().nullable(),
    ngo_partner_id: z.string().nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type CorporateCsrProfileResponse = z.infer<typeof corporateCsrProfileResponseSchema>;

/** POST /api/donor/csr — create/update the caller's corporate CSR profile. */
export const corporateCsrProfileRequestSchema = z.object({
    company_name: z.string().trim().min(1).max(200),
    cin: z.string().trim().max(40).optional(),
    registration_number: z.string().trim().max(80).optional(),
    csr_focus_area: z.string().trim().max(200).optional(),
    ngo_partner_id: z.string().uuid().nullable().optional(),
});
export type CorporateCsrProfileRequest = z.infer<typeof corporateCsrProfileRequestSchema>;

/** POST /api/admin/csr — generate a corporate CSR report (addon #7). */
export const csrReportGenerateRequestSchema = z
    .object({
        donor_id: z.string().uuid().optional(),
        period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date").optional(),
        period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date").optional(),
        title: z.string().trim().max(200).optional(),
    })
    .refine(
        (r) => !r.period_start || !r.period_end || r.period_start <= r.period_end,
        { message: "period_start must be on or before period_end", path: ["period_start"] }
    );
export type CsrReportGenerateRequest = z.infer<typeof csrReportGenerateRequestSchema>;

// --- standard error body (contract: never a bare null) ---------------------

export const errorResponseSchema = z.object({ error: z.string() });
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
