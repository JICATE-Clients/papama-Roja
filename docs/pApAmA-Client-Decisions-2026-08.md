# pApAmA — Client Decisions, August 2026

**Status:** Agreed requirements for Version 1.1 and Phase 1 system logic.
**Sources:** Client (Mr. Ramesh Bafna, Papama Trust) replies of 4–5 Aug and 14–16 Aug 2026 to JICATE's decisions letters. JICATE consolidated confirmation reply drafted 17 Aug.
**How to use:** The rewrite prompt (`pApAmA-v1.1-Rewrite-Prompt.md`) treats this file as the authoritative answer to every `[DECISION-n]` slot. Text inside blockquotes is the client's **verbatim policy wording** and is to be adopted in v1.1 substantially as drafted, corrected only where it conflicts with code-verified behaviour (in which case describe the approved policy and mark unbuilt behaviour `> **Planned (B-nn)**`).
**Pending sub-points:** ~~Four design questions and the Emergency Appeal Phase 1/2 split await client confirmation (JICATE reply of 17 Aug). Fallbacks are noted per decision; none blocks the rewrite.~~ **ALL CONFIRMED 18 Aug 2026** — see per-decision notes below and the Foundation-documents timeline at the end of this file.

---

## D-1 — Beneficiary Contribution (₹10)

**Outcome:** Approved with expansions. ₹10 configurable policy; hard ceiling ₹10; changes require administrative approval. Phase 1 system scope: contribution status per redemption, basic waiver recording, daily remittance/reconciliation records, settlement-release gate, contribution report (B-01).

**Client's four principles (verbatim, 14 Aug):**
> 1. ₹10 is a beneficiary contribution to pApAmA and is not Food Partner revenue.
> 2. The Food Partner may collect the ₹10 only as an authorised collection agent of pApAmA.
> 3. The Food Partner's meal settlement should be released only after the ₹10 contribution has been received/reconciled, except where an authorised humanitarian waiver has been recorded.
> 4. Basic waiver recording and contribution reconciliation/auditability should be available in Phase 1, even if the more comprehensive automation is taken up in Phase 2.

**Transaction logic for v1.1 (client's §8, adopt as flows):**
Standard: token presented → validated → ₹10 collected → recorded against redemption → meal served → ₹10 remitted to pApAmA Administration Account → receipt/reconciliation recorded → settlement eligible for release.
Waiver: token presented → beneficiary unable to contribute → authorised waiver applied → recorded against redemption → meal served → settlement proceeds without the ₹10 requirement.

**Worked example (client's):** approved meal ₹50 → ₹50 payable to Food Partner via settlement; ₹10 payable to pApAmA, credited to the Administration Account; the two remain completely separate.

**Waiver record minimum fields:** transaction reference, Food Partner, date/time, meal value, contribution applicable, collected?, waived?, authorising person, reason/category, settlement status.
**Remittance cycle:** daily initially, configurable later. **Report:** expected / collected / remitted / received & reconciled / outstanding / waived / finally settled.

---

## D-2 — Geographic Structure

**Outcome:** "Fields now" agreed; masters, IDs and basic PIN validation moved INTO Phase 1 (B-02).

**Phase 1 (client's consolidated list):** State master; District master linked to State; City/Town/Village/Locality level; PIN Code with six-digit numeric validation; unique location IDs (not free text); full address where appropriate; structured location for Food Partners (mandatory, incl. registered vs operating/service address maintained separately), Volunteers (structured), Beneficiaries (lenient — "we should be careful not to make location or address requirements so stringent that they become a barrier to receiving a meal"); **actual Food Partner/service location captured against every redemption transaction** (historical accuracy if a partner later moves).

**Phase 2:** complete India postal master, advanced PIN-to-location validation, State/District/City dashboards, GIS/maps, heat maps, demand analysis, expansion analytics.

---

## D-3 — Food Partner Graduated Corrective Action

**Outcome:** Accepted as proposed (no dedicated reply; client's own §9.3 framework; referenced as settled in his audit email). Ladder: warning → final warning → penalty/enhanced monitoring → suspension; immediate suspension reserved for food-safety hazards, fraud, or risk to beneficiaries. `vendor_auto_suspend_enabled` remains OFF; the ladder governs operationally. Audit finding severities (D-5) link to this framework. **CONFIRMED 18 Aug** as documented.

---

## D-2A — Token Model & QR Controls (client addition within the geography reply)

**Outcome:** New token model agreed for Phase 1 (B-23).

**Client's principles (verbatim, 14 Aug):**
> A pApAmA token is PAN INDIA by default and may be redeemed at any authorised pApAmA Food Partner anywhere in India. The beneficiary's location does not determine the redemption location. Only a geographic restriction specifically selected by the donor should restrict the token's redemption area.

> Every token shall have a 60-day validity period from its activation date. The activation date and expiry date shall be clearly printed on physical tokens and displayed on digital tokens. After expiry, an unused token shall automatically become invalid and may be considered for controlled reissue by an authorised pApAmA administrator, with the original and reissued tokens permanently linked for audit purposes.

**Specifics:** donor-selected restriction options PAN INDIA / State / District / City / PIN, stored as token attributes, checked automatically at redemption against the **actual service location**; token face shows value, token type, geographic eligibility, activation date, expiry date (client supplied example layouts); QR carries the token ID only — backend is final authority; reissue = admin review → approval with reason → NEW token (new ID, QR, dates) linked via reference to the original, which remains permanently expired.
**Consequences:** `token_expiry_days = 60`; existing revalidation feature **retired — CONFIRMED 18 Aug** (Question 3) — expired tokens are permanently non-redeemable, authorised reissue only; reissue implements the 4-Aug decision that expired value returns to the Meal Pool (B-03).
**CONFIRMED (18 Aug — Question 1):** Donor Controlled tokens — 60-day validity from creation/issue to the donor (as recommended). PAPAMA Distributed tokens — 60-day validity commences from the date the token is actually distributed/assigned to the beneficiary (NOT creation; overrides the recommended default). FIFO continues to govern pool allocation. A token that remains undistributed past its expiry period goes through the controlled reissue mechanism (new token, permanently linked, original QR permanently non-redeemable).

---

## D-4 — Settlement Maker-Checker

**Outcome:** Agreed with 18 controls, Phase 1 system enforcement (B-24), and a **live demonstration before final sign-off** (10-step happy path + 5 exception scenarios).

**Client's core principle (verbatim, 14 Aug):**
> No individual user shall have the ability to prepare, independently verify, approve and release the same Food Partner settlement. Any material change to a settlement after approval shall automatically invalidate the approval and require fresh maker-checker authorisation.

**Controls:** system-blocked maker/checker segregation; genuine locking with settlement versioning (reopen → amend → new version → re-lock → fresh approval); approval auto-invalidation on material change; reject/return-to-maker with mandatory reason; maker cannot release own material hold (release recorded with person, time, reason, evidence); **Food Partner bank-account change control** — independent verification, authorised approval, effective date, full audit trail, and the account-changer cannot approve payment to the new account; checker drill-down evidence view; three-way reconciliation (platform transaction records / settlement claim / financial & contribution records) with the ₹10 figures visible (expected, received, waived, outstanding, final payable); approval and payment-release recorded as separate events; controlled emergency-payment process (no unrecorded override); individual user IDs throughout; no settlement deletion — original → reversal/correction → new record/version; maker-checker extended to adjustments, reversals, refunds, recoveries, manual credits/debits.
**Status names (Question 4):** JICATE proposes retaining existing names (pending → locked → approved → reconciled → paid + hold) with a documented mapping to the client's logical stages (PENDING / PREPARED / LOCKED / VERIFIED / APPROVED / PAYMENT INITIATED / PAID / RECONCILED), distinguishing pre-payment settlement reconciliation from post-payment bank reconciliation. Client's email permits this expressly.

---

## D-5 — Settlement Random Audit

**Outcome:** 10% confirmed as baseline within a risk-based framework (B-25). Key principle: **"10% random audit is the baseline, not the ceiling."**

**Client's policy paragraph (verbatim, 15 Aug):**
> "An initial random audit rate of 10% of eligible Food Partner settlement batches shall apply during the Coimbatore pilot, subject to a minimum of one settlement per audit cycle. The system shall select the sample randomly and maintain an auditable record of the selection. Random sampling shall be supplemented by risk-based and exception-based audits. Settlements or Food Partners exhibiting defined risk indicators, material discrepancies, prior audit findings, unusual transaction patterns or compliance concerns may be subjected to enhanced or 100% review. The audit rate shall be reviewed periodically based on transaction volume, audit findings, risk indicators and operational experience, with any change requiring authorised approval."

**Specifics:** audit unit = Food Partner settlement batch; within a selected batch, transaction sampling with 100% review of flagged items; system-generated selection with permanent record (cycle, population, sample size, IDs, timestamp, assignment, result) — selected settlements cannot be removed; three tiers (normal 10% / high-risk enhanced / critical 100%); exception queue for inherently risky transactions (manual adjustments, token reissues, reversals, refunds, manual entries, bank-account changes, unusual waivers, fraud-linked); findings graded Critical / Major / Minor, linked to the D-3 corrective-action framework; audit verifies the full chain (token → Food Partner → contribution/waiver → settlement → payment); ₹10 contribution reconciliation receives special attention; basic Food Partner risk status (LOW/NORMAL/MEDIUM/HIGH) with composite rating maturing in Phase 2; audit independence supported architecturally (pilot staffing limits accepted); 14-field permanent audit records, never deleted; permanent rate reductions only after review with the accounting/audit advisor.

---

## D-6 — Emergency Mode, Emergency Appeal & Surplus

**Outcome:** Values confirmed — **4 meals/day, 3-hour cooldown, 7-day maximum**, configurable within approved limits; full Emergency Response Framework agreed (B-26).

**Client's policy statement (verbatim, 15 Aug):**
> "Emergency Mode is a temporary, authorised operating mode activated by PAPAMA Administration in response to an approved humanitarian emergency. During Emergency Mode, the configured meal-frequency and cooldown parameters may be increased within approved limits for the defined emergency scope. The initial Phase 1 parameters shall be a maximum of 4 meals per day, a 3-hour cooldown and a maximum duration of 7 days, with automatic reversion to normal operating parameters upon expiry.
>
> Activation of Emergency Mode may also initiate an approved Emergency Appeal to eligible PAPAMA donors and CSR supporters through authorised email, SMS/message and WhatsApp communication channels. All emergency donations and related tokens shall be linked to a unique Emergency ID for accounting, monitoring and reporting.
>
> Any surplus funds or unused token value remaining after the specific emergency requirements have been adequately met shall not be subject to a normal donor refund or return process. The surplus shall first be considered for other genuine and continuing humanitarian needs in the affected area, with PAPAMA Administration determining the appropriate utilisation based on prevailing need and PAPAMA's mission and approved policies. Where no appropriate continuing need exists in the affected area, the surplus may be transferred to the PAPAMA Emergency Response Fund or another approved humanitarian purpose. All such utilisation shall be documented, accounted for and appropriately reported."

**Governance:** unique Emergency ID (e.g., TN-FLOOD-2026-001) with authorised activation, reason, geographic scope, beneficiary scope where applicable, period, complete audit trail; extension only by explicit authorised action + reason + revised end date; no indefinite Emergency Mode; activation restricted to authorised administrators. Emergency Mode never overrides: token expiry, donor geographic restriction, token validity/value, Food Partner suspension, food-safety/FSSAI/compliance holds, fraud blocks. Closure reconciliation (funds received/utilised/committed; tokens issued/redeemed/unused; surplus; utilisation decision; approver; closure date) as a permanent record; Emergency Impact Report for major/CSR donors. Unused emergency tokens: retained with full attributes, resolved through the controlled reissue process (new token linked to original). Surplus hierarchy: (1) the specific emergency → (2) continuing humanitarian needs in the same affected area → (3) PAPAMA Emergency Response Fund. **No donor refund mechanism**; policy disclosed at contribution time. Administration discretion within approved policy, documented.
**Emergency Appeal (CONFIRMED 18 Aug — Phase split + channel-extensibility):** Phase 1 — approved templates, authorised review/approval (incl. pre-approved instant template with post-send review), delivery via in-app + email (official account dependency), Emergency-ID donation tagging, basic individual/CSR segmentation. **Added requirement:** the Phase 1 appeal architecture must be designed so Phase 2 channels (SMS via DLT registration, WhatsApp via Business API) can be integrated later WITHOUT fundamental redesign. Phase 2 — SMS, WhatsApp, fine-grained segmentation, delivery analytics, CSR Emergency Impact Report. Communication preferences, consent, delivery status, opt-out maintained.

---

## D-7 — Emergency-Period Verification & ₹10 Waiver

**Outcome:** Agreed with the client's framework (B-27).

**Client's policy wording (verbatim, 15 Aug):**
> "During an authorised Emergency Mode, PAPAMA may relax beneficiary documentation and verification requirements to ensure that genuine beneficiaries are not denied emergency food assistance due to lack of documentation. The PAPAMA QR/token validity, expiry, geographic restrictions, Food Partner authorisation and other core transaction controls shall continue to apply. A beneficiary photograph may be captured where operationally feasible and appropriately consented, for transaction verification and post-emergency audit, but inability or refusal to provide a photograph shall not by itself prevent emergency meal access.
>
> During an authorised Emergency Mode, PAPAMA Administration may waive the ₹10 beneficiary contribution, either generally within the defined emergency scope or for specified emergency circumstances, based on prevailing humanitarian need. Where the contribution is waived, the Food Partner shall continue to receive the full approved meal value through the normal settlement process. Every waiver shall be recorded against the relevant redemption transaction and included in settlement and emergency reconciliation.
>
> All transactions processed under relaxed verification and all ₹10 waivers shall be tagged to the relevant Emergency ID and made available for post-emergency risk-based review and audit. Emergency Mode and any associated waiver shall automatically cease upon expiry unless expressly extended by an authorised administrator."

**Specifics:** minimum controls that always run (valid token, not already redeemed, within validity, authorised active Food Partner, geographic restriction, emergency meal limit, cooldown, date/time recorded); no Aadhaar dependency; verification levels — Level 1 Standard (valid token + basic controls), Level 2 Enhanced (photo/mobile/volunteer confirmation where feasible), Level 3 Exception/Investigation; waiver system-indicated per emergency scope, never Food-Partner or volunteer discretion; Emergency Mode = YES / Emergency ID / Emergency ₹10 Waiver = YES tagging with the client's field list; Post-Emergency Review Queue is risk-based (pattern-flagged transactions only; normal transactions covered by the regular random audit); no mandatory photo/biometric for children or vulnerable persons; data-collection minimisation, defined retention, Food Partners never retain beneficiary images.
**Documentation correction (v1.1):** the platform stores no photograph of any person in any mode — identity verification uses only an on-device-computed mathematical representation; no image is transmitted or retained. State this precisely wherever face verification is described. No facial-recognition expansion is introduced by the emergency process.

---

## D-8 — Special Care Programme

**Outcome:** REDESIGNED per client (B-28). Multiplier never wired to value — B-18 resolved as "internal analysis parameter only."

**Client's policy (verbatim, 15 Aug):**
> "PAPAMA shall maintain a separate Special Care donor category through which donors may sponsor Special Care Tokens at ₹100 per token. Each Special Care Token shall have a face value of ₹100 and shall be independently configurable from the standard PAPAMA meal token. An internal multiplier may be maintained for financial and policy analysis within an approved range of approximately 1.5× to 2× of the standard token value, but the donor-facing Special Care Token value shall remain ₹100 unless formally revised by PAPAMA.
>
> Where the approved value of the Special Care meal associated with a token is less than ₹100, the unused balance shall automatically be credited to the PAPAMA Common Special Care Pool. The pool shall be separately accounted for and shall be used exclusively for approved Special Care purposes. PAPAMA Administration may determine the utilisation of the accumulated pool based on prevailing humanitarian need and the approved Special Care policy. The surplus shall not ordinarily be transferred to the general PAPAMA fund or returned to the donor.
>
> All Special Care contributions, token utilisation, surplus generation, pool transfers and pool utilisation shall be separately recorded, auditable and appropriately reported."

**Specifics:** donor proposition "Sponsor a Special Care Token – ₹100"; token face shows Token Type: SPECIAL CARE + ₹100 + expiry etc.; Common Special Care Pool ledger (opening / donations / tokens issued / value utilised / surplus / additional contributions / utilisation / closing) fully separate from normal donation/settlement accounting; pool usable for additional Special Care meals, beneficiaries whose needs exceed ₹100, continuing needs, emergency Special Care requirements, other approved categories; **configurable Special Care Category Master** — initial categories: Pregnant Women, Postpartum/Lactating Mothers, Medically Vulnerable/Patients (Postpartum is new; v1.1 must distinguish beneficiary categories from Special Care categories); eligibility — pregnancy: from verified pregnancy until delivery, EDD recordable, no monthly re-verification; postpartum: **six months from delivery date**, auto-calculated; patients: **no universal period** — per-record category, start date, review/end date, professional recommendation, evidence reference, verification status, verifier, with a system reminder at review date (`patient_eligibility_months` deprecated); evidence proportionate (ANC/maternal record or provider confirmation; existing pregnancy/delivery record for postpartum; practitioner/hospital recommendation for patients; Aadhaar never mandatory); **medical privacy** — Food Partner sees only "SPECIAL CARE TOKEN – ₹100", diagnosis restricted to authorised personnel; Special Care and Emergency Mode fully independent (no automatic multiplication); ₹10 emergency waiver applies identically; full traceability Donor → Contribution → Token → Category → Redemption → Settlement → Surplus → Pool; no manual deletion or untraceable adjustment.

---

## D-9 — Volunteer Field Procedure

**Outcome:** Agreed; client's seven-situation procedure and wording replace JICATE's draft (B-30 offline, B-31 incident reporting).

**Client's governing principle:** "The volunteer's role is to facilitate access to PAPAMA assistance, not to create or alter entitlement."

**Client's §6.3 wording (verbatim, 16 Aug):**
> "Volunteers shall facilitate beneficiary access to PAPAMA assistance but shall not create, modify or independently authorise beneficiary entitlement. Beneficiaries without smartphones may use official PAPAMA printed QR tokens with volunteer assistance. During normal operations, where connectivity is unavailable and a transaction cannot be safely validated, volunteers shall not improvise or create unverified redemptions and shall follow the approved assistance/escalation procedure. During an authorised Emergency Mode, PAPAMA may permit controlled offline emergency transactions subject to configured limits, transaction identification, secure recording and subsequent synchronisation and validation.
>
> During Emergency Mode, relaxed beneficiary verification and any authorised ₹10 contribution waiver shall also apply to approved offline emergency transactions. The waiver shall be recorded and the Food Partner shall continue to receive the full approved meal value through the settlement process.
>
> Where a volunteer encounters an urgent food need, the volunteer may assist the person to the nearest authorised, active and applicable Food Partner and facilitate a normal or emergency redemption, as appropriate. Volunteers shall not independently activate Emergency Mode, alter token value or expiry, override geographic restrictions, reactivate suspended Food Partners or otherwise bypass PAPAMA controls. Volunteer safety and food-safety requirements shall remain applicable at all times."

**Seven situations (structure for §6.3):** (1) smartphone → digital QR, normal flow; (2) no smartphone, printed QR → volunteer presents official printed QR, normal validation; (3) no phone & no token, normal period → approved assistance/registration process; (4) no phone/token during Emergency Mode → relaxed emergency verification → assistance → transaction recorded; (5) no connectivity, normal period → do not improvise; connected Food Partner / assistance request / escalation; (6) no connectivity during Emergency Mode → controlled offline transaction → secure sync → final validation → exception review where required; (7) immediate safety risk → safety first, escalate, never force a transaction.
**Five Phase 1 essentials (client's list):** official printed-QR support; controlled offline emergency transaction capability; ₹10 waiver within offline transactions; clear no-phone-no-token procedure; strict prohibition on volunteers creating or overriding entitlement.
**Offline controls:** offline transaction record (offline txn ID, token ID, volunteer ID, Food Partner ID, beneficiary identifier where available, Emergency ID, date/time, token/meal type, waiver status, status, device reference); sync → full normal validation ("Pending Offline Validation"); expiry/geography/status never bypassed; max pending per volunteer/device; max sync window; alerts; cross-batch duplicate-token detection (exception queue, never silent accept/delete); admin visibility of unsynchronised transactions; limits configurable post-pilot. Emergency-only: "Emergency Mode + No Connectivity = Controlled Emergency Offline Procedure"; normal operations have no offline path.
**Also:** volunteer safety provisions (never required to enter unsafe locations); minimal paper records, secure transfer, approved disposal; food safety never bypassed; volunteer incident reporting — 11 one-tap categories (no phone / no token / partner closed / partner refusing valid token / no food / connectivity failure / token problem / urgent need / food-safety concern / safety concern / other) feeding an admin queue.
**CONFIRMED (18 Aug — Question 2):** BOTH routes — Food Partner redemption screen as primary; Volunteer App as secondary for field situations. Both emergency-only, subject to identical controls, and EVERY offline transaction must record its source (Food Partner vs Volunteer) for separate post-emergency review.

---

## D-10 — Beneficiary Privacy & Donor Communication (both 16 Aug emails)

**Outcome:** Category removal confirmed; expanded to a platform-wide rule (B-29). Core principle: **"Data available to the system ≠ data available to the donor."**

**Client's policy (verbatim):**
> "Donor-facing communications shall contain only information necessary to confirm donation/token utilisation and communicate PAPAMA programme impact. Beneficiary personal, health, vulnerability, identity and other sensitive information shall not be disclosed to donors unless specifically authorised under an approved policy and supported by an appropriate legal/privacy basis. Special Care categories shall remain restricted to authorised PAPAMA personnel on a need-to-know basis. Donor reporting shall use anonymised or aggregated information wherever possible."

> "Donor-facing communications shall provide confirmation of token utilisation and appropriate impact information without disclosing the identity, health status, Special Care category, vulnerability, residential address or other sensitive personal information of the beneficiary. The actual redemption/service location may be communicated to the donor at an appropriate level, normally City and State, where the token is unrestricted or otherwise permitted by the applicable geographic rule."

**Standard notification templates (verbatim; the only donor-visible redemption content):**
> *Standard:* PAPAMA Redemption Update — Your sponsored meal token has been successfully redeemed in [City, State]. Thank you for helping PAPAMA provide food with dignity.
> *Special Care:* PAPAMA Special Care Update — Your ₹100 Special Care Token has been successfully redeemed in [City, State]. Thank you for supporting PAPAMA's Special Care programme.
> *Emergency:* PAPAMA Emergency Response Update — Your sponsored emergency meal token has been successfully redeemed in [City, State]. Thank you for supporting PAPAMA's emergency food response.

**Specifics:** never disclosed to donors — name, phone, photograph, Aadhaar/identity, medical condition, pregnancy/postpartum status, patient/disability/vulnerability category, exact residential address, individual location, anything from which health or circumstances could be inferred; location at City + State (actual service location — e.g., a Coimbatore-sponsored unrestricted token redeemed in Mumbai reads "Mumbai, Maharashtra"); notification engine whitelist (may receive: token ID, type, value, redemption date/time, Food Partner/service location at appropriate level, Emergency ID, programme name) with sensitive fields structurally unreachable; need-to-know role access (Food Partner: token type/value/validity only; volunteer: transaction minimum; operations: category where necessary; finance: settlement data without medical detail; senior: broader for governance/fraud/safeguarding/audit); access & export logging; the rule extends to donor emails, SMS, WhatsApp, dashboards, receipts, downloadable/PDF/Excel reports and statements; emergency communications follow the same rule; extra care for children/vulnerable persons; donor transparency strengthened through aggregates (per-donor impact summaries; periodic area impact; CSR reports with meals, Special Care meals, beneficiaries, geography at reporting level, funds utilised, emergency statistics, pool utilisation).

---

## D-10A — Token Distribution Model (client addition, 16 Aug)

**Outcome:** Agreed (B-32); formalises existing Path A/B.

**Client's principle (verbatim):**
> "Where a donor authorises PAPAMA to distribute a sponsored token, the token shall enter the PAPAMA distribution pool and may be allocated to an eligible beneficiary on a First-In-First-Out basis, subject to the donor's geographic restriction, if any. The donor shall receive a redemption notification when the token is actually redeemed. Where a donor elects to retain, print or personally distribute the token, the token shall remain outside the PAPAMA distribution pool and shall not be allocated through FIFO. The system shall record the distribution mode and subsequent redemption separately."

**Specifics:** Distribution Mode (PAPAMA Distributed / Donor Controlled) fixed at creation; distribution authority and geographic scope fully independent attributes; FIFO for pool tokens incl. the Special Care distribution pool; donor-controlled tokens never enter FIFO (architecturally guaranteed); allocation ≠ utilisation — notification on actual redemption (allocation alerts optional, not Phase 1); donor-controlled lifecycle Created → Donor Controlled/Printed → Redeemed or Expired, with "Expired – Not Redeemed" display; 60-day validity applies to both modes; donor notification preference; token master fields per the client's list (ID, type, value, distribution mode, geographic scope, status, donor, activation, expiry, redemption date/time, redemption City/District/State, Food Partner, Emergency ID, Special Care category restricted from donor visibility, notification preference); Common Special Care Pool (financial) distinct from Special Care distribution pool (token queue).
**Status vocabulary (CONFIRMED 18 Aug — Question 4):** Existing status names retained with documented mapping to Created / Available / FIFO Pool / Donor Controlled / Allocated / Redeemed / Expired / Reissued. Approval and payment remain separate recorded events; pre-payment vs post-payment reconciliation clearly identifiable.

---

## D-11 — 80G Certificates

**Outcome:** Accepted as proposed (no dedicated reply). Feature remains OFF until (a) the Foundation's 80G registration number is available and (b) the client's Chartered Accountant approves the certificate format and eligibility rules. Generation build = B-16 (Phase 2, behind those preconditions). **CONFIRMED 18 Aug** — 80G preconditions as documented.

## D-12 — Section 3.13

**Outcome:** No separate review will be awaited; §3.13 (System Configuration) is rewritten applying the client's Section 9 and Section 10.4 comments, which cover the same ground. Noted in the v1.1 changelog. **CONFIRMED 18 Aug** — §3.13 rewrite approach as documented.

---

## Carried decisions of 4–5 Aug (first cycle — unchanged, restated for completeness)

Title "pApAmA Technical Administration Guide" v1.1; "Food Partner" and "General Donation Pool" terminology (UI may lag with explanatory notes); four implemented beneficiary categories current, others future; Donor Credit never expires; unspent value (token-vs-meal difference AND expired value) returns to the Meal Pool, never revenue (B-03; the D-2A reissue mechanism and D-8 Special Care Pool are its implementations by token type); revoked tokens → Admin Pool (as built); SLAs — proof approval ≤ 24 h, reconciliation ≤ 48 h, Food Partner payment ≤ 7 working days, complaint acknowledgement ≤ 24 h, resolution ≤ 7 working days (configurable operating parameters); permanent audit retention; two-register model; simplified Public User Guide deferred; five Foundation documents to be authored by the client.

**Foundation Documents Timeline (client's tentative targets, confirmed 18 Aug):**

| Document | Target date |
|----------|------------|
| Standard Meal Framework | 25 Aug 2026 |
| Special Care Meal Guidelines | 28 Aug 2026 |
| Food Partner Eligibility & Selection Criteria | 31 Aug 2026 |
| Complaint Categories/Escalation/Timelines Policy | 31 Aug 2026 |
| Institution Framework | 5 Sep 2026 |

**Client's directive (18 Aug):** Proceed with v1.1 and lane-wise development (data architecture → financial controls → emergency+offline → privacy); design-first milestones honoured; maker-checker demonstration date to be proposed by JICATE.
