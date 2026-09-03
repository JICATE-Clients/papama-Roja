# pApAmA — Project Specification (Team Onboarding)

**Audience:** any engineer, designer, tester, or reviewer joining the project.
**Purpose:** one document that explains *what pApAmA is*, *how it is built*, and
*how to work in this codebase* — enough to be productive without reading every
other doc first.

**This document does not replace the others.** It is the map; the territory is:

| Doc | What it is | When you need it |
|---|---|---|
| `AGENTS.md` | The rulebook. Authoritative working rules. | Before writing any code |
| `docs/prd.md` | Phase 1 Specification — the scope contract | Before building a feature |
| `docs/papama-phase1-spec-rev2.md` | Revision 2 of the spec (24-feature matrix) | Feature / permission questions |
| `docs/token-flow.md` | **Authoritative** token lifecycle | Before ANY token or distribution work |
| `docs/papama-owner-scope.md` | Owner's behavioural rules (§4.4–4.8, §5) | Redemption, proof, settlement, fraud |
| `docs/face-flow.md` | Identity / anti-spoof / fair-usage design | Face, liveness, cooldown work |
| `docs/db-schema-snapshot.md` | Table-by-table schema reference | Data model questions |
| `docs/papama-client-decisions.md` | Confirmed values + open items | Before assuming any number |
| `ASSUMPTIONS.md` | Every decision made without a client answer | Always, before inventing anything |
| `MUST-READ-AUDIT.md` | Current build / verification state | "Is X actually built?" |
| `docs/user-guide.md` | End-user manual, per role | Support / client onboarding |

> **Staleness warning.** Several docs list tables or features that have since
> changed. `docs/prd-gap-audit.md` and `docs/admin-audit-log.md` are explicitly
> superseded. **Always inspect the live schema (via the `supabase-papama` MCP)
> before trusting any document's table list.** This has bitten the project twice.

---

## 1. What pApAmA is

pApAmA is a **token-based meal-donation platform**. Donors fund food tokens;
admins and volunteers distribute them; beneficiaries redeem them at approved
vendors for an on-the-spot cooked meal; vendors are settled after proof of
service.

The entire design follows from one principle:

> **Money goes in one direction and can only become food.**

```
donor money  ->  CREDIT (non-withdrawable)
             ->  TOKEN (fixed value, one-time)
             ->  beneficiary (donor self-distributes, or admin pool -> volunteer)
             ->  MEAL at an approved vendor
             ->  PROOF (plate + receipt)
             ->  SETTLEMENT to the vendor
             ->  IMPACT shown to the donor
```

pApAmA is **not** a wallet, a payment app, or a discount scheme. Tokens
represent food value only. They can never be withdrawn, exchanged for cash, or
used as a discount.

### Vocabulary (enforced)

| Say | Never say | Why |
|---|---|---|
| **credit** | wallet | "Wallet" implies withdrawable money |
| **token** | coupon, voucher-for-cash | A token is fixed-value food entitlement |
| **settlement** | instant payout | Payouts are always cycle-based |
| **co-contribution / co-pay** | fee, charge | It is optional; zero is always allowed |

---

## 2. Roles

Eight roles, defined in `lib/types/enums.ts` (`USER_ROLES`):

| Role | Can do | Cannot do |
|---|---|---|
| `admin` | Everything operational: approve vendors, allocate tokens, review proofs, run settlements, edit config | — |
| `compliance` | Read everything; approve settlements; audit views | Change rules or data |
| `vendor_manager` | Onboard, approve, and manage vendors and menus | Touch tokens, money, or beneficiaries |
| `vendor` | Scan tokens, redeem, submit proof, view own settlements | See other vendors' data |
| `volunteer` | Receive / hold / distribute tokens; assist beneficiary registration | **Approve eligibility, change rules, release payments** (client Q16) |
| `donor` | Donate, mint tokens, choose distribution path, see impact | Reach a specific beneficiary in-app |
| `beneficiary` | Register, redeem, give feedback | Any admin surface |
| `guest` | Donate via QR / web; self-register as a beneficiary | Anything requiring an account |

The volunteer restrictions are enforced in **both** the permission matrix and
RLS — not by convention.

---

## 3. Core flows

### 3.1 Donation → credit

Donors donate any amount, repeatedly. Money accumulates as **credit**
(`donor_credits.balance_inr`), which is non-withdrawable. Guests can donate with
no account at all (`/donate`, `/donate/qr`) — the donation is recorded, but there
is no account to hold credit.

Credit accrual is compare-and-swap guarded. Every movement writes a
`credit_transactions` row and a double-entry `ledger_entries` posting.

### 3.2 Minting a token

When accumulated credit exceeds `system_config.standard_token_value` (seeded
**₹50**), the donor is notified and may mint **one token of a donor-chosen
amount**:

```
standard_token_value  <=  amount  <=  donor's available credit
```

Minting deducts from credit and creates one `tokens` row with a unique one-time
QR. Value is fixed at mint time. **No split, combine, or partial redemption.**

Donors may mint **Standard** tokens only. **Special Care** (up to
`special_care_multiplier` × standard) is eligibility-driven, not donor-chosen.

### 3.3 The fork — two distribution paths

Immediately after minting, the donor picks one:

- **Path A — "use it now"** → status `live`. The donor distributes it themselves,
  physically (printed QR) or digitally. **There is no in-app donor→beneficiary
  transfer.** This is deliberate.
- **Path B — "authorize pApAmA"** → status `in_admin_pool`.

### 3.4 Pool → volunteer → beneficiary (Path B only)

Two ways a pooled token reaches a volunteer:

- **Admin-initiated** — admin picks a volunteer and allocates N tokens.
- **Volunteer-requested** — volunteer requests N; admin grants fully, partially,
  or denies (`volunteer_token_requests`).

Both respect `max_tokens_per_volunteer`, a **concurrent** holding limit (the max
undistributed tokens a volunteer may hold at once). Distributing frees headroom.

The volunteer then distributes to a beneficiary → status `distributed`.

Every hand-off writes a `token_distribution_records` row with a channel:
`donor_self | admin_to_volunteer | volunteer_request_grant |
volunteer_to_beneficiary | admin_revoke`.

### 3.5 Token state machine (authoritative — `docs/token-flow.md` §6)

```
                     mint
                      |
                 [ generated ]        (transient)
                  /         \
             Path A          Path B
                |               |
            [ live ]    [ in_admin_pool ]
                |               |  admin assign / grant request
                |     [ assigned_to_volunteer ]
                |               |  volunteer distributes
                +------> [ distributed ]
                       \        /
        [ redeemed ]  |  [ expired ]  |  [ blocked ]
```

`blocked` is terminal and instant — used when a token is reported lost, with a
same-value replacement minted referencing `replacement_for_token_id`.

### 3.6 Redemption

The beneficiary presents the QR at an approved vendor; the vendor app scans.
`lib/services/redemption.ts` (~1,000 lines) is the single source of truth for
"may this be redeemed, and for how much?" It performs **no writes**, so the
dry-run preview and the real commit share one code path.

Checks are **HARD** (failure invalidates the redemption) or **SOFT**
(informational only):

1. Token exists, is in a redeemable status, and has not expired
2. Vendor is approved and active
3. Menu item belongs to this vendor and matches the token type
4. **Geofence** — within `redemption_radius_km` (seeded 20 km), **fail-closed**
5. **Liveness** — anti-spoof score at or above `face_liveness_min`
6. **Identity** — 1:1 face match within `face_match_threshold`, fail-closed on
   any RPC error
7. **Cooldown** — `meal_cooldown_hours` (seeded 6), enforced cross-vendor
8. **Meal limit** — `max_meals_per_day` (seeded 2)
9. **Eligibility** — category and special-care validity

**Any rule whose config key is unset is SOFT-SKIPPED, never guessed.**

**Value split** (owner scope §4.4):

| Case | Behaviour |
|---|---|
| meal value < token value | Difference is **forfeited** (`forfeited_balances`). No change given. |
| meal value > token value | Beneficiary **pays the difference** at the counter |
| optional co-pay | Up to `co_contribution_max` (seeded ₹5); **₹0 always allowed** |

On success: a `token_redemptions` row is written, the token flips to `redeemed`
(guarded on the still-redeemable status so a concurrent double-scan cannot redeem
twice), a `redemption_cooldown_log` entry is appended, and `payment_status` is
set to **`locked`**.

### 3.7 Proof of service → payment unlock

The vendor uploads a **plate photo + receipt** to a private bucket. An admin
reviews and approves. Only then does payment unlock (compare-and-swap guarded)
and the `vendor_payable` ledger credit post.

Photos are perceptually hashed into `media_fingerprints`; a duplicate within
`proof_phash_dup_distance` raises a `duplicate_media` fraud flag.

### 3.8 Settlement

`lib/services/settlement.ts` aggregates proof-released, not-yet-settled
redemptions into one `pending` settlement per vendor, on **that vendor's own
cycle** (`daily | twice_weekly | weekly`). It is idempotent — a redemption
already on a line item is never settled twice.

```
payout per redemption = min(token_value, menu_value)
                      = menu_value - difference_paid
```

The co-pay is a counter-side contribution and is **not** settled.

Lifecycle: `pending → locked → approved → reconciled → paid`, with `held` as an
admin override that blocks the transition to `paid`. Compliance approves; admin
can hold, release, or override. A random fraction
(`settlement_random_audit_rate`) is pulled into `settlement_audit_queue` for
human review.

> **No instant settlement, ever.** The MOU's "instant settlement" wording is a
> known error — do not implement it.

---

## 4. Non-negotiable product rules

1. Tokens are **one-time and fixed-value**. No split, combine, or partial
   redemption. Auto-invalidate on expiry (`token_expiry_days`, seeded 90).
2. **Credit is non-withdrawable.** Refunds are **internal credit reversal only**,
   never money back to the donor, and only for failed or duplicate payment cases.
   Enforced at schema level: `refunds.payment_failure_id` is `NOT NULL`.
3. **Aadhaar is never mandatory.** `beneficiaries.aadhaar_hash` is nullable; the
   face embedding is the primary identity signal.
4. **No instant settlement.**
5. **`audit_logs` is append-only.** No update or delete policies. Every mutating
   admin action writes an audit row.
6. **Never invent a value for an open item.** Use a marked placeholder and record
   it in `ASSUMPTIONS.md`.

---

## 5. Architecture

### 5.1 Stack

Next.js 16 (App Router, Turbopack) · TypeScript · React 19 · Supabase (Postgres +
RLS + Auth via `@supabase/ssr`) · Zod · Tailwind CSS v4 · Vitest · npm.

Scale: **~93 API routes · ~66 pages · ~51 tables · ~78 migrations.**

### 5.2 The 5-layer build order

Build every feature in this order. Do not skip or merge layers.

| # | Layer | Lives in |
|---|---|---|
| 1 | **Types** — enums + Zod schemas | `lib/types/enums.ts`, `lib/validation/**` |
| 2 | **Database** — migrations, RLS, indexes, seeds | `supabase/migrations/**` |
| 3 | **Services** — business logic, no HTTP or UI | `lib/services/**` |
| 4 | **Hooks** — data fetching / state | `lib/donor/hooks/**` and siblings |
| 5 | **Pages** — admin, donor, vendor, volunteer UI | `app/**` |

Route handlers are **thin**: validate with Zod → check permission → call a
service → return JSON. Business logic never lives in a route handler.

### 5.3 `defineRoute` — the backbone

`lib/api/handler.ts` wraps **every** API route. A route declares the permission
cell it needs; the wrapper then:

1. Authenticates server-side via `requireAppUser()` — it **never** trusts a
   client-sent user id
2. Checks `assertCan(user, feature, action, scope)` against the permission matrix
3. Provides an actor-bound `audit()` helper
4. Serialises the return value to JSON
5. Maps every known error to `{ error: string }` with the correct HTTP status

```ts
export const POST = defineRoute(
  { feature: "vendor_management", action: "update" },
  async ({ user, req, audit }) => {
    const body = await parseBody(req, vendorApproveRequestSchema);
    // ...mutation via the service-role client...
    await audit({ action: "vendor.approve", entity_table: "vendors", entity_id: body.vendor_id });
    return { ok: true, vendor_id: body.vendor_id };
  }
);
```

**Routes never return a bare `null` body.** Use empty arrays or objects as
defaults, and HTTP status codes for errors.

### 5.4 Directory map

```
app/
  admin/**        Admin console (~24 sections)
  donor/**        Donor portal
  vendor/**       Vendor app (register, scan, redeem, proof, settlements)
  volunteer/**    Volunteer app (request, hold, distribute, assist)
  beneficiary/**  Self-registration, feedback, nearby vendors
  donate/**       Public guest donation (plus /donate/qr)
  transparency/   Public stats dashboard
  login, post-login, auth/confirm, forgot-password, update-password
  api/**          93 route handlers, mirroring the portal structure
  api/_lib/       Shared route primitives (recordDonation, tokenQr)

lib/
  api/handler.ts       defineRoute, parseBody, error mapping
  auth/                Server-side session + AppUser resolution
  permissions/         24-feature x 8-role matrix + assertCan
  system-config.ts     THE ONLY reader of tunable rules
  services/            21 business-logic modules (see below)
  supabase/            client (browser) / server (SSR) / admin (service-role)
  face/                Embedding helpers, fingerprints, vector literals
  notifications/       Multi-channel dispatcher (in-app real; SMS/email/WA seams)
  validation/          Zod schemas + enum bindings
  i18n/                Dependency-free t(); English only today
  donor/, vendor/, volunteer/, distribution/, donations/, scheduling/

components/            auth, donor, vendor, beneficiary, face, ui
supabase/migrations/   ~78 versioned SQL migrations, each with a DOWN
test/                  api, services, permissions, validation, integration, helpers
docs/                  Reference documentation (see the table at the top)
proxy.ts               Edge session refresh + coarse portal auth gate
```

### 5.5 Services

| Service | Responsibility |
|---|---|
| `redemption.ts` | The validation + value engine (the heaviest module) |
| `settlement.ts` | Cycle aggregation, payout maths, audit sampling |
| `token.ts` | Lost-token blocking + replacement, revalidation |
| `fraud.ts` | Rule-based flags, vendor volume-anomaly sweep |
| `proofIntegrity.ts` | Perceptual hashing, duplicate-photo detection |
| `ledger.ts` | Double-entry postings (donation / vendor_payable / revenue) |
| `emergency.ts` | Emergency tokens, time-boxed config overrides |
| `audit.ts` | Append-only audit-log writer |
| `analytics.ts` | Aggregations, breakdowns, vendor performance |
| `transparency.ts` | Public RPC-backed stats |
| `vendorCapacity.ts`, `vendorDiscovery.ts`, `vendorRating.ts` | Vendor operations |
| `institution.ts`, `csr.ts`, `consent.ts` | Institutional / compliance |
| `creditRefund.ts`, `refund.ts` | Internal credit reversal, refund workflow |
| `volunteerActivity.ts`, `geo.ts`, `notificationTemplates.ts` | Support |

---

## 6. Data model

~51 tables, **all RLS-enabled**. Grouped:

| Group | Tables |
|---|---|
| **Identity** | `users`, `donors`, `beneficiaries`, `beneficiary_registrations`, `volunteers`, `vendors` |
| **Money in** | `donations`, `donor_credits`, `credit_transactions`, `payment_methods`, `upi_qr_payments`, `payment_failures`, `refunds` |
| **Tokens** | `tokens`, `token_types`, `token_batches`, `token_authorisations`, `token_distribution_records`, `volunteer_token_requests`, `scheduled_redemption_dates` |
| **Redemption** | `token_redemptions`, `redemption_cooldown_log`, `forfeited_balances`, `meal_windows` |
| **Vendor operations** | `vendor_menus`, `vendor_documents`, `vendor_capacity_usage`, `vendor_feedback`, `vendor_escalations`, `vendor_communication_history`, `surprise_inspections` |
| **Money out** | `vendor_settlements`, `settlement_line_items`, `settlement_audit_queue`, `ledger_entries` |
| **Integrity** | `audit_logs`, `fraud_flags`, `media_fingerprints`, `compliance_reports`, `consent_records` |
| **Programmes** | `ngo_partners`, `institution_token_allocations`, `campaigns`, `corporate_csr_profiles`, `emergency_token_grants`, `emergency_overrides`, `courier_dispatches` |
| **Platform** | `system_config`, `notifications`, `notification_templates`, `volunteer_activity_log` |

---

## 7. Permissions

`lib/permissions/matrix.ts` encodes spec §6 cell-by-cell: **24 features × 8
roles**, each cell a `{ create, read, update, delete, caps }` permission with a
scope of `all | own | none`.

Special capabilities beyond CRUD: `approve`, `override`, `scan_proof`, `assist`,
`self_register`, `donate`.

Authorization is **layered**:

1. `proxy.ts` — coarse "are you signed in?" per portal, plus session refresh
2. `defineRoute` → `assertCan` — the real per-route authorization
3. **RLS** — the database refuses the row even if the app layer were bypassed

---

## 8. Configuration

### 8.1 `system_config` — every tunable rule

**Hard rule: no tunable is ever hard-coded.** `lib/system-config.ts` is the only
module that reads them.

```
standard_token_value 50     special_care_multiplier 2     token_expiry_days 90
meal_cooldown_hours 6       max_meals_per_day 2           redemption_radius_km 20
co_contribution_max 5       operating_city / city_lock_enabled
max_tokens_per_volunteer    patient_eligibility_months    special_care_post_delivery_months
face_match_threshold        face_liveness_min             proof_phash_dup_distance
fraud_anomaly_min_count     fraud_anomaly_median_multiple settlement_random_audit_rate
vendor_min_rating           vendor_max_complaint_rate     vendor_min_feedback_count
vendor_auto_suspend_enabled                               vendor_inspection_fail_penalty
vendor_capacity_enforcement_enabled                       meal_window_enforcement_enabled
emergency_mode_enabled      emergency_max_meals_per_day   emergency_meal_cooldown_hours
emergency_mode_max_duration_days
meal_cooldown_hours_{pregnant_women|patient|disability|disaster_affected}
institution_bulk_allocation_max     csr_80g_certificates_enabled
transparency_dashboard_enabled      volunteer_zones_enabled
token_revalidation_allowed          audit_log_retention_days
courier_batch_min_value
```

**`NULL` means "not decided yet" → SOFT-SKIP the rule.** Never substitute a
guessed default. A rule with no configured threshold is recorded as a soft
"config unset" note and does not block.

Multi-level cooldown resolves **emergency > category > global**; each level
soft-skips independently.

### 8.2 Environment variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service-role key>   # SERVER ONLY - never NEXT_PUBLIC_

# Strongly recommended before launch
TOKEN_QR_SECRET=<long random>   # falls back to the service key if unset;
                                # rotating it invalidates every issued QR

# Optional / feature-specific
NEXT_PUBLIC_USE_MOCK_API=true       # offline donor demo
NEXT_PUBLIC_FACE_MODEL_PATH         # Human model assets
NEXT_PUBLIC_UPI_VPA / _MERCHANT_NAME / _MERCHANT_CODE / UPI_TX_PREFIX
SMS_PROVIDER_API_KEY / EMAIL_PROVIDER_API_KEY / WHATSAPP_PROVIDER_API_KEY
NEXT_PUBLIC_BUG_REPORTER_API_KEY / _API_URL
DEMO_PASSWORD                       # seeded demo accounts only
```

**No secrets in git.** `.env*` and `.mcp.json` are git-ignored.

---

## 9. Security model

- **The session is always read server-side** (`supabase.auth.getUser()`). A
  client-supplied user id is never trusted.
- **Three Supabase clients:** browser (anon), SSR session-aware (anon, RLS
  applies — the default), and service-role (server only, used *after* the
  permission check has passed).
- **RLS on every table** holding donor or beneficiary data. The §6 role matrix is
  the RLS specification.
- **Token QR:** HMAC-SHA256 derived from the token id plus a server secret —
  unguessable and re-derivable, so the payload is never stored. Only its SHA-256
  lands in `tokens.qr_hash`.
- **Face privacy:** the embedding is computed **on-device**; the raw image never
  leaves the browser. Matching is pgvector cosine distance, fail-closed on error.
  The legacy `face_hash` text column is a coarse equality signal, never the
  matcher.
- **Proof media** lives in private buckets.
- **`audit_logs` is append-only.**

---

## 10. Running the project

### Full setup

```bash
npm install
# create .env.local with the Supabase vars above
# apply supabase/migrations/** in filename order
npm run dev        # http://localhost:3000
```

### Offline demo (no database, no network)

```bash
npm install
echo "NEXT_PUBLIC_USE_MOCK_API=true" > .env.local
npm run dev
```

The donor portal then serves realistic sample data from an in-browser mock store
(`lib/donor/services/apiClient.ts`), persisted to `localStorage`. Donating adds
credit, converting mints a token, and a token "redeems" itself after a few
seconds to demonstrate live impact updates. **The admin console is not part of
mock mode** — it needs real Supabase Auth.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest suite |

> **Before running a production build, check whether a dev server is running.**
> Both write to the same output directory, and building underneath a live dev
> server corrupts its cache — producing runtime errors that name symbols which
> exist in no source file.

### Auth setup notes

Self-signups default to the `donor` role and are auto-provisioned a `donors` plus
`donor_credits` row (migration m19). **Admins are provisioned manually**, not by
self-signup. For email confirmation and password reset to work, set the Supabase
email templates to the `token_hash` format pointing at `/auth/confirm`, and add
your origins under **Authentication → URL Configuration → Redirect URLs**.

Demo accounts for each role are listed in `docs/demo-credentials.md`; the shared
password is distributed out-of-band and never committed.

---

## 11. Current status

### Built and verified end-to-end

The full loop is wired UI → API → service → DB: donor signup → donate → credit →
mint → path fork → pool/volunteer allocation → distribution → vendor scan →
validation engine → value split → proof → payment unlock → settlement → donor
impact. Plus fraud flags, audit trail, ledgers, analytics, the transparency
dashboard, emergency overrides, lost-token replacement, token revalidation,
multi-level cooldown, institution bulk allocation, and complaints/inspections.

### Deliberately held

| # | Feature | Why |
|---|---|---|
| 13 | Bill-fingerprint duplicate detection | Photo pHash exists; the bill side is not built. `media_fingerprints.bill_number` / `bill_amount_inr` are forward-compat columns |
| 10 | CSR utilization certificates | Statutory format unconfirmed |
| 19 | Document management | Central versioned store with expiry alerts |
| — | Receipt OCR cross-check in settlement | No OCR provider procured |

### Open — awaiting client/mentor. **Do not invent values.**

| Item | Status |
|---|---|
| **Payment provider** (Razorpay / Cashfree / PhonePe) | Card, netbanking, and UPI-app paths record a clearly flagged `mock:` ref. The **manual UPI-QR flow is real** — a confirmed UTR is the payment evidence |
| **Email / SMS / WhatsApp provider** | Dispatcher seams exist; each adapter no-ops gracefully when its env var is unset. Only in-app notifications are live |
| **`disaster_affected` proof and eligibility** | The category label exists; the rules do not. Fast-track vendor onboarding and relaxed beneficiary docs stay out of scope until answered |
| **`max_tokens_per_volunteer` numeric value** | The feature is decided and fully coded; the config row is `NULL`, so the cap is **inert**. The volunteer UI shows "No holding limit is set." Seeding the number is the only action needed — no code change |

### Phase 2 — schema seams only, do **not** build

Event-campaign donations (`donations.event_campaign_id`), micro-donation pooling
(`credit_transactions.pooling_supplement`), the training module, multi-language
translations, and GPS-spoofing / behavioural-clustering fraud analytics.

---

## 12. Working agreements

1. **Read the source-of-truth docs first.** If a request conflicts with them,
   stop and flag the conflict rather than generating code.
2. **Build in the 5-layer order.** Types → DB → Services → Hooks → Pages.
3. **Inspect the live schema before you migrate.** Docs go stale; the database
   does not. Reconcile, never overwrite; flag conflicts before changing data.
4. **Every migration has a working DOWN.**
5. **Field names are `snake_case`**, matching Postgres columns exactly
   (`credit_balance`, not `creditBalance`). The UI binds to these names.
6. **Read tunables from `system_config` at runtime.** Never hard-code, and never
   guess an unset value.
7. **Externalize user-facing strings** through `lib/i18n`. Adding a language must
   be purely additive.
8. **Every mutating admin action writes an audit row.**
9. **Record any assumption in `ASSUMPTIONS.md`** the moment you make it.
10. **Keep `main` buildable and demo-ready** — it gets checked out and run for
    review, so UX quality counts as much as backend correctness.
