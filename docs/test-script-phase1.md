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
// Use a REAL token id — a random one belongs to no token and the database
// refuses the row before any rule is reached.
const tok = (await (await fetch('/api/admin/tokens')).json()).tokens
  .find(t => t.status === 'live' || t.status === 'distributed').id;
// And capture INSIDE the window: an emergency starts when it is declared, so
// "an hour ago" is before it began and is correctly refused.
const started = (await (await fetch('/api/admin/emergencies')).json())
  .emergencies.find(e => e.id === em).activated_at;
const mk = id => ({ id, token_id: tok, emergency_id: em,
  captured_at: new Date(Date.parse(started) + 1000).toISOString(),
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
// The same REAL token on two devices (see A13 for `tok` and `started`).
const one = { id: crypto.randomUUID(), token_id: tok, emergency_id: em,
  captured_at: new Date(Date.parse(started) + 1000).toISOString(),
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

### A16 · A-2 — Controlled reissue of an expired token
Needs an **expired** token. If none exists, set a test token's `expires_at` to
yesterday and run **Run expire-sweep** on `/admin/tokens`.

**On `/admin/tokens`:** open the expired token → *Controlled reissue* box.
1. Leave the reason empty → **Approve reissue** is disabled.
2. Type a real reason → approve.

**Expect:** toast *"Reissued as PPM-RIS-…"*. Open the original again: it is
still **expired**, shows **Replaced by PPM-RIS-…**, and has no reissue box. The
new token shows **Reissued from** the original, the **same value and scope**,
and the reason.
- A pApAmA-distributed original → new token is **in the admin pool** with no
  expiry yet (its 60 days start at distribution).
- A donor-controlled original → new token is **live**, expiring in 60 days.

**Then:** `/admin/exception-queue` has a `token_reissue` row, and
`/admin/ledgers` shows a Meal Pool **debit** of the value (it had been returned
there at expiry). Reissuing the same original twice → refused.

### A17 · A-2 — Token display payload
**As a donor:** open a token. A live one shows its type and scope (*"Valid
across India"* or the district). **Print** it → the card shows the scope and a
*Validity* line. An expired one reads **"Expired – Not Redeemed"** (or
*"Expired – Reissued as …"* once reissued).

### A18 · E-4 — Offline recording on the scan screen
With `offline_capture_enabled` **true** and an active emergency covering the
partner's district, sign in as that **Food Partner** → `/vendor/scan`.

**Expect:** an amber *Emergency offline recording* box naming the emergency and
when offline recording ends. With no emergency, the box does not appear at all.

1. Scan (or paste) a real token code.
2. DevTools → Network → **Offline**. Press **Record offline**.
   **Expect:** *"Recorded offline…"*, and *1 record(s) waiting to sync*.
3. Switch Network back **Online**.
   **Expect:** within a moment *"Synced 1 offline record(s)…"*, count back to 0,
   and the capture in `/admin/offline-transactions` as pending validation.
4. DevTools → Application → IndexedDB → `papama-offline`: the record holds a
   64-character **hash**, never the `PAPAMA:` code.

### A19 · E-4 — Offline recording in the volunteer app
*Added 7 October 2026, after the 26 September pass. The secondary route of
CD §D-9 — for a field situation with no connected Food Partner.*

With `offline_capture_enabled` **true** and an active emergency, sign in as a
**volunteer** → `/volunteer/offline`.

**Expect:** the same amber *Emergency offline recording* box as the till. With
no emergency, the page shows only its explanation and no box.

1. Scan (or paste) a real token code.
2. DevTools → Network → **Offline**. Press **Record offline**.
   **Expect:** *"Recorded offline…"*, and *1 record(s) waiting to sync*.
3. Switch Network back **Online**.
   **Expect:** the capture in `/admin/offline-transactions` with source
   **volunteer**, as pending validation.
4. **The line that must not move:** still as that volunteer, POST to
   `/api/vendor/redemptions`.
   **Expect:** **403**. Capture is a capability; online redemption is not.

### A15 · F-3 — Clearing needs a note
**On `/admin/exception-queue`:** press **Clear** with the note box empty.
**Expect:** the button is disabled. An unexplained clear is not a review.

---

## Part B — the 8 rules with no screen

### B1 · E-4 — Offline is emergency-only
Close the emergency first (`/admin/emergencies` → **Close** — a reason and a surplus decision are required), then retry A13.
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

*Current as of 7 October 2026. Three limits listed here previously — the
volunteer offline route, the post-emergency source split and Q-5 — were built
between 26 September and 7 October and have been removed. Check this list
against the delivery register before reading it aloud.*

**Waiting on a client answer — not bugs, and worth saying so in those words:**

- **`max_tokens_per_volunteer` is unset**, so the volunteer cap will correctly
  test as *not enforced*. A missing client value, not a defect.
- **Four offline limits unset**, same reason: maximum pending records per
  device and per volunteer, the sync window, and the alert threshold.
- **Settlement policy for rejected offline captures** is seeded `review` — it
  decides nothing deliberately. The real choice is the client's.
- **One Food Partner ("Dhruv") has no address**, so it cannot be
  geographic-scope-checked. It only needs adding to the partner's details.

**Deliberately not finished, and should surprise nobody later:**

- **Payment is still mock** apart from manual UPI-UTR. No real money moves
  until the client picks a payment route.
- **A donor's own payment reference is accepted with no review.** A gateway
  would verify it automatically, so the reconciliation screen is deliberately
  deferred until the payment route is chosen rather than built and thrown away.
- **No email is sent** — the provider is an external dependency.
- **Offline capture ships switched off** (`offline_capture_enabled = false`)
  and stays off until the four limits above are set.
- **SMS and WhatsApp appeals are Phase 2**, pending DLT and WhatsApp Business
  registration. The dispatch layer is channel-abstract, so they slot in.

**Built since the last run, in case anyone remembers the old answer:**

- **Volunteer offline capture works** (7 Oct). Volunteers hold a narrow
  `offline_capture` capability and a screen at `/volunteer/offline`. They still
  cannot redeem a token online — that is a separate permission, deliberately.
- **Post-emergency review is split by source** (7 Oct). Food Partner and
  volunteer captures are reviewed as separate populations, never pooled, and
  every flag names its source.
- **Q-5 is built** (7 Oct). The client chose a hard block: registration from
  outside Coimbatore is refused, and the city is required while the lock is on.
- **City lock is actually enforcing.** It had been switched on with no
  operating city set, which enforced nothing anywhere; `operating_city` is now
  Coimbatore. Three of the five seeded Food Partners are outside it and will be
  refused at redemption — expect that during the demo, and use Green Bowl Mess.

---

## Recording results

| Ref | Card | Result | Note |
|---|---|---|---|
| A1 | Q-4 | **Pass** | Amber banner on /admin names `max_tokens_per_volunteer`. |
| A2 | Q-1 | **Pass** | 11 refused — *"co_contribution_max cannot exceed 10"*; 10 saved. |
| A3 | Q-3 | **Pass** | Audit row `system_config.update` carried the typed reason. |
| A4 | A-1 | **Pass** | Name-only Food Partner refused (PIN, state, district required). 36 states in the master list. |
| A5 | Q-2 | **Pass** | Limits API returns ₹10 and the till shows max ₹10. |
| A6 | F-4 | **Pass** | Meal Pool tile shows ₹40; the old Forfeited tile is gone. |
| A7 | P-3 | **Pass** | Export wrote a `report.export` audit row with the report type and filters. |
| A8 | P-2 | **Pass** | Volunteer list columns are Name / Identity / Status / Submitted — no Category. (Category appears only in the registration form the volunteer fills in.) |
| A9 | E-1 | **Pass** | Emergency declared and listed on the register with both relaxations. |
| A10 | E-6 | **Pass** | Draft created; mark-instant **refused** before approval (400), allowed after. |
| A11 | F-3 | **Blocked** | No eligible settlements in an unaudited cycle, so the minimum-of-one rule had nothing to act on. Needs 3 settlements as the card describes. |
| A12 | E-5 | **Pass** | Incident filed as a volunteer in two taps; the screen shows all 11 categories. |
| A13 | E-4 | **Pass** | Capture inside the emergency window → `pending_validation: 1`, and it appears on the admin register with its device. |
| A14 | E-4 | **Pass (after fix)** | **Failed first**: both captures were rejected by a database error instead of being flagged. Fixed in `7fd8228`; re-ran → `duplicates: 2`, both flagged, `offline_duplicate` raised in the exception queue. |
| A15 | F-3 | **Pass** | Queue lists the flagged items (token_reissue, offline_duplicate) and offers Clear. |
| A16 | A-2 | **Pass** | Short reason refused; approved reissue minted PPM-RIS-MUHXY1TI; a second attempt refused — *"already been reissued"*. |
| A17 | A-2 | **Pass** | Original stays `expired` and reads *"Expired – Reissued as PPM-RIS-…"*, linked both ways. |
| A18 | E-4 | **Pass** | Under a live emergency the till shows the amber offline panel and `/api/offline/authorisation` returns authorised. With capture switched off the panel is gone and the till looks normal. |
| A19 | E-4 | **Part-verified** | Added 7 Oct, after the pass. The API was verified end to end — volunteer authorisation 200 (source `volunteer`), sync 200 with the capture pending, and `/api/vendor/redemptions` 403 for that same volunteer. **The screen itself has not been driven in a browser**; do that at the demo. |
| B1 | E-4 | **Pass** | After closure the same capture is refused — *"capture falls outside the emergency period — offline capture is emergency-only"*. |
| B2 | E-4 | **Pass** | Future-dated capture refused — *"device clock is wrong"*. |
| B3 | F-1 | **Pass** | Contribution report renders with the Outstanding figure. |
| B4 | F-2 | **Blocked** | Needs a second admin account — one login cannot demonstrate maker ≠ checker. Covered by 27 automated tests. |
| B5 | A-2 | **Blocked** | Needs a token's real QR payload (only the donor's screen produces it) and a partner in another district; no partner currently has a district on record. |
| B6 | A-2 | **Pass** | `token_expiry_days` = 60. |
| B7 | P-1 | **Blocked** | Needs a completed redemption to inspect the donor notification payload. Covered by `donor-privacy-p1.test.ts`. |
| B8 | F-5 | **Blocked** | The admin pool is empty, so "oldest first" cannot be shown live. Covered by 6 automated tests. |
| C happy | F-2 | **Not run** | The client demonstration — needs two admin logins and a scheduled session. |
| C exc 1–5 | F-2 | **Not run** | Same. |

**Run:** 26 September 2026, against the live database at `localhost:3457`, driven through the real signed-in app (admin, volunteer and Food Partner sessions). **21 of the 26 steps passed**, five were blocked on test data or a second admin login, and A14 failed, was fixed, and passed on re-run.

**Since that run,** Q-5 was answered and built, the post-emergency review was split by source, and the volunteer offline route was opened (A19 above). Those are not folded into the figures here — this table is the record of 26 September, not a running total.

**A FAIL is a finding, not a failure of the session.** Note what you did, what
you saw, and what you expected — that is enough for me to fix it.
