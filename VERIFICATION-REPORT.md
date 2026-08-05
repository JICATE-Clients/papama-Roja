# pApAmA Platform — Code Verification Report

> **Date:** 2026-08-05
> **Purpose:** Factual audit of what the code actually does, to correct the User Guide (`docs/user-guide.md`, Markdown format).
> **Method:** Code-only evidence. No changes made.

---

## SOURCE DOCUMENT

| Field | Value |
|-------|-------|
| Title | pApAmA --- User Guide |
| Format | Markdown (.md) |
| Path | `docs/user-guide.md` |
| Version noted | 1.0 (Phase 1), July 2026 |

---

## AUTH & ROLES

### 1. OTP / email verification / password complexity

| Check | Finding | Evidence | Confidence |
|-------|---------|----------|------------|
| OTP / 2FA | **NOT FOUND** --- zero references to OTP, TOTP, or MFA anywhere in the codebase. | Grep across all files | High |
| Email verification (donor) | Conditional --- if the Supabase project has email confirmation enabled, signup shows "Check your email"; otherwise auto-login. | `app/donor/signup/page.tsx:72-73` | High |
| Email verification (vendor) | Skipped --- `email_confirm: true` passed server-side (pre-confirmed). Vendor is gated by admin approval, not email. | `app/api/vendor/register/route.ts:61` | High |
| Email verification (volunteer) | Skipped --- same `email_confirm: true` pattern. Gated by admin approval. | `app/api/volunteer/register/route.ts:39` | High |
| Password rules (donor) | Min 6 chars, HTML `minLength` only (client-side). No complexity (uppercase / digit / symbol). | `app/donor/signup/page.tsx:151` | High |
| Password rules (vendor) | Min 8 chars, Zod schema. No complexity. | `app/api/vendor/register/route.ts:33` | High |
| Password rules (volunteer) | Min 8 chars, Zod schema. No complexity. | `app/api/volunteer/register/route.ts:25` | High |

### 2. Admin roles --- real permissions or labels?

**All three admin-console roles are real, distinctly scoped, and enforced.**

Roles constant: `lib/permissions/index.ts:67-71`
Permission matrix: `lib/permissions/matrix.ts:88-279`
Enforcement: `assertCan()` in `lib/permissions/index.ts:96-107` (throws `ForbiddenError`)
Navigation gating: `useCan(feature, action)` hook hides inaccessible pages in `app/admin/AdminHeader.tsx`

| Role | Scope summary | Key capabilities |
|------|---------------|------------------|
| **admin** | `CRUD_ALL` on all 23+ features | Override settlement holds; approve vendors, beneficiaries, volunteers; full emergency-mode control; system config |
| **compliance** | `R_ALL` (read-only) on 20 features | Can read everything (donations, tokens, vendors, beneficiaries, settlements, proofs, fraud, audit logs). Cannot create, update, delete, approve, or override anything. |
| **vendor_manager** | Targeted CRUD | Approve vendors & vendor menus; manage vendor documents; read settlements, proofs, analytics; triage complaints. Cannot override settlements; cannot approve beneficiaries or volunteers. |

Admin layout gate: only users with role in `ADMIN_CONSOLE_ROLES` can enter `/admin` (`app/admin/layout.tsx:31`).

All 27 admin sections in `app/admin/adminSections.ts:21-214` are individually gated by `feature + action`.

**ANSWER:** Real, enforced, distinctly scoped roles --- not labels.
**CONFIDENCE:** High

### 3. Signup approval requirements

| User type | Immediate access? | Approval required? | Approved by | Evidence |
|-----------|--------------------|---------------------|-------------|----------|
| **Donor** | Yes | No | N/A | Auto-trigger inserts `role='donor'` on signup (`m02_users_auth.sql:108`). No status/pending field on `donors` table. |
| **Vendor** | No | Yes | Admin or Vendor Manager | `status: "pending"`, `kyc_status: "pending"` at registration (`app/api/vendor/register/route.ts:124-125`). Enum: `pending | approved | suspended | rejected` (`enums.ts:141`). |
| **Volunteer** | No | Yes | Admin only | `status: "pending"` at registration (`app/api/volunteer/register/route.ts:90`). UI says "An admin reviews every application" (`app/volunteer/register/page.tsx:69`). **Note:** DB check constraint allows only `active | inactive | suspended` --- `pending` is not in the constraint (`m09_volunteers.sql:37`); this is a latent bug. |
| **Beneficiary** | No | Yes | Admin only | `registration_status: "pending"` (`app/api/beneficiary/register/route.ts:85`). RLS policy restricts UPDATE to `current_app_role() = 'admin'` only (`m05_beneficiaries.sql:132-136`). |

**CONFIDENCE:** High

---

## PRIVACY & DATA

### 4. Storage of face photos, eligibility proofs, vendor KYC

| Data type | Where stored | Public? | Access control | Evidence |
|-----------|-------------|---------|----------------|----------|
| **Beneficiary face data** | Database columns only (`beneficiaries.face_embedding`, `beneficiary_registrations.face_embedding`, `redemption_cooldown_log.face_embedding`). 1024-d vectors. | No | Column-level; no raw image ever stored. Comment: "PRIVACY: we store ONLY the embedding (never a raw image)" | `m23_face_embeddings.sql:19, 34-47` |
| **Vendor KYC documents** | Supabase Storage bucket `vendor-documents` (`public: false`). | No | Private bucket + RLS (vendor sees own prefix only; staff reads all). Served via signed URLs (1-hour TTL). | `m22_vendor_documents_storage.sql:25-26, 37-97`; `app/api/vendor/documents/route.ts:17-19` |
| **Proof-of-service photos** | Supabase Storage bucket `vendor-proofs` (`public: false`). | No | Private bucket + RLS (vendor can read/insert own; no update/delete; staff reads all). Signed URLs: 10 min for admin review, 30 days for donor meal-photo notification. Write-once --- "vendors may NOT update or delete uploaded proof objects." | `m26_vendor_proofs_storage.sql:24-26, 29-69`; `app/api/admin/proofs/route.ts:18`; `app/api/admin/proofs/[id]/decide/route.ts:153` |
| **Eligibility proofs (beneficiary)** | `beneficiary_registrations.document_refs text[]` stores references. | Unclear | References stored in array; actual storage location for these documents not evident in the upload routes audited. | `m05_beneficiaries.sql:65` |

**ANSWER:** All storage buckets are private with RLS and signed URLs. Face data is embeddings only, never raw images. Eligibility document storage mechanism is unclear (references stored, upload path not found).
**CONFIDENCE:** High (buckets/face); Medium (eligibility doc upload path)

### 5. Consent capture at beneficiary registration

**NOT FOUND at beneficiary registration.**

- A `consent_records` table exists with `subject_type` supporting `donor | beneficiary | volunteer | vendor` (`m_consent_and_retention.sql:21-31`).
- A donor consent endpoint exists at `app/api/donor/consent/route.ts:19-34` capturing `data_privacy`, `communications`, `data_processing`.
- Migration comment says "other subjects are server-mediated (service-role) at registration" (`consent_and_retention.sql:40`).
- **However, neither `app/api/beneficiary/register/route.ts` nor `app/api/admin/beneficiary-registrations/route.ts` actually records a consent row.** No consent field in their Zod schemas.

**ANSWER:** NOT FOUND --- consent infrastructure exists but is not wired into beneficiary registration.
**CONFIDENCE:** High

### 6. Data retention / deletion policy

**NOT IMPLEMENTED.**

- `system_config` key `audit_log_retention_days` is seeded as `NULL` with comment: "do NOT invent a duration" (`consent_and_retention.sql:60-64`).
- Comment: "append-only logs stays append-only; there is NO destructive purge job here" (`consent_and_retention.sql:12-13`).
- Eligibility auto-expiry exists for `pregnant_women` and `patients` (calculates `eligibility_expires_at`), but this marks ineligibility --- **data is not deleted** (`app/api/admin/beneficiary-registrations/[id]/decide/route.ts:71-92`).
- No scheduled cleanup, TTL enforcement, or deletion routine found for any beneficiary data, proof photos, or face hashes.

**ANSWER:** NOT FOUND --- no retention or deletion policy is implemented. Data accumulates indefinitely.
**CONFIDENCE:** High

### 7. Donor "token redeemed" notification fields

Two notifications are sent to donors; fields listed below.

**Redemption notification** (`app/api/vendor/redemptions/route.ts:247-275`):

```
metadata: {
    token_reference    // serial number
    vendor_name        // vendor's name
    meal_info          // menu item name
    location           // vendor city
    time / redeemed_at // ISO timestamp
    value_inr          // meal value
    beneficiary_category  // e.g. "pregnant_women", "patient"  <-- EXPOSED
}
```

**Meal-photo notification** (sent after admin approves proof, `app/api/admin/proofs/[id]/decide/route.ts:160-219`):

```
metadata: {
    vendor_name
    location           // vendor city
    time / redeemed_at
    value_inr
    beneficiary_category   // <-- EXPOSED again
    token_reference
    meal_photo_url         // 30-day signed URL to plate photo
}
```

**ANSWER:** `beneficiary_category` IS exposed to the donor in both notifications. No other beneficiary PII (name, face, Aadhaar, location) is included.
**CONFIDENCE:** High

---

## MONEY & TOKENS

### 8. Co-pay at redemption

**Co-pay is retained by the vendor (collected at the counter). It is NOT deducted from vendor settlement.**

- Co-pay is clamped to `co_contribution_max` config (`lib/services/redemption.ts:1007-1015`).
- Stored on `token_redemptions.co_pay_inr` (`app/api/vendor/redemptions/route.ts:97`).
- Settlement payout formula: `menu_value - difference_paid` (`lib/services/settlement.ts:107-109`). Co-pay is entirely excluded from this calculation.

**CONFIDENCE:** High

### 9. Forfeited / expired / revoked token value

| Scenario | Disposition | Evidence |
|----------|-------------|----------|
| **Forfeited balance** (token value > menu price) | Written off to **platform revenue** ledger (`ledger: "revenue"`, `description: "forfeited balance on redemption"`). Never refunded to donor. | `app/api/vendor/redemptions/route.ts:173-199` |
| **Expired tokens** | Status flipped to `"expired"`. No refund logic, no pool return, no ledger entry. Value is effectively **written off**. | `app/api/admin/tokens/expire-sweep/route.ts:25-31` |
| **Revoked tokens** (volunteer-held) | Token status reset to `"in_admin_pool"` for reallocation. No money reversal or donor refund. | `app/api/admin/tokens/[id]/revoke/route.ts:54-73` |

**CONFIDENCE:** High

### 10. Hard-delete paths

| Target | Hard-delete exists? | Context | Evidence |
|--------|---------------------|---------|----------|
| **Settlements** | Yes --- compensating cleanup only | If `settlement_line_items.insert()` fails after header creation, the orphaned header is deleted. Not a general deletion path. | `lib/services/settlement.ts:228` |
| **Donors** | Yes --- internal housekeeping | When a volunteer account is created, the auto-provisioned donor profile is deleted to avoid clutter. | `app/api/admin/volunteers/route.ts:104-110` |
| **Donations** | No | Reversals use `status = "failed"` with credit clawback (soft). | -- |
| **Tokens** | No | All transitions are status changes; tokens are never deleted. | -- |
| **Audit logs** | No | Append-only; no delete path. | -- |

**CONFIDENCE:** High

### 11. Pool-to-token conversion batch traceability

**Partially traceable.** The batch is recorded in two places:
- `credit_transactions` entry (type `token_conversion`): records count, value, total, donor_id (`app/api/admin/pool/mint/route.ts:106-111`).
- `audit_logs` entry (action `pool.mint`): metadata includes `{ count, value_each, total, new_balance }` (`app/api/admin/pool/mint/route.ts:113-119`).

**However**, the minted tokens themselves have **no `pool_batch_id` or `minting_batch_id` column** in the insert (`app/api/admin/pool/mint/route.ts:79-91`). Tracing individual tokens back to a specific mint batch requires cross-referencing timestamps and donor_id on the credit_transactions ledger.

**CONFIDENCE:** High

### 12. Reason fields mandatory (server-side)?

| Operation | Field | Mandatory? | Evidence |
|-----------|-------|------------|----------|
| **Donation reversal** | `reason` | No (`.optional()`) | `app/api/admin/donations/[id]/reverse/route.ts:19` |
| **Token revocation** | `reason` | No (`.optional()`) | `app/api/admin/tokens/[id]/revoke/route.ts:34` |
| **Token revalidation** | (none) | N/A --- schema is `.strict()` empty object | `lib/validation/schemas.ts:188` |
| **Lost-token replacement** | `reason` | No (`.optional()`) | `lib/validation/schemas.ts:183` |
| **Vendor suspension** | `reason` | No (`.optional()`) | `lib/validation/schemas.ts:339` |
| **Proof rejection** | `note` | **Yes** --- `.refine()` enforces non-empty note when `decision === "reject"` | `app/api/admin/proofs/[id]/decide/route.ts:31-34` |
| **Settlement hold** | `note` | No (`.optional()`) | `lib/validation/schemas.ts:383` |

**ANSWER:** Only **proof rejection** enforces a mandatory reason server-side. All others are optional.
**CONFIDENCE:** High

### 13. Old-to-new token linkage on lost-token replacement

**YES --- fully stored.**

- Old token is set to `status: "blocked"` with `cancelled_at` timestamp (`lib/services/token.ts:96-105`).
- New replacement token is created with `replacement_for_token_id: token.id` --- a nullable UUID FK pointing to the original blocked token (`lib/services/token.ts:124`).
- Audit log metadata records both `old_token_id` and `new_token_id` (`lib/services/token.ts:138-152`).

**CONFIDENCE:** High

---

## NOTIFICATIONS

### 14. Delivery channels and multi-language support

**In-app only.** SMS, email, and WhatsApp are **seams** (stub adapters that check for env vars and log a skip message when unset).

- Dispatch layer: `lib/notifications/dispatch.ts:8-14` --- "SMS, email, and WhatsApp are SEAMS: each adapter checks for its respective provider env var and logs a clear skip message when unset."
- Default channel: `['in_app']` only (`dispatch.ts:25-27`).
- Adapters check for `SMS_PROVIDER_API_KEY`, `EMAIL_PROVIDER_API_KEY`, `WHATSAPP_PROVIDER_API_KEY` (`dispatch.ts:104-138`).
- Multi-language: NOT implemented. Comment says "i18n-ready: the copy is data, not code --- a future locale column/table can slot in" (`lib/services/notificationTemplates.ts:18`), but no locale column exists today.

**CONFIDENCE:** High

### 15. Pre-expiry reminders for tokens

**YES --- 7-day pre-redemption reminder exists.**

- `/api/admin/scheduled-reminders/sweep` sends reminders for tokens with `scheduled_redemption_dates` 7 days out. Flips status to `'reminded'` to prevent duplicates (`app/api/admin/scheduled-reminders/sweep/route.ts:5-62`).
- Separate token expiry sweep at `/api/admin/tokens/expire-sweep/route.ts` auto-expires past-due tokens.

**CONFIDENCE:** High

---

## BEHAVIOUR GAPS

### 16. Can a volunteer return an undistributed token to the Admin Pool?

**NOT FOUND.** No volunteer-initiated return route exists. `DISTRIBUTION_CHANNELS` includes `"admin_revoke"` (admin reclaims a held token back to pool, `lib/types/enums.ts:73`), but this is admin-only, not volunteer-initiated.

**CONFIDENCE:** High

### 17. Can a vendor mark themselves temporarily closed?

**YES.** Vendors can PATCH `temporary_closure_until` (nullable datetime) via `/api/vendor/availability` (`app/api/vendor/availability/route.ts:19-109`). Redemption validation checks this and blocks if `temporary_closure_until > now` (`lib/services/redemption.ts:274-299`).

**CONFIDENCE:** High

### 18. Can a vendor mark a single menu item temporarily unavailable?

**NOT FOUND.** The `vendor_menus` table has no availability flag or `temporary_unavailable_until` column (`m04_vendors.sql:74-86`). PATCH on menu items accepts only `item_name`, `price`, `nutrition_category`, `is_special_care_equivalent` (`app/api/vendor/menus/[id]/route.ts:18-25`).

**CONFIDENCE:** High

### 19. Vendor dispute/query mechanism on settlements?

**NOT FOUND.** Vendor settlement endpoint is GET-only, read-only ("never mutates a settlement", `app/api/vendor/settlements/route.ts:12-31`). No dispute, query, or appeal route exists for settlements.

**CONFIDENCE:** High

### 20. Offline handling at /vendor/scan

| Scenario | Handling | Evidence |
|----------|----------|----------|
| **Network drop mid-redemption** | Graceful catch: `"Network error --- please try again."` No offline queue or retry mechanism. | `app/vendor/scan/page.tsx:89-99` |
| **Camera/face capture failure** | Face is required; submit button disabled if face not captured. No manual fallback to skip face. | `app/vendor/scan/page.tsx:501` |
| **QR scan failure** | Manual paste fallback: "scan with camera or paste the code." | `app/vendor/scan/page.tsx:333, 340-347` |
| **Comprehensive offline mode** | **NOT FOUND** --- no service worker, no persistent queue, no offline detection. | -- |

**CONFIDENCE:** High

### 21. Emergency Mode --- what does it override?

**Emergency mode relaxes cooldown and meal-limit checks. It does NOT override vendor closure, stock exhaustion, or capacity checks.**

- When `emergency_mode_enabled = true`:
  - Cooldown check becomes **soft** (warning, not blocking) (`lib/services/redemption.ts:887-901`)
  - Meal-limit check becomes **soft** (`lib/services/redemption.ts:936-943`)
- Checks that remain **hard** (still block):
  - Vendor `is_open` (`redemption.ts:284`)
  - `stock_exhausted` (`redemption.ts:291`)
  - `temporary_closure_until` (`redemption.ts:299`)

**CONFIDENCE:** High

### 22. Who chooses the menu item at redemption?

**The VENDOR chooses.** The vendor scans the token QR code and picks a menu item from a dropdown of their approved items. The beneficiary does not select.

- Vendor scan page dropdown: `app/vendor/scan/page.tsx:350-375`
- API comment: "The vendor scans a token QR and picks a menu item" (`app/api/vendor/redemptions/preview/route.ts:14`)
- `menu_item_id` comes from vendor request body (`app/api/vendor/redemptions/route.ts:58`)

**CONFIDENCE:** High

### 23. Vendor menu price history

**NOT FOUND.** Price edits overwrite the previous value in-place. No version column, history table, or price-change audit in the `vendor_menus` table (`m04_vendors.sql:74-86`; `app/api/vendor/menus/[id]/route.ts:27-63`). General audit logs may capture the action but not the old price value.

**CONFIDENCE:** High

### 24. Resubmission time limit on rejected proofs

**NOT FOUND.** On rejection, `proof_status='rejected'` and vendor may re-upload anytime. No `rejected_at` timestamp, `resubmit_deadline`, or time-window enforcement exists (`app/api/admin/proofs/[id]/decide/route.ts:69-75`).

**CONFIDENCE:** High

### 25. FSSAI / licence expiry date

**NOT FOUND.** Only the licence number is stored as `fssai_license text` (`m04_vendors.sql:31`; `app/api/vendor/register/route.ts:42`). No expiry date column or validation.

**CONFIDENCE:** High

### 26. What does `volunteer_zones_enabled` do?

**Gates zone enforcement at token distribution.** When OFF, zone assignment UI is still available (can be set up ahead of enabling), but zones are not enforced. When ON, zones are enforced during allocation.

- Config read: `app/api/admin/volunteer-activity/route.ts:26-31`
- Boolean config key: `lib/system-config.ts:44`
- UI comment: "zone enforcement is gated by system_config volunteer_zones_enabled; assignment is always available" (`app/admin/volunteer-activity/page.tsx:41`)

**CONFIDENCE:** Medium (exact enforcement logic at distribution level not fully traced)

### 27. Beneficiary categories --- hardcoded or config-driven?

**HARDCODED.** Four categories defined as a TypeScript const array:

```
pregnant_women, patient, disability, disaster_affected
```

Source: `lib/types/enums.ts:115-121`. Validated via `z.enum(BENEFICIARY_CATEGORIES)` at `lib/validation/enums.ts:54`. Adding a category requires a code change.

**CONFIDENCE:** High

### 28. Does /donor/notifications persist or clear on view?

**Persists.** Notifications are never deleted. A separate POST endpoint marks individual notifications as `status='read'` without deleting the row (`app/api/donor/notifications/read/route.ts:27-31`). GET returns all notifications ordered by `created_at` desc (`app/api/donor/notifications/route.ts:18-36`). Rows accumulate indefinitely.

**CONFIDENCE:** High

### 29. Search / filter / export on audit-logs and donations

| Page | Search | Filter | Export |
|------|--------|--------|--------|
| `/admin/audit-logs` | Client-side text search on `action`, `entity_table`, `summary` (`app/admin/audit-logs/page.tsx:39-42`) | Implicit via search only | **NOT FOUND** |
| `/admin/donations` | Client-side text search on `donor_label`, `payment_ref`, `status` (`app/admin/donations/page.tsx:77-80`) | Implicit via search only | **NOT FOUND** |

- Server-side filtering: NOT implemented on either route (both use pagination only: `limit` + `offset`).
- Export: exists only for compliance reports at `/api/admin/reports/export`.

**CONFIDENCE:** High

### 30. "pApAmA" expanded to "People Against Poverty and Malnutrition"

**NOT FOUND.** Grepped entire codebase for "People Against Poverty" and "Malnutrition" --- zero matches. "pApAmA" appears only as the brand name (e.g., "pApAmA Food Token" in `components/donor/PrintableToken.tsx:69`).

**CONFIDENCE:** High

---

## GAPS CONFIRMED (answered NOT FOUND)

1. **OTP / 2FA** --- no multi-factor authentication exists.
2. **Consent at beneficiary registration** --- infrastructure exists but is not wired in.
3. **Data retention / deletion policy** --- not implemented; data accumulates indefinitely.
4. **Volunteer self-return of undistributed tokens** --- admin-only revocation.
5. **Per-menu-item temporary unavailability** --- not implemented.
6. **Vendor settlement dispute mechanism** --- not implemented.
7. **Comprehensive offline mode at /vendor/scan** --- no service worker or queue.
8. **Vendor menu price history** --- edit overwrites; no history tracked.
9. **Resubmission time limit on rejected proofs** --- no deadline.
10. **FSSAI licence expiry date** --- only licence number stored.
11. **Export on audit-logs and donations pages** --- not available.
12. **"People Against Poverty and Malnutrition" expansion** --- not present anywhere.

---

## NOTABLE FINDINGS (not asked but observed)

- **Volunteer status bug:** Registration inserts `status: "pending"` but the DB check constraint only allows `active | inactive | suspended` (`m09_volunteers.sql:37` vs `app/api/volunteer/register/route.ts:90`).
- **Beneficiary category exposed to donors:** Both redemption and meal-photo notifications include `beneficiary_category` in metadata --- may be a privacy concern.
- **Reason fields inconsistency:** Only proof rejection enforces a mandatory reason; all other critical actions (reversal, revocation, suspension, settlement hold) have optional reasons.
- **Pool-to-token batch gap:** Minted tokens lack a `pool_batch_id` column --- traceability requires timestamp cross-referencing.
