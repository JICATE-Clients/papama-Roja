# pApAmA — Phase 1 Test Script

**Covers:** all 23 Work Order cards · **Also serves as:** CD §D-4's required demo script
**Written against:** the live database as of 11 Sept 2026 · **App:** http://localhost:3457

> CD §D-4 makes a **live demonstration** a condition of the client's final sign-off —
> a 10-step happy path plus 5 exception scenarios. Part C is that demonstration.
> Parts A and B are the fuller test pass behind it.

---

## Before you start

**Sign in as `admin@papama.test`.** Everything below assumes an admin session.

### What's actually in the database

| | Count |
|---|---|
| Approved Food Partners | 5 |
| Tokens | 4 — 1 live, 2 distributed, 1 redeemed |
| Active volunteers | 3 |
| Beneficiaries | 1 |
| Settlements | 1 (pending) |
| Redemptions | 1 |

**Most new screens will be empty on first load.** That is correct, not broken —
nothing has been flagged, captured or declared yet. Part A tells you which ones
you populate yourself.

### How to run the backend checks

Several rules have no screen — they fire during redemption, allocation or
settlement. Don't reach for curl: these routes need your **session cookie**.

Open **DevTools → Console** on any `localhost:3457` page while signed in, and
paste the `fetch(...)` snippets. The cookie rides along automatically.

---

## Part A — the 15 screens

Mark each **PASS / FAIL / BLOCKED**.

### A1 · Q-4 — Configuration banner
**Go:** `/admin`
**Expect:** an amber **"Critical configuration incomplete"** panel naming
`max_tokens_per_volunteer`, with the consequence *"No limit is enforced —
volunteer exposure is unbounded."*
**If absent:** either every mandatory key is set (check `/admin/system-config`)
or the banner regressed.

### A2 · Q-1 — ₹10 ceiling
**Go:** `/admin/system-config` → find `co_contribution_max` → set **11** → save
**Expect:** rejected, *"co_contribution_max cannot exceed 10"*
**Then:** set **10** → saves.

### A3 · Q-3 — Change reason
**Same screen.** Change any value and supply a reason.
**Verify:** `/admin/audit-logs` → newest `system_config.update` row carries your
reason in its metadata.

### A4 · A-1 — Structured address
**Go:** `/admin/vendors` → **Add vendor** → fill name only → save
**Expect:** refused — PIN, state and district are required.
**Then:** add PIN `641001`, pick **Tamil Nadu** → the district list loads → pick
**Coimbatore** → saves.

### A5 · Q-2 — Till reads the config
**Sign in as `vendor@papama.test`** → `/vendor/scan`
**Expect:** the co-pay field says **max ₹10** (it was hardcoded to ₹5).
**Back to admin afterwards.**

### A6 · F-4 — Pool, not revenue
**Go:** `/admin/analytics`
**Expect:** a **Meal Pool** tile showing **₹40**, and a **Special Care Pool**
tile. There is no longer a "Forfeited value" tile.
**Why ₹40:** that value used to sit in revenue. Migration `000009` reclassified
it — revenue now nets to ₹0.

### A7 · P-3 — Export logging
**Go:** `/admin/reports` → export any report as CSV
**Verify:** `/admin/audit-logs` → a `report.export` row exists carrying the
report type **and the period filters**.

### A8 · P-2 — Need-to-know
**Sign in as `volunteer@papama.test`** → `/volunteer/beneficiaries`
**Expect:** **no Category column.** A volunteer must not see who is a patient or
pregnant. Identity shows only "face ✓ / no face", never a hash.

### A9 · E-1 — Declare an emergency  ← **do this before A10–A12**
**Go:** `/admin/emergencies` → **Declare emergency**
- Emergency ID `TN-TEST-2026-001`, title `Test emergency`, any reason
- Ends at: **tomorrow**
- City scope: **leave blank** (nationwide, so it covers every partner)
- **Tick both amber boxes** — waive ₹10, allow face skip

**Expect:** an amber "Emergency mode is active" banner listing both relaxations.

### A10 · E-6 — Appeal templates
**Go:** `/admin/appeal-templates` → **New template** → save
**Expect:** status **draft**. A draft has no send path at all.
**Then:** Approve → **Mark instant** works only after approval.
**Try:** Mark instant on a draft → refused.

### A11 · F-3 — Audit selections
**Go:** `/admin/audit-selections` → cycle `2026-09-CYCLE-1` → **Draw sample**
**Expect:** a row reading **"1 of 1"** at 10%.
**The point:** 10% of 1 rounds to zero — the minimum-of-one rule is why it is 1
and not 0. A pilot must never audit nothing while appearing to have a policy.

### A12 · E-5 — Volunteer incident
Run in the console **as a volunteer** (sign in as `volunteer@papama.test` first):
```js
await fetch('/api/volunteer/incidents', {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ category: 'safety_concern', note: 'Test — unsafe access road' })
}).then(r => r.json())
```
**Then as admin:** `/admin/volunteer-incidents`
**Expect:** the report at the top, **red-tinted**, with a "Safety concerns open"
banner. Safety sorts first regardless of age — enforced server-side.

### A13 · E-4 — Offline capture
Offline capture ships **off**. Turn it on: `/admin/system-config` →
`offline_capture_enabled` → **true**.

Then in the console (as admin), using the emergency id from A9:
```js
const em = (await (await fetch('/api/admin/emergencies')).json()).emergencies[0].id;
const dev = 'test-device-a';
const mk = id => ({ id, token_id: crypto.randomUUID(), emergency_id: em,
  captured_at: new Date(Date.now()-3600e3).toISOString(),
  device_reference: dev, source: 'volunteer' });
await fetch('/api/offline/sync', { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ captures: [mk(crypto.randomUUID())] })
}).then(r => r.json())
```
**Expect:** `pending_validation: 1`.
**Then:** `/admin/offline-transactions` shows it, plus the device in the Devices
table.

### A14 · E-4 — Duplicate flags BOTH
```js
const em = (await (await fetch('/api/admin/emergencies')).json()).emergencies[0].id;
const tok = crypto.randomUUID();                    // same token, two devices
const one = { id: crypto.randomUUID(), token_id: tok, emergency_id: em,
  captured_at: new Date(Date.now()-3600e3).toISOString(),
  device_reference: 'device-a', source: 'volunteer' };
const two = { ...one, id: crypto.randomUUID(), device_reference: 'device-b',
  source: 'food_partner' };
await fetch('/api/offline/sync', { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ captures: [one, two] })
}).then(r => r.json())
```
**Expect:** `duplicates: 2` — **both**, not one.
**Then:** `/admin/exception-queue` shows two `offline_duplicate` rows.
**Why both:** a duplicate may be a crash retry, two volunteers helping one
person, or deliberate reuse. Picking the earliest would silently discard a real
meal or silently accept fraud. A human decides.

### A15 · F-3 — Clearing needs a note
**On `/admin/exception-queue`:** press **Clear** with the note box empty.
**Expect:** the button is disabled. An unexplained clear is not a review.

---

## Part B — the 8 rules with no screen

### B1 · E-4 — Offline is emergency-only
Close the emergency first (`/admin/emergencies` → **Close**), then retry A13.
**Expect:** every capture **rejected** — *"capture falls outside the emergency
period"*. Normal operations have no offline path at all.

### B2 · E-4 — Device clock not trusted
Re-declare an emergency, then send a capture dated **tomorrow**:
```js
captured_at: new Date(Date.now()+864e5).toISOString()
```
**Expect:** rejected — *"device clock is wrong"*.

### B3 · F-1 — Contribution gate blocks payment
**Go:** `/admin/contribution-report`
**Expect:** the reconciliation banner, and **Outstanding** showing any unremitted
₹10.
**Then** try paying a settlement with an outstanding line → refused, **naming the
blocking lines**.

### B4 · F-2 — Maker cannot be checker
Fully covered by 27 automated tests (`test/services/maker-checker-f2.test.ts`).
To see it live you need **two admin accounts** — lock as one, approve as the
same one → refused, *"you locked this settlement"*.

### B5 · A-2 — Geographic scope
Give a token a `DISTRICT` scope of Coimbatore, then redeem at a partner in
another district → hard block naming where it **is** valid.

### B6 · A-2 — Expiry is 60 days, per mode
**Check:** `/admin/system-config` → `token_expiry_days` = **60**.
Donor-controlled counts from creation; pool tokens from **distribution** — so a
pool token distributed on day 30 expires on day 90 from creation.

### B7 · P-1 — No category to donors
Covered by `test/services/donor-privacy-p1.test.ts`. To see it: redeem a token
and inspect the donor's notification metadata — it carries token type, value,
**"City, State"**, and **no** beneficiary category.

### B8 · F-5 — FIFO with scope
Allocate to a volunteer → the **oldest eligible** pool token goes first, and any
token whose scope excludes that volunteer's district is **skipped and counted**
in `skipped_for_scope`.

---

## Part C — CD §D-4 demo script

The client's required demonstration. Run in order.

### Happy path — 10 steps
1. Donor gives → `/donate`
2. Admin mints tokens from the pool → `/admin/donations`
3. Admin allocates to a volunteer → `/admin/volunteers` → Allocate
4. Volunteer distributes to a beneficiary
5. Food Partner scans the token → `/vendor/scan`
6. ₹10 recorded, meal served, proof uploaded
7. Admin approves the proof → `/admin/proofs`
8. Settlement **locked** by admin A → `/admin/settlements`
9. Settlement **approved** by admin B *(different person)*
10. Settlement **paid** by admin C *(different again)*

### Exception scenarios — 5
| # | Scenario | Expect |
|---|---|---|
| 1 | Same admin locks **and** approves | Refused — D-4(a) |
| 2 | Amend after approval, then pay | Refused — approval stale, D-4(c) |
| 3 | Pay with an outstanding ₹10 | Refused, **blocking lines named** |
| 4 | Bank-change requester tries to pay that partner | Refused — D-4(f) |
| 5 | Material hold released by whoever placed it | Refused — D-4(e) |

**Scenarios 1, 2, 4 and 5 need at least two admin logins.** Worth creating a
second admin before the demo — you have 3 admin users already.

---

## Known limits — say these before anyone finds them

- **A-2 is partial.** Reissue admin flow and token display payload not built.
- **E-4 is partial.** Server side works; the **client capture queue** (service
  worker + IndexedDB) does not exist, so nothing can capture offline for real
  yet. The sync API is testable, as in A13.
- **Q-5 held** by the Work Order's own instruction, pending Lane 1 design.
- **`max_tokens_per_volunteer` is unset**, so the volunteer cap will correctly
  test as *not enforced*. A missing client value, not a bug.
- **Four offline limits unset**, same reason.
- **Settlement policy for rejected offline captures** is seeded `review` — it
  decides nothing deliberately. The real choice is the client's.
- **One Food Partner ("Dhruv") has no address**, so it cannot be
  geographic-scope-checked. Data entry, not code.
- **Payment is still mock** apart from manual UPI-UTR. No real money moves.
- **No email is sent** — the provider is an external dependency.

---

## Recording results

| Ref | Card | Result | Note |
|---|---|---|---|
| A1 | Q-4 | | |
| A2 | Q-1 | | |
| A3 | Q-3 | | |
| A4 | A-1 | | |
| A5 | Q-2 | | |
| A6 | F-4 | | |
| A7 | P-3 | | |
| A8 | P-2 | | |
| A9 | E-1 | | |
| A10 | E-6 | | |
| A11 | F-3 | | |
| A12 | E-5 | | |
| A13 | E-4 | | |
| A14 | E-4 | | |
| A15 | F-3 | | |
| B1–B8 | rules | | |
| C happy | F-2 | | |
| C exc 1–5 | F-2 | | |

**A FAIL is a finding, not a failure of the session.** Note what you did, what
you saw, and what you expected — that is enough for me to fix it.
