# pApAmA — Client's Verbatim FAQ Drafts (Sections 10.1–10.3)

**Source:** Three review emails from Mr. Ramesh Bafna, 11 Aug 2026 (Sections 10.1, 10.2, 10.3 of the guide).
**How to use:** These are the client's own drafted FAQ questions and answers. Version 1.1's §10.1–10.3 must use HIS wording as the base. Two kinds of content appear: (a) fully drafted Q&A — adopt the wording substantially as written; (b) instructions ("The FAQ should explain…") — write the answer to satisfy the instruction. In BOTH cases, correct any answer that is superseded by the later 14–16 Aug decisions (`pApAmA-Client-Decisions-2026-08.md`) or contradicted by the verification reports — his own closing instruction in each email requires exactly this check. Known supersessions to apply: Q12/Q13 & 10.2 #10/#11 → Meal-Pool return policy (B-03) and 60-day validity/reissue model (D-2A); Q14–Q16 & 10.3 #7–#10 → the final D-1 ₹10 model (four principles, settlement gate, waiver recording); Q19 → the D-8 ₹100 Special Care Token model; Q31 & 10.2 #13/#14 → guest contact capture is Planned (B-11); Q35 & 10.3 #24 → redirection/line-item hold are Planned (B-13/B-08); Q38 → the D-2 Phase 1 location architecture; 10.2 #3 → Donor Credit does not expire (decided); 10.2 #6 → no donor-side cancellation exists, admin revocation returns value to the Admin Pool (V-18); 10.3 #6 → the settlement status mapping per D-4.

---

## SECTION 10.1 — GENERAL FAQs (client's email, verbatim)

Q1. Can a beneficiary receive a meal without a smartphone?
A: Yes. A beneficiary does not need a smartphone. A token may be presented through a printed QR code or with the assistance of an authorised volunteer. The Food Partner scans the token and completes the redemption process.

Q2. Can a beneficiary receive a meal without Aadhaar or formal identification?
A: Yes. Aadhaar is not mandatory for receiving a pApAmA meal. The platform is designed to ensure that lack of formal identification does not automatically prevent a genuine person in need from receiving assistance. Alternative verification and assisted processes may be used in accordance with the Foundation's approved policies.

Q3. Does pApAmA cook, store or deliver food?
A: No. pApAmA is a meal-enablement platform. Approved Food Partners prepare the food and serve it directly to the beneficiary. pApAmA does not cook, store or deliver food.

Q4. Who provides the meal?
A: The meal is prepared and served by an approved pApAmA Food Partner, such as a restaurant, food shop or other authorised meal provider.

Q5. Can a beneficiary use a token at any restaurant?
A: No. Tokens can only be redeemed at approved pApAmA Food Partners that are active and eligible to participate in the platform.

Q6. Can a token be exchanged for cash?
A: No. pApAmA tokens are meal-enablement vouchers. They have no cash-withdrawal value and cannot be exchanged for cash.

Q7. Can a donor withdraw donated money later?
A: No. Once a donation has been credited as Donor Credit, it represents a commitment to fund meals and is not a withdrawable cash balance.

Q8. What happens when a donor creates a token?
A: The donor's available Donor Credit is reduced by the token amount and a digital meal token is created. The donor can either distribute the token personally or allow pApAmA to distribute it through its authorised volunteer network.

Q9. Can a donor give a token directly to someone in need?
A: Yes. Under the personal distribution pathway, the donor can share the token QR code directly with a person in need. The token can be displayed digitally or printed.

Q10. What happens if a donor chooses "Let pApAmA distribute"?
A: The token enters the Admin Pool and may be allocated to an authorised volunteer, who can then distribute it to an eligible beneficiary.

Q11. What happens if a token is lost?
A: Where the applicable system function is enabled, an authorised administrator can report the token as lost, block the original token and issue a replacement according to the platform's token-replacement rules. The action is recorded for audit purposes.

Q12. What happens if a token expires?
A: This depends on the token-expiry policy configured by the Foundation. Where token expiry is enabled, an unused token may expire after the configured period. The treatment of the unredeemed value must follow the Foundation's approved financial policy.

Q13. What happens if the meal costs less than the token value?
A: The difference between the token value and the approved meal value is recorded by the platform in accordance with the Foundation's approved accounting and donor-fund policy. This treatment should be clearly documented before the final Technical Administration Guide is issued.

Q14. Is the beneficiary required to contribute towards the meal?
A: Under the present operating policy, the beneficiary contribution is ₹10 per meal. The contribution is intended for the pApAmA Administration Account to support approved administrative and operational expenses.
The contribution may be collected directly by pApAmA or, where operationally appropriate, by the Food Partner on behalf of pApAmA and subsequently remitted to the designated Administration Account.
Approved humanitarian waivers may apply where appropriate.

Q15. Why does pApAmA ask a beneficiary to contribute ₹10?
A: The contribution is intended to encourage participation and dignity while helping support the administrative and operational costs of the pApAmA programme. It is not intended to make the beneficiary responsible for the cost of the meal.
The Foundation may provide appropriate exemptions or waivers in situations where the beneficiary is unable to contribute.

Q16. Does the Food Partner keep the ₹10 contribution?
A: No. Under the Foundation's present policy, the ₹10 contribution belongs to the pApAmA Administration Account. Where the Food Partner collects it on behalf of pApAmA, the amount must subsequently be remitted and reconciled with the Foundation.

Q17. Does pApAmA guarantee that every token will provide exactly the same meal?
A: The meal must be selected from the Food Partner's approved menu and comply with the applicable pApAmA meal standards. The Foundation's Standard Meal Framework should define the minimum requirements for meal value, portion, quality and, where applicable, nutritional standards.

Q18. Can a beneficiary receive more than one meal in a day?
A: The platform applies configurable meal limits and cooldown periods. These are intended to ensure fair distribution of donor-funded meals. Special Care or emergency provisions may permit different limits where authorised.

Q19. Can Special Care beneficiaries receive additional assistance?
A: Yes, where the beneficiary falls within an approved Special Care category and meets the applicable eligibility requirements. Special Care may provide different meal limits, cooldowns or meal values according to Foundation policy.
The Technical Administration Guide should refer only to categories actually implemented in the platform.

Q20. What happens during a disaster or emergency?
A: pApAmA can operate under an authorised Emergency Mode where applicable. Certain normal restrictions may be relaxed to enable faster humanitarian assistance.
However, financial records, token records, audit trails and fraud controls remain active.

Q21. Can a beneficiary be denied food because they do not have documents?
A: Lack of Aadhaar, a smartphone or formal identification should not by itself prevent a genuine beneficiary from receiving assistance, subject to the Foundation's approved verification and safeguarding procedures.

Q22. How does pApAmA prevent the same token from being used twice?
A: Each token has a unique identity and its status is checked during redemption. Once successfully redeemed, the token cannot normally be redeemed again.
Additional fraud controls may identify suspicious duplicate or abnormal activity.

Q23. How does pApAmA prevent repeated claims by the same beneficiary?
A: The platform applies beneficiary verification, meal cooldowns and daily meal limits. Additional fraud-monitoring mechanisms may identify suspicious patterns for administrative review.

Q24. Does pApAmA store the beneficiary's photograph?
A: The platform's current implementation does not retain the original beneficiary face photograph as a stored image. The identity-verification process uses a mathematical representation for verification. The Technical Administration Guide should accurately document the implemented privacy and security mechanism.

Q25. Can a beneficiary give feedback about the meal?
A: Yes. Beneficiaries can provide feedback regarding food quality, quantity and service. Serious concerns can also be submitted as complaints for administrative investigation.

Q26. What happens if a beneficiary has a complaint about a Food Partner?
A: The complaint is recorded and reviewed by the Foundation. Depending on the nature and seriousness of the issue, the Food Partner may receive corrective guidance, warnings, penalties, enhanced monitoring or suspension in accordance with the Foundation's approved Food Partner governance policy.

Q27. How are Food Partners monitored?
A: Food Partners are monitored through beneficiary feedback, complaints, inspections, redemption activity and other quality and fraud indicators available within the platform.

Q28. Does pApAmA reveal beneficiary information publicly?
A: No. Public-facing information should be aggregated and should not disclose personal information relating to beneficiaries or donors.

Q29. Can anyone donate to pApAmA?
A: Yes. A person can donate through the public donation facility without necessarily creating a donor account. Such donations are recorded and administered through the Foundation's designated public/general donation pool.

Q30. What is a public or guest donation?
A: A public donation is a contribution made by a person who chooses to donate without creating a registered donor account.
This is particularly useful for people making one-time donations, event-related contributions or donations through a publicly shared QR code.

Q31. Will a donor receive confirmation of a public donation?
A: Where the donor provides a mobile number or other permitted contact information, pApAmA should provide an appropriate acknowledgement and thank-you communication after the successful donation.
Where the applicable communication channel is enabled, the donor should also receive an impact notification when the contribution ultimately results in a meal being redeemed.

Q32. Can pApAmA donations be made for a particular occasion?
A: The Foundation's long-term donation model may support occasion-based giving such as birthdays, anniversaries, memorial donations, festivals, monthly giving and emergency campaigns. Such functionality should be documented according to the actual implementation status of the platform.

Q33. Can donors know what impact their donation has created?
A: Yes. Registered donors can track their donation and token activity through the donor interface. The Foundation also intends to provide public aggregate impact information through the Transparency Dashboard.

Q34. Does pApAmA provide cash assistance to beneficiaries?
A: No. pApAmA is designed to enable access to freshly prepared meals. Tokens are intended for meal redemption and are not cash benefits.

Q35. What happens if a Food Partner is temporarily closed or cannot serve a meal?
A: The platform supports Food Partner availability controls. Where applicable, beneficiaries should be directed to another approved Food Partner rather than being required to redeem at an unavailable location.

Q36. What happens if there is a technical problem while redeeming a token?
A: The Food Partner or authorised administrator should follow the platform's prescribed exception and support procedure. A meal should not be recorded as successfully redeemed unless the transaction has been appropriately confirmed by the platform or authorised process.

Q37. How is donor money protected?
A: pApAmA maintains transaction records, token records, redemption records, settlement records, audit logs and fraud-monitoring controls to provide traceability and accountability for donor-funded activity.

Q38. Can pApAmA operate in more than one city?
A: Yes. The initial implementation may operate within a defined city boundary, but the platform should be capable of expanding geographically. The intended geographic structure should support:
Country → State → District → City/Town → PIN Code
This will allow pApAmA to expand in a controlled manner while maintaining location-wise reporting and accountability.

Q39. What is the basic philosophy of pApAmA?
A: pApAmA is designed to enable meals with dignity.
It connects donors, beneficiaries, Food Partners and volunteers through a controlled technology platform so that charitable contributions can be converted into freshly prepared meals for people in need.
The platform does not merely transfer money. It creates an accountable pathway from:
Donation → Meal Token → Beneficiary → Food Partner → Meal Served → Verification → Settlement → Donor Impact

*Client's closing instruction (10.1):* "each answer should be checked against the actual implemented software and the Foundation's approved policies before Version 1.1 is finalised. This will prevent the FAQ from unintentionally creating a business rule that the platform does not currently support."

---

## SECTION 10.2 — FAQs FOR DONORS (client's email, verbatim)

1. Can I get my money back after donating?
Client's recommended wording: "No. Once a donation is successfully received and credited as Donor Credit, it is non-withdrawable and is committed to the pApAmA programme. The treatment of unused, expired or forfeited token value follows the Foundation's approved financial policy." (He asks to avoid "your contribution goes directly to feeding people" until the value policy is documented — it now is: Meal-Pool return, B-03.)

2. What is Donor Credit?
Donor Credit is the non-withdrawable balance representing the donor's committed funds within pApAmA. It increases when the donor makes a donation and decreases when the donor mints a token. The donor should be able to see the credit balance and relevant transaction history.

3. Does Donor Credit expire?
Client's wording where the policy is no-expiry (it is — decided): "Donor Credit does not expire. It remains available to the donor until it is used to mint a token, subject to the applicable platform and Foundation policies."

4. What is the difference between Path A and Path B?
Retain the existing explanation. Path A – Donor Distribution: the donor personally decides whom to give the token to; the token is shared directly with the intended beneficiary. Path B – pApAmA Distribution: the donor entrusts the token to pApAmA, which places it in the Admin Pool for allocation through authorised volunteers. Also make clear Path B is preferable where the donor does not personally know a beneficiary or wishes pApAmA to identify and assist someone in need.

5. Is a Path A token transferable?
A donor-distributed token can be presented by whoever possesses the valid QR code, subject to the platform's redemption controls. The Guide should therefore caution donors not to post or publicly circulate a token unless they intentionally want it to be accessible to anyone who obtains it.

6. Can I cancel a token after creating it?
Instruction: explain the actual functionality. If a token cannot be cancelled directly by the donor, state this clearly. Where an administrator can revoke a token, explain the effect on its value.

7. What happens if my token is lost?
Instruction: state the token-loss and replacement procedure — the replacement retains the appropriate value while the original token is permanently prevented from being redeemed.

8. What happens when my token is redeemed?
The donor should receive an appropriate notification confirming that the token has been redeemed and that a meal has been served, with (where available): Food Partner name, meal served, date/time, token or meal value, thank-you message. [Note: reconcile with the D-10 privacy templates — City + State location convention governs.]

9. Will I know who received my meal?
The donor should receive appropriate impact information without unnecessarily exposing the beneficiary's personal information. The identity and privacy of beneficiaries should be protected. The donor needs to know that a meal was served, rather than necessarily knowing the identity of the person who received it.

10. What happens if my token expires without being used?
Instruction: state the Foundation's approved policy for expired tokens, consistent across the guide, donor communications and accounting records. (Now decided: 60-day validity; expired value returns to the Meal Pool; controlled reissue — D-2A/B-03.)

11. What happens if the meal costs less than my token value?
Instruction: the difference is recorded according to the Foundation's approved financial policy, transparent to donors and consistent in accounting and reporting. (Now decided: Meal-Pool return; for Special Care tokens, the Common Special Care Pool — D-8.)

12. Can I choose the value of my token?
Instruction: explain Donation → Donor Credit → Token and the minimum/standard token value configured by the Foundation, so donors understand why sufficient Donor Credit is needed before creating a token.

13. Can I donate without creating an account?
Yes. The Public Donation facility allows a person to make a donation without registering as a donor. Where a mobile number is provided, the donor should receive an appropriate acknowledgement and thank-you communication. [Contact capture is Planned — B-11.]

14. Will a public donor receive a meal-redemption notification?
Where the donor has provided a valid mobile number or other contact information and the applicable notification channel is enabled, the donor should receive an appropriate notification when the contribution ultimately results in a meal being redeemed. This is an important part of the donor-impact journey. [Planned — B-11 + channels.]

15. Can I make a donation for a particular occasion?
The donation model should support, where implemented: monthly giving, birthday giving, anniversary giving, memorial donations, festival campaigns, emergency relief campaigns — with the donor identifying the intended occasion where campaign functionality permits. The FAQ should accurately distinguish implemented from future planned functionality.

16. Can I donate through a birthday, wedding or other event instead of receiving gifts?
The long-term model may allow a celebrant to request that guests donate to pApAmA instead of giving gifts, with a dedicated QR code or campaign identifier associating the donations with that occasion. Document when the relevant functionality is implemented.

17. Can I see the impact of all my donations?
Yes. Registered donors should be able to view their donation history, Donor Credit, tokens created and meals served through their donor interface, subject to the functionality implemented. The public Transparency Dashboard should additionally provide aggregate platform-level impact without revealing personal information.

18. Is my donation used only for food?
Instruction: answer carefully and consistently with the approved financial policy, transparent about the distinction between funds committed to meal tokens, beneficiary contributions, approved administrative and operational expenses, reserve funds where applicable, and any unused, expired or forfeited token value. "This transparency will strengthen rather than weaken donor confidence."

19. Can I donate again after my token has been redeemed?
Yes. A donor may make additional donations at any time, subject to the applicable donation mechanism. The donor's impact history should continue to accumulate over time.

20. What is the main difference between donating and sponsoring a meal?
A donation places funds into the pApAmA system, while token creation converts the donor's available credit into a defined meal entitlement that can subsequently be distributed and redeemed.

*Client's overall recommendation (10.2):* cover the complete donor journey — Donate → Donor Credit → Mint Token → Distribute → Meal Redeemed → Donor Notified → Impact Tracked — and reconcile all answers with the implemented software and final financial policies.

---

## SECTION 10.3 — FAQs FOR FOOD PARTNERS (client's email, verbatim)

1. Why is my payment locked?
Payment remains locked until the required proof of service is submitted and the applicable approval process is completed. This protects both the Food Partner and pApAmA by ensuring that payments are supported by evidence of the meal served. Clarify that the payment is not permanently withheld; it moves through the defined approval and settlement process.

2. What proof do I need to submit?
The required proof currently includes a plate/meal photograph and a receipt or bill showing the meal item and applicable value. The photographs should be clear and sufficiently legible for verification.

3. What if my proof is rejected?
The Food Partner should receive the rejection reason and be permitted to correct the issue and resubmit the proof where the platform allows.

4. Why does pApAmA require proof of service?
Proof protects all parties: donor funds are protected; Food Partners have evidence supporting their payment claim; beneficiary meals can be verified; fraudulent or duplicate claims can be identified; the Foundation maintains an auditable record.

5. How often will I be paid?
Settlement cycles may be daily, twice weekly or weekly, depending on the Foundation's configured operating policy. The Food Partner should be able to view the status of its settlements.

6. What do the settlement statuses mean?
Pending — approved meals awaiting settlement. Reconciled — the settlement has been reviewed and reconciled and is awaiting payment. Paid — the payment has been transferred to the Food Partner. [Align with the D-4 status mapping incl. locked/approved stages.]

7. Does the Food Partner receive the full approved meal value?
Under the present Foundation policy, the Food Partner should receive the approved meal value in full, subject to the applicable settlement rules. The beneficiary's ₹10 contribution is treated separately and is intended for the pApAmA Administration Account. Where the Food Partner collects the ₹10 on behalf of pApAmA, it must remit the amount to the designated Administration Account and the amount must be reconciled separately.

8. Why does the beneficiary pay ₹10?
The ₹10 contribution is intended to support the pApAmA Administration and operational account. It is not intended to reduce the Food Partner's approved meal payment. The contribution should therefore be treated as a separate financial transaction from the Food Partner's meal settlement.

9. What happens if the beneficiary cannot pay the ₹10?
Reflect the Foundation's approved humanitarian waiver policy: a genuine beneficiary should not be denied food solely because they are unable to make the contribution in an approved hardship or humanitarian situation. The mechanism for recording such a waiver should follow the actual platform functionality. [Waiver recording is Planned — B-01.]

10. Can I charge the beneficiary more than ₹10?
No. The Food Partner should not impose any additional charge on a beneficiary beyond the amount authorised by pApAmA. The beneficiary should receive the approved meal without being pressured to make any additional payment.

11. Can I serve any meal I want?
No. Only meals/items approved through the pApAmA menu process should be offered for token redemption. The Food Partner must serve the approved menu item corresponding to the redemption.

12. Can I change my menu or prices?
Food Partners may propose changes through the menu-management process. Changes to meal items or prices may require administrative review and approval before they can be used for pApAmA redemptions.

13. What is the pApAmA Standard Meal Framework?
The Standard Meal Framework will define the Foundation's minimum expectations regarding meal value, portion, quality and, where applicable, nutritional standards. Food Partners should comply with the approved framework once it is formally adopted.

14. Can I temporarily close my Food Partner outlet?
Where the platform supports temporary closure or availability controls, the Food Partner should update its status so that beneficiaries are not directed to an outlet that is unable to serve meals. [Supported — V-08.]

15. What happens if I reach my daily meal capacity?
If capacity enforcement is enabled and the Food Partner reaches its configured daily capacity, further redemptions will not be accepted until the applicable limit resets. This protects meal quality and prevents Food Partners from accepting more meals than they can properly serve.

16. Can I refuse a valid pApAmA token?
A Food Partner should not refuse a valid token without a legitimate operational reason. Where the token is invalid, expired, already redeemed or fails an applicable platform rule, the Food Partner should follow the system's prescribed process rather than attempting to bypass the system.

17. Can I redeem the same token twice?
No. Once a token has been successfully redeemed, it cannot normally be redeemed again. Any suspicious duplicate redemption should be reported through the appropriate platform process.

18. What happens if there is a technical problem during redemption?
The Food Partner should follow the platform's approved exception/support procedure and should not treat an unsuccessful or unconfirmed transaction as a completed redemption unless the system or authorised administrator confirms it.

19. How are Food Partners monitored?
Monitoring may include beneficiary feedback, complaints, food inspections, redemption patterns, proof submissions, fraud indicators, quality ratings and settlement discrepancies. The purpose is not merely enforcement but also continuous improvement in food quality and service.

20. What happens if I receive complaints?
Complaints should be investigated fairly. The Foundation may follow a graduated corrective-action process: first occurrence → warning → second occurrence → final warning → third occurrence → appropriate penalty/enhanced monitoring → continued non-compliance → suspension/review. However, serious matters such as food safety risks, deliberate fraud or conduct posing an immediate danger to beneficiaries may justify immediate suspension.

21. Can my Food Partner registration be suspended?
Yes, where justified under the Foundation's Food Partner governance policy. Suspension may result from serious or repeated quality issues, fraud, food safety concerns, regulatory non-compliance or other material violations.

22. Can a suspended Food Partner be reinstated?
Where the Foundation's policy permits reinstatement, the Food Partner may be reinstated after the identified deficiencies have been corrected and the required review has been completed.

23. What happens if my settlement contains an error?
The Food Partner should raise the discrepancy through the prescribed support or settlement-review process. The transaction should remain traceable, and any correction should be recorded rather than altering the historical transaction.

24. Can pApAmA withhold an entire settlement because of one disputed transaction?
The settlement process should follow the Foundation's approved financial-control policy. Where possible, only the disputed amount should be placed on hold while undisputed amounts proceed through normal settlement, subject to the actual functionality implemented. This would help protect Food Partner cash flow while maintaining financial controls. [Line-item hold is Planned — B-08; current holds are settlement-level.]

25. Why does pApAmA need photographs of the meal?
The meal photograph provides evidence that the claimed meal was actually prepared and served. The purpose is accountability and fraud prevention, not unnecessary monitoring of Food Partners.

26. Can the same photograph be used for another redemption?
No. Reusing the same or substantially similar proof photograph for multiple transactions may trigger a fraud or duplicate-media flag and may result in administrative investigation.

27. Will pApAmA publish my Food Partner information?
Only information authorised for operational, transparency or public-facing purposes should be published. Sensitive KYC and financial information should remain restricted to authorised personnel.

28. What is expected from a pApAmA Food Partner?
The fundamental responsibility is: serve a safe, hygienic, approved and appropriately portioned meal to the eligible beneficiary, record the transaction accurately and provide the required evidence for settlement.

*Client's overall recommendation (10.3):* explain the complete Food Partner journey — Registration → KYC Approval → Menu Approval → Availability/Capacity → Token Redemption → Meal Service → Proof Submission → Verification → Settlement → Payment — with the principles: Food Partners receive the approved meal value per settlement rules; the ₹10 contribution is separate and belongs to the pApAmA Administration Account; proof protects donor funds and Food Partners alike; quality and beneficiary safety are fundamental; complaints normally follow the graduated corrective-action process with immediate suspension reserved for serious cases; all financial transactions remain traceable and auditable. Final answers checked against implemented functionality and approved policies before publication.
