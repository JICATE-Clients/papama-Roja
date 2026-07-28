# pApAmA — User Guide

> **Version:** 1.0 (Phase 1)
> **Last updated:** July 2026
> **Audience:** Admins, Donors, Vendors, Volunteers, and anyone operating the pApAmA platform.

---

## Table of Contents

1. [What is pApAmA?](#1-what-is-papama)
2. [How to Sign In](#2-how-to-sign-in)
3. [For Admins — Running the Platform](#3-for-admins--running-the-platform)
   - 3.1 [Admin Dashboard (Home)](#31-admin-dashboard-home)
   - 3.2 [Managing Donations](#32-managing-donations)
   - 3.3 [Managing Tokens](#33-managing-tokens)
   - 3.4 [Beneficiary Registration Approvals](#34-beneficiary-registration-approvals)
   - 3.5 [Managing Vendors](#35-managing-vendors)
   - 3.6 [Vendor Menu Approvals](#36-vendor-menu-approvals)
   - 3.7 [Reviewing Meal Proofs](#37-reviewing-meal-proofs)
   - 3.8 [Settlements & Vendor Payouts](#38-settlements--vendor-payouts)
   - 3.9 [Volunteers & Token Allocation](#39-volunteers--token-allocation)
   - 3.10 [Fraud Monitoring](#310-fraud-monitoring)
   - 3.11 [Emergency Mode](#311-emergency-mode)
   - 3.12 [Analytics & Reports](#312-analytics--reports)
   - 3.13 [System Configuration](#313-system-configuration)
   - 3.14 [Other Admin Sections](#314-other-admin-sections)
4. [For Donors — Donating & Tracking Impact](#4-for-donors--donating--tracking-impact)
   - 4.1 [Making a Donation](#41-making-a-donation)
   - 4.2 [Understanding Your Credit](#42-understanding-your-credit)
   - 4.3 [Minting a Token](#43-minting-a-token)
   - 4.4 [Distributing Your Token (Path A)](#44-distributing-your-token-path-a)
   - 4.5 [Letting pApAmA Distribute (Path B)](#45-letting-papama-distribute-path-b)
   - 4.6 [Tracking Your Impact](#46-tracking-your-impact)
   - 4.7 [Notifications](#47-notifications)
5. [For Vendors — Serving Meals](#5-for-vendors--serving-meals)
   - 5.1 [Registering as a Vendor](#51-registering-as-a-vendor)
   - 5.2 [Managing Your Menu](#52-managing-your-menu)
   - 5.3 [Setting Availability & Capacity](#53-setting-availability--capacity)
   - 5.4 [Redeeming a Token (Serving a Meal)](#54-redeeming-a-token-serving-a-meal)
   - 5.5 [Uploading Proof of Service](#55-uploading-proof-of-service)
   - 5.6 [Viewing Your Settlements](#56-viewing-your-settlements)
6. [For Volunteers — Distributing Tokens](#6-for-volunteers--distributing-tokens)
   - 6.1 [Registering as a Volunteer](#61-registering-as-a-volunteer)
   - 6.2 [Receiving Tokens from Admin](#62-receiving-tokens-from-admin)
   - 6.3 [Distributing Tokens to Beneficiaries](#63-distributing-tokens-to-beneficiaries)
7. [For Beneficiaries — Receiving Meals](#7-for-beneficiaries--receiving-meals)
   - 7.1 [Registering as a Beneficiary](#71-registering-as-a-beneficiary)
   - 7.2 [Finding a Nearby Vendor](#72-finding-a-nearby-vendor)
   - 7.3 [Redeeming a Token at a Vendor](#73-redeeming-a-token-at-a-vendor)
   - 7.4 [Giving Feedback](#74-giving-feedback)
8. [Public Features (No Account Needed)](#8-public-features-no-account-needed)
9. [System Configuration Reference](#9-system-configuration-reference)
10. [Frequently Asked Questions](#10-frequently-asked-questions)

---

## 1. What is pApAmA?

pApAmA is a **meal-enablement platform**. It connects **donors** who fund meals with **beneficiaries** (people in need) through **verified food vendors** (restaurants/shops). pApAmA does not cook, store, or deliver food — it enables beneficiaries to walk into an approved vendor and receive a freshly cooked meal, funded by a donor's contribution.

**How it works in brief:**

```
Donor donates money
      ↓
Money becomes "Donor Credit" (non-withdrawable)
      ↓
Donor mints a "Token" (digital meal voucher)
      ↓
Token reaches a beneficiary (directly or via volunteers)
      ↓
Beneficiary visits an approved vendor → presents the token
      ↓
Vendor serves the meal → uploads proof (photo + receipt)
      ↓
Admin approves proof → vendor gets paid
```

**The four roles in pApAmA:**

| Role | What they do |
|------|-------------|
| **Admin** | Runs the platform — approves vendors, reviews proofs, manages settlements, monitors fraud, configures system rules |
| **Donor** | Donates money, mints tokens, tracks the impact of their donations |
| **Vendor** | Serves meals to beneficiaries, uploads proof of service, receives payments |
| **Volunteer** | Receives tokens from the admin pool and distributes them to beneficiaries in the field |
| **Beneficiary** | Registers for eligibility, receives tokens, redeems them for meals at approved vendors |

---

## 2. How to Sign In

Each role has its own login page:

| Role | Sign in at | Notes |
|------|-----------|-------|
| **Admin** | `/login` | Full admin console |
| **Compliance Officer** | `/login` | Same page — the console adapts to show compliance/audit views |
| **Vendor Manager** | `/login` | Same page — scoped to vendor onboarding and management |
| **Donor** | `/donor/login` | Or sign up at `/donor/signup` |
| **Vendor** | `/vendor/login` | Or register at `/vendor/register` |
| **Volunteer** | `/volunteer/login` | Or register at `/volunteer/register` |

**Forgot your password?** Use the `/forgot-password` page to receive a password reset link.

> **Note:** Beneficiaries register via `/beneficiary/register` — they do not have a login-based dashboard. Their interaction is primarily through the token redemption process at vendors.

---

## 3. For Admins — Running the Platform

The Admin Console is your command centre. After signing in at `/login`, you will land on the **Admin Dashboard**.

### 3.1 Admin Dashboard (Home)

**Page:** `/admin`

This is your at-a-glance overview of platform health. It shows:

- **KPI Cards** — Six key metrics displayed as cards at the top:
  - Total Donations received
  - Total Tokens minted
  - Total Redemptions (meals served)
  - Proofs Awaiting Review (highlighted in red if any are pending)
  - Open Fraud Flags (highlighted if any need attention)
  - Settlements on Hold

  Each card is clickable — it takes you directly to the relevant page.

- **Community Impact** — Aggregate numbers: total donations, meals sponsored, meals served, active vendors, beneficiaries reached.

- **Recent Activity** — The last 10 actions taken on the platform (who did what, when). Links to the full audit log.

- **Section Directory** — Quick links to every admin page, organized by category.

---

### 3.2 Managing Donations

**Page:** `/admin/donations`

Here you can see every donation made on the platform — both from registered donors and anonymous/guest donations.

**What you can do:**
- View all donations with amount, donor name (or "Guest"), payment method, and date
- See the **Guest Pool balance** — this is the accumulated credit from anonymous donations
- **Convert Guest Pool credit to tokens** — select an amount and mint tokens into the Admin Pool for volunteer distribution
- **Reverse a donation** — in case of a payment error or duplicate (this reverses the credit, not a money-back refund)

> **Important:** pApAmA does not offer money-back refunds to donors. Reversal only affects internal credit. The donor's money is committed to meals.

---

### 3.3 Managing Tokens

**Page:** `/admin/tokens`

View all tokens across the platform, filtered by status.

**Token statuses explained:**

| Status | Meaning |
|--------|---------|
| `generated` | Just created, not yet activated |
| `live` | Active — donor chose to distribute personally (Path A) |
| `in_admin_pool` | Donor chose to let pApAmA distribute (Path B) — waiting for admin to allocate |
| `assigned_to_volunteer` | Allocated to a volunteer, waiting to be handed to a beneficiary |
| `distributed` | Volunteer has given the token to a beneficiary |
| `redeemed` | Used — a meal was served |
| `expired` | Time ran out before the token was redeemed |
| `blocked` | Reported lost — replaced with a new token |

**What you can do:**
- **Run Expire Sweep** — automatically expire all tokens past their expiry date
- **Report a token as lost** — blocks the old token and generates a replacement with the same value
- **Revalidate an expired token** — only if `token_revalidation_allowed` is enabled in System Config. This is an audited action
- **Revoke a token** — cancel it permanently

---

### 3.4 Beneficiary Registration Approvals

**Page:** `/admin/beneficiary-registrations`

When someone registers as a beneficiary (via `/beneficiary/register` or with volunteer assistance), their application appears here for review.

**What you see:**
- Applicant's name, category (e.g., pregnant women, elderly, persons with disabilities), and eligibility proof submitted

**What you can do:**
- **Approve** — creates a verified beneficiary record; they can now receive and redeem tokens
- **Reject** — with a reason; the applicant can re-apply

**Approved beneficiaries** are listed at `/admin/beneficiaries` where you can view and update their profiles.

---

### 3.5 Managing Vendors

**Page:** `/admin/vendors`

All food vendor partners are listed here.

**What you see:**
- Vendor name, location, onboarding/KYC status, approval status, quality rating

**What you can do:**
- **Register a new vendor** — enter their details (name, location, FSSAI licence, GST, contact, geo-coordinates)
- **Approve or reject** a vendor's registration
- **Suspend a vendor** — temporarily block them from receiving redemptions (e.g., due to quality issues)
- **Reinstate a suspended vendor**
- **Manage vendor KYC documents** — view uploaded documents at `/admin/vendors/[id]/documents`

**Quality monitoring:**
- Vendor ratings are driven by beneficiary feedback
- If a vendor's complaint rate exceeds the threshold (`vendor_max_complaint_rate` in System Config), and auto-suspend is enabled, they are automatically flagged

---

### 3.6 Vendor Menu Approvals

**Page:** `/admin/vendor-menus`

Vendors propose menu items with pricing. Each item must be approved before it can be used for redemptions.

**What you can do:**
- View proposed menu items (name, description, price, vendor)
- **Approve** — the item becomes available for meal redemptions
- **Reject** — with a reason; vendor can modify and resubmit

> **Special Care items:** Vendors may request local equivalents for the standard Special Care food list. Approve these on a case-by-case basis.

---

### 3.7 Reviewing Meal Proofs

**Page:** `/admin/proofs`

This is one of the most important admin tasks. After a vendor serves a meal, they upload proof (a photo of the plate and a receipt). You must review and approve the proof before the vendor gets paid.

**Filter tabs:** Awaiting Review | Approved | Rejected | All

**For each proof submission, you see:**
- Vendor name and beneficiary category
- Menu item served and its value
- Plate photo and receipt image

**What you can do:**
- **Approve** — releases the payment (moves from `locked` to `released`). A thank-you notification is sent to the donor who funded the token.
- **Reject** — enter a reason. The vendor sees the rejection and can re-upload better proof. Payment stays locked until approved.

> **Tip:** Look for clear photos showing the actual meal served. The receipt should match the menu item claimed.

---

### 3.8 Settlements & Vendor Payouts

**Pages:** `/admin/settlements` and `/admin/settlement-audit`

Once meal proofs are approved, vendor payments accumulate. You run a **settlement cycle** to batch them together and pay vendors.

**Step-by-step:**

1. **Run a settlement** — Go to `/admin/settlements` and click "Run Settlement." Choose the cycle period:
   - **Daily** — settle every day
   - **Twice Weekly** — settle twice a week
   - **Weekly** — settle once a week

   The system gathers all approved-but-unsettled redemptions, groups them by vendor, and creates settlement records.

2. **Review settlements** — Each settlement shows:
   - Vendor name, total amount, number of meals included
   - Status: `pending` → `reconciled` → `paid`

3. **Reconcile** — After reviewing the line items, mark a settlement as `reconciled`

4. **Pay** — Mark as `paid` once funds are transferred to the vendor. Record the payment date.

5. **Hold** — If something looks suspicious, put a settlement on hold for further review.

**Settlement Audit Queue** (`/admin/settlement-audit`):
A random sample of settlements is pulled for audit review (percentage configurable via System Config). These must be reviewed before being released.

---

### 3.9 Volunteers & Token Allocation

**Page:** `/admin/volunteers`

Volunteers help distribute tokens to beneficiaries in the field (Path B flow).

**What you can do:**

- **View all volunteers** — see their status, zone, and current token holding
- **Allocate tokens** — assign tokens from the Admin Pool to a volunteer
  - The system enforces a **concurrent holding limit** (`max_tokens_per_volunteer` in System Config). A volunteer cannot hold more than this many undistributed tokens at once.
- **Review volunteer requests** — volunteers can request tokens via their app. You can grant (fully or partially) or deny requests.
- **View volunteer activity** — at `/admin/volunteer-activity`, see distribution logs (when, where, how many tokens distributed)

---

### 3.10 Fraud Monitoring

**Page:** `/admin/fraud`

The system automatically detects potential fraud patterns. Flags appear here for your review.

**Types of fraud flags:**
- **Duplicate token scan** — same token QR scanned more than once
- **Face hash repeat** — same face detected at multiple vendors within the cooldown window
- **Cooldown breach** — beneficiary attempted to redeem before their cooldown period expired
- **Duplicate media** — same proof photo uploaded for different redemptions

**Severity levels:** Low | Medium | High | Critical

**What you can do:**
- **Investigate** — mark a flag as "investigating"
- **Resolve** — mark as resolved with notes
- **Dismiss** — if it's a false positive
- **Run a fraud scan** — manually trigger a scan for duplicate patterns

---

### 3.11 Emergency Mode

**Page:** `/admin/emergency`

During a disaster or emergency, you can activate Emergency Mode to relax meal limits and issue emergency tokens.

**How to activate:**
1. Go to `/admin/emergency`
2. Toggle **Emergency Mode ON**

**What changes when Emergency Mode is active:**
- Meal cooldown periods are relaxed (configurable: `emergency_meal_cooldown_hours`)
- Daily meal limits are increased (configurable: `emergency_max_meals_per_day`)
- You can issue **Emergency Tokens** — click "Issue Emergency Token," enter a reason, and the system mints a token directly into the Admin Pool for immediate volunteer distribution

**Auto-revert:** If `emergency_mode_max_duration_days` is set, emergency mode automatically turns off after that many days.

> **Important:** Disaster-affected proof/eligibility rules are pending a client decision. Currently, emergency tokens do not require special proof from the beneficiary.

---

### 3.12 Analytics & Reports

**Analytics:** `/admin/analytics`

Visual dashboards showing:
- Meals served over time (daily/weekly/monthly trends)
- Donation trends by amount and payment method
- Vendor performance (redemptions per vendor, ratings, complaint rates)
- Token utilisation (minted vs redeemed vs expired)
- Financial summary (total donated, settled, forfeited, revenue)
- Fraud summary (flags by type and severity)
- Beneficiary breakdown by category

**Reports:** `/admin/reports`

Generate and export compliance and CSR reports. Reports can be downloaded as files for record-keeping.

**Audit Logs:** `/admin/audit-logs`

Every admin action is logged permanently — who did what, when, and on which record. This log is append-only (entries cannot be edited or deleted) for accountability.

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

| Page | What it does |
|------|-------------|
| `/admin/meal-windows` | Set serving time windows (breakfast, lunch, dinner, snack). If `meal_window_enforcement_enabled` is ON, redemptions are blocked outside these windows. |
| `/admin/vendor-capacity` | Set each vendor's daily meal capacity. If `vendor_capacity_enforcement_enabled` is ON, redemptions stop when a vendor reaches their limit for the day. |
| `/admin/vendor-feedback` | View beneficiary feedback and vendor inspection results. |
| `/admin/institutions` | Manage partner institutions — allocate tokens in bulk for institutional distribution. |
| `/admin/csr` | Manage corporate CSR donors and view CSR-specific reports. |
| `/admin/ngo-partners` | Reference registry of partner NGOs and organizations. |
| `/admin/notification-templates` | Edit the notification messages sent to donors (e.g., when their token is redeemed). Uses placeholders like `{{token_value}}`, `{{vendor_name}}`. |
| `/admin/complaints` | View and resolve complaints submitted by beneficiaries. Status flow: Open → Investigating → Resolved/Dismissed. |

---

## 4. For Donors — Donating & Tracking Impact

### 4.1 Making a Donation

**Page:** `/donor/donate`

1. Sign in at `/donor/login` (or sign up at `/donor/signup`)
2. Go to **Donate**
3. Enter the amount you'd like to donate (in ₹)
4. Choose a payment method:
   - **Scan & Pay (UPI QR)** — This is the live payment option. You'll see a QR code. Scan it with any UPI app (Google Pay, PhonePe, Paytm, etc.) and complete the payment. After paying, enter your **UTR number** (the transaction reference from your UPI app) to confirm.
   - Other methods (Card, Net Banking, Bank Transfer) — These are available for demonstration but are not yet connected to a live payment gateway.
5. After payment, you'll see a confirmation page with your updated credit balance.

**Donating without an account:** You can also donate as a guest at the public `/donate` page — no sign-up needed. Guest donations go into a common pool that the admin distributes.

### 4.2 Understanding Your Credit

**Page:** `/donor/credit`

When you donate, your money becomes **Donor Credit**. This is a non-withdrawable balance within pApAmA — it represents your committed funds for meals.

- Credit accumulates with each donation
- Credit is deducted when you mint a token
- You can view your full credit history (top-ups and deductions)

> **Note:** Donor Credit cannot be withdrawn as cash. It is a commitment to fund meals for people in need.

### 4.3 Minting a Token

**Page:** `/donor/tokens`

Once your credit balance reaches the `standard_token_value` (set by the admin), you can **mint a token** — a digital meal voucher.

**How to mint:**
1. Go to your **Tokens** page
2. Click **Create Token**
3. Choose the token amount (must be at least the standard token value, and cannot exceed your credit balance)
4. Choose what to do with it:
   - **"I'll distribute it myself"** (Path A) — The token goes `live` immediately. You get a QR code to share.
   - **"Let pApAmA distribute"** (Path B) — The token goes into the **Admin Pool**. The admin will allocate it to a volunteer who distributes it in the field.
5. Your credit balance is reduced by the token amount.

### 4.4 Distributing Your Token (Path A)

If you chose "I'll distribute it myself":

1. Your token is now `live` with a unique QR code
2. Go to `/donor/tokens/[id]` to view the QR code
3. Share the QR code with someone in need:
   - Show it on your phone screen
   - Print it out
   - Share it digitally
4. The person takes the QR code to any approved pApAmA vendor to receive a meal

### 4.5 Letting pApAmA Distribute (Path B)

If you chose "Let pApAmA distribute":

1. Your token goes into the **Admin Pool** (`in_admin_pool` status)
2. The admin allocates it to a volunteer
3. The volunteer distributes the token (with QR code) to a beneficiary in the field
4. You'll receive a notification when the token is redeemed for a meal

### 4.6 Tracking Your Impact

**Pages:** `/donor/dashboard` and `/donor/impact`

Your dashboard shows:
- **Total donated** (₹) — your lifetime contributions
- **Credit balance** — funds available for minting tokens
- **Tokens minted** — how many tokens you've created
- **Meals served** — how many of your tokens have been redeemed for meals
- **Monthly trends** — your donation and impact history by month

### 4.7 Notifications

**Page:** `/donor/notifications`

You receive in-app notifications for:
- **Token redeemed** — "Your token was used at [Vendor Name]! A [meal item] was served. Thank you!"
- **Thank you** messages after redemptions
- **Threshold alerts** — when your credit reaches the token minting threshold

---

## 5. For Vendors — Serving Meals

### 5.1 Registering as a Vendor

**Page:** `/vendor/register`

1. Go to `/vendor/register`
2. Fill in your details:
   - Shop/restaurant name
   - Address and geo-location
   - Phone number and email
   - FSSAI licence number
   - GST number (if applicable)
   - Emergency contact
3. Upload required KYC documents
4. Capture your face photo (for identity verification)
5. Submit your application

Your registration will be reviewed by an admin. Once approved, you can sign in at `/vendor/login`.

### 5.2 Managing Your Menu

**Page:** `/vendor/menu`

After approval, set up your menu:

1. Go to **Menu**
2. Click **Add Item** — enter the item name, description, and price (in ₹)
3. Submit for admin approval
4. Once approved, the item appears as available for meal redemptions

> **Special Care meals:** If you offer nutritious alternatives for Special Care beneficiaries (pregnant women, patients), you can propose equivalents. The admin reviews and approves them.

You can update pricing or descriptions of existing items — changes may require re-approval.

### 5.3 Setting Availability & Capacity

**Page:** `/vendor/availability`

Tell the platform when you're open and how many meals you can serve:

1. Set your **serving time windows** — which meal slots you cover (breakfast, lunch, dinner, snack)
2. Set your **daily capacity** — the maximum number of meals you can serve per day

If capacity enforcement is turned on by the admin, no more redemptions will be accepted once you hit your daily limit.

### 5.4 Redeeming a Token (Serving a Meal)

**Page:** `/vendor/scan`

This is the core vendor workflow — serving a meal to someone with a pApAmA token.

**Step-by-step:**

1. **Go to the Scan page** at `/vendor/scan`
2. **Scan the token QR code** — use your phone camera or paste the code manually
3. **Select the menu item** being served — choose from your approved menu items
4. **Capture the beneficiary's face** — the camera will verify the person's identity
5. **Enter co-pay amount** (if any) — a small amount the beneficiary may contribute (₹0 to ₹5, configurable by admin)
6. **Confirm the redemption**

**The system checks:**
- Is the QR code valid and authentic?
- Is this vendor within the allowed distance? (geofence check)
- Has this beneficiary eaten too recently? (cooldown check)
- Has this beneficiary exceeded today's meal limit?
- Is the token still valid (not expired, not already used)?
- Is the vendor within daily capacity?
- Is it within a valid meal window?

If all checks pass, the redemption is confirmed. The token is consumed, and the payment is **locked** (pending your proof upload).

**Value breakdown shown after redemption:**
- Token value, menu item price, any co-pay, and any forfeited amount (if token value > menu price)

### 5.5 Uploading Proof of Service

**Page:** `/vendor/redemptions`

After serving a meal, you **must upload proof** before you get paid.

1. Go to **Redemptions**
2. Find the meal you just served (status: "Proof Needed")
3. Upload:
   - **Plate photo** — a clear photo of the meal served
   - **Receipt photo** — an itemized receipt or bill
4. Submit the proof

**What happens next:**
- The admin reviews your proof at `/admin/proofs`
- If **approved** — your payment is released and included in the next settlement
- If **rejected** — you'll see the rejection reason. Fix the issue and re-upload

> **Tip:** Take clear, well-lit photos. The plate photo should clearly show the food. The receipt should be legible with the item and price visible.

### 5.6 Viewing Your Settlements

**Page:** `/vendor/settlements`

Track your payments:
- **Pending** — approved meals waiting for the next settlement cycle
- **Reconciled** — settlement reviewed by admin, awaiting payment
- **Paid** — funds transferred to your account

This is a read-only view. The admin controls when settlements are run and payments are released.

---

## 6. For Volunteers — Distributing Tokens

Volunteers are the bridge between the platform and beneficiaries in the field. You receive tokens from the admin and distribute them to people in need.

### 6.1 Registering as a Volunteer

**Page:** `/volunteer/register`

1. Enter your name, phone number, and email
2. Capture your face photo
3. Submit your registration

After admin approval, sign in at `/volunteer/login`.

### 6.2 Receiving Tokens from Admin

**Page:** `/volunteer` (Dashboard)

There are two ways to receive tokens:

**Option 1 — Admin assigns tokens to you:**
- The admin selects your profile and allocates tokens from the Admin Pool
- Tokens appear in your "Held Tokens" section

**Option 2 — You request tokens:**
1. Go to the **Request Tokens** section on your dashboard
2. Enter how many tokens you need
3. Submit the request
4. The admin reviews and approves (fully, partially, or denies)
5. Approved tokens appear in your "Held Tokens" section

**Holding limit:** You can only hold a certain number of undistributed tokens at a time. This limit is set by the admin. Your dashboard shows your current count and remaining capacity.

### 6.3 Distributing Tokens to Beneficiaries

**Page:** `/volunteer` (Dashboard → Held Tokens)

1. Find the token you want to distribute in your "Held Tokens" list
2. Click **Distribute**
3. The QR code is displayed — show it to the beneficiary or share it digitally
4. The token status changes from `assigned_to_volunteer` to `distributed`
5. Your holding count decreases, freeing up space for more tokens

You can also view all tokens you've previously distributed in the "Distributed" section.

**Assisting with registration:** You can help beneficiaries register at `/volunteer/beneficiaries`. Fill in their details on their behalf — the registration still goes through the normal admin approval process.

---

## 7. For Beneficiaries — Receiving Meals

### 7.1 Registering as a Beneficiary

**Page:** `/beneficiary/register`

Anyone in need can register. No Aadhaar, smartphone, bank account, or formal ID is mandatory.

1. Go to `/beneficiary/register` (or ask a volunteer for help)
2. Enter your name and basic details
3. Select your category:
   - Elderly
   - Pregnant Women
   - Children
   - Persons with Disabilities
   - Patients
   - Disaster-Affected (during emergencies)
   - General
4. Upload any eligibility proof (if available)
5. Capture your face photo (recommended — this helps verify your identity at meal time)
6. Submit

An admin will review and approve your registration.

### 7.2 Finding a Nearby Vendor

**Page:** `/beneficiary/nearby-vendors`

View a list of approved pApAmA vendors near your location. Each listing shows the vendor's name, address, and available menu items.

### 7.3 Redeeming a Token at a Vendor

Once you have a token (received from a donor or volunteer):

1. **Visit any approved pApAmA vendor**
2. **Show your token QR code** to the vendor (on your phone or printed)
3. The vendor scans the QR code and verifies your face
4. You receive your meal — freshly cooked, eaten at the shop
5. That's it! The token is consumed and the vendor handles the rest

**Meal limits (for fairness):**
- There is a minimum waiting period between meals (e.g., 6 hours)
- There is a maximum number of meals per day
- Special Care beneficiaries (pregnant women, patients) may have relaxed limits

### 7.4 Giving Feedback

**Page:** `/beneficiary/feedback`

After a meal, you can share your experience:

1. Go to `/beneficiary/feedback`
2. Select the vendor
3. Rate your experience (1–5 stars)
4. Add comments about food quality, quantity, or service
5. Submit

Your feedback helps the admin monitor vendor quality. If there's a serious issue, you can file a complaint that the admin will investigate.

---

## 8. Public Features (No Account Needed)

### Public Donation

**Page:** `/donate`

Anyone can donate without creating an account. The donation goes into a common **Guest Pool** managed by the admin.

### UPI QR Donation

**Page:** `/donate/qr`

Scan a UPI QR code with any UPI app (Google Pay, PhonePe, Paytm, etc.) and confirm the payment with your UTR number.

### Transparency Dashboard

**Page:** `/transparency`

A public page showing aggregate platform impact — total donations, meals served, vendors, and beneficiaries reached. No personal information is ever shown.

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
| `token_redemption_radius_km` | Number | Maximum distance (km) between vendor and beneficiary for redemption | Must be set |
| `meal_window_enforcement_enabled` | Boolean | Block redemptions outside defined meal windows | OFF |
| `co_contribution_max` | Number (₹) | Maximum co-pay a beneficiary may contribute at redemption | NULL |

### Vendor Settings

| Key | Type | What it controls | Default |
|-----|------|-----------------|---------|
| `vendor_auto_suspend_enabled` | Boolean | Auto-suspend vendors when complaint rate exceeds threshold | OFF |
| `vendor_max_complaint_rate` | Number (0–1) | Complaint ratio threshold for auto-suspend | NULL |
| `vendor_min_rating` | Number | Minimum acceptable vendor rating | NULL |
| `vendor_min_feedback_count` | Number | Minimum feedback entries before rating is considered reliable | NULL |
| `vendor_capacity_enforcement_enabled` | Boolean | Enforce vendor daily capacity limits | OFF |
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
A: Yes. A volunteer can distribute a printed QR code, and the vendor handles the scanning. The beneficiary does not need a phone.

**Q: Can a beneficiary receive meals without an Aadhaar card or formal ID?**
A: Yes. Aadhaar is optional. Face verification is the primary identity method, but assisted redemption (via a volunteer) ensures no genuine beneficiary is denied.

**Q: Does pApAmA cook or deliver food?**
A: No. pApAmA is a meal-enablement platform. Food is freshly cooked by approved vendors and eaten at the shop. pApAmA never cooks, stores, or delivers food.

### For Donors

**Q: Can I get my money back after donating?**
A: No. Donations become non-withdrawable Donor Credit committed to funding meals. This is by design — your contribution goes directly to feeding people.

**Q: What is the difference between Path A and Path B?**
A: **Path A** — you distribute the token yourself (you choose who gets the meal). **Path B** — you hand the token to pApAmA, and they distribute it through volunteers to people in need.

**Q: When do I get notified?**
A: You receive a notification when your token is redeemed — including the vendor name, meal served, and a thank-you message.

### For Vendors

**Q: Why is my payment locked?**
A: Payment is locked until you upload proof of service (plate photo + receipt) and the admin approves it. This ensures accountability.

**Q: What if my proof is rejected?**
A: You'll see the rejection reason on your Redemptions page. Fix the issue (e.g., take a clearer photo) and re-upload.

**Q: How often do I get paid?**
A: The admin runs settlement cycles — daily, twice weekly, or weekly. You can see your settlement status at `/vendor/settlements`.

### For Admins

**Q: What should I configure first?**
A: At minimum, set these values before going live:
1. `standard_token_value` — the value of a meal token
2. `meal_cooldown_hours` — minimum hours between meals
3. `max_meals_per_day` — daily meal limit per beneficiary
4. `token_redemption_radius_km` — vendor proximity limit
5. `max_tokens_per_volunteer` — volunteer holding limit
6. UPI merchant VPA (environment variable `NEXT_PUBLIC_UPI_VPA`) — for real UPI payments

**Q: What happens if I don't set a numeric config value?**
A: The rule **soft-skips** — it's not enforced. For example, if `meal_cooldown_hours` is NULL, there's no cooldown between meals. Set values before going live.

**Q: Can I undo a settlement payment?**
A: Settlements are designed to be one-directional. If there's an issue, put the settlement on hold before marking it as paid. Once paid, the record is final.

---

> **Need help?** Contact the platform administrator or the development team for technical support.
