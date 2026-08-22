# pApAmA — Developer Work Order (Phase 1 Build)

**Date:** 17 August 2026 · **Status:** Ready for development on push of v1.1 docs
**Companions:** `docs/pApAmA-Client-Decisions-2026-08.md` (CD — approved requirements incl. client's verbatim policy), `docs/pApAmA-Review-Register-v2-Internal.md` (register — full B-item history), `docs/VERIFICATION-REPORT.md` / `VERIFICATION-REPORT-2.md` (current-behaviour citations), `docs/user-guide.md` v1.1 (every `Planned (B-nn)` marker in it maps to a card here).

**Workflow per card:** Claude prompt authored → run in Claude Code → branch/PR to GitHub → developer reviews against the card's acceptance criteria → merge → tick the card. When a lane completes, its guide markers flip to present tense (batch job at Verification Report 3 / guide v1.2).
**Standing rules:** no charge to client — timing is the only variable · settlement/ledger code is the most sensitive surface: Lane 2 changes require test coverage before merge · schema lanes land **before pilot data accumulates** · nothing here contradicts CD; where a card and CD seem to differ, CD wins.

**Card status legend:** ☐ not started · ◐ in progress · ☑ merged · ✔ verified (VR-3)

---

## LANE 0 — QUICK FIXES (no dependencies; start immediately)

**Q-1 (B-10) — ₹10 ceiling on `co_contribution_max`**
Current: config PATCH validates non-negative only; any value accepted (V-01). Required: hard maximum 10 server-side; values >10 rejected with clear error. Accept: PATCH with 11 → 400; PATCH with 10 → stored; audit entry written. Note: also set the live value to 10 per D-1.

**Q-2 (B-20) — Vendor scan UI co-pay limit from config**
Current: `CO_PAY_MAX = 5` hardcoded in `app/vendor/scan/page.tsx` (V-01). Required: client-side limit reads `co_contribution_max`. Accept: with config=10 the scan screen accepts ₹10; server and client limits can never diverge.

**Q-3 (B-14) — Reason field on config-change audit**
Current: config audit captures actor/timestamp/from/to, no reason (V-09); emergency toggle likewise (V-12). Required: optional reason on system-config PATCH, stored in audit metadata; **mandatory** reason when extending an active emergency override (D-6). Accept: config change with reason → reason in audit row; emergency-override extension without reason → rejected.

**Q-4 (B-06) — "Critical configuration incomplete" dashboard warning**
Current: none; NULL configs soft-skip silently. Required: admin dashboard banner listing unset go-live-mandatory keys (per the guide's Go-Live Checklist classification). Accept: with `standard_token_value` NULL the banner names it; with all mandatory keys set the banner is absent.

**Q-5 (B-15) — City-lock at registration flows — REVISIT, do not build as originally scoped**
Original scope (extend `city_lock_enabled` gating to beneficiary/vendor/volunteer registration, V-13) predates the D-2A PAN-INDIA token model, which frames city lock as a pilot-phase control to be superseded. Decision needed (JICATE-internal): (a) build as scoped for pilot operational hygiene, or (b) drop and rely on operational onboarding control + B-02 location capture. Recommend (a) minimal: warn-and-confirm rather than hard-block at registration. Hold until Lane 1 design settles.

---

## LANE 1 — DATA ARCHITECTURE (schema-first; land before pilot data accumulates)

**A-1 (B-02) — Location masters & structured addresses**
Current: `vendors.city` free text + coordinates; no state/district/PIN anywhere (V-02/V-13 context). Required (CD §D-2): `states` and `districts` masters (district FK→state), city/town/village/locality level, PIN with 6-digit numeric validation, location IDs referenced from Food Partner (mandatory full, registered vs operating address separately), volunteer (structured), beneficiary (lenient — optional fields never block registration); **service-location snapshot columns on `token_redemptions`** filled at redemption from the Food Partner's operating address. Seed: Tamil Nadu districts minimum; all-India state list. Accept: Food Partner registration without district/PIN rejected; beneficiary registration without PIN succeeds; redemption row carries city+district+state snapshot; changing a Food Partner's address later does not alter historical snapshots. Migration note: backfill existing Coimbatore records via one mapped script; write it alongside the migration.

**A-2 (B-23) — Token model: geographic scope, activation/expiry, reissue**
Current: tokens have `expires_at` from `token_expiry_days` (NULL today), no geo attributes, no face-display fields; revalidation feature reactivates the same token (V-21/VR-1). Required (CD §D-2A): `geographic_scope` attributes (PAN_INDIA default | state | district | city | PIN + reference IDs from A-1); redemption check of scope vs service location (never beneficiary location); **per-mode activation & expiry dates (confirmed 18 Aug): Donor Controlled tokens — 60-day validity from creation/issue to donor; PAPAMA Distributed tokens — 60-day validity from distribution/assignment to beneficiary (NOT creation)**; `token_expiry_days=60`; FIFO continues to govern pool allocation order; undistributed pool tokens past expiry → controlled reissue (new token, permanently linked, original QR permanently non-redeemable); token display payload (type, value, scope, activation, expiry) for digital view and print; **reissue flow** — admin review → approve with reason → new token (new ID/QR/dates) linked via existing `replacement_for_token_id` pattern → original permanently `expired`; **revalidation retirement confirmed 18 Aug** — remove routes/UI or permanently disable `token_revalidation_allowed`; expired = permanently non-redeemable. Accept: Coimbatore-restricted token scanned at a Mumbai-district Food Partner → hard block with clear message; PAN-INDIA token redeems anywhere; expired token redemption → block; reissued token carries original's value with link; revalidation endpoints gone/disabled; expired value no longer written off (see F-4); pool token distributed on day 30 → expires on day 90 from creation (day 60 from distribution).

**A-3 (B-28 c+d) — Special Care structures: category master + pool ledger**
Current: category enum (pregnant_women, patient, disability, disaster_affected); `special_care_multiplier` dead; `patient_eligibility_months` applied from approval date (V-17). Required (CD §D-8): `special_care_categories` master (configurable; seed: Pregnant Women, Postpartum/Lactating Mothers, Medically Vulnerable/Patients) distinct from beneficiary categories; **Common Special Care Pool ledger** (new ledger stream alongside revenue ledger) with the eight-line statement (opening/receipts/issued/utilised/surplus/contributions/utilisation/closing); SPECIAL_CARE token type with fixed ₹100 face value; surplus auto-routing ₹100−meal→pool at redemption. Accept: ₹100 token redeemed for ₹75 meal → ₹25 pool ledger credit, zero to revenue; category master editable by admin; multiplier remains config-present but provably unread by value logic (comment + test). Eligibility-model changes (EDD, delivery-date, per-record review dates + reminders) = **A-3b**, may follow in the same lane: pregnancy rows expire at delivery event; postpartum = delivery date + 6 months; patient rows carry review date + professional-recommendation fields; reminder rides the scheduled-reminders sweep. `patient_eligibility_months` stays functional until A-3b merges (audit Finding 1), then deprecates.

**A-4 (B-32a) — Distribution mode field**
Current: mode implicit in status (live vs in_admin_pool). Required (CD §D-10A): explicit `distribution_mode` (PAPAMA_DISTRIBUTED | DONOR_CONTROLLED) fixed at creation; donor notification preference field; "Expired – Not Redeemed" presentation for donor-controlled tokens. Accept: mode immutable post-creation; donor token list shows the mode and expiry presentation. (FIFO itself is F-6 — needs this field first.)

---

## LANE 2 — FINANCIAL CONTROLS (after A-lane schema; most sensitive code — tests mandatory)

**F-1 (B-01) — ₹10 contribution system**
Current: `co_pay_inr` recorded per redemption, excluded from settlement, no status/waiver/remittance concepts (V-01). Required (CD §D-1): per-redemption contribution status (collected | waived | outstanding); waiver record with CD's minimum fields; remittance & reconciliation records (daily cycle, configurable); **settlement-release gate** — a settlement cannot move to paid while any line's contribution is neither reconciled nor waived; contribution report (expected/collected/remitted/received/outstanding/waived/settled). Accept: redemption with ₹10 collected → status collected; emergency-waived redemption → waived with authoriser+reason; settlement containing an outstanding line → pay blocked with named lines; report totals reconcile to ledger. Dependencies: waiver auto-rule from E-2; checker view from F-2(g).

**F-2 (B-24) — Maker-checker enforcement**
Current: statuses pending→locked→approved→reconciled→paid with holds, fully audited, but any admin can perform all transitions; no versioning/reject; bank-account storage to confirm (V-11). Required (CD §D-4): (a) preparer/locker ≠ approver/payer, system-blocked per settlement; (b) lock immutability + versioning (reopen→amend→v2→re-lock→fresh approval); (c) material change post-approval auto-invalidates approval; (d) reject→return-to-maker with mandatory reason; (e) hold placed as material cannot be released by its placer; (f) Food Partner bank-account change: four-eyes approval, effective date, changer barred from approving payment to the new account — **first confirm where/if bank details are stored; if absent, add the fields under this card**; (g) checker evidence drill-down incl. contribution/waiver columns; (h) three-way reconciliation view per CD's worked example; (i) same controls on adjustments/reversals (with B-07 records when built). Status names retained + documented mapping (client Question-4; default yes). Accept: each lettered control has a failing-path test (maker approves own settlement → 403; edit after approval → approval void; etc.). **Deliverable alongside: the demo script** — client's 10-step happy path + 5 exception scenarios as a repeatable UAT script; client demonstration required before his sign-off.

**F-3 (B-25) — Risk-based audit framework**
Current: settlement audit queue with random sampling + flag/clear + hold (V-11 addon). Required (CD §D-5): tamper-proof selection record (cycle, population, sample, IDs, timestamp, assignee, result) with min-1-per-cycle and no removal once selected; audit record model (14 fields, severity Critical/Major/Minor); exception auto-flag queue (adjustments, reissues, reversals, bank changes, unusual waivers, fraud-linked) — **build once, shared with E-3/E-4**; targeted-audit addition; basic Food Partner risk status field. Accept: cycle with 3 settlements selects ≥1; admin cannot delete a selection row; reissue transaction auto-appears in exception queue; audit record immutable.

**F-4 (B-03) — Forfeited & expired value → Meal Pool**
Current: forfeited → `forfeited_balances` + **revenue ledger** + analytics revenue line; expired → written off, no ledger entry (V-21). Required (D 4-Aug §2 + CD §D-8 for the Special-Care variant): standard-token forfeited difference → Meal Pool (admin pool credit ledger), never revenue; Special Care surplus → Special Care Pool (A-3); expired token value → pool pending reissue (mechanism = A-2 reissue). Analytics: revenue line replaced by pool-return reporting; vendor scan "Forfeited" label reworded ("returned to Meal Pool"). Accept: ₹60 token/₹50 meal → ₹10 pool ledger entry, revenue ledger untouched; expiry sweep moves value to pool-pending; analytics show pool figures. Sequence: after A-2/A-3 ledgers exist.

**F-5 (B-32b) — FIFO allocation**
Current: manual admin pick from pool. Required (CD §D-10A): allocation (admin assign + volunteer-request grant) serves oldest eligible pool token first, honouring geographic scope and token type; donor-controlled tokens never enter the queue (already structural — add test). Accept: two pool tokens, older allocated first; scope-restricted older token skipped for an out-of-scope volunteer zone with the skip logged. After A-2 + A-4.

---

## LANE 3 — EMERGENCY FRAMEWORK (E-1 first; E-4 design-first)

**E-1 (B-26 a,d,e) — Emergency event entity + tagging + closure**
Current: global toggle + time-boxed overrides w/ auto-revert; no event record (V-12). Required (CD §D-6): `emergencies` table (Emergency ID e.g. TN-FLOOD-2026-001, reason, geographic scope refs from A-1, period, activator, estimates, status); activation/extension/closure via the entity (extension reason mandatory — Q-3); donation & token tagging (ride `campaign_id` pattern or `emergency_id` FK); closure reconciliation record (funds received/utilised/committed; tokens issued/redeemed/unused; surplus; utilisation decision; approver). Config values set: 4 meals / 3h / 7 days. Accept: cannot issue emergency token without an active emergency record; every emergency donation/token/redemption queryable by Emergency ID; closure report totals reconcile.

**E-2 (B-27 a–c) — Emergency verification relaxation + auto-waiver**
Current: face verification mandatory at redemption, no bypass (VR-1/V-22 #4); waivers don't exist. Required (CD §D-7): during active emergency (within scope), face step skippable with level recorded (Standard/Enhanced/Referred); automatic ₹10 waiver per emergency scope — system-indicated, never Food-Partner/volunteer discretion; Food Partner settlement always full meal value; transaction tagging (emergency flag, Emergency ID, waiver flag + CD field list); waiver auto-ends at emergency end. Accept: emergency OFF → skip unavailable; ON → skip recorded with level; waived redemption shows ₹0 collected + waiver record + full settlement line; tags present. Depends: E-1, F-1 waiver records.

**E-3 (B-27d) — Post-emergency review queue**
Required: exception engine (F-3) filtered by Emergency ID with emergency-pattern rules (rapid repeats, same-identifier reuse, volume/geographic anomalies, waiver patterns); normal transactions stay under the 10% random audit. Accept: emergency closure populates the queue with flagged transactions only. Depends: E-1, F-3.

**E-4 (B-30) — Controlled offline emergency transactions — DESIGN-FIRST**
Current: no offline capability of any kind (V-22 #11). Required (CD §D-9): emergency-only offline capture — offline txn record (CD's 11 fields incl. waiver status + **mandatory transaction source field** (Food Partner / Volunteer) — confirmed 18 Aug), sync → full normal validation ("Pending Offline Validation"), expiry/geo/status never bypassed; controls: max pending per volunteer/device, sync window, alerts, cross-batch duplicate-token detection → exception queue, admin unsynced-view; limits configurable. **Two capture routes confirmed 18 Aug:** (1) Food Partner redemption screen — **primary**, at-premises recording; (2) Volunteer App — **secondary**, for field situations without a connected Food Partner. Both emergency-only, subject to identical controls. Every offline transaction must record its source for separate post-emergency review by source. **Milestone 1 = design doc** (PWA/service-worker approach for both routes; conflict semantics; security of offline store) reviewed by JICATE before any code. Accept (build): airplane-mode capture during active emergency succeeds and syncs to Pending Offline Validation; source field present on every record; duplicate token across two devices → both flagged, neither silently accepted; normal-period offline attempt → refused. Heaviest single item — schedule last in the lane.

**E-5 (B-31) — Volunteer incident reporting**
Required: 11 one-tap categories (CD §D-9) in the volunteer app → admin queue with status flow; assistance-request folded in. Accept: report filed in ≤2 taps + optional note; appears in admin queue with volunteer/time/location context. Small — good parallel filler.

**E-6 (B-26 b,c) — Emergency Appeal workflow**
Required (Phase 1 — split confirmed 18 Aug): template store + approval workflow (incl. pre-approved instant template with post-send review) → dispatch via in-app now, email when official account lands (external dependency: Mr. Kabilan); donations from appeal tagged to Emergency ID; basic individual/CSR segmentation. SMS/WhatsApp = Phase 2 (DLT/WABA). **Channel-extensibility requirement (confirmed 18 Aug):** the Phase 1 appeal architecture must be designed so Phase 2 channels (SMS via DLT registration, WhatsApp via Business API) can be integrated later WITHOUT fundamental redesign of the dispatch, template or tracking infrastructure. Accept: unapproved template cannot dispatch; instant template dispatch creates post-send review task; appeal-attributed donations carry the Emergency ID; dispatch interface is channel-abstract (adding a channel = new adapter, no core rework).

---

## LANE 4 — PRIVACY FRAMEWORK

**P-1 (B-29a) — Notification whitelist filter + templates**
Current: redemption notifications include `beneficiary_category` (V-20/B-22). Required (CD §D-10): dispatch layer accepts only the whitelist (token ID/type/value, datetime, Food Partner/location at City+State from A-1 snapshot, Emergency ID, programme); category and all sensitive fields structurally unreachable; the three CD templates installed as defaults for standard/Special-Care/emergency token types. Accept: notification payload for a Special Care redemption contains "SPECIAL CARE" token type and "City, State" but no category/medical field — asserted by test on the payload builder, not just template content.

**P-2 (B-29b) — Need-to-know role surfaces**
Required: vendor scan & redemption screens show token type/value/validity only (verify current exposure first); volunteer screens transaction-minimum; Special Care category visible to admin roles only where eligibility work requires it. Accept: vendor-side API responses contain no beneficiary category/medical data; snapshot tests per role.

**P-3 (B-29c, Phase 1 slice) — Export logging**
Required: every report/CSV export writes an audit row (who, what report, when, filters). Full sensitive-read audit = Phase 2. Accept: export → audit entry.

---

## PHASE 2 / DEFERRED / CLOSED (tracked, not scheduled)

Phase 2: B-07 settlement adjustment records · B-08 line-item hold · B-11 guest contact capture · B-12 complaint categories (**spec = client's complaint-policy document — await it**) · B-13 beneficiary redirection · B-16 80G generation (await 80G number + CA format) · B-17 CSR impact linkage · B-19 auto-revert per-item audit · B-21 UTR bank-feed verification (rides gateway integration) · B-25e composite risk rating · B-29c full read audit · B-26c SMS/WhatsApp channels · B-30 general (non-emergency) offline — not planned at all.
Resolved without build: **B-04** duplicate UTR (already implemented) · **B-05** superseded by B-16 · **B-18** multiplier stays internal-analysis-only (A-3 adds the guard test).

## CROSS-CUTTING

**Shared spines (build once):** Emergency ID entity (E-1) ← E-2/E-3/E-6/closure · exception queue (F-3) ← E-3, F-2(i), reissue/bank-change/waiver flags · reissue mechanism (A-2) ← B-03 expiry return, emergency unused tokens, lost-token pattern · location masters (A-1) ← A-2 scope, E-1 scoping, P-1 City+State, B-32 fields · ledger streams (A-3/F-4) ← Special Care Pool, Meal-Pool returns, Emergency Response Fund.
**Client confirmations received 18 Aug (all defaults overridden or confirmed):** Q1 activation date — Donor Controlled at creation, PAPAMA Distributed at distribution (overrides creation default) · Q2 offline device — BOTH routes: Food Partner primary + Volunteer App secondary, mandatory source field · Q3 revalidation retirement — CONFIRMED · Q4 status names retained — CONFIRMED, with documented mapping; approval and payment separate events · Emergency Appeal split — CONFIRMED with channel-extensibility requirement · Items (a) graduated corrective action, (b) 80G preconditions, (c) §3.13 rewrite — all confirmed · Foundation documents timeline: Standard Meal Framework 25 Aug; Special Care Meal Guidelines 28 Aug; Food Partner Eligibility 31 Aug; Complaints Policy 31 Aug; Institution Framework 5 Sep · Client directive: proceed with v1.1 and lane-wise development; maker-checker demo date to be proposed by JICATE.
**Suggested order:** Lane 0 (minus Q-5) immediately → A-1 → A-2/A-3/A-4 in parallel → F-1→F-2→F-3→F-4/F-5 → E-1→E-2/E-5→E-3/E-6 → E-4 design then build → P-1/P-2/P-3 (P-1 can start once A-1 lands). Maker-checker demo to client after F-1+F-2. VR-3 + guide v1.2 after each lane or at Phase-1 completion.
