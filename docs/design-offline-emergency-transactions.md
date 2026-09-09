# Design — Controlled Offline Emergency Transactions

**Work Order card:** E-4 (B-30) · **Client decision:** CD §D-9
**Status:** **DESIGN — Milestone 1. Awaiting JICATE review. No code has been written.**
**Author:** development · **Date:** 9 September 2026

> The Work Order requires this document be reviewed by JICATE **before any code**.
> It is deliberately a design, not an implementation plan with tickets. Section 11
> lists the decisions I cannot make alone.

---

## 1. What this is, and what it is not

CD §D-9 permits offline capture in exactly one circumstance:

> **Emergency Mode + No Connectivity = Controlled Emergency Offline Procedure**

Normal operations have **no offline path at all**. CD §D-9 is explicit that during
normal periods, where connectivity is unavailable and a transaction cannot be
safely validated, volunteers *"shall not improvise or create unverified
redemptions"*. This design must make improvising impossible, not merely
discouraged.

**Current state:** the platform has no offline capability of any kind — no service
worker, no client-side storage, no sync queue. This is greenfield.

### The single most important design decision

**An offline capture does NOT redeem a token. It records that a meal was served.**

The token is burned only at sync, after full normal validation. Capture is a
*record of intent*; sync is where the rules run.

Everything below follows from that. It also produces the risk in §9 that JICATE
must accept explicitly, because it cannot be engineered away.

---

## 2. The two capture routes (confirmed 18 Aug)

| | Route | Role | When |
|---|---|---|---|
| **1** | Food Partner redemption screen | **Primary** | At-premises recording — the partner is present but the connection is down |
| **2** | Volunteer App | **Secondary** | Field situations with no connected Food Partner |

Both are emergency-only and subject to **identical controls**. Every offline
transaction records its **source**, and post-emergency review is run **separately
by source** — a Food Partner recording at their own till and a volunteer
recording in a field are different risk profiles and must not be pooled.

---

## 3. The offline transaction record

CD §D-9's eleven fields, plus the source field confirmed 18 Aug:

| # | Field | Notes |
|---|---|---|
| 1 | `offline_txn_id` | Generated **on the device** (UUIDv4). The device cannot ask the server for an id. |
| 2 | `token_id` | From the scanned QR. |
| 3 | `volunteer_id` | Null for the Food Partner route. |
| 4 | `food_partner_id` | Null when a volunteer captures with no partner present. |
| 5 | `beneficiary_identifier` | **Where available.** Often null — see §7. |
| 6 | `emergency_id` | From the cached authorisation (§5). |
| 7 | `captured_at` | Device clock — see §8 on why this is not trusted. |
| 8 | `token_meal_type` | Standard / Special Care. |
| 9 | `waiver_status` | Whether the ₹10 was waived under E-2's emergency rule. |
| 10 | `status` | `pending_sync` → `pending_offline_validation` → `validated` / `rejected`. |
| 11 | `device_reference` | Stable per-install id. Not a device fingerprint — see §7. |
| **12** | **`source`** | **`food_partner` \| `volunteer`. Mandatory. Confirmed 18 Aug.** |

---

## 4. Technical approach

**Storage: IndexedDB.** Not `localStorage` — it is synchronous, string-only, size
capped around 5 MB, and has no transactions. A queue that must not lose entries
needs atomic writes.

**Service worker** for two jobs only: detecting connectivity transitions and
triggering sync. It does **not** cache application pages for offline use — a
volunteer must never be able to open the app "offline" outside an emergency and
find a working capture screen. The offline screen is reachable only when a valid
cached authorisation exists (§5).

**Background Sync API** where supported, with a foreground retry on app open as
the fallback. Background Sync is unavailable on iOS Safari, which is a material
share of Indian field devices, so the foreground path is the primary mechanism
and Background Sync is an enhancement, not a dependency.

---

## 5. How the device knows an emergency is active

**This is the constraint most likely to be missed.** A device cannot ask the
server whether an emergency is running — being unable to ask is the whole
scenario.

So the authorisation must be **cached in advance and must self-expire**:

- On every successful connection during an active emergency, the app caches an
  **offline authorisation**: `emergency_id`, `ends_at`, `waiver_enabled`,
  `verification_relaxation_enabled`, and the configured limits.
- Offline capture is available **only** while a cached authorisation exists and
  `now < ends_at` **by the device clock**.
- The authorisation is cleared when the emergency closes, on the next connection.

**Consequences JICATE should note:**

1. A device that has never connected during the emergency **cannot capture
   offline**. A volunteer who leaves base before an emergency is declared, and
   never reconnects, has no offline capability. This is correct — the alternative
   is a device that authorises itself.
2. A device whose clock is wrong could extend its own window. Mitigated, not
   solved, by the sync-window cap (§6) and by server-side validation rejecting
   captures outside the true emergency period.

---

## 6. Controls and limits

All configurable, per CD §D-9 ("limits configurable post-pilot"). Proposed
starting values are **suggestions for JICATE, not decisions** — see §11.

| Control | Purpose | Proposed |
|---|---|---|
| Max pending per device | Caps loss if a device is lost, and caps fraud per device | *to confirm* |
| Max pending per volunteer | Same, across devices | *to confirm* |
| Max sync window | After this, a capture is rejected as too stale to validate | *to confirm* |
| Unsynced alert threshold | Admin alert when a device holds unsynced records too long | *to confirm* |
| Offline capture allowed | Master switch, per emergency | Off by default |

**Admin unsynced view** (CD §D-9): a screen showing which devices hold unsynced
records and for how long. This is the operational safety net — if a device never
syncs, someone must know that meals were served with no record reaching the
platform.

---

## 7. Security of the offline store

**Threat: a device is lost or stolen during a disaster.** This is not
hypothetical; it is a normal event in the exact conditions this feature exists
for.

### What is stored

The design principle is **store as little as possible**:

- **No face embeddings.** No biometric data ever reaches the offline store.
- **No beneficiary PII** — no name, no phone, no address.
- `beneficiary_identifier` is stored **only if a beneficiary was already
  identified online before connectivity was lost**, and then only as the
  existing opaque id. In the common field case it is null, and CD §D-9 accepts
  this ("where available").
- A stolen device therefore yields: token ids, a partner id, timestamps and an
  emergency id. That is operational data, not personal data.

### Encryption at rest

**An honest assessment: full encryption at rest is weak in this context, and I do
not want to overstate it.** IndexedDB is not encrypted by default. Encrypting
with Web Crypto requires a key the device can use *while offline and possibly
after a restart* — which means the key must be stored on the device too, and an
attacker with the device has both. It raises the bar against casual inspection;
it does not defeat a determined attacker with physical possession.

Proposed mitigations, in order of actual effectiveness:

1. **Minimise the payload** (above). The strongest control by a wide margin.
2. **Cap pending records and the sync window** — less data resident, for less time.
3. **Clear the store immediately on successful sync.** Records do not linger.
4. **Encrypt with a session-derived key** as defence against casual inspection,
   documented as exactly that and not as protection against device seizure.
5. **Server-side invalidation:** an admin can mark a device reference
   compromised, and any records later synced from it land in the exception queue
   rather than validating.

**This section needs JICATE's judgement** — see §11.

---

## 8. Sync and validation

```
capture (offline)
   ↓  device stores record, status = pending_sync
connectivity returns
   ↓  service worker / app-open retry uploads the batch
server receives
   ↓  status = PENDING OFFLINE VALIDATION
FULL NORMAL VALIDATION runs — nothing is bypassed:
   • token exists, not already redeemed, not expired
   • geographic scope (A-2) vs the Food Partner's service location
   • Food Partner authorised, active, not suspended
   • emergency genuinely active at capture time (server clock, not device)
   • meal limit and cooldown
   • fraud blocks
   ↓
validated  →  token burned, redemption written, settlement line created
rejected   →  exception queue with the reason; NO token burned
```

**Timestamps.** `captured_at` comes from the device clock and is recorded as
*claimed* capture time. The server also records `received_at`. Validation of the
emergency window uses the **server's** knowledge of the emergency period, not the
device's claim. A device clock is a value an attacker controls.

**Ordering.** Captures are validated in `captured_at` order within a batch, but
that ordering is *claimed*, not trusted — which is why duplicates go to a human
(§9) rather than being resolved by "earliest wins".

---

## 9. Conflict semantics — the hard part

**The case:** the same token is captured offline on two devices, and both sync.

CD §D-9 is unambiguous: cross-batch duplicate-token detection routes to the
**exception queue**, and there must be **no silent accept and no silent delete**.

**Design: neither capture is auto-accepted. Both are flagged. A human decides.**

This is deliberately not "first timestamp wins", because a duplicate has at
least three innocent-to-serious explanations and the system cannot tell them
apart:

| Cause | What actually happened |
|---|---|
| Volunteer retried after a crash | One meal, two records — accept one |
| Two volunteers helped the same person | Possibly two meals — or one, double-recorded |
| Deliberate reuse | Fraud |

Auto-picking the earliest would **silently discard a genuine second meal** in
case 2, or **silently accept fraud** in case 3. Both failures are invisible.
Sending both to a human makes the ambiguity visible, which is the only honest
outcome.

**Duplicate against an ONLINE redemption** — the token was already redeemed
normally before the offline batch arrived — is resolved the other way: the online
redemption stands (it was fully validated at the time) and the offline record is
rejected into the exception queue. The meal may well have been served; that is
the loss described in §9.1.

### 9.1 The residual risk JICATE must accept explicitly

**A meal can be served offline against a token that later fails validation.**

The food is gone. The token is not burned. Nobody is defrauded, but pApAmA has
provided a meal with no funded token behind it, and the Food Partner still
expects settlement.

This cannot be engineered away — it is inherent to serving food before
validating. The options are:

- **(a)** Settle the partner anyway and absorb the cost from the Meal Pool,
  recording it as an emergency write-off.
- **(b)** Refuse settlement for rejected offline transactions.
- **(c)** Settle, and review case by case above a threshold.

**I recommend (a) with a per-emergency cap**, on the grounds that a Food Partner
who served a meal in good faith during a disaster should not bear the loss — but
this is a money decision and a policy decision, not an engineering one. **It is
JICATE's and the client's to make.** See §11.

---

## 10. What this design deliberately does NOT do

- **No offline capability in normal operations.** Not configurable "off"; simply
  not built. CD §D-9's prohibition is absolute.
- **No offline beneficiary registration.** Only redemption capture.
- **No offline token issuance.** Tokens cannot be created without a server.
- **No relaxation of expiry, geography, partner status or fraud blocks.** CD §D-6
  lists these as things Emergency Mode never overrides, and offline is no
  exception.
- **No face capture offline.** E-2 already permits skipping face verification
  during an authorised emergency; capturing biometrics onto a field device that
  may be lost is a worse trade than accepting Level 1 verification.

---

## 11. Decisions I cannot make — for JICATE

1. **§9.1 — settlement of rejected offline transactions.** (a), (b) or (c)? A
   money and policy decision. Everything else in this design can proceed without
   it; the build cannot finish without it.
2. **§6 — the four numeric limits.** Max pending per device and per volunteer,
   max sync window, alert threshold. I have deliberately **not proposed values**:
   this is the same discipline as `max_tokens_per_volunteer`, which remains unset
   because inventing a number nobody approved is worse than leaving it visible.
3. **§7 — the encryption position.** Is "minimise + short window + clear on sync,
   with session-key encryption documented as anti-casual-inspection only"
   acceptable, or does the client require a stronger claim? If stronger, the
   honest answer is that it needs a native app with OS keystore access, not a
   PWA — which is a scope change, not a tweak.
4. **iOS Background Sync.** The foreground-retry fallback means an iOS volunteer
   must **open the app** to sync. Acceptable, or does it need an operational
   procedure ("open the app on returning to signal")?
5. **Device clock trust (§5.2).** A wrong device clock can extend the local
   offline window. Server-side validation catches it at sync, but the meal is
   already served. Accept, or add a stricter local guard?

---

## 12. Suggested build sequence — only after review

1. Schema: `offline_transactions` table (12 fields), device registry, config keys
2. Sync endpoint + full validation pipeline reusing the existing redemption engine
3. Duplicate detection → exception queue (F-3's queue, already built and shared)
4. Admin unsynced view + alerts
5. Service worker + IndexedDB queue, Food Partner route (primary)
6. Volunteer App route (secondary)
7. Post-emergency review **by source** (extends E-3)

**Steps 1–4 are server-side and carry the controls.** They should land and be
verifiable before any client can capture anything — so that the day a device
first captures offline, the machinery that validates, deduplicates and reviews it
already exists.

---

## Appendix — dependencies already built

| Needs | Status |
|---|---|
| Emergency entity + active gate | ✅ E-1 |
| Emergency waiver + verification relaxation | ✅ E-2 |
| Exception queue (shared) | ✅ F-3 |
| Post-emergency review sweep | ✅ E-3 — extend for source split |
| Geographic scope at redemption | ✅ A-2 |
| Service-location snapshot | ✅ A-1 |

E-4 is the last card, and every dependency it needs already exists.
