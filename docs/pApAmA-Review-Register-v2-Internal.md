# pApAmA Review Register v2 — Internal Handover Document

**Prepared:** 11 August 2026
**Covers:** Client review emails §6.3 – §10.4 (received 4–11 Aug 2026) + client decision replies of 4–5 Aug 2026
**Companion to:** pApAmA-Review-Analysis-Internal.md (Sections 1–6.2 cycle)
**Classification codes:** D = documentation-only (v1.1, no cost) · P = policy decision needed · CR = change request · CAND = CR candidate (JICATE-flagged) · V = verify against code before documenting · P2 = Phase 2 backlog · CA = client action item

---

## 1. REVIEW STATUS

| Item | Status |
|---|---|
| Guide sections reviewed by client | §1 – §10.4 complete, **except §3.13** (System Configuration) |
| §3.13 | Exists in guide (p.15); skipped between §3.12 and §3.14 — likely accidental; confirm in decisions letter |
| Guide TOC end | §10.4 is the final section (verified against PDF, 11 Aug) |
| Duplicate emails | §3.4, §4.1, §6.3, §9.6 each received two emails; §6.3 first copy truncated, second complete; §9.6 second email is an *addendum* (geographic hierarchy), not a duplicate |

## 2. DECISIONS ALREADY MADE BY CLIENT (4–5 Aug replies)

These are settled. Incorporate into v1.1 without further questions.

1. **Title:** Version 1.1 is the "pApAmA Technical Administration Guide". A simplified Public User Guide is deferred to a later phase.
2. **Registers:** Documentation Review Register (incorporated into v1.1 at no cost) + Change Request Register (only genuinely new functionality). His rule: explanations, business rules, and documenting existing-but-undocumented features are all documentation work.
3. **Terminology:** "Food Partner" throughout the guide; app UI may remain "Vendor" in Phase 1 with an explanatory note; UI rename = future enhancement. "General Donation Pool" replaces "Guest Pool" in the guide; UI term explained.
4. **Beneficiary categories:** v1.1 documents only the four implemented categories. Future list (Children, Elderly Persons, Pregnant Women, Lactating Mothers, Persons with Disabilities, Patients, Disaster-Affected, General) documented as proposed enhancements.
5. **Donor Credit never expires** (unless a future statutory requirement forces otherwise).
6. **Unspent donor value → Meal Pool, never revenue:**
   - (a) Token value > meal price → difference returns to the Donor/Admin Meal Pool. **Conflicts with current "forfeited" treatment → CR-03.**
   - (b) Expired token value → returns to Meal Pool for reissue. **CR-03.**
   - (c) Revoked tokens → Admin Pool. Matches current implementation; no change.
7. **SLAs (configurable admin parameters, not hard-coded):** proof approval ≤ 24 h; settlement reconciliation ≤ 48 h after proof approval; Food Partner payment ≤ 7 working days after reconciliation; complaint acknowledgement ≤ 24 h; complaint resolution normally ≤ 7 working days. Document in v1.1; system SLA tracking = P2.
8. **Permanent audit retention** endorsed (financial/token/settlement/governance records never deleted).
9. **Document audience (STRUCT-01, prior cycle):** Technical Administration Guide — internal routes and config keys stay in. Reconfirmed.

## 3. BUILD REGISTER — everything here gets built (no charge to client); the only variable is WHEN

**Standing rule (per JICATE policy, 11 Aug):** any client-requested behaviour not present in the code is (a) documented in v1.1 as intended behaviour, clearly marked, and (b) recorded here as a build item and implemented. Verification findings of "absent" from Section 5 are logged here as new B-items as they are discovered. Nothing is dropped; "Phase 2" indicates timing only.

| ID | Title | Source | Build timing | Notes |
|---|---|---|---|---|
| B-01 | ₹10 beneficiary contribution — enforcement, remittance & waiver recording | §7.3, §9.2, §10.1 Q14–16, §10.3 Q7–10; 4 Aug reply §3 | **Operable in Phase 1 now** (per V-01) once B-20 lands; remittance/waiver system build Phase 2; confirm framing with client (§6.1) | V-01 finding: `co_contribution_max` has NO code ceiling (₹5 is only the seed value; spec-rev2 already contemplates ₹10; tests use ₹10) — admin can set 10 today. Vendor UI hardcodes ₹5 (B-20 fixes). Co-pay recorded per redemption, excluded from settlement payout — vendor retains it at counter, which matches the collect-and-remit model; remittance itself is manual/accounting in Phase 1. |
| B-02 | Geographic hierarchy: Country → State → District → City/Town → PIN | §9.6 second email | Recommend structured address fields **before pilot data accumulates** (Phase 1); reporting rollups, PIN validation, location master Phase 2; confirm timing with client (§6.2) | Applies to Food Partners, beneficiaries, volunteers, transactions; state/district reporting; standardised location master. Current build: city string + coordinates. |
| B-03 | Return of forfeited & expired token value to Meal Pool | 4 Aug reply §2(a),(b) | Decided by client — schedule with developer | V-21 baseline confirmed: forfeited → `forfeited_balances` + revenue ledger + analytics `financial.forfeited_inr`; expired → status flip only, value written off, no ledger entry. Both must be rerouted to pool. Vendor scan preview shows a "Forfeited" line — UI wording changes too. |
| B-04 | ~~Duplicate UTR detection~~ **DONE — already implemented** | §8.2 pt 6; V-06 | Closed | DB partial unique index + ledger-level uniqueness; second submission gets 409 "already been used". Residual gap is bank-feed verification → tracked as B-21. |
| B-05 | ~~80G certificate content completeness~~ **Superseded by B-16** | §9.8 pt 2; V-15 | — | V-15: generation entirely absent (deliberately blocked); no partial implementation to gap-fix. Full build is B-16. |
| B-06 | "Critical configuration incomplete" dashboard warning | §10.4 pt 3 | **Before go-live** (small, high value) | Flags mandatory NULL configs before production operation. |
| B-07 | Auditable settlement adjustment/recovery records | §10.4 pt 4 | Phase 2 | Corrections as new linked transactions; paid settlements never edited. |
| B-08 | Line-item settlement hold | §10.3 Q24 | Phase 2 | Hold only the disputed transaction; protect Food Partner cash flow. |
| B-09 | Emergency Mode governance workflow | §9.5 pts 4–5 | Phase 2 (documented as operational procedure in v1.1 meanwhile) | Initiator/approver/oversight roles, reason capture on activation/deactivation, extension review. |
| B-10 | Enforce hard upper bound (₹10 per spec-rev2 §7) on `co_contribution_max` in the config PATCH route | V-01 | Pre-go-live | Code currently accepts any non-negative value; spec requires ₹10 ceiling. |
| B-11 | Capture optional contact (mobile/email) on guest donation for receipt/thank-you notifications | V-05 | Phase 2 | Prerequisite for the client's guest-donor acknowledgement policy (§8.1 pt 7); notification channels also pending (official email dependency). |
| B-12 | Predefined complaint categories (quality, quantity, hygiene, staff, delay, redemption, other) on feedback form | V-07; client §7.4 pt 3 | Phase 2 | Current form: rating + free text + is_complaint flag only. Client's category list becomes the build spec. |
| B-13 | Beneficiary-facing redirection to nearby open Food Partners on capacity/closure block | V-08; client §7.2 pt 5 | Phase 2 | Hard-block is functionally correct today; redirection is the client-requested enhancement. |
| B-14 | Optional reason field on system-config change audit (incl. feature toggles & emergency toggle) | V-09/V-12; client §9.1 pt 6, §9.6 pt 8, §9.7 pt 8 | Pre-go-live | Client asked for reason capture on significant config changes repeatedly; currently absent. |
| B-15 | Extend city-lock enforcement to beneficiary/vendor/volunteer registration flows | V-13 | Pre-go-live | Today only redemption is gated — out-of-city registrations succeed and then fail at meal time. |
| B-16 | 80G certificate generation end-to-end (incl. donor details, txn ref, Foundation 80G registration, unique cert number, permanent record) | V-15/V-16; client §9.8 pt 2 | Phase 2 — after client supplies 80G registration + CA-approved format; toggle stays OFF meanwhile | Supersedes/absorbs B-05. Also blocked on PDF/email provider. |
| B-17 | CSR allocation/impact linkage (which beneficiaries benefited from CSR donations) + per-transaction detail | V-16; client §9.8 pt 3 | Phase 2 | Chain today stops at aggregate report; file_url always null. |
| B-18 | Wire `special_care_multiplier` into token value logic (or remove key pending client decision) | V-17 | Pre-go-live decision needed | Dead config: documented as controlling special-care token value, seeded '2', never read by any minting/redemption code. Guide must NOT describe it as working; client to confirm intended behaviour. |
| B-19 | Per-override detail in emergency auto-revert audit (currently aggregate count only) | V-12 | Phase 2 | Aggregate log adequate for now. |
| B-20 | Align client-side CO_PAY_MAX (hardcoded ₹5 in vendor scan UI) with server-side `co_contribution_max` | V-01 | Pre-go-live | Required before ₹10 policy can operate — otherwise vendor UI blocks at ₹5 regardless of config. |
| B-21 | UTR verification against bank/PSP feed (currently donor-self-asserted; fabricated UTR can mint pool credit) | V-06 code comment | With live payment gateway integration | Distinct from duplicate detection (which exists). Should ride the gateway integration workstream already pending with the accounts team. |
| B-22 | Beneficiary category exposure in donor notifications — review/remove per privacy stance | V-20; VERIFICATION-REPORT.md #7 | Pre-go-live decision | Donor notifications currently include `beneficiary_category`; client's privacy position (§9.9 pt 9, §8.3) suggests this should not be donor-visible. Confirm with client. |

## 4. PHASE 2 BACKLOG (client-labelled future vision)

1. Volunteer distribution-record enrichment (date, value, location, redemption/expiry status) — §6.3 pt 5
2. Smart Distribution (nearby vendors/beneficiaries, priority categories, demand areas) — §6.3 pt 9
3. Volunteer Field Activity Dashboard — §6.3 addendum
4. Additional beneficiary categories (Children, Elderly, Lactating Mothers, General) — §7.1 / 4 Aug reply
5. Aadhaar/biometric verification (legal compliance permitting) — §7.1 pt 5
6. Vendor-unavailable redirection for beneficiaries — §7.2 pt 5 (if V-08 shows absent)
7. Event QR codes; festival/corporate/community campaigns — §8.1 pt 5
8. Occasion-based & recurring giving (birthday, memorial, monthly) — §10.1 Q32, §10.2 Q15–16
9. Transparency dashboard expansion (monthly trends, volunteers, cities, CSR, impact metrics) — §8.3 pt 6
10. Risk-based settlement audit selection (system-assisted) — §9.4 pt 2
11. System-enforced maker-checker on settlements — §9.4 pt 4 / §10.4 pt 6
12. Vendor graduated-discipline workflow automation (warnings, penalties) — §9.3 pt 1
13. Volunteer zones aligned to geographic hierarchy — §9.8 pts 4–5
14. Tiered Food Partner categories (restaurants, canteens, community kitchens, carts, street food) — 4 Aug reply §7
15. AI-assisted duplicate-registration detection — 4 Aug reply §8
16. SLA tracking/alerting in system — 4 Aug reply §4
17. App UI terminology standardisation (Food Partner, General Donation Pool) — 4 Aug reply §§1–2
18. Simplified Public User Guide — 5 Aug reply §1
19. Post-emergency reconciliation report — §9.5 pt 10

## 5. VERIFY-AGAINST-CODE CHECKLIST — ✅ COMPLETED 11 Aug 2026

**See `VERIFICATION-REPORT-2.md` for full findings and citations.** Verdicts: CONFIRMED — V-02, V-03, V-04, V-06, V-08, V-09, V-10, V-11, V-12, V-14, V-18, V-19, V-20, V-21, V-22 (all 11 FAQ claims). DIFFERENT — V-01 (no code ceiling on co-pay; UI hardcodes ₹5), V-07 (no complaint categories; binary flag only), V-13 (city lock gates redemption only), V-16 (CSR chain partial), V-17 (**`special_care_multiplier` is a dead key — never applied**). ABSENT — V-05 (no guest contact capture), V-15 (no 80G generation at all). Absent/different findings converted to build items B-10…B-22 above. Additionally: 10 existing-but-undocumented features identified (report §4) — all become v1.1 documentation additions: token revalidation, vendor inspection workflow, settlement audit queue, emergency override system (time-boxed overrides with auto-revert), lost-token compensating rollback, donor-initiated lost-token report, payer_vpa capture, admin vendor-capacity monitor, scheduled redemption reminders, vendor quality-score formula.

| ID | Check | Source |
|---|---|---|
| V-01 | Can `co_contribution_max` be set to 10? Is the ₹0–5 range code-enforced or guide-only? Is co-pay recorded per redemption? | CR-01 |
| V-02 | Nearby-vendor list generation: GPS vs locality selection; fields shown (open/closed, meal sessions, distance, contact) | §7.2 |
| V-03 | Redemption exception behaviour: expired token, already-redeemed, failed face verification, network interruption, capacity reached | §7.3 pt 6 |
| V-04 | Face verification storage: hash-only claim (no original photo retained) | §7.3 pt 2, §10.1 Q24 |
| V-05 | Guest/public donation form: is a mobile number captured? Any notification hooks? | §8.1 pt 7 |
| V-06 | UTR handling: automated verification vs manual reconciliation; behaviour on failure/incorrect/pending/duplicate UTR | §8.2 pts 2, 6 |
| V-07 | Complaint form: are complaint categories implemented? | §7.4 pt 3 |
| V-08 | Vendor-unavailable/capacity-reached: is any beneficiary redirection implemented? Temporary-closure control? | §7.2 pt 5, §10.3 Q14 |
| V-09 | System-config changes: written to audit log? Previous/new value captured? | §9.1 pt 6, §9.6 pt 8, §9.7 pt 8, §9.8 pt 6 |
| V-10 | `vendor_inspection_fail_penalty`: actual behaviour of this string setting | §9.3 pt 6 |
| V-11 | Settlement hold: reason + responsible person captured? Full settlement action trail (generated/reconciled/held/paid, who, when)? | §9.4 pts 5–6 |
| V-12 | Emergency Mode toggle: what is logged on activation/deactivation? Reason captured? | §9.5 pt 4.2 |
| V-13 | City lock enforcement scope: which flows are actually gated (registration, onboarding, redemption, volunteer activity)? | §9.6 pt 2 |
| V-14 | Duplicate-proof phash: flag-for-review or auto-reject? Audit log truly append-only? Audit-log view permission separable from config rights (Compliance Officer role scope)? | §9.7 pts 2, 6–7 |
| V-15 | 80G certificate generation: fields actually included vs CAND-02 required list; permanent record kept? | §9.8 pt 2 |
| V-16 | CSR module: org→donation→transaction→allocation→certificate/report linkage | §9.8 pt 3 |
| V-17 | Special-care approvals: what is recorded (category, basis, approval date, period, extensions, administrator)? | §9.9 pt 8 |
| V-18 | Token cancellation: any donor-side cancel? Admin revoke effect on value | §10.2 pt 6 |
| V-19 | Lost-token replacement: value carry-over mechanics | §10.1 Q11, §10.2 pt 7 |
| V-20 | Redemption notification contents (vendor name, meal, date/time, value, thank-you) | §10.2 pt 8 |
| V-21 | Forfeited/expired value: exact current financial treatment in code & analytics (baseline for CR-03) | 4 Aug reply §2 |
| V-22 | Every §10.1/10.2/10.3 drafted FAQ answer asserting system behaviour: confirm against implementation before adoption | §10.1–10.3 closing notes |

## 6. OPEN QUESTIONS FOR SECOND DECISIONS LETTER — ✅ ANSWERED 14–16 Aug 2026

**The decisions email was sent 11 Aug; the client replied in 11 topic-wise emails (14–16 Aug). All 12 items are resolved — see PART 2 below for the full decisions log, the B-01/B-02 rescopes, and new build items B-23–B-32.** Items 3 (discipline ladder), 11 (80G) and 12 (§3.13) received no dedicated reply email — treated as accepted-as-proposed, to be closed explicitly in JICATE's confirmation reply. The original questions are retained below for the record.

1. **₹10 contribution — one confirming question.** 4 Aug reply framed it as a future policy proposal ("evaluate alternative operational models"); 6–11 Aug section emails state it as present operating policy to document. Propose: v1.1 documents the policy (vendor collects, remits to Administration Account, waivable, Food Partner receives full meal value); Phase 1 operates it manually (subject to V-01); Phase 2 CR for enforcement/remittance tracking. Ask him to confirm this framing.
2. **Geographic hierarchy scoping (CR-02).** Offer the split: structured address fields in Phase 1 before pilot data accumulates vs. full deferral to Phase 2.
3. **Graduated Food Partner discipline ladder** — formal adoption of his own §9.3 proposal (operational, auto-suspend stays OFF).
4. **Maker-checker settlement flow** — formal adoption as operational procedure (Prepared → Reconciled → Approved → Paid).
5. **`settlement_random_audit_rate`** — percentage before go-live.
6. **Emergency Mode values** — `emergency_max_meals_per_day`, `emergency_meal_cooldown_hours`, `emergency_mode_max_duration_days` (all currently NULL = uncapped/never-revert).
7. **Emergency beneficiary-verification relaxation** — the guide's existing "pending client decision" item; §9.5 pt 8 is the prompt to close it.
8. **Special Care values** — multiplier, qualifying categories, `special_care_post_delivery_months`, `patient_eligibility_months`, evidence requirements (with professional advice).
9. **Exceptional field-distribution procedure** — volunteer handling when beneficiary has no phone / no connectivity / urgent need (§6.3 pt 8): propose a procedure for his approval.
10. **§3.13** — confirm whether review comments are coming, or whether §9 + §10.4 comments may be treated as covering it.
11. **80G activation precondition** — acknowledge CA sign-off rests with the Foundation; confirm the toggle stays OFF until then.

## 7. CLIENT ACTION ITEMS (Foundation-authored artifacts)

1. pApAmA Standard Meal Framework (scope confirmed in 4 Aug reply §5)
2. Special Care Meal Framework (§9.9 pt 7)
3. Food Partner eligibility & selection criteria policy
4. Complaint categories, escalation procedures & response timelines policy
5. Institution eligibility, responsibilities & accountability framework
6. CA-approved 80G certificate format & eligibility rules (before CAND-02 toggle activation)

## 8. DOCUMENTATION-ONLY ITEMS FOR v1.1 REWRITE (by section)

Global: rename to Technical Administration Guide v1.1 · "Food Partner" terminology (with UI note) · "General Donation Pool" (with UI note) · four implemented beneficiary categories + future list · humanitarian framing woven through per client's recurring request · per-setting NULL semantics with Mandatory/Optional/NULL-permitted/Recommended classification in §9 · Pre-Go-Live Configuration Checklist as new section (per §10.4 pt 1, including business-config vs environment-variable distinction for UPI VPA) · SLAs documented as configurable operational parameters.

- **§6.3:** purpose framing; dignity & conduct guidance; responsible distribution (no formal eligibility assessment); token status lifecycle explanation; registration assistance scope (data entry only, Foundation approves); display/share/print accessibility; humanitarian tone.
- **§7.1:** registration philosophy; optional documents, none mandatory; volunteer-assist scope; approval workflow diagram; privacy statement.
- **§7.2:** purpose; accessibility (volunteer-directed access); location mechanism & displayed fields per V-02.
- **§7.3:** purpose of redemption controls; face-verification privacy (per V-04); meal-limit rationale; exception behaviours per V-03; dignity; ₹10 policy text per CR-01 framing once confirmed.
- **§7.4:** feedback purpose; confidentiality; complaint handling process; link to Food Partner performance; assisted feedback; continuous improvement.
- **§8.1:** General Donation Pool terminology & explanation; purpose; governance/audit statement; pool→tokens→distribution flow; audit parity; acknowledgement flow as future-state policy (per V-05); humanitarian framing.
- **§8.2:** purpose; UTR definition & reconciliation role (per V-06); financial governance principles; exception handling per V-06; communication lifecycle as future-state.
- **§8.3:** dashboard purpose; aggregates-only & privacy statements; verified-records data source; toggle as communication-policy control.
- **§9.1:** business impact per key; expiry implications aligned to CR-03 policy; holding-limit rationale; revalidation as exceptional & audited; config governance; change-control practice.
- **§9.2:** rationale per setting; implemented special-care categories only; ₹10 text per CR-01; radius flexibility via config note; governance.
- **§9.3:** graduated discipline ladder as operational policy (pending item 6.3 confirmation); ratios-in-context; rating as one signal; feedback-count rationale; capacity rationale; inspection philosophy; V-10 outcome.
- **§9.4:** audit purpose list; risk-based selection as documented practice; mandatory reconciliation chain (incl. beneficiary contribution once CR-01 confirmed); maker-checker as operational procedure; hold discipline; audit-trail description per V-11.
- **§9.5:** purpose scenarios; flexibility-not-unlimited principle; recommended non-NULL values (per item 6.6); governance roles as operational procedure; time-bound operation; safeguards; emergency token traceability; verification relaxation per item 6.7; emergency Food Partner mobilisation principles; post-emergency review procedure; Normal/Emergency/Financial-governance distinction.
- **§9.6:** city-lock purpose & enforcement scope per V-13; operating-city standardisation; city-lock vs redemption-radius distinction; location-change governance; emergency-exception principle; multi-city readiness statement aligned to CR-02 outcome.
- **§9.7:** phash explanation; flag-not-proof principle; combined fraud signals; operational-vs-financial record distinction; permanent-retention policy statement; immutability; restricted access per V-14.
- **§9.8:** governance conditions per toggle; transparency pre-activation checks; 80G preconditions (CA sign-off, CAND-02); volunteer zones note; OFF-by-default explanation; toggle audit per V-09.
- **§9.9:** technical-config vs Foundation-policy vs professional-guidance distinction; multiplier ≠ cash; need-based principle; implemented categories (Pregnant Women, Patients, PwD, Disaster-Affected); consistency with §9.2; Meal Framework references; approval auditability per V-17; privacy from Food Partners/volunteers/public.
- **§10.1:** adopt client's 39-question draft subject to V-22 verification and policy alignment (Q12/13 → CR-03 policy; Q14–16 → CR-01 text; Q17 → Meal Framework reference; Q32/Q38 marked per implementation status).
- **§10.2:** adopt 20-question draft with his refined refund wording; credit-never-expires answer; Path A transferability caution; privacy-preserving impact answers; V-18/19/20 alignment; occasion-giving marked future.
- **§10.3:** adopt 28-question draft; full-meal-value + separate-₹10 principles per CR-01; graduated-discipline answer; V-08 alignment on closure/capacity; settlement-status meanings; exception procedure.
- **§10.4:** Pre-Go-Live checklist (promoted to its own section, cross-referenced); per-setting NULL table; strengthened settlement-finality wording; pre-payment reconciliation discipline; maker-checker per item 6.4.

## 9. SEQUENCE FROM HERE

1. Run **Claude Code verification prompt** (V-01 … V-22) → VERIFICATION-REPORT-2.md
2. Send **second decisions letter** (items in §6, informed by V-01 at minimum)
3. On client reply: run **full-guide v1.1 rewrite prompt** (Sections 1–10, incorporating §2 decisions, §8 items, verification findings, letter answers)
4. Developer review & deploy any Phase 1 code items approved (CAND-01, CAND-03, CR-01 Phase 1 operational config, CR-02 Phase 1 fields if approved)

---
---

# PART 2 — CLIENT DECISIONS OF 14–16 AUG 2026 & EXPANDED BUILD REGISTER

**Source:** 11 topic-wise reply emails from Mr. Ramesh Bafna (14–16 Aug) answering the 12-item decisions email of 11 Aug. **Pattern across all replies:** every item agreed *with conditions*; basic system enforcement pulled into Phase 1, automation depth deferred to Phase 2; client supplied verbatim v1.1 policy wording in nearly every email (adopt as drafted, corrected only against verified behaviour).

## 10. DECISIONS LOG (fills the rewrite prompt's twelve slots)

| # | Decision | Outcome |
|---|---|---|
| D-1 | ₹10 contribution | AGREED + expanded. Four principles for v1.1: (1) ₹10 is a beneficiary contribution **to pApAmA**, never Food Partner revenue; (2) Food Partner collects only as **authorised collection agent**; (3) **settlement release gated** on contribution received/reconciled-or-waived per redemption; (4) basic waiver recording + contribution reconciliation in Phase 1. Daily remittance cycle initially (configurable later). Config: approved value ₹10, hard max ₹10, changes need administrative approval. → B-01 rescope. |
| D-2 | Geography | AGREED "fields now" + moved masters/IDs/PIN-validation into Phase 1. State & District controlled masters (linked), City/Town/Village/Locality level, 6-digit PIN validation, location IDs not text, per-stakeholder strictness (Food Partner mandatory-full incl. registered-vs-operating address; volunteer structured; beneficiary lenient — never a barrier), **actual service location snapshot on every redemption**. Phase 2: postal master, PIN-to-location, dashboards, GIS. → B-02 rescope. |
| D-3 | Discipline ladder | No dedicated reply — accepted as proposed (his own §9.3 ladder; auto-suspend OFF). Close explicitly in confirmation reply. |
| D-4 | Maker-checker | AGREED + 18 requirements incl. Phase 1 system enforcement and a **live demonstration before sign-off** (10-step happy path + 5 failure scenarios). Status names may be retained if pre- vs post-payment reconciliation distinction is documented. → B-24. |
| D-5 | Audit rate | 10% CONFIRMED — of eligible settlement **batches** per cycle, minimum one per cycle; "baseline, not the ceiling"; system-generated tamper-proof selection; risk-based + exception audits supplement; policy paragraph supplied verbatim. → B-25. |
| D-6 | Emergency values | **4 meals/day, 3-hour cooldown, 7-day max**, auto-revert, configurable within approved limits; extension = explicit admin action + reason + revised end date. |
| D-7 | Emergency verification | AGREED with his framework: relaxed-not-eliminated (token controls always apply); photograph-vs-biometric wording correction; no facial recognition introduced into the emergency process; automatic ₹10 waiver during emergencies (Food Partner always receives full meal value); transaction tagging; risk-based post-emergency review queue; policy wording supplied verbatim. → B-27. |
| D-8 | Special Care | REDESIGNED (not parameterised): ₹100 fixed-face Special Care Token + separate donor category ("Sponsor a Special Care Token – ₹100"); multiplier **never** wired to value — internal analysis parameter only (~1.5–2×) → B-18 resolved; **Common Special Care Pool** with separate ledger and automatic surplus routing (₹100 − meal value → pool; no refunds; pool exclusively Special Care); configurable **category master** (initial: Pregnant Women, Postpartum/Lactating Mothers, Medically Vulnerable/Patients — Postpartum is NEW vs current enum); eligibility: pregnancy-until-delivery (record EDD), postpartum 6 months from delivery date, patients per-record professionally-determined review dates + reminders (`patient_eligibility_months` deprecated); Food Partner sees "SPECIAL CARE TOKEN – ₹100", never diagnosis; Special Care × Emergency never multiply. Policy wording supplied verbatim. → B-28. |
| D-9 | Volunteer procedure | AGREED direction; his **7-situation decision tree** + pt-21 wording replace our draft. Five Phase 1 essentials: printed-QR support; **controlled offline emergency transactions** (reverses our deferral); ₹10 waiver inside offline transactions; procedure for no-phone-no-token persons; strict prohibition on volunteers creating/altering entitlement. Plus volunteer safety + minimal-records SOP text. → B-30, B-31. |
| D-10 | Privacy | CONFIRMED removal + expanded to a platform-wide **Beneficiary Privacy & Donor Communication Rule**: "data available to the system ≠ data available to the donor"; notification whitelist filter; need-to-know role access; sensitive-access/export audit; aggregate impact reporting; verbatim templates for all three token types; redemption location communicated at **City + State** (actual service location, e.g. "Mumbai, Maharashtra"), never exact addresses. → B-29 (absorbs B-22). |
| D-11 | 80G | No dedicated reply — accepted as proposed (toggle OFF until 80G registration number + CA sign-off). Close explicitly in confirmation reply. |
| D-12 | §3.13 | No dedicated reply — rewrite §3.13 applying his §9/§10.4 comments per the prompt fallback. Close explicitly in confirmation reply. |

**Plus one unrequested architectural addition (final email):** the **Token Distribution Model** — see B-32.

## 11. RESCOPED & NEW BUILD ITEMS (B-01/B-02 revised; B-23–B-32 added)

| ID | Title | Phase 1 scope | Notes / interlocks |
|---|---|---|---|
| B-01 (rescoped) | ₹10 contribution system | (a) contribution status per redemption (collected/waived/outstanding); (b) waiver record with his minimum field list; (c) remittance & reconciliation records, daily cycle; (d) **settlement-release gate** on reconciliation-or-waiver; (e) contribution report (expected/collected/remitted/received/outstanding/waived/settled) | (d) touches settlement logic — most financially sensitive change; feeds B-24(h) and B-25 checks |
| B-02 (rescoped) | Location architecture | State/District masters (linked), City/Town/Village/Locality, PIN + 6-digit validation, location IDs, per-stakeholder requirement levels, registered-vs-operating Food Partner address, service-location snapshot per redemption | Schema — land before pilot data; feeds B-23 geo checks, B-26 scoping, B-29/B-32 City+State notifications |
| B-23 | Token model | PAN INDIA default; donor-selected geo restriction (State/District/City/PIN) as token attribute checked at redemption against **service location**; token face: type, value, geo eligibility, activation + expiry dates (physical + digital); 60-day validity from activation (`token_expiry_days=60`); **per-mode activation date (confirmed 18 Aug): Donor Controlled = creation, PAPAMA Distributed = distribution event**; **controlled admin reissue** — new token, new QR, linked via reference, original permanently expired; **revalidation retirement confirmed 18 Aug** — expired = permanently non-redeemable | Reuses lost-token replacement pattern; implements B-03 expired-value-return; city lock = pilot-phase control superseded by token-level restriction (revisit B-15) |
| B-24 | Maker-checker enforcement | (a) maker ≠ checker system-blocked per settlement; (b) true locking + versioning (reopen → amend → new version → re-lock); (c) approval auto-invalidation on material change; (d) reject/return-to-maker with mandatory reason; (e) maker cannot release own material hold; (f) **bank-account change four-eyes control** + effective date (verify whether bank details are stored at all); (g) checker evidence drill-down; (h) three-way reconciliation view incl. ₹10 figures; (i) maker-checker on adjustments/reversals (extends B-07) | Keep existing 5 status names + documented mapping to his 8 logical stages (propose in reply); **live demo required before sign-off** — first mandated UAT script |
| B-25 | Risk-based audit framework | (a) tamper-proof system selection + selection record + min-1 rule; (b) 14-field permanent audit record with Critical/Major/Minor severity linked to discipline ladder; (c) exception auto-flag queue (adjustments, reissues, reversals, bank changes, unusual waivers, fraud-linked); (d) targeted-audit addition; (e) basic Food Partner risk status (composite rating Phase 2) | Extends existing settlement audit queue; exception engine shared with B-27(d)/B-30 |
| B-26 | Emergency Response Framework | (a) Emergency event entity (Emergency ID, reason, geographic scope, period, activator, estimates); mandatory reason on extension; (b) Emergency Appeal workflow (approved templates → admin approval → dispatch; pre-approved instant template with post-send review); (c) channels: in-app + email Phase 1 (official account dependency), SMS/WhatsApp Phase 2 (DLT registration, WhatsApp Business API — external lead times); **(c′) channel-extensibility requirement (confirmed 18 Aug): Phase 1 architecture must support Phase 2 channels without fundamental redesign**; (d) Emergency-ID tagging of donations & tokens (ride `campaign_id` pattern); (e) closure reconciliation + surplus resolution records | Surplus hierarchy: specific emergency → same-area continuing needs → PAPAMA Emergency Response Fund; **no refunds**; disclosure at contribution time; geographic scoping basic P1 / fine-grained P2 (depends B-02); values: 4/3h/7d |
| B-27 | Emergency verification & waiver | (a) face-verification skip path during active emergency, recorded with level (Standard/Enhanced/Referred); (b) automatic ₹10 waiver rule tied to emergency state + scope — system-indicated, never Food-Partner- or volunteer-discretionary; Food Partner always receives full meal value; (c) transaction tagging (Emergency Mode=YES, Emergency ID, Waiver=YES + field list); (d) post-emergency review queue = B-25(c) engine filtered by Emergency ID | Reply clarification: no photograph is ever stored in any mode (embeddings only) — stronger than his ask; normal-mode face verification unchanged |
| B-28 | Special Care programme | (a) SPECIAL_CARE token type, ₹100 fixed face value; (b) donor sponsorship flow + donor category; (c) Common Special Care Pool + separate ledger + automatic surplus routing (B-03 principle by token type); (d) configurable category master + migration from enum (distinguish beneficiary categories vs Special Care categories in v1.1); (e) eligibility model: EDD/delivery-date/review-date logic + reminders (reuse scheduled-reminders infra); (f) vendor-facing display: token type + value only | Schema items (c)(d) land before pilot data; `special_care_multiplier` reclassified internal-analysis-only; `patient_eligibility_months` deprecated |
| B-29 | Privacy framework (absorbs B-22) | (a) notification engine whitelist filter (sensitive fields structurally unreachable) + his verbatim templates for all 3 token types incl. redemption City + State; (b) need-to-know role access (Food Partner / volunteer / ops / finance / senior) — verify current vendor/volunteer screens; (c) export logging Phase 1, full sensitive-read audit Phase 2; (d) aggregate impact reporting (rides B-17, Phase 2 depth) | Cross-cutting: governs B-26 appeal content, B-28(f), B-17 CSR reports, all exports/receipts/dashboards |
| B-30 | Controlled offline emergency transactions | **Phase 1 essential per client (reversed our deferral); emergency-only** — no offline path in normal operations. Offline txn record (his 11-field list incl. waiver status + **transaction source** field — confirmed 18 Aug); sync → full normal validation ("Pending Offline Validation"); expiry/geo/status never bypassed; controls: max pending per volunteer/device, max sync window, alerts, cross-batch duplicate detection, exception-queue routing, admin visibility of unsynced. **Two capture routes confirmed 18 Aug: Food Partner screen (primary) + Volunteer App (secondary); mandatory source identification per transaction for separate post-emergency review** | Heaviest single build (no service worker exists today) — **design-first milestone**; recording-device question answered 18 Aug |
| B-31 | Volunteer incident reporting | 11 one-tap report categories in volunteer app → admin queue; assistance-request mechanism for no-token cases folds in | Small, high field value |
| B-32 | Token distribution model | (a) explicit `distribution_mode` at creation (PAPAMA Distributed / Donor Controlled — formalises Path B/A); (b) **FIFO allocation** for pool tokens incl. Special Care distribution pool (donor-controlled tokens never enter FIFO — already structurally true); (c) City + State in redemption notifications (depends B-02); (d) donor notification preference field; (e) status vocabulary mapping doc (+ Reissued status via B-23); "Expired – Not Redeemed" display; his pt-12 token master field list as schema checklist | Distribution authority independent of geographic scope; Common Special Care Pool (money) ≠ distribution pool (tokens) — document distinction |

## 12. DESIGN QUESTIONS FOR JICATE'S CONFIRMATION REPLY — ✅ ALL ANSWERED 18 Aug 2026

1. **Activation date definition** — ANSWERED 18 Aug: Donor Controlled = creation date; PAPAMA Distributed = date of actual distribution/assignment to beneficiary (overrides JICATE recommendation of creation date). Undistributed tokens past expiry → controlled reissue.
2. **Offline recording device** — ANSWERED 18 Aug: BOTH routes — Food Partner redemption screen (primary) + Volunteer App (secondary). Mandatory source field. Separate post-emergency review by source.
3. **Status-name retention** — CONFIRMED 18 Aug: existing names retained with documented mapping; approval and payment remain separate recorded events; pre-payment vs post-payment reconciliation clearly identifiable.
4. **Revalidation retirement** — CONFIRMED 18 Aug: expired → permanently non-redeemable → authorised reissue only.
5. **D-3, D-11, D-12** — all CONFIRMED 18 Aug as documented. Items (a) graduated corrective action, (b) 80G preconditions, (c) §3.13 rewrite approach: all confirmed. Emergency Appeal split confirmed with channel-extensibility requirement (Phase 1 architecture must support Phase 2 SMS/WhatsApp without fundamental redesign). Maker-checker demonstration date to be proposed by JICATE. Foundation-documents timeline received (see Client Decisions file).

## 13. REVISED SEQUENCE

1. ✅ All 11 replies triaged (17 Aug)
2. Register updated (this document) → commit to repo `docs/`
3. **JICATE confirmation reply** to client — confirms all models, answers his "please confirm" asks, poses §12 design questions, closes D-3/D-11/D-12, proposes demo date
4. Fill all 12 decision slots in `pApAmA-v1.1-Rewrite-Prompt.md` → run in Claude Code → v1.1 + changelog
5. Reshaped **Developer Work Order**: schema-first lane (B-02, B-23, B-28c/d, B-32a — before pilot data), financial-controls lane (B-01, B-24, B-25), emergency lane (B-26, B-27, B-30 design-first, B-31), privacy lane (B-29), carried-over quick fixes (B-06, B-10, B-14, B-15※, B-20; ※B-15 revisit against PAN INDIA model)
6. Build prompts per lane → GitHub → developer review; maker-checker UAT script authored alongside B-24
