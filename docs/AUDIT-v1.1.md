# AUDIT — pApAmA Technical Administration Guide v1.1

> **Auditor:** Independent (Claude Code)
> **Date:** 17 August 2026
> **Scope:** Every section of `docs/user-guide.md` (v1.1), audited against four tests
> **Fact base:** VERIFICATION-REPORT.md (30 checks), VERIFICATION-REPORT-2.md (V-01–V-22), pApAmA-Client-Decisions-2026-08.md, pApAmA-Client-FAQ-Drafts.md, pApAmA-Review-Register-v2-Internal.md, CHANGELOG-v1.1.md

---

## Step 0 — Fact Base Currency

```
git log --oneline --since="2026-08-11" -- . ":(exclude)docs"
```

**Result: no output.** No application code commits since 11 August 2026. The two verification reports (VERIFICATION-REPORT.md dated 5 Aug, VERIFICATION-REPORT-2.md dated 11 Aug) remain a valid fact base for this audit.

---

## Audit Tests

| Code | Test | CRITICAL threshold | MAJOR threshold | MINOR threshold |
|------|------|--------------------|-----------------|-----------------|
| **a** | TRUTH | Wrong system behaviour claim | Stale or misleading system description | — |
| **b** | CURRENCY | Contradicts a client decision | Presents planned feature as current | — |
| **c** | CONSISTENCY | — | Section contradicts another section | Terminology / wording inconsistency |
| **d** | COMPLETENESS | — | Required register/decision item missing | Documented feature omitted |

---

## Findings

### Finding 1 — §9.9 `patient_eligibility_months` described as inactive when it is active

| Field | Value |
|-------|-------|
| **Section** | §9.9 Special Care Settings, configuration table |
| **Test failed** | a (TRUTH) |
| **Severity** | **CRITICAL** |

**Quoted problem text:**

> `| patient_eligibility_months | Number | **Superseded** | Previously set a universal patient eligibility period | Uses general approval without time limit | NULL | **Superseded** by per-record review dates with system reminders (approved model). Retained for backward compatibility. |`

**Problem:** The classification "Superseded" and the past-tense phrase "Previously set" assert that this key is no longer functionally active. V-17 confirms the opposite: `patient_eligibility_months` IS actively applied in `app/api/admin/beneficiary-registrations/[id]/decide/route.ts:72–92` to compute `eligibility_expires_at` for patients at approval time. The per-record review-date model that would supersede it is part of the Special Care programme redesign (Planned B-28) and is not yet implemented.

An administrator reading "Superseded" may leave this key NULL, resulting in patients receiving no eligibility period — a direct operational impact.

**Recommended fix:** Change classification from "Superseded" to "Optional" (it falls back to no time limit when NULL). Change "Previously set" to "Sets." Add a note that the per-record review-date model (B-28) will supersede this key when implemented. Update the business implication to reflect active status.

**Applied:** Yes.

---

### Finding 2 — §10.3 Q6 presents ₹10 contribution verification as current

| Field | Value |
|-------|-------|
| **Section** | §10.3 For Food Partners, Q6 |
| **Test failed** | a (TRUTH), b (CURRENCY) |
| **Severity** | **MAJOR** |

**Quoted problem text:**

> `**Reconciled** — pre-payment reconciliation complete (including ₹10 contribution verification).`

**Problem:** The parenthetical "(including ₹10 contribution verification)" presents unbuilt behaviour as current. The ₹10 contribution reconciliation as part of the settlement process is Planned (B-01, settlement-release gate; and B-24, three-way reconciliation view). The current `reconciled` status transition (V-11) is a simple status flip from `approved` — no ₹10 verification logic exists in the reconciliation step today.

The body text in §3.8 correctly marks the settlement-release gate on ₹10 contribution as Planned (B-01), but this FAQ answer omits the marker.

**Recommended fix:** Remove the parenthetical from the Reconciled definition, or qualify it with a Planned (B-01) reference.

**Applied:** Yes — parenthetical removed; the existing Planned (B-01) note in §3.8 and the §10.3 Q9 Planned (B-01) marker already cover the policy intent.

---

### Finding 3 — Scheduled-redemption reminders undocumented

| Field | Value |
|-------|-------|
| **Section** | (absent — should appear in §3.3 or §3.14) |
| **Test failed** | d (COMPLETENESS) |
| **Severity** | **MINOR** |

**Problem:** VERIFICATION-REPORT.md check #15 confirms a scheduled-redemption reminder feature exists at `/api/admin/scheduled-reminders/sweep` — it sends 7-day reminders for tokens with `scheduled_redemption_dates` and flips status to `reminded`. The Review Register §5 lists "scheduled redemption reminders" as one of 10 existing-but-undocumented features that "all become v1.1 documentation additions." The other nine features are documented in the guide; this one is not.

Note: this is distinct from the token expiry reminder question. The guide's statement "No reminder is sent to anyone before a token expires" is about the expiry date, not the scheduled redemption date. That statement is correct. The scheduled-redemption reminder is a separate, undocumented feature.

**Recommended fix:** Add a brief note in §3.3 or §3.14 documenting the scheduled-redemption reminder sweep endpoint, its purpose and its current status.

**Applied:** No (MINOR — recommendation only).

---

### Finding 4 — "face photo" terminology inconsistency

| Field | Value |
|-------|-------|
| **Section** | §2 (Registration and Approval Flow) and §6.1 (Registering as a Volunteer) |
| **Test failed** | c (CONSISTENCY) |
| **Severity** | **MINOR** |

**Quoted problem text (§2):**

> `A volunteer registers at /volunteer/register with name, contact details and a face photo.`

**Quoted problem text (§6.1):**

> `2. Capture a face photo (for identity verification) — only the mathematical embedding is stored; no photograph is retained`

**Problem:** The D-7 documentation correction mandates precise language: "the platform stores no photograph of any person in any mode — identity verification uses only an on-device-computed mathematical representation." Section 7.1 follows this precisely: "Capture your face — a mathematical embedding is computed on-device." Sections 2 and 6.1 use "face photo" which, while clarified in §6.1's parenthetical, is inconsistent with the established terminology and the D-7 correction principle.

**Recommended fix:** Replace "face photo" with "face capture" or "face image" (the user-facing action) and ensure the parenthetical clarification is present. Example: "a face capture (for identity verification — only the mathematical embedding is stored; no photograph is retained)."

**Applied:** No (MINOR — recommendation only).

---

## Sections Audited — Summary

Every section was audited against all four tests. The following sections passed all tests without findings:

| Section | Notes |
|---------|-------|
| §1 What is pApAmA? | Flow diagram, principles, roles — all match D-1, D-2A, D-10; ₹10 wording correct |
| §2 How to Sign In | Login pages, approval flows — all match VR checks 1–3; Finding 4 is MINOR terminology |
| Go-Live Checklist | All mandatory settings listed; classifications match §9; environment variables correct |
| §3.1 Admin Dashboard | KPI cards match implemented pages |
| §3.2 Managing Donations | General Donation Pool terminology correct per 4 Aug decision; lifecycle accurate |
| §3.3 Managing Tokens | Token model, 60-day validity, PAN INDIA, distribution modes, reissue model, lost-token flow, value disposition — all match D-2A, D-10A, V-18, V-19, V-21; Planned markers cite real register items |
| §3.4 Beneficiary Registration | Four categories match `lib/types/enums.ts`; Aadhaar claim matches V-22; face privacy matches V-04 |
| §3.5 Managing Food Partners | Corrective-action ladder matches D-3; inspection workflow matches V-10; quality score formula documented |
| §3.6 Menu Approvals | Matches verified behaviour; Special Care equivalents documented |
| §3.7 Reviewing Meal Proofs | Phash flow matches V-14(a); mandatory reason on rejection matches VR check 12; write-once proof confirmed |
| §3.8 Settlements | Full lifecycle matches V-11; ₹10 separation matches D-1; maker-checker as operating procedure matches D-4; audit rate matches D-5; SLAs match 4 Aug decisions; Planned markers B-01/B-07/B-08/B-24/B-25 all cite real items |
| §3.9 Volunteers | Holding limits, accountability lifecycle, revocation semantics — all match VR checks 16, 18 |
| §3.10 Fraud Monitoring | Flag types match V-14(a); severity levels documented; investigation workflow correct |
| §3.11 Emergency Mode | Three-mode distinction, values 4/3h/7d match D-6; verification relaxation matches D-7; surplus hierarchy matches D-6; audit logging matches V-12; all Planned markers (B-09/B-19/B-26/B-27) cite real items |
| §3.12 Analytics and Reports | Audit log immutability matches V-14(b); permanent retention documented |
| §3.13 System Configuration | Governance principles match V-09; key settings accurate; cross-reference to §9 correct |
| §3.14 Other Admin Sections | Pages listed match verified routes; vendor-capacity monitor documented per VR-2 §4 item 8 |
| §4.1–4.6 Donor Workflow | Donation, credit, minting, Path A/B — all match verified behaviour; distribution mode fixed at creation per D-10A |
| §4.7 Notifications | Three templates match D-10 verbatim; City+State convention correct; current behaviour honestly described (includes beneficiary_category); Planned (B-29) cites real item |
| §4.8 Lost Token (Donor) | Matches V-19 and VR-2 §4 item 6 |
| §5.1–5.3 Food Partner | Registration, menu, availability — all match VR checks 17, 18, 22, 23, 24, 25; V-08 |
| §5.4 Redeeming a Token | ₹10 contribution uses D-1 four principles; implementation note honest (no code ceiling, UI ₹5); settlement treatment correct; system checks match V-03 |
| §5.5–5.6 Proof and Settlements | Write-once proofs confirmed; settlement statuses match V-11 |
| §6.1–6.2 Volunteer Registration and Tokens | Holding limits, accountability — all consistent with §3.9 |
| §6.3 Distributing Tokens | Seven situations match D-9 verbatim structure; five prohibitions correct; Planned B-27/B-30/B-31 cite real items |
| §7.1–7.4 Beneficiary | Registration, nearby vendors, redemption, feedback — all match V-02, V-03, V-04, V-07 |
| §8.1–8.3 Public Features | General Donation Pool, UPI QR, transparency — match V-05, V-06; Planned B-11/B-21 cite real items |
| §9.1–9.8 System Configuration | Per-key NULL semantics correct; classifications appropriate; all match verification findings |
| §9.9 Special Care | **Finding 1 (CRITICAL)** on `patient_eligibility_months`; remainder correct per D-8 and V-17 |
| §10.1 General FAQ (39 Qs) | Client's verbatim wording used as base; supersessions correctly applied (Q12/13 → D-2A/B-03; Q14–16 → D-1; Q19 → D-8; Q31 → B-11; Q38 → D-2); answers consistent with body sections |
| §10.2 Donor FAQ (20 Qs) | Client's wording adopted; privacy templates per D-10; refund/credit/Path A–B answers consistent with §4 |
| §10.3 Food Partner FAQ (28 Qs) | Client's wording adopted; **Finding 2 (MAJOR)** on Q6 Reconciled status; remainder consistent with §3.8 and §5 |
| §10.4 Admin FAQ (8 Qs) | Go-Live cross-reference correct; NULL semantics match §9; settlement finality consistent with §3.8 |
| Appendix A Food Partner CoC | ₹10 wording correct per D-1; face privacy correct per V-04 |
| Appendix B Volunteer CoC | Point 7 (facilitate, not create entitlement) matches D-9 |
| Appendix C Business Rules | Compensating rollbacks match V-19; audit immutability matches V-14(b); retention policy correct |

---

## Completeness Checks

### All Planned (B-nn) markers cite real register items

Every Planned marker in the guide was checked against the Review Register §3 and §11. All cite real items: B-01, B-02, B-03, B-06, B-07, B-08, B-09, B-10, B-11, B-12, B-13, B-14, B-15, B-16, B-19, B-20, B-21, B-23, B-24, B-25, B-26, B-27, B-28, B-29, B-30, B-31, B-32. No marker cites a nonexistent item. **PASS.**

### All client decisions reflected in the guide

| Decision | Reflected | Location(s) |
|----------|-----------|-------------|
| D-1 (₹10 contribution) | Yes | §1, §3.8, §5.4, §7.3, §10.1 Q14–16, §10.3 Q7–10, Appendix A |
| D-2 (Geographic structure) | Yes | §9.6, §10.1 Q38, Planned B-02 |
| D-2A (Token model) | Yes | §3.3, §4.3, Planned B-23 |
| D-3 (Discipline ladder) | Yes | §3.5 |
| D-4 (Maker-checker) | Yes | §3.8, §10.3 Q6, §10.4 Q5 |
| D-5 (Settlement audit) | Yes | §3.8, verbatim policy paragraph |
| D-6 (Emergency) | Yes | §3.11 |
| D-7 (Emergency verification) | Yes | §3.11 |
| D-8 (Special Care) | Yes | §5.2, §9.9, §10.1 Q19 |
| D-9 (Volunteer procedure) | Yes | §6.3 |
| D-10 (Privacy) | Yes | §4.7, §10.2 Q8–9 |
| D-10A (Distribution model) | Yes | §3.3, §4.3, §4.5 |
| D-11 (80G) | Yes | §9.8 |
| D-12 (§3.13) | Yes | §3.13 rewritten |

**PASS.**

### All register build items referenced

All 32 build items (B-01 through B-32, excluding closed B-04/B-05 and resolved B-18) are referenced with Planned markers in the guide where their scope intersects guide content. B-17 (CSR allocation/impact linkage, Phase 2) is the only item without a direct Planned marker, but its scope (CSR module depth) is Phase 2 and the guide's brief §3.14 CSR reference is appropriate. **PASS.**

### 10 undocumented features from Register §5

9 of 10 documented. Missing: scheduled-redemption reminders (Finding 3, MINOR).

### Changelog source tags

Spot-checked 40+ entries across all changelog sections. Every entry carries at least one source tag ([DECISION-n], [V-nn], [B-nn planned], [client-FAQ], [structural], [carried from first-cycle rewrite], [client §n.n], [register §n]). **PASS.**

---

## Summary

| Severity | Count | Applied | Recommendation only |
|----------|-------|---------|---------------------|
| CRITICAL | 1 | 1 | 0 |
| MAJOR | 1 | 1 | 0 |
| MINOR | 2 | 0 | 2 |
| **Total** | **4** | **2** | **2** |

| Test | Findings |
|------|----------|
| a (TRUTH) | 2 (Finding 1 CRITICAL, Finding 2 MAJOR) |
| b (CURRENCY) | 1 (Finding 2, overlaps with test a) |
| c (CONSISTENCY) | 1 (Finding 4 MINOR) |
| d (COMPLETENESS) | 1 (Finding 3 MINOR) |

| Origin | Findings |
|--------|----------|
| Carried §1–6.2 content | 1 (Finding 4 — §2/§6.1 "face photo" terminology) |
| New rewrite / FAQ content | 3 (Findings 1, 2, 3) |
