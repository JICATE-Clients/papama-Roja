# pApAmA Platform — Verification Report 2 (V-01 … V-22)

> **Date:** 2026-08-11
> **Purpose:** Verify behavioural claims in `docs/user-guide.md` (v1.1) against implemented code, prior to rewriting the Platform Administration Guide.
> **Method:** Read-only code inspection. No changes made.
> **Predecessor:** `VERIFICATION-REPORT.md` (30 checks on sections 1–6.2) — findings referenced but not re-verified.

---

## 1. Summary Table

| V-ID | Finding | Verdict |
|------|---------|---------|
| V-01 | Co-pay seed is ₹5 but code enforces no hard ceiling — admin can set any non-negative value; spec-rev2 says ₹10 hard bound but code does not enforce it | **DIFFERENT** |
| V-02 | Nearby-vendor list uses browser GPS, shows distance/open-status/hours; no contact number or menu items | **CONFIRMED** |
| V-03 | All six redemption exception paths handled with user-facing messages and system-side records | **CONFIRMED** |
| V-04 | Only 1024-d embeddings + SHA-256 fingerprint stored; raw photographs never captured, transmitted, or stored | **CONFIRMED** |
| V-05 | No mobile/contact field captured on public donation flows; notification hooks exist but are no-ops for guests | **ABSENT** |
| V-06 | UTR stored with DB uniqueness constraint; duplicate prevented (409); no external bank verification — flagged as FOLLOW-UP | **CONFIRMED** |
| V-07 | Feedback is free-text + 1–5 star rating + binary `is_complaint` flag; no predefined complaint categories | **DIFFERENT** |
| V-08 | Temporary closure and capacity both HARD-block redemption; displayed on nearby list; no automatic beneficiary redirection | **CONFIRMED** |
| V-09 | Config changes audited with previous/new value, actor, timestamp; no dedicated reason field | **CONFIRMED** |
| V-10 | `vendor_inspection_fail_penalty` read as number, used as quality-score deduction on failed inspections | **CONFIRMED** |
| V-11 | Full settlement action trail: pending → locked → approved → reconciled → paid; hold/release with note; all audit-logged | **CONFIRMED** |
| V-12 | Emergency toggle audited via generic config path (no required reason); override activate/revert audited; auto-revert logs aggregate only | **CONFIRMED** |
| V-13 | City lock enforced ONLY at token redemption; not gated at beneficiary/vendor/volunteer registration | **DIFFERENT** |
| V-14 | Proof phash dups flagged for admin review (not auto-rejected); audit logs append-only with DB triggers; Compliance Officer read-only | **CONFIRMED** |
| V-15 | 80G certificate generation BLOCKED (`csr_80g_certificates_enabled=false`); no generation code, no certificate record storage | **ABSENT** |
| V-16 | CSR chain partial: Organisation → Donation → Aggregate Report; allocation/impact and certificate links missing | **DIFFERENT** |
| V-17 | Category, eligibility period, approver recorded; `special_care_multiplier` defined but NOT applied anywhere in code | **DIFFERENT** |
| V-18 | Admin revocation returns volunteer-held token to admin pool (value preserved); no donor-side cancellation | **CONFIRMED** |
| V-19 | Report-lost blocks original, mints replacement with same value via `replacement_for_token_id`; fully audit-logged | **CONFIRMED** |
| V-20 | Notifications include vendor name, meal item, date/time, value, thank-you text; admin-editable templates with `{{var}}` placeholders | **CONFIRMED** |
| V-21 | Forfeited balance → `forfeited_balances` table + revenue ledger; expired tokens → status flip only, no ledger entry, value written off | **CONFIRMED** |
| V-22 | 11 distinct FAQ behavioural claims verified — all CONFIRMED against code | **CONFIRMED** |

---

## 2. Detailed Findings

---

### V-01 — Beneficiary Co-Pay Bounds

**Verdict: DIFFERENT**

The user guide states ₹0–₹5 range for co-pay. The code tells a more nuanced story:

**Config definition:** `co_contribution_max` is seeded as `'5'` (type `number`) in `supabase/migrations/20260620010103_m03_system_config.sql:68`.

**Server-side clamping:** `lib/services/redemption.ts:1010–1015` — co-pay is clamped to `[0, co_contribution_max]` via `clamp()`. If config is unset, only ₹0 is accepted (no guessed default).

**Client-side limit:** `app/vendor/scan/page.tsx:11–13` — `const CO_PAY_MAX = 5` with comment: "Client-side clamp to ₹0..₹5; the server clamps to co_contribution_max too."

**No hard upper ceiling in code:** The PATCH `/api/admin/system-config` route (`app/api/admin/system-config/route.ts:46–75`) validates that number configs are non-negative but enforces no maximum. An admin can set `co_contribution_max` to 10, 50, or 999 — only the non-negative check gates it.

**Test suite uses ₹10:** `test/helpers/mockConfig.ts:43` and `test/services/redemption.test.ts:147,549` all use `co_contribution_max = 10`, citing "spec §7: ₹0–₹10". The spec-rev2 (`docs/papama-phase1-spec-rev2.md:233,249`) states ₹10 as the hard bound with a claim that "co_contribution_max cannot exceed ₹10" — but this bound is **not enforced in code**.

**Per-redemption recording:** `token_redemptions.co_pay_inr` — stored per redemption (`supabase/migrations/20260620010117_m17_redemption_settlement_spine.sql:27`). DB constraint: `co_pay_inr >= 0`.

**Settlement treatment:** Co-pay is entirely excluded from settlement payout formula (`lib/services/settlement.ts:107–109,132`). Vendor retains co-pay collected at counter.

**Reporting:** Co-pay value accessible in redemption detail queries but not aggregated in analytics dashboard.

**Key discrepancy:** The guide says ₹0–₹5; the spec-rev2 says ₹10 hard max; the code enforces no ceiling at all. The ₹5 is merely the seed value.

---

### V-02 — Nearby-Vendor Discovery

**Verdict: CONFIRMED**

**Page:** `app/beneficiary/nearby-vendors/page.tsx`
**API:** `app/api/beneficiary/nearby-vendors/route.ts`
**Service:** `lib/services/vendorDiscovery.ts`

**Location determination:** Browser GPS via `navigator.geolocation.getCurrentPosition()`. User clicks "Use my location" to trigger. No stored beneficiary location — lookup is ad-hoc per request.

**Query parameters:** `lat`, `lng`, `radius_km` (optional, defaults to `redemption_radius_km` config), `limit` (optional).

**Distance computation:** Great-circle (Haversine) via `getGreatCircleDistanceKm()` in `lib/services/vendorDiscovery.ts:160`.

**Displayed fields per vendor:**

| Field | Present | Source |
|-------|---------|--------|
| Name | Yes | `vendors.name` |
| Address / city | Yes | `vendors.address`, `vendors.city` |
| Distance (km) | Yes | Computed by service |
| Open / Closed / Temporarily closed / Out of stock | Yes | Derived from `is_open`, `stock_exhausted`, `temporary_closure_until` |
| Operating hours (meal windows) | Yes | `meal_windows` join |
| Contact number | **No** | Not in projection |
| Menu items | **No** | Not in this response; separate menu API exists |

---

### V-03 — Redemption Exception Paths

**Verdict: CONFIRMED**

All exception paths are handled in `lib/services/redemption.ts:validateRedemption()`. Each check returns `{ name, pass, hard, detail }`. Hard-check failures return HTTP 400 from `app/api/vendor/redemptions/route.ts:77–78`.

| Exception | Check type | User-facing message | System record | Citation |
|-----------|-----------|---------------------|---------------|----------|
| **(a) Expired token** | HARD | `"token has expired"` | Check recorded in validation array | `redemption.ts:210–222` |
| **(b) Already-redeemed token** | HARD | `"token was already redeemed"` | Duplicate scan detection rolls back redemption row | `redemptions/route.ts:163` |
| **(c) Failed face verification** | HARD | Identity: `"could not verify beneficiary identity"` / Liveness: `"face capture failed the liveness/anti-spoof check — retake in good lighting"` | Fraud flag raised if matched to prior violation | `redemption.ts:682–750`, `lib/face/liveness.ts:39` |
| **(d) Network interruption** | Graceful | `"Network error — please try again."` | No offline queue; token not burned until full commit | `app/vendor/scan/page.tsx:79,89–99` |
| **(e) Vendor capacity reached** | HARD (if `vendor_capacity_enforcement_enabled`) | `"vendor daily capacity reached (${served}/${cap})"` | Capacity usage table checked | `redemption.ts:302–343` |
| **(f) Outside meal window** | HARD (if `meal_window_enforcement_enabled`) | `"outside meal windows — next window opens at ${bestStart}"` | Meal windows table checked | `redemption.ts:604–650` |

**Idempotency:** No explicit idempotency key. Re-attempt after network failure is safe because token status is checked atomically — a partially committed redemption rolls back, and the token remains redeemable.

---

### V-04 — Face Data Storage

**Verdict: CONFIRMED**

**Claim verified:** Only a mathematical representation is stored; original photographs are never retained.

**Capture (client-side):** `components/face/FaceCapture.tsx` — uses `@vladmandic/human` library's `faceres` model to produce a 1024-d embedding on-device. Only `embedding: number[]` and `liveness: number` are transmitted (`lib/validation/schemas.ts:75–79`). No photo blob, no image file, no pixel data sent to server.

**Storage (database):**
- `beneficiaries.face_embedding` — pgvector 1024-d (`supabase/migrations/20260624010123_m23_face_embeddings.sql:19`)
- `beneficiary_registrations.face_embedding` — pgvector 1024-d
- `redemption_cooldown_log.face_embedding` — pgvector 1024-d
- `beneficiaries.face_hash` / `beneficiary_registrations.face_hash` / `redemption_cooldown_log.face_hash` — SHA-256 fingerprint (text, one-way, not reversible)

**Privacy comment in migration:** `m23_face_embeddings.sql:14–16`: *"PRIVACY (unchanged rule): we store ONLY the embedding (never a raw image); the embedding is computed on the device."*

**No storage buckets for face photos:** No Supabase storage bucket references for face photos exist. Proof photos (plate images) use `vendor-proofs` bucket — these are meal photos, not face photos.

**Matching:** Server-side RPCs `match_beneficiary_face()` and `recent_face_matches()` use cosine distance on stored vectors (`m23:64–108`). `SECURITY DEFINER`, revoked from anon/authenticated.

---

### V-05 — Guest/Public Donation Contact Capture

**Verdict: ABSENT**

**Public donation form:** `app/donate/page.tsx:23–29` — schema accepts only `amount` and `payment_method`. No contact/phone/email field.

**QR donation form:** `app/donate/qr/page.tsx:20–31` — amount form and UTR form only. No contact capture.

**Guest API:** `app/api/donations/create-guest/route.ts:26–29` — schema: `{ amount_inr: number, payment_method?: string }`. No contact fields.

**Notification hooks:** `app/api/_lib/recordDonation.ts:170–181` — guest donations explicitly skip all notifications. The notification infrastructure (`lib/notifications/dispatch.ts:14–27`) documents SMS/email/WhatsApp as "SEAMS" with env-var checks, but no guest contact is ever captured to send to.

**Conclusion:** No contact capture exists for guest donors. Even if SMS/email providers were configured, there is no contact data to deliver to.

---

### V-06 — UTR Handling

**Verdict: CONFIRMED**

**UTR storage:** `upi_qr_payments.upi_transaction_id` (text) — `supabase/migrations/20260624010124_m24_upi_qr_payments.sql:22–41`.

**Uniqueness constraint:** Partial unique index `upi_qr_payments_utr_key` on `upi_transaction_id WHERE upi_transaction_id IS NOT NULL` (`supabase/migrations/20260624102352_m29_upi_transaction_id_unique.sql:8–10`). Additional ledger-level uniqueness via `donations_upi_payment_ref_key` (`supabase/migrations/20260625000018_donations_upi_ref_unique.sql`).

**Duplicate UTR detection:** DB code `23505` (unique violation) returns HTTP 409: `"this UPI reference number has already been used to confirm a payment"` (`app/api/payment/upi-qr/confirm/route.ts:129–139`).

**Verification:** UTR is donor-self-asserted and **NOT** verified against any bank/PSP feed. Flagged in code comments (`app/api/payment/upi-qr/confirm/route.ts:25–29`): *"the UTR is donor-self-asserted and NOT verified against a bank/PSP feed, so a fabricated UTR can still mint pool credit."*

| Scenario | Behaviour | Citation |
|----------|-----------|----------|
| Payment failure | Manual re-entry (user can try again) | `app/donate/qr/page.tsx:301–303` |
| Incorrect UTR format | Client-side: min 6, max 40 chars | `app/api/payment/upi-qr/confirm/route.ts:36` |
| Pending status (timeout) | Lazy expiry flip to `EXPIRED` on first touch after deadline | `confirm/route.ts:97–104` |
| Duplicate UTR | First confirms atomically; second gets 409 Conflict | `confirm/route.ts:116–146` |

---

### V-07 — Complaint Categories

**Verdict: DIFFERENT**

The user guide implies predefined complaint categories (food quality, quantity, hygiene, staff behaviour, delay, redemption issue, other). The implementation is simpler:

**Beneficiary feedback form:** `app/beneficiary/feedback/page.tsx:114–173`
- Star rating (1–5)
- Free-text comment (optional, 1000 chars max)
- Single checkbox: `"This is a complaint (hygiene, behaviour, or a serious problem)"`
- **No category dropdown or multi-select**

**API schema:** `app/api/beneficiary/feedback/route.ts:21–29` — fields: `vendor_id`, `rating`, `comment`, `is_complaint`, `redemption_id`, `beneficiary_id`. No `category` field.

**Database:** `vendor_feedback` table (`supabase/migrations/20260630000004_vendor_feedback.sql:79–88`) — columns: `vendor_id`, `rating`, `comment`, `is_complaint`. No `category` column. Extended with `complaint_status` (open/investigating/resolved/dismissed), `resolution`, `resolved_by`, `resolved_at` (`supabase/migrations/20260702000003_complaint_workflow.sql:19–24`) — still no categories.

**Quality scoring:** `lib/services/vendorRating.ts:87–116` uses `complaint_rate` (count of `is_complaint=true` / total) for auto-suspension but does not categorise complaints.

---

### V-08 — Vendor Unavailability

**Verdict: CONFIRMED**

**(a) Temporary closure:**

- **Vendor self-service:** PATCH `/api/vendor/availability` with `temporary_closure_until: datetime | null` (`app/api/vendor/availability/route.ts:62–71`).
- **Nearby list impact:** `lib/services/vendorDiscovery.ts:38,61–174` returns `temporary_closure_until`; frontend shows "Temporarily closed" (`app/beneficiary/nearby-vendors/page.tsx:38–44`).
- **Redemption impact:** HARD-blocks redemption — `"vendor temporarily closed until ..."` (`lib/services/redemption.ts:293–299`).

**(b) Daily capacity:**

- **Schema:** `vendors.daily_meal_capacity` + `vendor_capacity_usage` table (`supabase/migrations/20260630000003_vendor_capacity.sql:25–52`).
- **Vendor self-service:** PATCH via same availability endpoint.
- **Redemption enforcement:** When `vendor_capacity_enforcement_enabled=true` and `served >= capacity`, HARD-blocks: `"vendor daily capacity reached (${served}/${cap})"` (`lib/services/redemption.ts:302–343`).
- **Beneficiary redirection: ABSENT** — redemption simply fails. No suggestion to try other nearby vendors. Capacity is not displayed on the nearby-vendors list (only admin console shows remaining capacity via `app/api/admin/vendor-capacity/route.ts`).

---

### V-09 — Config Change Audit

**Verdict: CONFIRMED**

When a system-config value is changed via PATCH `/api/admin/system-config` (`app/api/admin/system-config/route.ts:77–116`):

| Element | Captured? | How |
|---------|-----------|-----|
| Previous value | Yes | `metadata.from = row.value` |
| New value | Yes | `metadata.to = stored` |
| Administrator | Yes | `actor_id = user.id` (via audit service) |
| Timestamp | Yes | `created_at = now()` (via audit service) |
| Reason | **No** | No dedicated reason field in schema or audit call |

**Audit action:** `"system_config.update"`. Summary: `"${key}: ${old} → ${new}"`.

**Feature toggles:** Treated as regular system config values — same audit trail applies.

**Audit service:** `lib/services/audit.ts:87–97` — all audit rows include `actor_id`, `actor_role`, `action`, `entity_table`, `entity_id`, `summary`, `metadata`, `created_at`.

**Audit log schema:** `supabase/migrations/20260620010108_m08_audit_logs.sql:27–36` — no dedicated `reason` column.

---

### V-10 — `vendor_inspection_fail_penalty`

**Verdict: CONFIRMED**

**Config key:** Defined as string type in `lib/system-config.ts:50`. Seeded in system_config table.

**Usage:** `lib/services/vendorRating.ts:252–299` — function `applyInspectionOutcome()`:
- Read via `getNumber("vendor_inspection_fail_penalty", admin)` — coerced to number (lines 259–264).
- Applied ONLY on failed inspections (`passed === false`).
- Formula: `nextScore = Math.max(0, Math.round((vendor.quality_score - penalty) * 100) / 100)` (lines 278–284).
- Audit-logged with penalty metadata (lines 286–296).
- Soft-skip when unset: returns `{ penalized: false }` (line 265).

**Triggering workflow:** `app/api/admin/vendor-inspections/route.ts:69–123` — POST route calls `applyInspectionOutcome()` after recording a surprise inspection (lines 115–119). Best-effort: penalty failure does not block inspection record.

**Conclusion:** Not merely stored — actively used as a numeric quality-score deduction on failed inspections.

---

### V-11 — Settlement Action Trail

**Verdict: CONFIRMED**

**Settlement lifecycle** (`app/api/admin/settlements/route.ts:78–84`):

```
pending → locked → approved → reconciled → paid
```

With orthogonal `on_hold`/`hold_note` toggles at any point before paid.

| Action | Persisted | Audit-logged | Details |
|--------|-----------|-------------|---------|
| Generate | Yes (header + line items) | Yes | `lib/services/settlement.ts` |
| Lock | Yes (`status = 'locked'`) | Yes (`settlement.lock`) | Lines 148–195 |
| Unlock | Yes (`status = 'pending'`) | Yes (`settlement.unlock`) | |
| Approve | Yes (`status = 'approved'`) | Yes (`settlement.approve`) | |
| Reconcile | Yes (`status = 'reconciled'`) | Yes (`settlement.reconcile`) | |
| Hold | Yes (`on_hold = true`, `hold_note`) | Yes | Lines 125–145; note optional |
| Release | Yes (`on_hold = false`) | Yes | |
| Pay | Yes (`status = 'paid'`, `settled_at`) | Yes (`settlement.pay`) | Ledger entry posted; lines 172–185 |

**Audit metadata per action:** `{ from: settlement.status, to: rule.to, note: body.note ?? null }`.

**Settlement audit queue (addon #10):** `app/api/admin/settlement-audit/route.ts:147–155` — clear/flag actions also audited; flagged settlements are held.

**Hold reason:** `hold_note` is optional (`lib/validation/schemas.ts:383`). Responsible person: `actor_id` (the admin performing the hold).

---

### V-12 — Emergency Mode Logging

**Verdict: CONFIRMED**

**Toggle (`emergency_mode_enabled`):** Uses generic PATCH `/api/admin/system-config` route. Audit captures actor, timestamp, previous/new value. **No dedicated reason field** — same as V-09 finding.

**Emergency overrides (activate):** `lib/services/emergency.ts:171–233`:
- `action: "emergency.override.activate"`
- Metadata: `{ config_key, from, to, expires_at }`
- Optional `reason` stored in `emergency_overrides` table AND in metadata.

**Emergency overrides (manual revert):** `lib/services/emergency.ts:247–305`:
- `action: "emergency.override.revert"`
- Metadata: `{ config_key }`

**Auto-revert via `emergency_mode_max_duration_days`:** `supabase/migrations/20260716090007_emergency_overrides.sql:51–84`:
- pg_cron job runs daily at 03:00 UTC.
- RPC `revert_emergency_overrides()` auto-reverts expired overrides.
- **Single aggregate audit entry:** `actor_id: null`, `action: "emergency.override.auto_revert"`, `summary: "auto-reverted N emergency override(s) [cron]"`, `metadata: { count, source: "pg_cron" }`.
- **No per-override detail** in the auto-revert log — only aggregate count.

**Emergency token issuance:** `lib/services/emergency.ts:74–150`:
- `action: "emergency.token.grant"`
- Metadata includes optional `reason`.

| Element | Toggle | Override activate | Override revert | Auto-revert |
|---------|--------|------------------|-----------------|-------------|
| Actor | Yes | Yes | Yes | null (cron) |
| Timestamp | Yes | Yes | Yes | Yes |
| Reason required | No | No (optional) | No | N/A |
| Per-item detail | N/A | Yes | Yes | No (aggregate) |

---

### V-13 — City Lock Enforcement Scope

**Verdict: DIFFERENT**

**Config keys:** `city_lock_enabled` (boolean) and `operating_city` (string) — `lib/system-config.ts:24–25`.

**Enforcement:** ONLY at token redemption — `lib/services/redemption.ts:486–564`. When `city_lock_enabled=true` and `operating_city` is set, compares vendor city (case-insensitive) against operating city. HARD-blocks if mismatch.

**Flows NOT gated:**

| Flow | File | City lock check? |
|------|------|-----------------|
| Beneficiary registration | `app/api/beneficiary/register/route.ts` | **No** |
| Vendor onboarding | `app/api/vendor/register/route.ts` | **No** |
| Volunteer registration | `app/api/volunteer/register/route.ts` | **No** |
| Token redemption | `lib/services/redemption.ts:486–564` | **Yes** |

**Conclusion:** City lock gates only where a meal is redeemed, not who can register. The user guide should clarify this scope.

---

### V-14 — Fraud Flag Behaviour & Audit Log Properties

**Verdict: CONFIRMED**

**(a) Proof phash duplicate handling:**

On a `proof_phash_dup_distance` match (`app/api/vendor/redemptions/[id]/proof/route.ts:177–224`):
- Proof status remains `"submitted"` awaiting admin review (line 129).
- Fraud flag `duplicate_media` raised with `blocked: false` (lines 212–224).
- Settlements covering either redemption placed `on_hold: true` (lines 203–209).
- Detection is best-effort (soft-fail, lines 239–240).
- **Not auto-rejected** — admin decides via PATCH `/api/admin/proofs/[id]/decide`.

**(b) Audit log immutability:**

- **DB-level:** Two PostgreSQL triggers (`audit_logs_no_update`, `audit_logs_no_delete`) call `audit_logs_block_mutation()` which raises an exception for ANY update/delete, including service_role (`supabase/migrations/20260620010108_m08_audit_logs.sql:47–63`).
- **RLS:** SELECT for admin/compliance; INSERT-only for authenticated; no UPDATE/DELETE policies (lines 73–79).
- **Code:** `lib/services/audit.ts` exposes only INSERT methods (`writeAuditLog`, `writeAuditLogs`). GET-only API route (`app/api/admin/audit-logs/route.ts`).
- Comment: *"Immutable: no updates or deletes, enforced by trigger even for service_role"* (line 39).

**(c) Compliance Officer vs Admin permissions:**

| Feature | Compliance Officer | Admin |
|---------|-------------------|-------|
| Audit logs | `R_ALL` (read all) | `CRUD_ALL` |
| Fraud monitoring | `R_ALL` (read-only) | `CRUD_ALL` (resolve/dismiss/unblock) |
| System config | Read only (via `audit_reports/read`) | Update (via `audit_reports/update`) |

Source: `lib/permissions/matrix.ts:152–160`. Compliance sees all metadata but cannot create, update, delete, approve, or override anything.

---

### V-15 — 80G Certificate Generation

**Verdict: ABSENT**

**Feature flag:** `csr_80g_certificates_enabled` — seeded as `false` (`lib/system-config.ts:35`). Check function: `csr80gCertificatesEnabled()` (`lib/services/csr.ts:56–58`).

**No generation code:** `lib/services/csr.ts:18–20` comment: *"80G utilization certificates are BLOCKED (need 80G registration + an email/PDF provider) → see csr80gCertificatesEnabled / the marked TODO below. No certificate generation is built."*

**TODO block** (`lib/services/csr.ts:206–211`): Requires (a) entity's 80G registration number and (b) email/PDF provider. Both are open items.

**UI indicator:** `app/admin/csr/page.tsx:70–77` — shows disabled affordance with explanation.

**Required elements status:**

| Element | Present? |
|---------|----------|
| Donor identity/details | No (only `donor_id` in aggregates) |
| Donation amount | Only aggregated, not per-certificate |
| Donation date | No |
| Transaction reference | No |
| Foundation registration details | No (80G reg not stored) |
| Unique certificate number | No |
| Permanent certificate record | No table exists |

---

### V-16 — CSR Module Linkage

**Verdict: DIFFERENT**

**Implemented chain:**

1. **Organisation:** `corporate_csr_profiles` table — `donor_id`, `company_name`, `cin`, `registration_number`, `csr_focus_area`, `ngo_partner_id`. Created via `POST /api/donor/csr` (`app/api/donor/csr/route.ts:41–79`).

2. **Donation:** Existing `donations` table read for corporate donors. CSR queries donations by `donor_id`, `campaign_id`, `amount_inr`, `financial_year` (`lib/services/csr.ts:95–110`).

3. **Aggregation:** `compliance_reports` with `report_type='csr'`. Summary: `{ by_company, by_campaign, by_financial_year, totals }`. Generated by `generateCsrReport()` (`lib/services/csr.ts:64–204`). Route: `POST /api/admin/csr` (`app/api/admin/csr/route.ts:66–97`).

**Missing linkages:**

| Chain link | Status |
|-----------|--------|
| Organisation → Donation | Implemented (donor_id join) |
| Donation → Transaction | Partially (amount aggregated, no per-transaction detail) |
| Allocation / Impact | **ABSENT** — no mapping of CSR donations to beneficiary impact |
| Certificate / Report | **ABSENT** — no file artifacts (certificates blocked), `file_url` always null |

---

### V-17 — Special Care Records

**Verdict: DIFFERENT**

**What is recorded:**

| Element | Stored? | Location |
|---------|---------|----------|
| Category | Yes | `beneficiaries.category` (enum: `pregnant_women`, `patient`, `disability`, `disaster_affected`) |
| Eligibility basis/evidence | Yes | `beneficiary_registrations.document_refs[]` (array of storage refs) |
| Approval date | Yes | `beneficiaries.registered_at` |
| Eligibility period | Yes | `beneficiaries.eligibility_expires_at` (auto-computed on approval) |
| Extensions | No mechanism found | — |
| Approving administrator | Yes | `beneficiary_registrations.reviewed_by` |

**Config application:**

| Config key | Applied? | How |
|-----------|----------|-----|
| `special_care_post_delivery_months` | Yes | Added to `now()` to compute `eligibility_expires_at` for `pregnant_women` (`app/api/admin/beneficiary-registrations/[id]/decide/route.ts:72–92`) |
| `patient_eligibility_months` | Yes | Same pattern for `patient` category |
| `special_care_multiplier` | **NO** | Defined in `lib/system-config.ts:18`, seeded as `'2'` in migrations (`m03_system_config.sql:61`), but **never read or applied** in any token minting, redemption, or value calculation code |

**Key gap:** `special_care_multiplier` is a dead config key — documented as controlling token value for special-care beneficiaries, but no code reads it for that purpose. Special-care tokens use `standard_token_value` like all others.

---

### V-18 — Token Cancellation

**Verdict: CONFIRMED**

**Donor-side cancellation: ABSENT.** No route in `app/api/donor/tokens/` allows cancellation.

**Admin revocation:** `POST /api/admin/tokens/[id]/revoke` (`app/api/admin/tokens/[id]/revoke/route.ts`):
- Only tokens with status `assigned_to_volunteer` can be revoked (line 54).
- Token status flips to `in_admin_pool` (line 64) — **value preserved in system, returned to admin pool for reallocation**.
- CAS (compare-and-swap) on status prevents concurrent mutations (line 66).
- Distribution record written: channel `admin_revoke` with optional `notes` (line 79).
- Audit: `action: "admin.token_revoke"`, metadata includes `{ channel, reason }` (lines 88–97).

**Value disposition:** Token value is NOT returned to donor credit and NOT lost — it remains in the admin pool for reallocation.

---

### V-19 — Lost-Token Replacement

**Verdict: CONFIRMED**

**Entry points:**
- Admin: `POST /api/admin/tokens/[id]/report-loss` (`app/api/admin/tokens/[id]/report-loss/route.ts`)
- Donor: `POST /api/donor/tokens/[id]/report-loss` (`app/api/donor/tokens/[id]/report-loss/route.ts`)

**Service:** `reportTokenLost()` in `lib/services/token.ts:65–160`.

**Flow:**
1. Only `live` or `distributed` tokens eligible (line 87–91).
2. Old token → `status: "blocked"` with `cancelled_at` timestamp (line 96–105).
3. New token minted with identical properties: same `token_type`, `value_inr`, `status`, `donor_id`, `beneficiary_id`, `campaign_id`, `is_emergency`, `expires_at` (lines 111–126).
4. New token linked via `replacement_for_token_id: token.id` (line 124).
5. **Compensating rollback:** If replacement minting fails, old token is un-blocked to restore original state (lines 131–135).
6. **Audit:** `action: "token.report_lost"`, metadata: `{ new_token_id, new_serial, reason }` (lines 138–152).

---

### V-20 — Redemption Notification Contents

**Verdict: CONFIRMED**

**Two notifications dispatched** on successful redemption (`app/api/vendor/redemptions/route.ts:247–287`):

**1. Redemption alert** (`kind: "redemption"`):
- Title: `"Your token was redeemed"`
- Message: `"A token you funded was redeemed at {vendor_name} for a ₹{value} meal. Thank you for making it possible."`
- Metadata: `vendor_name`, `meal_info` (menu item name), `location` (vendor city), `time` (ISO timestamp), `redeemed_at`, `value_inr`, `beneficiary_category`, `token_reference`

**2. Thank-you follow-up** (`kind: "thank_you"`):
- Title: `"Thank you — your gift became a meal"`
- Message: `"Thanks to you, someone was served a meal at {vendor_name}. Tap to donate again and fund the next one."`
- Same metadata

**Template system:** `lib/services/notificationTemplates.ts` — admin-editable templates in `notification_templates` table. Template variables use `{{var}}` placeholder syntax (line 31). Admin can edit via PATCH `/api/admin/notification-templates` (`app/api/admin/notification-templates/route.ts:36–75`).

**Channels:** Default `in_app` only. SMS/email/WhatsApp are stub adapters (`lib/notifications/dispatch.ts:25–27`).

**Note:** `beneficiary_category` IS exposed to donors in both notifications (previously flagged in VERIFICATION-REPORT.md finding #7).

---

### V-21 — Forfeited & Expired Value Flow

**Verdict: CONFIRMED**

**(a) Forfeited balance (token value > menu price):**

- **Calculation:** `forfeited = Math.max(0, tokenValue - menuValue)` (`lib/services/redemption.ts:1005`).
- **Recording:** When `forfeited > 0`, row inserted into `forfeited_balances` table with `token_id`, `redemption_id`, `forfeited_inr` (`app/api/vendor/redemptions/route.ts:174–179`).
- **Ledger:** Posted to revenue ledger as platform revenue via `postLedgerEntry` — `ledger: "revenue"`, `description: "forfeited balance on redemption"` (lines 188–198).
- **Analytics:** Aggregated sum exposed as `financial.forfeited_inr` in admin analytics (`lib/services/analytics.ts:221–228`).
- **Vendor UI:** Vendor sees "Forfeited" line in value breakdown during scan preview (`app/vendor/scan/page.tsx:597–620`).

**(b) Expired tokens:**

- **Mechanism:** `POST /api/admin/tokens/expire-sweep` flips active tokens with `expires_at < now` to `status = 'expired'` (`app/api/admin/tokens/expire-sweep/route.ts:1–47`).
- **No refund:** No automatic pool return, no donor credit reversal, no ledger entry. Value is **written off entirely**.
- **Revalidation:** Optional admin action via `lib/services/token.ts:174–245` — restores status to `live`/`distributed` with new `expires_at`. Gated by `token_revalidation_allowed` config.

**Current financial summary:**

| Event | Value destination | Ledger entry? | Analytics? |
|-------|------------------|---------------|------------|
| Forfeited (token > menu) | Platform revenue | Yes (`revenue` ledger) | Yes (`financial.forfeited_inr`) |
| Expired | Written off (nowhere) | No | Count only (token status breakdown) |

**Policy note:** The approved policy change (B-03) calls for both forfeited and expired value to return to the Meal Pool — neither currently does.

---

### V-22 — FAQ Behavioural-Claim Sweep

**Verdict: CONFIRMED (all 11 distinct claims verified)**

Claims extracted from `docs/user-guide.md` sections 7–10 that are not covered by V-01 through V-21:

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | Printed QR works for redemption | CONFIRMED | Vendor scan page accepts manual paste fallback (`app/vendor/scan/page.tsx:336–347`) |
| 2 | Beneficiary does not need a smartphone | CONFIRMED | Volunteer shows QR for screenshot/print (`app/volunteer/page.tsx:262–270`); vendor operates device |
| 3 | Aadhaar not collected by platform | CONFIRMED | `aadhaar_hash` field exists but never populated by any form; user-guide line 272 documents this |
| 4 | Face verification is primary identity method | CONFIRMED | Mandatory at redemption (`app/api/vendor/redemptions/route.ts:37–40`); no manual bypass (`app/vendor/scan/page.tsx:501`) |
| 5 | Vendor sees rejection reason on proofs page | CONFIRMED | `proof_review_note` displayed when `proof_status === 'rejected'` (`app/vendor/redemptions/page.tsx:115–118`) |
| 6 | Reports exportable as files | CONFIRMED | CSV export endpoint at `/api/admin/reports/export`; download link in UI (`app/admin/reports/page.tsx:122–130`) |
| 7 | Donor sees credit history | CONFIRMED | `credit_transactions` table with RLS `credit_tx_select_own`; page at `/donor/credit` |
| 8 | Volunteer-assisted registration exists | CONFIRMED | `/volunteer/beneficiaries` directory exists; documented at user-guide line 876 |
| 9 | Beneficiary without account can redeem | CONFIRMED | No beneficiary login required; redemption degrades to soft checks if no registered match |
| 10 | Transparency dashboard is public and config-gated | CONFIRMED | `app/transparency/page.tsx` — public, checks `transparency_dashboard_enabled`; aggregate stats only, no PII |
| 11 | No offline mode exists | CONFIRMED | No service worker, no offline queue; all operations require live API calls |

---

## 3. ABSENT Register

Items marked ABSENT or materially DIFFERENT, with proposed build-item IDs starting at B-10:

| Build ID | V-ID | Description | Timing | Justification |
|----------|------|-------------|--------|---------------|
| B-10 | V-01 | Enforce hard upper bound on `co_contribution_max` (spec says ₹10; code has no ceiling) | Pre-go-live | Prevents admin misconfiguration; spec-rev2 §7 requires it |
| B-11 | V-05 | Capture optional contact (mobile/email) on guest donation for receipt/thank-you | Phase 2 | No operational impact; enhances donor engagement |
| B-12 | V-07 | Add predefined complaint categories (quality, quantity, hygiene, staff, delay, redemption, other) to feedback form | Phase 2 | Enables root-cause triage and reporting; current binary flag sufficient for auto-suspension |
| B-13 | V-08 | Beneficiary-facing redirection to nearby open vendors when capacity reached | Phase 2 | UX improvement; current hard-block is functionally correct |
| B-14 | V-09 | Add optional reason field to system-config change audit trail | Pre-go-live | Compliance traceability; reason is captured nowhere for config changes |
| B-15 | V-13 | Extend city lock enforcement to beneficiary/vendor/volunteer registration flows | Pre-go-live | Current gap allows out-of-city registrations that will fail at redemption |
| B-16 | V-15 | Implement 80G certificate generation (requires 80G registration + PDF/email provider) | Phase 2 | Blocked on external dependencies; CSR aggregation works without it |
| B-17 | V-16 | Add CSR allocation/impact linking (which beneficiaries benefited from CSR donations) | Phase 2 | Enhances CSR reporting; not required for basic operations |
| B-18 | V-17 | Wire `special_care_multiplier` into token minting/value logic or remove dead config key | Pre-go-live | Dead config misleads admins; either implement or remove to avoid confusion |
| B-19 | V-12 | Per-override detail in auto-revert audit log (currently aggregate count only) | Phase 2 | Improves audit granularity; aggregate log is sufficient for compliance |
| B-20 | V-01 | Align client-side CO_PAY_MAX with server-side `co_contribution_max` (currently hardcoded ₹5 vs configurable) | Pre-go-live | Prevents UI/server mismatch when admin changes config |

---

## 4. Undocumented-Features Appendix

Features found in code but not documented in `docs/user-guide.md`:

| # | Feature | Location | Description |
|---|---------|----------|-------------|
| 1 | Token revalidation | `lib/services/token.ts:174–245` | Admin can restore expired tokens to active status (gated by `token_revalidation_allowed` config). Not mentioned in user guide. |
| 2 | Vendor inspection workflow | `app/api/admin/vendor-inspections/route.ts` + `lib/services/vendorRating.ts:252–299` | Surprise inspections with pass/fail + quality-score penalty. UI at admin console. Not documented in operations guide. |
| 3 | Settlement audit queue | `app/api/admin/settlement-audit/route.ts` | Addon #10 — automated settlement flagging/clearing with hold integration. Admin page exists. Not documented. |
| 4 | Emergency override system | `lib/services/emergency.ts` + `app/admin/emergency/page.tsx` | Time-boxed config overrides with auto-revert — distinct from simple emergency toggle. Partially documented but override mechanism details missing. |
| 5 | Compensating rollback on lost-token replacement failure | `lib/services/token.ts:131–135` | If replacement minting fails, original token is automatically un-blocked. Safety mechanism not documented. |
| 6 | Donor-initiated lost-token report | `app/api/donor/tokens/[id]/report-loss/route.ts` | Donors can self-service report lost tokens (not just admin). Not explicitly mentioned in user guide. |
| 7 | `payer_vpa` capture on UPI confirmation | `app/api/payment/upi-qr/confirm/route.ts:32–38` | Optional `payerVpa` field captured at UTR confirmation. Not documented. |
| 8 | Vendor capacity display for admin | `app/api/admin/vendor-capacity/route.ts` + `app/admin/vendor-capacity/page.tsx` | Real-time capacity monitoring (served/remaining) for all vendors. Admin page not documented. |
| 9 | Scheduled redemption reminders | `app/api/admin/scheduled-reminders/sweep/route.ts` | 7-day pre-redemption reminders for tokens with scheduled dates. Found in V-REPORT-1 but still not in user guide. |
| 10 | Quality score computation | `lib/services/vendorRating.ts` | Composite vendor quality score from ratings, complaints, and inspection outcomes. Formula not documented. |
