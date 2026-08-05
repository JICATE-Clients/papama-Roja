# pApAmA — Platform Administration Guide

> **Version:** 1.1 (Phase 1)
> **Last updated:** August 2026
> **Audience:** For administrators, implementation partners and technical teams

---

## Changelog

| Version | Date | Sections revised | Notes |
|---------|------|-----------------|-------|
| 1.1 | August 2026 | 1, 2, 3.1–3.12, 3.14, 4.1–4.7, 5.1–5.6, 6.1–6.3; Appendices A–C added; factual corrections and terminology alignment in 7–10 | Sections 3.13 and 7–10 have not been fully revised; they received terminology alignment and factual corrections only |
| 1.0 | July 2026 | Initial release | — |

---

## How to Use This Guide

This document is the operational reference for the pApAmA platform. It covers system behaviour, administrative procedures, role definitions and integration details as implemented in the Phase 1 codebase.

Sections 1–3 cover platform overview, authentication and the admin console. Sections 4–6 describe donor, Food Partner and volunteer workflows respectively. Section 7 covers beneficiary interactions, Section 8 covers public features, Section 9 is the system configuration reference and Section 10 is a technical FAQ.

All page paths (e.g. `/admin/tokens`), configuration keys (e.g. `standard_token_value`) and interface labels are cited verbatim from the running application.

---

## Terminology

- **pApAmA** — People Against Poverty and Malnutrition. This expansion is a Trust-supplied name and does not appear in the codebase.
- **Food Partner** — An approved restaurant, hotel, canteen or other food establishment participating in the platform. The application interface currently uses "Vendor" (in page paths such as `/admin/vendors`, `/vendor/scan`, configuration keys such as `vendor_max_complaint_rate` and `vendor_capacity_enforcement_enabled`, database tables and on-screen labels). Standardisation to "Food Partner" across the interface is a future enhancement. This guide uses "Food Partner" in narrative and principles and retains "Vendor" for all technical references.
- **Token** — A digital meal voucher funded by a donation, redeemable for one freshly prepared meal at a Food Partner. Tokens are not money and carry no cash value.
- **Donor Credit** — A non-withdrawable internal accounting balance representing a donor's committed meal-funding capacity.
- **Admin Pool** — The holding area for Path B tokens awaiting volunteer allocation.
- **Guest Pool** — The accumulated credit balance from anonymous (guest) donations, managed by the admin and convertible into tokens for volunteer distribution.
  <!-- PENDING: client to choose replacement name for Guest Pool -->

---

## 1. What is pApAmA?

pApAmA (People Against Poverty and Malnutrition) is a humanitarian meal-enablement platform operated by the pApAmA Trust. Its purpose is to connect people who want to fund meals with people who need them, through a network of approved Food Partners — restaurants, hotels, canteens and other food establishments that prepare and serve fresh food.

pApAmA does not cook, store or deliver food. It enables a beneficiary to walk into an approved Food Partner and receive a freshly prepared meal, funded by a donor's contribution and verified end-to-end through digital accountability.

### How pApAmA Works

```
Donor donates money
      ↓
Money becomes "Donor Credit" (non-withdrawable)
      ↓
Donor mints a "Token" (digital meal voucher)
      ↓
Token reaches a beneficiary:
  Path A — donor distributes directly
  Path B — donor entrusts to pApAmA → admin allocates to volunteer → volunteer distributes
      ↓
Beneficiary visits an approved Food Partner → presents the token QR code
      ↓
Food Partner verifies identity (face) → selects menu item → serves the meal
      ↓
Food Partner uploads proof (plate photo)
      ↓
Admin reviews and approves proof → Food Partner receives payment via settlement
      ↓
Donor receives notification with meal details — a humanitarian outcome delivered
```

### Founding Principles

| Principle | Meaning |
|-----------|---------|
| **Dignity** | Every beneficiary is served with respect. No beneficiary is photographed or publicised. Service is discreet and equal. |
| **Access to Freshly Prepared Meals** | Every token funds a meal that is cooked fresh and served at the Food Partner's premises. The Food Partner selects the item served from their approved menu. |
| **Tokens Are Not Cash** | A token is a meal entitlement, not a financial instrument. It cannot be exchanged for money, traded, or partially redeemed for change. |
| **Transparency and Accountability** | Every donation, token, redemption and settlement is recorded and auditable. Proof of service is required before payment. |
| **Humanitarian Ecosystem** | Donors, Food Partners, volunteers and administrators each play a defined role. The platform coordinates them; it does not replace them. |
| **Mission** | To ensure that no person in need is denied a meal when a donor has funded one and a Food Partner is ready to serve it. |

### Platform Roles

| Role | Responsibility |
|------|---------------|
| **Administrator** | Operates the platform: approves registrations, reviews meal proofs, runs settlements, monitors fraud, configures system rules and manages emergency response. |
| **Compliance Officer** | Audits platform activity with read-only access to all operational data — donations, tokens, vendors, beneficiaries, settlements, proofs, fraud flags and audit logs. Cannot create, update, approve or delete any record. |
| **Vendor Manager** | Manages Food Partner relationships: approves vendor registrations and menus, manages vendor KYC documents, reviews settlements and proofs, triages complaints. Cannot approve beneficiaries or volunteers, and cannot override settlement holds. |
| **Donor** | Funds meals by donating, minting tokens and choosing a distribution path. Tracks the impact of donations through notifications and dashboards. |
| **Food Partner (Vendor)** | Serves meals to token holders, uploads proof of service and receives payment through periodic settlements. |
| **Volunteer** | Receives tokens from the Admin Pool and distributes them to beneficiaries in the field. Assists with beneficiary registration. |
| **Beneficiary** | Registers for eligibility, receives tokens and redeems them for meals at approved Food Partners. |
| **Guest** | Donates without creating an account. Guest donations accumulate in the Guest Pool for admin-managed distribution. |

> **pApAmA does not cook, store or deliver food.** Food is freshly prepared by approved Food Partners and consumed at their premises.

---

## 2. How to Sign In

### Role Purposes

- **Administrator, Compliance Officer and Vendor Manager** access the admin console at `/login`. The console adapts to each role's permission scope — an administrator sees all features, a compliance officer sees read-only audit views and a vendor manager sees vendor onboarding and management.
- **Donors** manage their donations, tokens and impact at `/donor/login`.
- **Food Partners (Vendors)** manage their menus, serve meals and track settlements at `/vendor/login`.
- **Volunteers** manage their token holdings and distribution activity at `/volunteer/login`.
- **Beneficiaries** do not have a login-based dashboard. Their interaction with the platform is through the registration form and the token redemption process at Food Partners. This is a deliberate design choice for digital-literacy and device inclusion — a beneficiary needs neither a smartphone nor an account to receive a meal.
- **Guests** donate at the public `/donate` page with no account required.

### Login Pages

| Role | Sign in at | Registration |
|------|-----------|-------------|
| Admin / Compliance / Vendor Manager | `/login` | Created by system administrator |
| Donor | `/donor/login` | `/donor/signup` |
| Food Partner (Vendor) | `/vendor/login` | `/vendor/register` |
| Volunteer | `/volunteer/login` | `/volunteer/register` |
| Beneficiary | No login | `/beneficiary/register` |

### Registration and Approval Flow

```
Donor:          /donor/signup ──────────────────────────────► Active immediately
Food Partner:   /vendor/register ──► pending ──► Admin/VM review ──► approved ──► Active
Volunteer:      /volunteer/register ──► pending ──► Admin review ──► approved ──► Active
Beneficiary:    /beneficiary/register ──► pending ──► Admin review ──► approved ──► Active
Guest:          /donate ──────────────────────────────────────► No account needed
```

Each role follows a different path from registration to active use:

**Donors** — Registration is immediate. A donor signs up at `/donor/signup` with an email and password (minimum 6 characters, client-side validation only) and can begin donating straight away. No admin approval is required.

**Food Partners (Vendors)** — Registration requires admin approval. A Food Partner registers at `/vendor/register` with business details, FSSAI licence number and KYC documents. Their email is pre-confirmed server-side (no email verification step). The registration enters `pending` status and must be approved by an administrator or vendor manager before the Food Partner can sign in. KYC status is also set to `pending` at registration.

**Volunteers** — Registration requires admin approval. A volunteer registers at `/volunteer/register` with name, contact details and a face photo. Their email is pre-confirmed server-side. The registration enters `pending` status and must be approved by an administrator.

**Beneficiaries** — Registration requires admin approval. A beneficiary (or a volunteer assisting them) submits a registration at `/beneficiary/register`. The registration enters `pending` status and must be approved by an administrator.

### Forgot Password

Use the `/forgot-password` page to request a password reset link by email.

---

## 3. For Admins — Running the Platform

The admin console is the operational centre of pApAmA. After signing in at `/login`, administrators, compliance officers and vendor managers land on the admin dashboard. Each user sees only the features their role permits — enforced both in the navigation (inaccessible pages are hidden) and at the API level (every route checks the permission matrix and returns HTTP 403 for unauthorised actions).

### 3.1 Admin Dashboard (Home)

**Page:** `/admin`

The dashboard provides an at-a-glance view of platform health through six KPI cards and supporting panels.

**KPI Cards:**

| Card | What it measures | What action it prompts |
|------|-----------------|----------------------|
| Total Donations | Cumulative donation value received | If flat or declining, review donor engagement and public donation visibility |
| Total Tokens Minted | Count of tokens created from donor credit | A growing gap between donations and tokens may indicate credit sitting idle |
| Total Redemptions | Count of meals served through token redemptions | The primary mission metric — meals delivered |
| Proofs Awaiting Review | Count of unreviewed meal proofs (highlighted red when non-zero) | Unreviewed proofs delay Food Partner payments; clear the queue promptly |
| Open Fraud Flags | Count of unresolved fraud flags (highlighted when non-zero) | Investigate and resolve flags to maintain platform integrity |
| Settlements on Hold | Count of settlements with a hold applied | Held settlements block Food Partner payments; review and release or escalate |

Each card links directly to its detail page.

**Supporting panels:**
- **Community Impact** — Aggregate numbers: total donations, meals sponsored, meals served, active Food Partners, beneficiaries reached.
- **Recent Activity** — The last 10 audited actions on the platform (who did what, when). Links to the full audit log.
- **Section Directory** — Quick links to every admin page, organised by category.

---

### 3.2 Managing Donations

**Page:** `/admin/donations`

This page lists every donation on the platform — from registered donors and from anonymous guest donations.

**What the admin sees:**
- All donations with amount, donor name (or "Guest"), payment method, status and date
- Client-side text search across donor label, payment reference and status (20 records per page). Export is not available on this page.
- The **Guest Pool balance** — accumulated credit from anonymous donations

<!-- PENDING: client to choose replacement name for Guest Pool -->

**Guest Pool purpose and lifecycle:**

The Guest Pool exists so that anyone can fund meals without creating an account. Its lifecycle has six stages:

1. **Donation** — A guest donates at `/donate` or `/donate/qr`
2. **Credit** — The donation amount is credited to the Guest Pool balance
3. **Accumulation** — Guest Pool credit accumulates until the admin acts
4. **Token conversion** — The admin selects an amount and mints tokens from Guest Pool credit into the Admin Pool
5. **Volunteer distribution** — The admin allocates minted tokens to volunteers for field distribution
6. **Redemption** — A beneficiary redeems the token at a Food Partner for a meal

CSR donations and institutional donations are handled through dedicated pages (`/admin/csr` and `/admin/institutions`) and follow the same underlying credit-to-token conversion mechanism.

**What the admin can do:**
- **Convert Guest Pool credit to tokens** — select an amount and mint tokens into the Admin Pool for volunteer distribution
- **Reverse a donation** — in case of a payment error or duplicate. This reverses the internal credit; it is not a money-back refund. pApAmA does not offer money-back refunds — donated funds are committed to meals.

---

### 3.3 Managing Tokens

**Page:** `/admin/tokens`

All tokens across the platform are visible here, filterable by status.

**Token statuses:**

| Status | Meaning | How a token reaches this status | Who advances it |
|--------|---------|-------------------------------|----------------|
| `generated` | Just created, before the donor picks a distribution path | Donor mints a token from credit | Donor (automatic on creation) |
| `live` | Active — donor chose to distribute personally (Path A) | Donor selects "I'll distribute it myself" | Donor |
| `in_admin_pool` | Donor chose to let pApAmA distribute (Path B) — waiting for admin allocation | Donor selects "Let pApAmA distribute" | Donor |
| `assigned_to_volunteer` | Allocated to a volunteer, not yet given to a beneficiary | Admin allocates from the Admin Pool | Admin |
| `distributed` | Volunteer has given the token to a beneficiary | Volunteer marks as distributed | Volunteer |
| `redeemed` | Terminal: consumed at a Food Partner — a meal was served | Food Partner completes redemption | Food Partner (system) |
| `expired` | Terminal: time ran out before the token was redeemed | Expire sweep runs (admin-triggered) | Admin (system) |
| `blocked` | Terminal: reported lost — replaced with a new token | Admin reports token as lost | Admin |

**QR payload integrity:** Each token's QR code is derived from the token ID using an HMAC-SHA256 signature with a server-held secret (`TOKEN_QR_SECRET`). The QR payload is deterministic and re-derivable but unguessable without the secret — a forged or altered QR code will not match any stored hash and will be rejected at redemption. Only the SHA-256 hash of the payload is persisted in the database (`tokens.qr_hash`); the payload itself is never stored. This prevents QR forgery and duplicate scanning, but it does not prevent a genuine token being redeemed by someone other than the intended recipient — that limitation is documented in Section 4.4.

**What the admin can do:**
- **Run Expire Sweep** — automatically expire all tokens past their expiry date
- **Report a token as lost** — blocks the old token and generates a replacement with the same value. The old and new tokens are linked (`replacement_for_token_id`)
- **Revalidate an expired token** — only if `token_revalidation_allowed` is enabled in System Config. This is an audited action.
- **Revoke a token** — returns a volunteer-held token to `in_admin_pool` status for reallocation. No money reversal or donor refund occurs.

**Token value disposition (current behaviour):**

| Scenario | What happens |
|----------|-------------|
| **Forfeited balance** (token value exceeds menu price) | The surplus is posted to the platform revenue ledger. It is not refunded to the donor. |
| **Expired tokens** | Status is set to `expired`. No refund, no pool return and no ledger entry. The value is written off. |
| **Revoked tokens** (volunteer-held) | Token status resets to `in_admin_pool` for reallocation. |

> **Approved policy change (pending implementation):** The Trust has approved a revised policy under which forfeited and expired token value returns to the meal pool for reissue rather than being written off or posted to revenue. This revised policy is not yet implemented. The behaviour described above is the current live behaviour.

---

### 3.4 Beneficiary Registration Approvals

**Page:** `/admin/beneficiary-registrations`

When a person registers as a beneficiary (via `/beneficiary/register` or with volunteer assistance), their application appears here for review.

**Verification objective:** The admin's role is to confirm that the applicant belongs to an eligible category and that their face capture is usable for identity verification at redemption. The approval decision is made on the basis of category, face verification and administrative judgement.

<!-- PENDING: eligibility proof capture not implemented -->

**Beneficiary categories (as implemented):**

The platform supports four beneficiary categories, hardcoded in `lib/types/enums.ts`. Adding a category requires a code change.

| Category | Code value |
|----------|-----------|
| Pregnant Women | `pregnant_women` |
| Patients | `patient` |
| Persons with Disabilities | `disability` |
| Disaster-Affected | `disaster_affected` |

> **Future enhancements:** The Trust intends to support additional categories in a later phase: Children, Elderly Persons, Lactating Mothers and General Category. These are not implemented today. Note that the existing `special_care_post_delivery_months` configuration already extends Special Care eligibility beyond delivery, which may partly cover lactating mothers.

**What the admin sees:**
- Applicant's name, category, contact details and face capture status
- An Aadhaar column. The admin list displays a boolean presence indicator for each applicant. However, no registration path in the application collects an Aadhaar value — the underlying `aadhaar_hash` field is accepted by the API but is never populated by any form. The indicator therefore reads as absent for every record.
  <!-- PENDING: aadhaar_hash is an unused schema field; no capture, hashing or validation implemented -->

**What the admin can do:**
- **Approve** — creates a verified beneficiary record; the person can now receive and redeem tokens. Eligibility expiry is calculated automatically for `pregnant_women` and `patient` categories.
- **Reject** — with a reason; the applicant can re-apply

**Approved beneficiaries** are listed at `/admin/beneficiaries` where the admin can view and update their profiles.

**Dignity framing:** Beneficiary registration is designed to be as simple as possible — name, contact, category, location hint and face capture. No smartphone, bank account or formal ID is required. A volunteer can assist with registration in person.

**Privacy:** Only a non-reversible 1024-dimension face embedding is retained by the platform. The face image never leaves the device on which it was captured and is never stored on the server.

---

### 3.5 Managing Food Partners

**Page:** `/admin/vendors`

Food Partners are mission partners — the establishments that prepare and serve meals to beneficiaries. This page manages their lifecycle from onboarding to active service.

<!-- PENDING: Food Partner eligibility and selection criteria are Trust policy documents in preparation -->

**Onboarding journey:**

1. The Food Partner registers at `/vendor/register` with business details, contact information, geo-coordinates and their FSSAI licence number. Note that only the FSSAI licence number is captured; no expiry date is recorded.
2. The admin reviews the registration at `/admin/vendors` — checking business details, location suitability and FSSAI licence.
3. The admin reviews uploaded KYC documents at `/admin/vendors/[id]/documents`. KYC documents are held in a private storage bucket and served to the admin via short-lived signed URLs (1-hour TTL).
4. The admin approves or rejects the registration.
5. Once approved, the Food Partner can sign in, set up their menu and begin serving meals.

**What the admin can do:**
- **Register a new Food Partner** — enter details (name, location, FSSAI licence, GST, contact, geo-coordinates)
- **Approve or reject** a registration
- **Suspend** a Food Partner — temporarily block them from receiving redemptions (e.g. due to quality issues)
- **Reinstate** a suspended Food Partner
- **Manage KYC documents** — view uploaded documents at `/admin/vendors/[id]/documents`

**Quality monitoring:**
- Food Partner ratings are driven by beneficiary feedback
- If a Food Partner's complaint rate exceeds the threshold (`vendor_max_complaint_rate` in System Config) and auto-suspend is enabled (`vendor_auto_suspend_enabled`), they are automatically flagged

---

### 3.6 Menu Approvals

**Page:** `/admin/vendor-menus`

Food Partners propose menu items with pricing. Each item must be approved by an administrator or vendor manager before it can be used for redemptions. Menu approval ensures that the items and prices offered to beneficiaries meet platform standards.

<!-- PENDING: pApAmA Standard Meal Framework awaited from Trust -->

**Menu dignity:** Beneficiaries are served from the same approved menu as paying customers. The platform does not contemplate a separate or lower grade of food for token-funded meals.

**What the admin can do:**
- View proposed menu items (name, description, price, Food Partner)
- **Approve** — the item becomes available for meal redemptions
- **Reject** — with a reason; the Food Partner can modify and resubmit. The purpose of rejection is to reach an approved menu, not to penalise. A good rejection reason is specific and actionable — it tells the Food Partner exactly what to change (e.g. "price exceeds the standard token value" or "item description too vague — please specify portion size") so they can correct and resubmit promptly.

**Special Care items:** Food Partners may propose local equivalents for Special Care categories (pregnant women, patients). The categories with Special Care equivalents are defined by the `is_special_care_equivalent` flag on menu items. Approve these on a case-by-case basis.

Note that menu price edits overwrite the previous value with no price history retained, and there is no per-item availability toggle.

---

### 3.7 Reviewing Meal Proofs

**Page:** `/admin/proofs`

After a Food Partner serves a meal, they upload a plate photo as proof of service. The admin must review and approve the proof before the Food Partner's payment is released.

**Filter tabs:** Awaiting Review | Approved | Rejected | All

**For each proof submission, the admin sees:**
- Food Partner name and beneficiary category
- Menu item served and its value
- Plate photo

**Proof review checklist:**
- The plate photo should show the meal served, not the beneficiary (dignity and privacy)
- The photo should be clear, well-lit and show recognisable food
- The menu item claimed should be consistent with what appears in the photo

**What the admin can do:**
- **Approve** — releases the payment (moves from `locked` to `released`). A notification is sent to the donor who funded the token, including the Food Partner name, meal item, location, value and the beneficiary's category.
- **Reject** — a reason is mandatory (this is the only action in the platform that enforces a mandatory reason server-side). The Food Partner sees the rejection and can re-upload. Payment stays locked until approved. No resubmission deadline exists.

**Fraud patterns to watch for:** The platform's fraud module detects several patterns automatically, but proof reviewers should also watch for:
- **Duplicate or recycled photos** — the same plate image submitted for different redemptions (detected automatically when `proof_phash_dup_distance` is configured)
- **Identical backgrounds** — multiple proof photos with the same table, crockery or setting that suggest staging rather than distinct meals
- **Inconsistency between claimed item and photo** — a plate photo that does not match the menu item selected at redemption
- **Unusual volume** — a high number of proofs from a single Food Partner in a short period, which may warrant cross-referencing with fraud flags (face-hash repeats, cooldown breaches)

**Important:** Proof photos are write-once — once uploaded, they cannot be altered or deleted by the Food Partner. This ensures the integrity of the proof record.

<!-- PENDING: SLA thresholds issued by Trust; no config keys or alerting implemented -->

---

### 3.8 Settlements and Food Partner Payouts

**Pages:** `/admin/settlements` and `/admin/settlement-audit`

Settlements exist to convert approved meal service into Food Partner payments in a controlled, auditable process. Once meal proofs are approved, the platform-owed amounts accumulate. The admin runs a settlement cycle to batch them and track payment.

**Payout formula:** For each redeemed meal, the platform pays the Food Partner `min(token_value, menu_value)`. If the menu price exceeds the token value, the difference (`menu_value - token_value`) is borne by the beneficiary as a top-up. Co-pay (₹0 to ₹5 via `co_contribution_max`) is collected by the Food Partner at the counter and retained by them — it is not deducted from the settlement payout.

**Current co-pay behaviour:** The beneficiary may contribute a small co-pay amount at the point of service, currently configured between ₹0 and ₹5 via the `co_contribution_max` setting. This amount is collected and retained by the Food Partner at the counter.

> **Future enhancement (under Trust consideration):** A revised beneficiary contribution model — a standard ₹10 contribution collected by the Food Partner and remitted to a pApAmA Administration Account — is under Trust consideration for a future phase. It is not implemented.

**Settlement lifecycle:**

1. **Run a settlement** — go to `/admin/settlements` and click "Run Settlement." Choose the cycle period (daily, twice weekly, or weekly). The system gathers all approved-but-unsettled redemptions, groups them by Food Partner and creates settlement records.
2. **Review settlements** — each settlement shows the Food Partner name, total amount, number of meals included, and status: `pending` → `reconciled` → `paid`.
3. **Reconcile** — after reviewing line items, mark a settlement as `reconciled`.
4. **Pay** — mark as `paid` once funds are transferred to the Food Partner. Record the payment date.
5. **Hold** — if something looks suspicious, put a settlement on hold for further review.

**Settlement audit queue** (`/admin/settlement-audit`): A random sample of settlements is pulled for audit review (percentage configurable via `settlement_random_audit_rate`). These must be reviewed before being released.

**Note:** There is no Food Partner-side dispute or query mechanism for settlements. Food Partners have read-only access to their settlement status.

> **Approved policy change (pending implementation):** Under the current implementation, forfeited balance (token value exceeding menu price) is posted to the platform revenue ledger. The Trust has approved a revised policy under which forfeited value returns to the meal pool for reissue. This revised policy is not yet implemented.

---

### 3.9 Volunteers and Token Allocation

**Page:** `/admin/volunteers`

Volunteers are custodians of donor trust. They receive tokens from the Admin Pool and distribute them to beneficiaries in the field — the human link between a donor's generosity and a beneficiary's meal.

**Token accountability lifecycle:**

1. The admin allocates tokens from the Admin Pool to a volunteer
2. The volunteer holds the tokens (tracked as `assigned_to_volunteer`)
3. The volunteer distributes each token to a beneficiary (status changes to `distributed`)
4. Each distribution is logged with a timestamp and channel

**Holding limits:** The system enforces a concurrent holding limit (`max_tokens_per_volunteer` in System Config). A volunteer cannot hold more than this many undistributed tokens at once. This limit exists to bound exposure — if a volunteer becomes unreachable, the maximum number of tokens at risk is capped.

**Important:** A volunteer cannot return an undistributed token to the Admin Pool. Only an admin can revoke a token back to the pool.

**Judgement factors for allocation:** When deciding how many tokens to allocate to a volunteer, the admin should weigh:
- **Distribution history** — visible at `/admin/volunteer-activity`, showing past distribution volume and patterns
- **Current holding** — the volunteer's current undistributed count against the configured `max_tokens_per_volunteer` limit
- **Area coverage** — whether the volunteer serves an area with unmet need. Note that zone-based allocation is not enforced (`volunteer_zones_enabled` is a configuration seam only; zone assignment is available but not enforced at distribution).

**What the admin can do:**
- **View all volunteers** — see their status, zone assignment and current token holding count
- **Allocate tokens** — assign tokens from the Admin Pool to a volunteer, subject to the holding limit
- **Review volunteer requests** — volunteers can request tokens via their dashboard. The admin can grant (fully or partially) or deny requests.
- **View volunteer activity** — at `/admin/volunteer-activity`, see distribution logs (when, where, how many tokens distributed)
- **Approve or reject** volunteer registrations

---

### 3.10 Fraud Monitoring

**Page:** `/admin/fraud`

The fraud monitoring system exists to protect the platform's integrity — its objective is to protect, not to suspect. Automated detection flags patterns that may indicate misuse; the admin investigates each flag and determines the appropriate response.

**Types of fraud flags:**
- **Duplicate token scan** — same token QR scanned more than once
- **Face hash repeat** — same face detected at multiple Food Partners within the cooldown window
- **Cooldown breach** — beneficiary attempted to redeem before their cooldown period expired
- **Duplicate media** — same proof photo uploaded for different redemptions

**Severity levels:** Low | Medium | High | Critical

**Investigation workflow:**
1. Review the flag details — what triggered it, when and at which Food Partner
2. **Investigate** — mark the flag as "investigating" while gathering facts
3. Determine the outcome:
   - **Resolve** — confirmed issue; record the resolution with notes
   - **Dismiss** — false positive; record why it was dismissed

**Fair handling of false positives:** The system may flag legitimate activity — for example, a beneficiary visiting two nearby Food Partners within the cooldown window due to the first being unable to serve. Investigate before acting. Dismissal with notes is the correct handling for a false positive.

The admin can also **run a fraud scan** manually to trigger a check for duplicate patterns across recent activity.

---

### 3.11 Emergency Mode

**Page:** `/admin/emergency`

Emergency Mode is a set of relaxed controls for use during disasters or crises. It is present in the platform but is not activated for the pilot.

**How to activate:**
1. Go to `/admin/emergency`
2. Toggle **Emergency Mode ON** (`emergency_mode_enabled`)

**What Emergency Mode changes:**
- Meal cooldown periods become soft warnings rather than hard blocks (configurable: `emergency_meal_cooldown_hours`)
- Daily meal limits become soft warnings rather than hard blocks (configurable: `emergency_max_meals_per_day`)
- Emergency tokens can be issued directly into the Admin Pool for immediate volunteer distribution

**What Emergency Mode does NOT override (these remain mandatory):**
- Meal window enforcement (if enabled)
- Food Partner opening state (`is_open`)
- Food Partner stock exhaustion (`stock_exhausted`)
- Food Partner temporary closure (`temporary_closure_until`)
- Food Partner daily capacity limits (if enforced)

**Disaster-affected eligibility:** During an emergency, eligibility requirements are simplified and assistance must not be denied for want of documentation. Emergency tokens do not require special proof from the beneficiary.

**Auto-revert:** If `emergency_mode_max_duration_days` is set, Emergency Mode automatically turns off after that many days.

<!-- PENDING: Emergency Mode activation criteria are Trust policy, awaited -->

---

### 3.12 Analytics and Reports

**Analytics:** `/admin/analytics`

Visual dashboards answering key operational questions:

| Dashboard | Business question it answers |
|-----------|----------------------------|
| Meals served over time | Is the platform's mission output growing? Are there seasonal or day-of-week patterns? |
| Donation trends | Where is funding coming from? Which payment methods are used? |
| Food Partner performance | Which Food Partners are most active? Which have quality concerns? |
| Token utilisation | What fraction of minted tokens are redeemed vs expired? Is there waste? |
| Financial summary | How much has been donated, settled, forfeited and recorded as revenue? |
| Fraud summary | What types of flags are most common? Are they concentrated at specific Food Partners? |
| Beneficiary breakdown | How are beneficiaries distributed across categories? |

**Reports:** `/admin/reports`

Generate and export compliance and CSR reports. Reports can be downloaded as files for record-keeping.

**Audit Logs:** `/admin/audit-logs`

Every admin action is logged permanently — who did what, when and on which record. This log is append-only at database level (entries cannot be edited or deleted). Client-side text search is available across action, entity table and summary fields (20 records per page). Export is not available on audit logs.

**Donations page search:** The donations page (`/admin/donations`) also supports client-side text search across donor label, payment reference and status (20 records per page). Export is not available.

---

### 3.13 System Configuration

**Page:** `/admin/system-config`

This is where you control the rules that govern the platform. Settings are organized in tabs.

> **See [Section 9](#9-system-configuration-reference) for a complete reference of all configuration keys.**

**Key settings you'll use most often:**

| Setting | What it controls |
|---------|-----------------|
| `standard_token_value` | The value of a standard meal token (in ₹) |
| `token_expiry_days` | How many days before an unused token expires |
| `max_tokens_per_volunteer` | Maximum tokens a volunteer can hold at once |
| `meal_cooldown_hours` | Minimum hours between meals for a beneficiary |
| `max_meals_per_day` | Maximum meals a beneficiary can receive per day |
| `emergency_mode_enabled` | Toggle emergency/disaster mode ON or OFF |

---

### 3.14 Other Admin Sections

#### Operations Management

| Page | What it does |
|------|-------------|
| `/admin/meal-windows` | Set serving time windows (breakfast, lunch, dinner, snack). If `meal_window_enforcement_enabled` is ON, redemptions are blocked outside these windows. |
| `/admin/vendor-capacity` | Set each Food Partner's daily meal capacity. If `vendor_capacity_enforcement_enabled` is ON, redemptions stop when a Food Partner reaches their limit for the day. |
| `/admin/emergency` | Activate or deactivate Emergency Mode (see Section 3.11). |

#### Partnership Management

| Page | What it does |
|------|-------------|
| `/admin/institutions` | Manage partner institutions — allocate tokens in bulk for institutional distribution. <!-- PENDING: institution eligibility and accountability rules are Trust policy documents in preparation --> |
| `/admin/csr` | Manage corporate CSR donors and view CSR-specific reports. |
| `/admin/ngo-partners` | Reference registry of partner NGOs and organisations. |

#### Communication Management

| Page | What it does |
|------|-------------|
| `/admin/notification-templates` | Edit the notification messages sent to donors (e.g. when their token is redeemed). Uses placeholders like `{{token_value}}`, `{{vendor_name}}`. |
| `/admin/complaints` | View and resolve complaints submitted by beneficiaries. Status flow: Open → Investigating → Resolved/Dismissed. |

<!-- PENDING: complaint categories with escalation and timelines are Trust policy documents in preparation -->

#### Governance and Service Quality

| Page | What it does |
|------|-------------|
| `/admin/vendor-feedback` | View beneficiary feedback and Food Partner inspection results. |
| `/admin/audit-logs` | Full audit trail of all admin actions (append-only). |
| `/admin/settlement-audit` | Random-sample audit queue for settlement review. |

---

## 4. Donor Workflow

### 4.1 Making a Donation

**Page:** `/donor/donate`

The donor signs in at `/donor/login` (or signs up at `/donor/signup`) and navigates to the Donate page.

1. The donor enters the amount to donate (in ₹)
2. The donor chooses a payment method:
   - **Scan & Pay (UPI QR)** — The donor sees a QR code, scans it with any UPI app (Google Pay, PhonePe, Paytm, etc.) and completes the payment. After paying, the donor enters the **UTR number** (the transaction reference from the UPI app) for manual reconciliation. This is not an integrated payment gateway — the admin reconciles UPI payments against UTR numbers.
   - **Card, Net Banking, Bank Transfer** — These methods are available for demonstration purposes only and are not connected to a live payment gateway.
3. After payment, the donor sees a confirmation page with their updated credit balance.

<!-- PENDING: no donation receipt mechanism implemented -->

**Guest donations:** Anyone can donate without an account at the public `/donate` page. Guest donations go into the Guest Pool, which the admin manages and converts into tokens for volunteer distribution.

### 4.2 Understanding Donor Credit

**Page:** `/donor/credit`

When a donor donates, the payment becomes **Donor Credit** — a non-withdrawable internal accounting balance within pApAmA. It is not a wallet and cannot be transferred, cashed out or used for anything other than minting meal tokens.

**Credit lifecycle:**
- Credit increases with each donation
- Credit decreases when the donor mints a token
- The donor can view their full credit history (top-ups and deductions)

**Donor Credit does not expire.** This is Trust policy, unless required by future statutory or regulatory provisions.

**Irrevocability:** Once donated, funds cannot be withdrawn as cash. This is by design — the donor's contribution is a commitment to fund meals for people in need.

### 4.3 Minting a Token

**Page:** `/donor/tokens`

Once a donor's credit balance reaches the `standard_token_value` (set by the admin), the donor can mint a token — a digital meal voucher.

**What a token represents:** A token is a one-time entitlement to a freshly prepared meal at any approved Food Partner. It carries a rupee value, a QR code, an expiry date (if configured via `token_expiry_days`; NULL by default, meaning no expiry) and an accountability trail from creation to redemption. No reminder is sent to anyone before a token expires, and the expire sweep is triggered manually by an administrator rather than running automatically.

**How to mint:**
1. Go to the Tokens page
2. Click **Create Token**
3. Choose the token amount (must be at least the standard token value and cannot exceed the credit balance)
4. Choose the distribution path:
   - **"I'll distribute it myself" (Path A)** — The token goes `live` immediately. The donor gets a QR code to share. This suits donors who know a specific person they want to help.
   - **"Let pApAmA distribute" (Path B)** — The token goes into the **Admin Pool** (`in_admin_pool`). The admin allocates it to a volunteer for field distribution. This suits donors who want to fund meals but do not have a specific recipient in mind.
5. The donor's credit balance is reduced by the token amount.

### 4.4 Distributing a Token (Path A)

When a donor chooses Path A:

1. The token is `live` with a unique QR code
2. The donor views the QR code at `/donor/tokens/[id]`
3. The donor shares the QR code with someone in need — by showing it on screen, printing it, or sharing it digitally
4. The recipient takes the QR code to any approved Food Partner to receive a meal

**Responsible distribution guidance:**
- Beneficiaries should never be photographed or publicised in connection with receiving a token
- A Path A token can be redeemed by whoever presents the QR code first — there is no binding to a named recipient. The donor should share the QR code discreetly and only with the intended person.

### 4.5 Letting pApAmA Distribute (Path B)

When a donor chooses Path B:

1. The token enters the **Admin Pool** — the central holding area for tokens awaiting distribution
2. The admin allocates the token to a volunteer
3. The volunteer distributes the token (with QR code) to a beneficiary in the field
4. The donor receives a notification when the token is redeemed for a meal

**The Admin Pool** ensures end-to-end transparency: every token is tracked from the pool, through a named volunteer, to distribution and redemption. Volunteer accountability (holding limits, activity logs, admin revocation) exists to safeguard donor trust.

### 4.6 Tracking Impact

**Pages:** `/donor/dashboard` and `/donor/impact`

The donor dashboard provides an impact summary:
- **Total donated** (₹) — lifetime contributions
- **Credit balance** — funds available for minting tokens
- **Tokens minted** — how many tokens the donor has created
- **Meals served** — how many of the donor's tokens have been redeemed for meals
- **Monthly trends** — donation and impact history by month

This framing connects a financial contribution to a humanitarian outcome: a donation funded a meal, and the meal was served to a person in need.

### 4.7 Notifications

**Page:** `/donor/notifications`

Donors receive **in-app notifications only**. SMS, email and WhatsApp notification channels are not active — adapter stubs exist but skip delivery when provider API keys are not configured. No multi-language support exists.

**Notification types:**
- **Token redeemed** — sent when a token is used at a Food Partner. Includes: Food Partner name, meal item, location, time, value and the beneficiary's category (e.g. `pregnant_women`, `patient`).
- **Meal photo** — sent when the admin approves the proof of service. Includes: Food Partner name, location, time, value, beneficiary category, token reference and a 30-day signed URL to the plate photo.

**Privacy note:** The beneficiary's category is included in notification metadata and is visible to the donor. No other beneficiary personal information (name, face, location) is included.

**Template editing:** Notification message templates are editable by an administrator at `/admin/notification-templates` (see Section 3.14). Templates use placeholders such as `{{token_value}}` and `{{vendor_name}}`.

**Persistence:** Notification history persists indefinitely. Notifications are marked as read when viewed but are never deleted.

---

## 5. Food Partner Workflow

### 5.1 Registering as a Food Partner

**Page:** `/vendor/register`

A Food Partner is a humanitarian partner of the pApAmA Trust — an establishment that prepares and serves fresh meals to beneficiaries as part of the platform's mission.

<!-- PENDING: Food Partner eligibility and selection criteria are Trust policy documents in preparation -->

**Registration and approval journey:**

1. Go to `/vendor/register`
2. Fill in business details:
   - Shop/restaurant name
   - Address and geo-location (coordinates) — these coordinates are used for the redemption radius check (`token_redemption_radius_km`), so they should be the establishment's actual position rather than an approximate area
   - Phone number and email
   - FSSAI licence number (no expiry date is captured)
   - GST number (if applicable)
   - Emergency contact
3. Upload required KYC documents — these are stored in a private storage bucket and served to admins via short-lived signed URLs. They are not publicly accessible.
4. Submit the application

The registration enters `pending` status. An administrator or vendor manager reviews the application and KYC documents, then approves or rejects it. Once approved, the Food Partner can sign in at `/vendor/login`.

### 5.2 Managing the Menu

**Page:** `/vendor/menu`

After approval, the Food Partner sets up their menu:

1. Go to **Menu**
2. Click **Add Item** — enter the item name, description and price (in ₹)
3. Mark the item as a Special Care equivalent if applicable (`is_special_care_equivalent`)
4. Submit for admin approval
5. Once approved, the item is available for meal redemptions

<!-- PENDING: pApAmA Standard Meal Framework awaited from Trust -->

**Special Care categories as implemented:** Special Care items serve beneficiaries in the `pregnant_women` and `patient` categories. The `special_care_multiplier` config key controls the token value multiplier for Special Care tokens.

**Pricing:** Menu price edits overwrite the previous value — no price history is maintained. There is no per-item availability toggle; the Food Partner manages availability at the establishment level (see Section 5.3).

### 5.3 Availability and Capacity Management

**Page:** `/vendor/availability`

The Food Partner manages their operational status through three controls:

| Control | Purpose | Effect on redemptions |
|---------|---------|----------------------|
| `is_open` | General open/closed toggle | When closed (`false`), all redemptions are blocked |
| `temporary_closure_until` | Scheduled temporary closure with a return date/time | Redemptions are blocked until the specified time passes |
| `stock_exhausted` | Indicates the Food Partner has run out of food for the day | Redemptions are blocked until reset |

**Daily capacity:** The Food Partner sets a `daily_meal_capacity` — the maximum meals they can serve per day. When `vendor_capacity_enforcement_enabled` is ON in System Config, redemptions stop when the Food Partner reaches their daily limit.

**Meal session participation:** The Food Partner's serving windows (breakfast, lunch, dinner, snack) are configured by the admin at `/admin/meal-windows`. When `meal_window_enforcement_enabled` is ON, redemptions are only accepted during active windows.

### 5.4 Redeeming a Token (Serving a Meal)

**Page:** `/vendor/scan`

This is the core Food Partner workflow — serving a meal to someone holding a pApAmA token.

**Redemption philosophy:** Every token holder is entitled to a meal. The Food Partner serves all token holders with equal dignity, regardless of category, appearance or circumstance. The Food Partner selects the menu item served from their approved menu — the beneficiary does not choose.

**Step-by-step:**

1. **Go to the Scan page** at `/vendor/scan`
2. **Scan the token QR code** — use the phone camera, or paste the code manually (a paste fallback exists for when the camera cannot read the QR)
3. **Select the menu item** being served — the Food Partner chooses from their approved menu
4. **Capture the beneficiary's face** — the camera captures a face for identity verification. This is mandatory; there is no manual fallback to skip face capture. No offline mode exists.
5. **Enter co-pay amount** (if any) — the beneficiary may contribute a small amount (₹0 to ₹5, configured via `co_contribution_max`)
6. **Confirm the redemption**

**System checks (all must pass):**
- Is the QR code valid and not already used?
- Is the Food Partner open (`is_open`), not stock-exhausted, and not temporarily closed?
- Is the Food Partner within daily capacity (if enforced)?
- Is it within a valid meal window (if enforced)?
- Is the beneficiary within the geofence radius (`token_redemption_radius_km`)?
- Has the beneficiary's cooldown period elapsed?
- Has the beneficiary's daily meal limit not been exceeded?
- Is the token still valid (not expired, blocked or already redeemed)?

**Co-pay:** The co-pay is collected by the Food Partner at the counter and retained by them. It is not deducted from the settlement payout.

> **Future enhancement (under Trust consideration):** A revised beneficiary contribution model — a standard ₹10 contribution collected by the Food Partner and remitted to a pApAmA Administration Account — is under Trust consideration for a future phase. It is not implemented.

**Accessibility:** No smartphone is required of the beneficiary. A printed QR code works. However, face capture at the point of service is mandatory and requires a camera-equipped device on the Food Partner's side.

**Non-discrimination:** The Food Partner must serve all token holders equally. The platform does not display the beneficiary's category to the Food Partner at the point of service.

### 5.5 Uploading Proof of Service

**Page:** `/vendor/redemptions`

After serving a meal, the Food Partner must upload proof before payment is released.

1. Go to **Redemptions**
2. Find the meal just served (status: "Proof Needed")
3. Upload a **plate photo** — a clear photo of the meal served
4. Submit the proof

**Photo quality guidance:**
- The plate photo should clearly show the food served
- The photo should show the meal, not the beneficiary
- Photos should be clear and well-lit

**What happens next:**
- The admin reviews the proof at `/admin/proofs`
- If **approved** — payment is released and included in the next settlement
- If **rejected** — the Food Partner sees the rejection reason (mandatory for the reviewer). The Food Partner can re-upload improved proof. No resubmission deadline exists.

**Important:** Proof photos are write-once. Once uploaded, they cannot be altered or deleted by the Food Partner. This ensures the integrity of the proof record.

**Mandatory reason:** Proof rejection is the only action in the platform that enforces a mandatory reason at the server level. Other actions (donation reversal, token revocation, vendor suspension, settlement holds) accept an optional reason.

### 5.6 Viewing Settlements

**Page:** `/vendor/settlements`

The Food Partner has a read-only view of their payment status:

| Status | Meaning |
|--------|---------|
| **Pending** | Approved meals waiting for the next settlement cycle |
| **Reconciled** | Settlement reviewed by admin, awaiting payment |
| **Paid** | Funds transferred to the Food Partner's account |

The admin controls when settlements are run and payments are released. There is no Food Partner-side dispute or query mechanism for settlements.

---

## 6. Volunteer Workflow

Volunteers are the bridge between the platform and beneficiaries in the field. They carry tokens from the Admin Pool to people in need — a role of trust and accountability.

### 6.1 Registering as a Volunteer

**Page:** `/volunteer/register`

**Registration and verification journey:**

1. Enter name, phone number and email
2. Capture a face photo (for identity verification)
3. Submit the registration

The volunteer's email is pre-confirmed server-side (no email verification step). The registration enters `pending` status and must be approved by an administrator. After approval, the volunteer signs in at `/volunteer/login`.

**Volunteer responsibilities:**
- Distribute tokens to beneficiaries promptly and equitably
- Assist beneficiaries with registration when needed (at `/volunteer/beneficiaries`)
- Maintain accurate records of distribution activity
- Never demand payment for a token
- Protect beneficiary privacy — no photographs or public identification

### 6.2 Receiving and Managing Tokens

**Page:** `/volunteer` (Dashboard)

**Purpose of allocation:** Token allocation connects donor generosity to beneficiary need through a named, accountable volunteer. Every token passing through a volunteer is tracked — from pool allocation through distribution to redemption.

**Two ways to receive tokens:**

**Option 1 — Admin assigns tokens:**
- The admin selects the volunteer's profile and allocates tokens from the Admin Pool
- Tokens appear in the volunteer's "Held Tokens" section

**Option 2 — Volunteer requests tokens:**
1. Go to the **Request Tokens** section on the dashboard
2. Enter how many tokens are needed
3. Submit the request
4. The admin reviews and approves (fully, partially, or denies)
5. Approved tokens appear in the "Held Tokens" section

**Holding limits:** The volunteer can only hold a set number of undistributed tokens at a time (`max_tokens_per_volunteer`). This limit exists to bound risk — if a volunteer becomes unreachable, the maximum number of tokens at risk is capped. The dashboard shows the current count and remaining capacity.

**Token accountability:** A volunteer cannot return an undistributed token to the Admin Pool. Only an admin can revoke a held token back to the pool. This ensures that every token movement is an explicit administrative action with an audit trail.

---

### 6.3 Distributing Tokens to Beneficiaries

**Page:** `/volunteer` (Dashboard → Held Tokens)

**Purpose and dignity:** Volunteers are not distributing QR codes — they are carrying donor-funded meals to people in need, with dignity, compassion and fairness. Every interaction should preserve the beneficiary's self-respect. Avoid anything that could embarrass or stigmatise a person receiving a token. Volunteers exercise reasonable judgement in identifying people who need assistance; they are not expected to perform formal eligibility assessment.

**Distribution steps:**

1. Find the token you want to distribute in your "Held Tokens" list
2. Click **Distribute**
3. The QR code is displayed — show it to the beneficiary or share it digitally
4. The token status changes from `assigned_to_volunteer` to `distributed`
5. Your holding count decreases, freeing up space for more tokens

**Accountability:** The `assigned_to_volunteer` → `distributed` transition is recorded with a timestamp and distribution channel. This means the token remains traceable through its whole life — from donor credit, through minting, pool allocation, volunteer holding, distribution and finally redemption at a Food Partner. A volunteer cannot return an undistributed token; only an administrator can revoke it back to the Admin Pool.

**Registration assistance:** Volunteers can assist beneficiaries with registration at `/volunteer/beneficiaries` by helping with data entry. The volunteer-assisted registration form collects the same five fields as self-registration (category, name, contact, location hint and face capture). Approval authority remains with the Trust through the normal administrative review process.

**Digital accessibility:** A token can be shown on the volunteer's phone screen, shared electronically, or printed as a QR code. The beneficiary does not need a smartphone — a printed QR code is the normal case, not an exception.

**Exceptional situations:**
- **No internet connectivity** — there is no offline mode. Both distribution and redemption require connectivity. Face capture at redemption has no fallback. This is a real operational constraint.
- **QR cannot be displayed** — a printed QR code works. The Food Partner's scan page (`/vendor/scan`) also accepts a pasted code as a fallback.
- **Urgent need** — there is no volunteer-level priority or urgent distribution path. Emergency Mode is activated by an administrator and applies platform-wide (see Section 3.11). A volunteer cannot escalate individually.

**Distribution records:** The "Distributed" section on the volunteer dashboard shows previously distributed tokens with serial number, token type, value (₹) and current status (e.g. `distributed`, `redeemed`, `expired`). Distribution date is not displayed. Distribution location is captured when the volunteer submits a distribution but is not shown back in the distributed list.

---

## 7. For Beneficiaries — Receiving Meals

### 7.1 Registering as a Beneficiary

**Page:** `/beneficiary/register`

Anyone in need can register. No Aadhaar, smartphone, bank account or formal ID is mandatory.

1. Go to `/beneficiary/register` (or ask a volunteer for help)
2. Enter your name and basic details
3. Select your category:
   - Pregnant Women
   - Patients
   - Persons with Disabilities
   - Disaster-Affected (during emergencies)
4. Capture your face photo — this is used for identity verification at meal time. Only a non-reversible embedding is stored; the image never leaves the device.
5. Submit

<!-- PENDING: eligibility proof capture not implemented -->

An admin will review and approve your registration. The approval decision is based on category, face verification and administrative judgement.

> **Note:** These four categories are hardcoded in the current implementation. Additional categories (Children, Elderly Persons, Lactating Mothers, General Category) are planned for a future phase.

### 7.2 Finding a Nearby Vendor

**Page:** `/beneficiary/nearby-vendors`

View a list of approved pApAmA Food Partners near your location. Each listing shows the Food Partner's name, address, and available menu items.

### 7.3 Redeeming a Token at a Food Partner

Once you have a token (received from a donor or volunteer):

1. **Visit any approved pApAmA Food Partner**
2. **Show your token QR code** to the Food Partner (on your phone or printed)
3. The Food Partner scans the QR code, selects a menu item from their approved menu and verifies your face
4. You receive your meal — freshly cooked, served at the premises
5. That's it! The token is consumed and the Food Partner handles the rest

**Meal limits (for fairness):**
- There is a minimum waiting period between meals (cooldown, e.g. 6 hours)
- There is a maximum number of meals per day
- Special Care beneficiaries (pregnant women, patients) may have relaxed cooldown periods

### 7.4 Giving Feedback

**Page:** `/beneficiary/feedback`

After a meal, you can share your experience:

1. Go to `/beneficiary/feedback`
2. Select the Food Partner
3. Rate your experience (1–5 stars)
4. Add comments about food quality, quantity, or service
5. Submit

Your feedback helps the admin monitor Food Partner quality. If there's a serious issue, you can file a complaint that the admin will investigate.

---

## 8. Public Features (No Account Needed)

### Public Donation

**Page:** `/donate`

Anyone can donate without creating an account. The donation goes into the **Guest Pool** managed by the admin.

### UPI QR Donation

**Page:** `/donate/qr`

Scan a UPI QR code with any UPI app (Google Pay, PhonePe, Paytm, etc.) and confirm the payment with your UTR number.

### Transparency Dashboard

**Page:** `/transparency`

A public page showing aggregate platform impact — total donations, meals served, Food Partners, and beneficiaries reached. No personal information is ever shown.

> This page is only visible when `transparency_dashboard_enabled` is turned ON by the admin.

---

## 9. System Configuration Reference

These settings are managed by the Admin at `/admin/system-config`. Each setting controls a specific platform rule.

### Token Settings

| Key | Type | What it controls | Default |
|-----|------|-----------------|---------|
| `standard_token_value` | Number (₹) | Minimum and pool-mint token value | Must be set by admin |
| `token_expiry_days` | Number | Days before an unused token expires. NULL = no expiry. | NULL |
| `max_tokens_per_volunteer` | Number | Maximum undistributed tokens a volunteer can hold at once | NULL (no limit until set) |
| `token_revalidation_allowed` | Boolean | Allow admins to revalidate expired tokens | OFF |

### Meal & Redemption Settings

| Key | Type | What it controls | Default |
|-----|------|-----------------|---------|
| `meal_cooldown_hours` | Number | Minimum hours between meals for a beneficiary | Must be set |
| `meal_cooldown_hours_pregnant_women` | Number | Relaxed cooldown for pregnant women | NULL (uses general) |
| `meal_cooldown_hours_patient` | Number | Relaxed cooldown for patients | NULL (uses general) |
| `meal_cooldown_hours_disability` | Number | Relaxed cooldown for persons with disabilities | NULL (uses general) |
| `meal_cooldown_hours_disaster_affected` | Number | Relaxed cooldown for disaster-affected | NULL (uses general) |
| `max_meals_per_day` | Number | Maximum meals a beneficiary can receive per day | Must be set |
| `token_redemption_radius_km` | Number | Maximum distance (km) between Food Partner and beneficiary for redemption | Must be set |
| `meal_window_enforcement_enabled` | Boolean | Block redemptions outside defined meal windows | OFF |
| `co_contribution_max` | Number (₹) | Maximum co-pay a beneficiary may contribute at redemption | NULL |

### Vendor Settings

| Key | Type | What it controls | Default |
|-----|------|-----------------|---------|
| `vendor_auto_suspend_enabled` | Boolean | Auto-suspend Food Partners when complaint rate exceeds threshold | OFF |
| `vendor_max_complaint_rate` | Number (0–1) | Complaint ratio threshold for auto-suspend | NULL |
| `vendor_min_rating` | Number | Minimum acceptable Food Partner rating | NULL |
| `vendor_min_feedback_count` | Number | Minimum feedback entries before rating is considered reliable | NULL |
| `vendor_capacity_enforcement_enabled` | Boolean | Enforce Food Partner daily capacity limits | OFF |
| `vendor_inspection_fail_penalty` | String | Action on failed inspection (e.g., quality score reduction) | NULL |

### Settlement & Financial Settings

| Key | Type | What it controls | Default |
|-----|------|-----------------|---------|
| `settlement_random_audit_rate` | Number (0–1) | Fraction of settlements sampled for random audit | NULL (off) |

### Emergency Mode Settings

| Key | Type | What it controls | Default |
|-----|------|-----------------|---------|
| `emergency_mode_enabled` | Boolean | Activate disaster/emergency relief mode | OFF |
| `emergency_max_meals_per_day` | Number | Relaxed daily meal limit during emergency. NULL = no cap. | NULL |
| `emergency_meal_cooldown_hours` | Number | Relaxed cooldown during emergency. NULL = no cooldown. | NULL |
| `emergency_mode_max_duration_days` | Number | Auto-revert emergency mode after this many days | NULL (never auto-reverts) |

### Location Settings

| Key | Type | What it controls | Default |
|-----|------|-----------------|---------|
| `city_lock_enabled` | Boolean | Restrict operations to a single city | OFF |
| `operating_city` | String | The current operating city (only applies if city lock is ON) | NULL |

### Quality & Security Settings

| Key | Type | What it controls | Default |
|-----|------|-----------------|---------|
| `proof_phash_dup_distance` | Number | How similar two proof photos can be before flagging as duplicate | NULL (off) |
| `audit_log_retention_days` | Number | How many days to keep audit logs | NULL (keep forever) |

### Feature Toggles

| Key | Type | What it controls | Default |
|-----|------|-----------------|---------|
| `transparency_dashboard_enabled` | Boolean | Show the public `/transparency` page | OFF |
| `csr_80g_certificates_enabled` | Boolean | Enable 80G certificate generation for CSR donors | OFF |
| `volunteer_zones_enabled` | Boolean | Enable volunteer zone geofencing | OFF |

### Special Care Settings

| Key | Type | What it controls | Default |
|-----|------|-----------------|---------|
| `special_care_multiplier` | Number | Token value multiplier for Special Care tokens (e.g., 1.5 = 50% more) | NULL |
| `special_care_post_delivery_months` | Number | Months post-delivery a pregnant woman qualifies for Special Care | NULL |
| `patient_eligibility_months` | Number | Months a patient qualifies for Special Care | NULL |

> **Convention:** All boolean settings ship **OFF** by default. All numeric settings ship **NULL** (the rule soft-skips until you set a value). This means every feature is opt-in — nothing activates until you explicitly configure it.

---

## 10. Frequently Asked Questions

### General

**Q: Can a beneficiary receive meals without a smartphone?**
A: Yes. A volunteer can distribute a printed QR code, and the Food Partner handles the scanning. The beneficiary does not need a phone.

**Q: Can a beneficiary receive meals without an Aadhaar card or formal ID?**
A: Yes. Aadhaar is not collected by the platform. Face verification is the primary identity method at redemption, and assisted registration (via a volunteer) ensures no genuine beneficiary is denied.

**Q: Does pApAmA cook or deliver food?**
A: No. pApAmA is a meal-enablement platform. Food is freshly cooked by approved Food Partners and served at their premises. pApAmA never cooks, stores, or delivers food.

### For Donors

**Q: Can I get my money back after donating?**
A: No. Donations become non-withdrawable Donor Credit committed to funding meals. This is by design — your contribution goes directly to feeding people.

**Q: What is the difference between Path A and Path B?**
A: **Path A** — you distribute the token yourself (you choose who gets the meal). **Path B** — you hand the token to pApAmA, and they distribute it through volunteers to people in need.

**Q: When do I get notified?**
A: You receive an in-app notification when your token is redeemed — including the Food Partner name, meal served, value, location and the beneficiary's category. A second notification is sent when the meal proof is approved, including a photo of the plate.

### For Food Partners

**Q: Why is my payment locked?**
A: Payment is locked until you upload proof of service (plate photo) and the admin approves it. This ensures accountability.

**Q: What if my proof is rejected?**
A: You'll see the rejection reason on your Redemptions page. Fix the issue (e.g., take a clearer photo) and re-upload. There is no deadline for resubmission.

**Q: How often do I get paid?**
A: The admin runs settlement cycles — daily, twice weekly, or weekly. You can see your settlement status at `/vendor/settlements`.

### For Admins

**Q: What should I configure first?**
A: At minimum, set these values before going live:
1. `standard_token_value` — the value of a meal token
2. `meal_cooldown_hours` — minimum hours between meals
3. `max_meals_per_day` — daily meal limit per beneficiary
4. `token_redemption_radius_km` — Food Partner proximity limit
5. `max_tokens_per_volunteer` — volunteer holding limit
6. UPI merchant VPA (environment variable `NEXT_PUBLIC_UPI_VPA`) — for real UPI payments

**Q: What happens if I don't set a numeric config value?**
A: The rule **soft-skips** — it's not enforced. For example, if `meal_cooldown_hours` is NULL, there's no cooldown between meals. Set values before going live.

**Q: Can I undo a settlement payment?**
A: Settlements are designed to be one-directional. If there's an issue, put the settlement on hold before marking it as paid. Once paid, the record is final.

---

## Appendix A: Food Partner Code of Conduct

Food Partners participating in the pApAmA platform commit to the following standards:

1. **Dignity** — Serve every token holder with the same respect and courtesy as any paying customer. Do not distinguish between token-funded and cash-paying patrons in manner, seating, or speed of service.
2. **Non-discrimination** — Serve all token holders regardless of category, appearance, gender, religion, caste, or any other characteristic. The platform does not display beneficiary categories to the Food Partner at the point of service.
3. **Freshness** — All meals served under pApAmA tokens must be freshly prepared. Pre-packaged, reheated or stale food is not acceptable.
4. **Approved pricing** — Charge only the prices listed in the approved menu. Do not add surcharges, service charges, or other fees beyond the configured co-pay range (₹0–₹5 via `co_contribution_max`).
5. **Hygiene** — Maintain food safety and hygiene standards consistent with FSSAI requirements.
6. **Audit cooperation** — Cooperate with platform audits, including settlement audits and proof reviews. Upload clear, honest proof photos after every meal served.
7. **Privacy** — Do not photograph beneficiaries. Do not share any beneficiary information observed during the redemption process. Proof photos must show the meal, not the person.

---

## Appendix B: Volunteer Code of Conduct

Volunteers distributing tokens on behalf of pApAmA commit to the following standards:

1. **Dignity** — Treat every beneficiary with respect. Distribution is a service, not a favour.
2. **Non-discrimination** — Distribute tokens equitably. Do not prioritise or exclude beneficiaries based on gender, religion, caste, appearance, or any other characteristic.
3. **No payment demands** — Never demand money, favours, or anything of value in exchange for a token. Tokens are funded by donors and are free to the beneficiary.
4. **No token misuse** — Do not redeem tokens for personal use, sell tokens, or divert them from their intended purpose.
5. **Privacy** — Do not photograph beneficiaries during distribution. Do not share beneficiary personal information. Do not publicise the identity of people receiving tokens.
6. **Ethical representation** — Represent pApAmA and its mission honestly. Do not make claims about the platform, the Trust, or the donor that are not authorised.

---

## Appendix C: Business Rules — Data Integrity and Retention

**Record preservation:** No donation, token or settlement record is deleted in normal platform operation. All state changes are tracked through status transitions (e.g. a token moves from `live` to `redeemed`, never deleted).

**Compensating rollbacks:** When a transaction fails partway through (e.g. settlement line-item insertion fails after the header is created), the platform performs a compensating cleanup that may delete the orphaned record. These rollbacks are audit-logged.

**Audit log immutability:** Audit logs are append-only at the database level. No route, service or administrative action can edit or delete an audit log entry.

**Retention:** The `audit_log_retention_days` configuration key exists but is intentionally unset (NULL). No automated purge or retention job runs. Data accumulates indefinitely. This key should remain unset until a retention policy is formally adopted.

---

> **pApAmA — Platform Administration Guide v1.1**
