# CHANGELOG — pApAmA Technical Administration Guide v1.1

**From:** Platform User Guide v1.0 / Platform Administration Guide v1.1-draft
**To:** Technical Administration Guide v1.1 (Phase 1), August 2026
**Date:** August 2026

This changelog records every substantive change in the v1.1 rewrite, grouped by section. Each entry is tagged with its source.

---

## Front Matter

- Retitled from "Platform Administration Guide" to "Technical Administration Guide" [DECISION: 4 Aug reply]
- Version note: v1.1 supersedes "Platform User Guide v1.0" [DECISION: 4 Aug reply]
- Added "How to Use This Guide" paragraph explaining administrative audience and deferred Public User Guide [DECISION: 4 Aug reply]
- Replaced inline Terminology list with structured Terminology table including Food Partner, General Donation Pool, Token, Donor Credit, Admin Pool [carried from first-cycle rewrite] [DECISION: 4 Aug reply]
- "Food Partner" replaces "Vendor" throughout with "(shown as 'Vendor' in the application interface)" on first use per section [carried from first-cycle rewrite]
- "General Donation Pool" replaces "Guest Pool" throughout with "(shown as 'Guest Pool' in the application interface)" on first use per section [DECISION: 4 Aug reply]
- Removed PENDING comment for Guest Pool rename — resolved as "General Donation Pool" [DECISION: 4 Aug reply]
- Removed inline Changelog table (replaced by this separate CHANGELOG file) [structural]

## Section 1 — What is pApAmA?

- Updated flow diagram: added "never expires" for Donor Credit, "60-day validity" for tokens, ₹10 contribution step, City/State notification convention [DECISION-1] [DECISION-2A] [DECISION-10]
- Updated "Food Partner (Vendor)" role description to include ₹10 collection agent responsibility [DECISION-1]
- Updated Guest role to use "General Donation Pool" terminology [DECISION: 4 Aug reply]
- Terminology alignment applied throughout [carried from first-cycle rewrite]

## Section 2 — How to Sign In

- Added Compliance Officer capabilities detail: read-all on audit logs, fraud, all operational data; no mutation rights [V-14(c)]
- Terminology alignment (Food Partner) [carried from first-cycle rewrite]

## Go-Live Checklist (new section)

- New unnumbered section between §2 and §3 [client §10.4 pt 1]
- Every mandatory pre-production setting listed with classification (Mandatory/Recommended/Review) [client §10.4 pt 1]
- Distinguishes business configuration (admin console) from technical environment variables (UPI VPA, TOKEN_QR_SECRET) [client §10.4 pt 1]
- Token expiry set to 60 days per approved policy [DECISION-2A]
- Co-contribution set to 10 per approved policy [DECISION-1]
- Settlement audit rate set to 10% [DECISION-5]
- Emergency values 4/3h/7d [DECISION-6]
- Dashboard incomplete-config warning referenced as Planned (B-06) [B-06 planned]
- Notification template review included [register §8]

## Section 3.1 — Admin Dashboard

- No substantive changes from first-cycle rewrite [carried from first-cycle rewrite]

## Section 3.2 — Managing Donations

- "Guest Pool" renamed to "General Donation Pool" throughout [DECISION: 4 Aug reply]
- Removed PENDING comment for Guest Pool rename [DECISION: 4 Aug reply]

## Section 3.3 — Managing Tokens

- MAJOR REWRITE: token revalidation feature description REMOVED, replaced with controlled reissue model [DECISION-2A] [register §12 Q3]
- Added Token Model section with PAN INDIA default principle (verbatim from client) [DECISION-2A]
- Added 60-day validity from activation as approved policy [DECISION-2A]
- Added Distribution Mode table (PAPAMA Distributed / Donor Controlled) [DECISION-10A]
- Added approved vocabulary mapping alongside existing status names [DECISION-10A]
- Added "Expired — Not Redeemed" display note [DECISION-10A]
- FIFO allocation for pool tokens documented as Planned (B-32) [B-32 planned]
- Donor-selected geographic restriction documented as Planned (B-23) [B-23 planned]
- Token face content (type, value, geo, dates) documented as Planned (B-23) [B-23 planned]
- QR payload section clarified: QR carries token ID only, backend is final authority [DECISION-2A]
- Controlled reissue process documented in detail: new token, new QR, new dates, linked to original, original permanently expired [DECISION-2A]
- Reissue connected to B-03 (Meal Pool return of expired value) explicitly [DECISION-2A] [B-03 planned]
- Token revalidation existing code noted as being retired [register §12 Q3]
- Lost-token flow expanded: compensating rollback documented (if replacement fails, original un-blocked) [V-19] [VERIFICATION-REPORT-2 §4 item 5]
- Lost-token: only `live` or `distributed` tokens eligible [V-19]
- Revocation semantics clarified: only `assigned_to_volunteer` tokens, value preserved in Admin Pool, no donor cancellation [V-18]
- Token value disposition table restructured with Current Behaviour vs Approved Policy columns [V-21] [B-03 planned]
- Forfeited balance current behaviour: revenue ledger (honestly described) [V-21]
- Expired tokens current behaviour: status flip only, value written off (honestly described) [V-21]

## Section 3.4 — Beneficiary Registration Approvals

- Confirmed four beneficiary categories only [carried from first-cycle rewrite]
- Privacy statement strengthened: "computed on-device and never leaves the device — no photograph is ever transmitted to or stored on the server" [V-04]
- Aadhaar description updated: "not required; face verification is the primary identity method" [V-22 claim 3]
- Future categories note retained [carried from first-cycle rewrite]

## Section 3.5 — Managing Food Partners

- Added Graduated Corrective-Action Ladder table (warning → final warning → penalty/enhanced monitoring → suspension; immediate suspension for safety/fraud/risk) [DECISION-3] [client §9.3]
- `vendor_auto_suspend_enabled` documented as OFF under the ladder [DECISION-3]
- Audit finding severities linked to corrective framework [DECISION-5]
- Added Quality score composition description: ratings, complaints, inspections [VERIFICATION-REPORT-2 §4 item 10]
- Added Vendor inspection workflow: surprise inspections, pass/fail, numeric quality-score deduction via `vendor_inspection_fail_penalty` [V-10] [VERIFICATION-REPORT-2 §4 item 2]
- Penalty formula documented: `max(0, round((score - penalty) * 100) / 100)` [V-10]

## Section 3.6 — Menu Approvals

- No substantive changes beyond terminology alignment [carried from first-cycle rewrite]

## Section 3.7 — Reviewing Meal Proofs

- Added duplicate-media phash detection flow: flagged for review, not auto-rejected; settlements auto-held; detection is best-effort [V-14(a)]
- Added principle: "A duplicate-media flag is a signal for investigation, not proof of fraud" [client §9.7 pt 2]
- Proof approval notification description simplified (removed field list — aligned to §4.7 notification policy) [DECISION-10]

## Section 3.8 — Settlements and Food Partner Payouts

- MAJOR REWRITE of settlement lifecycle [V-11]
- Full verified lifecycle documented: pending → locked → approved → reconciled → paid with orthogonal hold/release [V-11]
- Action table with status transitions and audit logging for all 8 actions [V-11]
- ₹10 contribution settlement treatment added: full meal value via settlement, ₹10 separate, excluded from payout formula [DECISION-1]
- Settlement-release gate on contribution as Planned (B-01) [B-01 planned]
- Maker-checker documented as operating procedure [DECISION-4]
- System-enforced maker-checker as Planned (B-24) including 18 controls and live demo requirement [B-24 planned]
- Hold discipline: hold_note optional, actor_id in audit, prompt review guidance [V-11]
- Settlement finality: paid = final, corrections as separate records [client §10.4 pt 4]
- Auditable adjustment records as Planned (B-07) [B-07 planned]
- Line-item hold as Planned (B-08) [B-08 planned]
- Settlement audit queue detail expanded [VERIFICATION-REPORT-2 §4 item 3]
- Audit rate: 10% with verbatim policy paragraph from client [DECISION-5]
- Risk-based audit framework as Planned (B-25) [B-25 planned]
- Operational Service Levels subsection added: proof ≤24h, reconciliation ≤48h, payment ≤7 working days, complaint ack ≤24h, resolution ≤7 working days [DECISION: 4 Aug reply]
- SLAs presented as Foundation operating parameters, not system-enforced [DECISION: 4 Aug reply]

## Section 3.9 — Volunteers and Token Allocation

- Terminology alignment [carried from first-cycle rewrite]
- No other substantive changes [carried from first-cycle rewrite]

## Section 3.10 — Fraud Monitoring

- Duplicate media flag type expanded: phash detection detail, `blocked: false`, settlements auto-held, never auto-rejected [V-14(a)]
- Fair-handling note retained [carried from first-cycle rewrite]

## Section 3.11 — Emergency Mode

- MAJOR REWRITE per DECISION-6 and DECISION-7
- Added three-mode distinction table (Normal / Emergency / Financial governance always on) [DECISION-6]
- Emergency values set: 4 meals/day, 3-hour cooldown, 7-day maximum [DECISION-6]
- "Flexibility, not unlimited" principle documented [DECISION-6]
- Expanded "does not override" list: token expiry, donor geo restriction, token value, Food Partner suspension, food safety, fraud, financial controls [DECISION-6]
- Verification relaxation section added (verbatim policy basis) [DECISION-7]
- Face-verification skip path during emergency as Planned (B-27) [B-27 planned]
- Documentation correction: no photograph ever stored in any mode — embeddings only [DECISION-7]
- ₹10 waiver during emergencies documented [DECISION-7]
- Automatic waiver rule as Planned (B-27) [B-27 planned]
- Emergency ID, Appeal workflow, closure reconciliation as Planned (B-26) [B-26 planned]
- Surplus hierarchy: specific emergency → same-area needs → PAPAMA Emergency Response Fund [DECISION-6]
- No donor refund; disclosed at contribution time [DECISION-6]
- What is audit-logged today: detailed table (toggle, override activate, override revert, auto-revert, token issuance) [V-12]
- Auto-revert: pg_cron at 03:00 UTC, aggregate audit entry only [V-12]
- Per-override auto-revert detail as Planned (B-19) [B-19 planned]
- Governance workflow as Planned (B-09) [B-09 planned]
- Post-emergency review procedure added [DECISION-6]

## Section 3.12 — Analytics and Reports

- Audit log immutability strengthened: DB triggers block update/delete even for service_role [V-14(b)]
- Permanent-retention policy statement added [DECISION: 4 Aug reply]

## Section 3.13 — System Configuration

- FULL REWRITE applying client §9 and §10.4 comments [DECISION-12]
- Governance principles added: authorised administrators only, audit-logged with prev/new value [V-09]
- Reason field as Planned (B-14) [B-14 planned]
- Internal approval practice for significant changes [client §9.1 pt 6]
- Key settings table updated with go-live action column [client §10.4]
- Cross-reference to Section 9 for complete reference [structural]

## Section 3.14 — Other Admin Sections

- Added vendor-capacity monitor page (`/admin/vendor-capacity`) with real-time capacity display [VERIFICATION-REPORT-2 §4 item 8]
- Added vendor-feedback page for inspections [VERIFICATION-REPORT-2 §4 item 2]

## Section 4 — Donor Workflow

- Purpose framing paragraph added [client request]

## Section 4.1 — Making a Donation

- UTR defined as "Unique Transaction Reference" [register §8]

## Section 4.2 — Understanding Donor Credit

- "Donor Credit does not expire" emphasized as Trust policy [DECISION: 4 Aug reply]

## Section 4.3 — Minting a Token

- Token description updated: PAN INDIA default, 60-day validity [DECISION-2A]
- Distribution path labels updated: "Donor Controlled" / "PAPAMA Distributed" [DECISION-10A]
- Distribution mode fixed at creation noted [DECISION-10A]
- Donor-selected geographic restriction as Planned (B-23) [B-23 planned]

## Section 4.4 — Distributing a Token (Path A)

- Added transferability caution: live QR redeemable by whoever holds it; do not post publicly [client §4.4]
- Renamed to "Path A — Donor Controlled" [DECISION-10A]

## Section 4.5 — Letting pApAmA Distribute (Path B)

- Renamed to "Path B — PAPAMA Distributed" [DECISION-10A]
- FIFO allocation reference added as Planned (B-32) [B-32 planned]
- Allocation ≠ utilisation — donor notified on redemption, not allocation [DECISION-10A]

## Section 4.7 — Notifications

- MAJOR REWRITE per DECISION-10
- Three verbatim notification templates added (Standard, Special Care, Emergency) [DECISION-10]
- City + State actual-location convention documented [DECISION-10]
- Current notification contents described honestly (includes beneficiary_category) [V-20]
- Beneficiary category removal from donor notifications confirmed as approved policy [DECISION-10]
- Notification engine whitelist filter as Planned (B-29) [B-29 planned]
- Privacy principle: "data available to the system ≠ data available to the donor" [DECISION-10]

## Section 4.8 — Reporting a Lost Token (Donor) (new subsection)

- Donor-initiated lost-token report documented [VERIFICATION-REPORT-2 §4 item 6]

## Section 5 — Food Partner Workflow

- Purpose framing updated to include ₹10 collection agent responsibility [DECISION-1]
- Geographic address as Planned (B-02) [B-02 planned]

## Section 5.2 — Managing the Menu

- `special_care_multiplier` described as internal analysis parameter only — never applied in code [V-17] [DECISION-8]
- Special Care Token value fixed at ₹100 per approved programme [DECISION-8]

## Section 5.3 — Availability and Capacity Management

- Hard-block language added for all three controls [V-08]
- "Temporarily closed" shown on nearby list [V-08]
- Capacity not on beneficiary list — admin only [V-08]
- Beneficiary redirection as Planned (B-13) [B-13 planned]

## Section 5.4 — Redeeming a Token (Serving a Meal)

- ₹10 contribution replaces previous co-pay description [DECISION-1]
- Four contribution principles documented [DECISION-1]
- Current implementation note: no code ceiling on co_contribution_max; vendor UI hardcodes ₹5 [V-01]
- Hard ceiling enforcement as Planned (B-10) [B-10 planned]
- Client-side alignment as Planned (B-20) [B-20 planned]
- ₹10 settlement treatment: full meal value to Food Partner, ₹10 separate [DECISION-1]
- Contribution enforcement system as Planned (B-01) [B-01 planned]
- Face capture privacy clarified: mathematical embedding computed on-device, no photo stored [V-04]
- Removed "future enhancement" framing for ₹10 — now approved policy [DECISION-1]

## Section 5.6 — Viewing Settlements

- Settlement status table expanded: added Locked, Approved statuses [V-11]

## Section 6 — Volunteer Workflow

- Governing principle added: "facilitate access, not create entitlement" [DECISION-9]

## Section 6.1 — Registering as a Volunteer

- Face photo privacy note added [V-04]

## Section 6.3 — Distributing Tokens to Beneficiaries

- RESTRUCTURED around seven situations per client's decision [DECISION-9]
- Situation 1: Smartphone — digital QR, normal flow [DECISION-9]
- Situation 2: No smartphone, printed QR — volunteer presents [DECISION-9]
- Situation 3: No phone/token, normal period — approved assistance/registration [DECISION-9]
- Situation 4: No phone/token during Emergency Mode — relaxed verification [DECISION-9]
- Situation 5: No connectivity, normal period — do not improvise; escalation [DECISION-9]
- Situation 6: No connectivity during Emergency Mode — controlled offline [DECISION-9]
- Situation 7: Immediate safety risk — safety first [DECISION-9]
- Controlled offline emergency transactions as Planned (B-30) [B-30 planned]
- Volunteer incident reporting as Planned (B-31) [B-31 planned]
- Emergency verification relaxation and ₹10 waiver as Planned (B-27) [B-27 planned]
- Five prohibitions listed (Emergency Mode activation, token value/expiry alteration, geo override, Food Partner reactivation, control bypass) [DECISION-9]
- Distribution-record enrichment and activity dashboard as Phase 2 backlog [register §4 pt 1-3]

## Section 7.1 — Registering as a Beneficiary

- Category list confirmed as four only (removed any reference to others as current) [carried from first-cycle rewrite]
- Future categories list updated: Children, Elderly Persons, Lactating Mothers, General [carried from first-cycle rewrite]
- Face capture description updated: "mathematical embedding computed on-device, no photograph transmitted or stored" [V-04]

## Section 7.2 — Finding a Nearby Food Partner

- Verified discovery behaviour: browser GPS on demand, Haversine distance, status display [V-02]
- Field table added showing what is/is not displayed (no contact number, no menu items) [V-02]

## Section 7.3 — Redeeming a Token at a Food Partner

- ₹10 contribution step added to redemption flow [DECISION-1]
- Waiver principle documented: no beneficiary denied food for inability to pay [DECISION-1]
- Exception behaviours table added with exact messages from code [V-03]
- Face privacy statement per V-04: embeddings only, no photo [V-04]
- Category-specific cooldown overrides mentioned [register §8]

## Section 7.4 — Giving Feedback

- Feedback form described as verified: star rating + free text + is_complaint flag [V-07]
- No predefined categories documented [V-07]
- Complaint categories as Planned (B-12) [B-12 planned]
- Complaint status workflow documented (Open → Investigating → Resolved/Dismissed) [V-07]

## Section 8.1 — Public Donation

- "Guest Pool" renamed to "General Donation Pool" [DECISION: 4 Aug reply]
- No contact capture documented [V-05]
- Guest notifications as Planned (B-11) [B-11 planned]

## Section 8.2 — UPI QR Donation

- UTR defined: self-asserted, not bank-verified [V-06]
- Duplicate UTR protection: 409 on reuse [V-06]
- Exception table added (payment failure, incorrect format, pending/timeout, duplicate) [V-06]
- `payer_vpa` capture documented [VERIFICATION-REPORT-2 §4 item 7]
- Bank-feed verification as Planned (B-21) [B-21 planned]

## Section 8.3 — Transparency Dashboard

- "Verified platform records" data source noted [register §8]

## Section 9 — System Configuration Reference

- FULL RESTRUCTURE per client §9 and §10.4 comments [DECISION-12]
- Configuration Governance principles at top: authorised access, audit trail, reason field Planned (B-14), approval practice [V-09] [B-14 planned]
- Classification system added: Mandatory / Recommended / Optional / NULL-permitted [client §10.4 pt 2]
- Per-key NULL semantics replace blanket "NULL = soft-skip" [client §10.4 pt 2]
- Business implication column added for every setting [client §10.4 pt 2]

## Section 9.1 — Token Settings

- `token_expiry_days` classified Mandatory, set to 60 [DECISION-2A]
- `token_revalidation_allowed` REMOVED (revalidation retired in favour of reissue) [DECISION-2A]
- Per-key NULL semantics documented [client §10.4 pt 2]

## Section 9.2 — Meal and Redemption Settings

- `co_contribution_max` classified Mandatory, set to 10, no code ceiling noted [DECISION-1] [V-01]

## Section 9.3 — Food Partner Settings

- `vendor_inspection_fail_penalty` type corrected to Number (was String) with deduction formula reference [V-10]
- `vendor_auto_suspend_enabled` documented under graduated ladder [DECISION-3]

## Section 9.4 — Settlement and Financial Settings

- `settlement_random_audit_rate` classified Mandatory, set to 0.10 [DECISION-5]

## Section 9.5 — Emergency Mode Settings

- Values set: 4/3h/7d [DECISION-6]
- `emergency_mode_max_duration_days` classified Mandatory before activation [DECISION-6]

## Section 9.6 — Location Settings

- City lock enforcement scope clarified: redemption only, not registration [V-13]
- Registration gating as Planned (B-15) [B-15 planned]
- Geographic hierarchy per DECISION-2 documented [DECISION-2]
- City lock framed as pilot-phase control superseded by token-level geo restriction [DECISION-2A]
- Planned (B-02) for structured hierarchy [B-02 planned]

## Section 9.7 — Quality and Security Settings

- Audit log immutability: DB triggers block update/delete even for service_role [V-14(b)]
- Permanent-retention policy statement [DECISION: 4 Aug reply]

## Section 9.8 — Feature Toggles

- 80G preconditions listed (registration number + CA sign-off) [DECISION-11]
- 80G generation as Planned (B-16) [B-16 planned]
- All toggles ship OFF documented [register §8]

## Section 9.9 — Special Care Settings

- MAJOR REWRITE per DECISION-8
- Special Care programme described: ₹100 token, Common Special Care Pool, separate ledger [DECISION-8]
- Special Care Category Master (distinct from beneficiary categories): Pregnant Women, Postpartum/Lactating Mothers, Medically Vulnerable/Patients [DECISION-8]
- Eligibility model: pregnancy-until-delivery, postpartum 6 months, patients per-record review dates [DECISION-8]
- `special_care_multiplier` documented as internal analysis parameter ONLY — defined but never applied in code [V-17] [DECISION-8]
- `patient_eligibility_months` documented as superseded by per-record review dates [DECISION-8]
- Medical privacy: Food Partner sees "SPECIAL CARE TOKEN – ₹100" only [DECISION-8]
- Full programme as Planned (B-28) [B-28 planned]

## Section 10 — Frequently Asked Questions

- MAJOR EXPANSION from ~12 questions to comprehensive FAQ [register §8]
- Restructured as §10.1 General, §10.2 For Donors, §10.3 For Food Partners, §10.4 For Administrators [client §10 structure]

## Section 10.1 — General (30 questions)

- Built from client's drafted FAQ topics [client §10.1]
- All answers corrected against verification findings [V-01 through V-22]
- Face verification privacy per V-04 [V-04]
- Token value and expiry per DECISION-2A [DECISION-2A]
- ₹10 contribution per DECISION-1 [DECISION-1]
- Forfeited/expired value with Planned (B-03) markers [B-03 planned]
- Four categories only; future list [carried from first-cycle rewrite]
- Special Care programme per DECISION-8 [DECISION-8]
- `special_care_multiplier` as non-functional [V-17] [DECISION-8]
- Emergency Mode overview with values [DECISION-6]
- Surplus hierarchy [DECISION-6]
- Geography per DECISION-2 [DECISION-2]
- Occasion-based giving marked future [register §4 pt 8]
- Redirection as Planned (B-13) [B-13 planned]
- Guest notifications as Planned (B-11) [B-11 planned]
- Inspection workflow documented [V-10]
- Data retention policy documented [V-14(b)]

## Section 10.2 — For Donors (20 questions)

- Built from client's drafted FAQ topics [client §10.2]
- Refund policy: no money-back; credit committed to meals [DECISION: 4 Aug reply]
- Donor Credit never expires [DECISION: 4 Aug reply]
- Path A transferability caution [client §4.4]
- Token reissue (not revalidation) [DECISION-2A]
- Notification content per three templates [DECISION-10]
- Privacy: no beneficiary info disclosed per approved policy [DECISION-10]
- Lost token reporting (donor-initiated) [VERIFICATION-REPORT-2 §4 item 6]
- Occasion-based giving marked future [register §4 pt 8]
- Impact tracking via dashboard [carried from first-cycle rewrite]
- Donor cancellation: not available [V-18]
- Emergency donation surplus per hierarchy [DECISION-6]
- Planned (B-29) for notification alignment [B-29 planned]

## Section 10.3 — For Food Partners (28 questions)

- Built from client's drafted FAQ topics [client §10.3]
- Payment locking and proof requirements [carried from first-cycle rewrite]
- Settlement lifecycle with all status meanings [V-11]
- ₹10 contribution: full meal value separate, collect-remit model [DECISION-1]
- Graduated discipline per DECISION-3 [DECISION-3]
- Temporary closure and capacity per V-08 [V-08]
- Menu approval process [carried from first-cycle rewrite]
- Inspection workflow per V-10 [V-10]
- Settlement audit per DECISION-5 [DECISION-5]
- Maker-checker per DECISION-4 [DECISION-4]
- Exception procedures [V-03]
- No per-item availability toggle [V-22 check 18 from VERIFICATION-REPORT]
- No Food Partner dispute mechanism [V-22 check 19 from VERIFICATION-REPORT]
- Settlement finality: paid = final [client §10.4 pt 4]
- Planned markers: B-07, B-08, B-13, B-24 [B-07/B-08/B-13/B-24 planned]

## Section 10.4 — For Administrators (8 questions)

- Go-Live checklist cross-reference [client §10.4 pt 1]
- Per-setting NULL guidance (not blanket soft-skip) with examples [client §10.4 pt 2]
- Fail-safe principle with Planned (B-06) [B-06 planned]
- Settlement finality: paid = final, corrections as new records [client §10.4 pt 4]
- Maker-checker per DECISION-4 with Planned (B-24) [DECISION-4] [B-24 planned]
- Pre-payment checks guidance [client §10.4 pt 5]
- Emergency management guidance [DECISION-6]
- Config audit per V-09, reason field Planned (B-14) [V-09] [B-14 planned]

## Appendix A — Food Partner Code of Conduct

- ₹10 contribution reference added (points 4 and 5) [DECISION-1]
- Co-pay range "₹0–₹5" replaced with "₹10 beneficiary contribution" [DECISION-1]
- Privacy point updated: face images never retained, embeddings only [V-04]

## Appendix B — Volunteer Code of Conduct

- Point 7 added: "Facilitate, do not create entitlement" — volunteer's role per DECISION-9 [DECISION-9]

## Appendix C — Business Rules — Data Integrity and Retention

- Lost-token compensating rollback documented [V-19] [VERIFICATION-REPORT-2 §4 item 5]
- Audit log immutability strengthened: two PostgreSQL triggers, including service_role [V-14(b)]
- Permanent retention policy statement with legal/accounting advice note [DECISION: 4 Aug reply]

---

## Cross-Cutting Changes

- Token revalidation feature description REMOVED throughout; replaced by controlled reissue model [DECISION-2A]
- `special_care_multiplier` appears only as internal analysis parameter — never described as functional [V-17] [DECISION-8]
- Only four beneficiary categories appear as current anywhere in the document [carried from first-cycle rewrite]
- "Planned (B-nn)" callouts used consistently for all unbuilt features; every callout cites a build item [structural]
- Face data described consistently: "on-device-computed mathematical representation (embedding); no photograph transmitted or stored" [V-04]
- ₹10 contribution language consistent throughout: "contribution to pApAmA, collected by Food Partner as authorised collection agent, remitted to Administration Account, waivable" [DECISION-1]
- Notification content aligned to approved privacy policy throughout [DECISION-10]
- Pre-sign-off maker-checker demonstration noted in register (not in guide text) [DECISION-4]
