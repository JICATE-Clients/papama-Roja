import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveVendorId } from "@/lib/vendor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { validateRedemption } from "@/lib/services/redemption";
import { flagFraud } from "@/lib/services/fraud";
import {
    initialContributionStatus,
    resolveExpectedContribution,
} from "@/lib/services/contribution";
import { resolveServiceLocation } from "@/lib/services/serviceLocation";
import { embeddingFingerprint, toVectorLiteral } from "@/lib/face/embedding";
import { faceCaptureSchema } from "@/lib/validation/schemas";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { incrementUsage } from "@/lib/services/vendorCapacity";
import { postLedgerEntry } from "@/lib/services/ledger";
import { getNumber } from "@/lib/system-config";

/**
 * POST /api/vendor/redemptions — commit a redemption (RED-1..7, PROOF-4).
 *
 * Gated by `token_redemption/create` (scope own). Re-runs the full validation
 * engine (so the preview's result can't be replayed past a state change); on the
 * first HARD failure it 400s. On success it writes, on the service-role client:
 *   1. the token_redemptions row (value split, geo, beneficiary if matched,
 *      face_hash_checked, payment_status defaults to 'locked'),
 *   2. flips the token to 'redeemed' — guarded on the still-redeemable status so
 *      a concurrent double-scan can't redeem twice,
 *   3. appends a redemption_cooldown_log entry (fair-usage signal), and
 *   4. a forfeited_balances row when token value > menu value (owner §4.4).
 * Vendor identity is resolved server-side. Payment stays LOCKED until proof is
 * submitted via the [id]/proof route.
 *
 * GET /api/vendor/redemptions — list this vendor's redemptions, newest first,
 * through the session (RLS) client.
 */
const createSchema = z.object({
    qr_payload: z.string().min(1),
    menu_item_id: z.string().uuid(),
    geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
    // Face capture is REQUIRED to redeem (owner §4.6 — the vendor captures a photo).
    // This closes the prior "validations bypassable by omitting the face" gap.
    face_capture: faceCaptureSchema,
    co_pay: z.number().int().min(0).optional(),
});

export const POST = defineRoute(
    { feature: "token_redemption", action: "create", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, createSchema);

        const admin = createAdminClient();
        const vendorId = await resolveVendorId(user, admin);
        if (!vendorId) throw new BadRequestError("no vendor profile for this account");

        const faceFingerprint = embeddingFingerprint(body.face_capture.embedding);

        const result = await validateRedemption(
            {
                qr_payload: body.qr_payload,
                vendor_id: vendorId,
                menu_item_id: body.menu_item_id,
                geo: body.geo,
                face: body.face_capture,
                co_pay: body.co_pay,
            },
            admin
        );

        if (!result.ok || !result.token || !result.menuItem) {
            const failed = result.checks.find((c) => c.hard && !c.pass);
            // Real-time fraud signal: a repeat-beneficiary attempt (cooldown / daily limit).
            if (failed && (failed.name === "cooldown" || failed.name === "meal_limit")) {
                await flagFraud(admin, {
                    flag_type: "beneficiary_duplicate",
                    severity: "medium",
                    detection_method: "face_hash_repeat",
                    entity: { kind: "face", id: result.beneficiary?.id ?? faceFingerprint },
                });
            }
            throw new BadRequestError(
                failed ? `${failed.name}: ${failed.detail}` : "redemption failed validation"
            );
        }

        const token = result.token;
        const value = result.value;
        const beneficiaryId = result.beneficiary?.id ?? null;
        const nowIso = new Date().toISOString();

        // A-1: freeze WHERE the meal was served, from the Food Partner's
        // operating address as it stands right now. Never re-derived later — a
        // vendor moving premises must not relocate historical redemptions.
        const serviceLocation = await resolveServiceLocation(admin as never, vendorId);

        // F-1 (CD §D-1): freeze what the ₹10 contribution was under policy AT
        // THIS MOMENT. Frozen per row so a later policy change cannot re-price
        // historical redemptions. Unset config → 0 expected: never invent a
        // charge to a beneficiary, and never block every settlement on a value
        // nobody has set.
        let contributionPolicy: number | null = null;
        try {
            contributionPolicy = await getNumber("co_contribution_max", admin as never);
        } catch {
            contributionPolicy = null;
        }
        const contributionExpected = resolveExpectedContribution(contributionPolicy);

        // 1. Insert the redemption (payment_status defaults to 'locked').
        const { data: redemptionRow, error: redemptionError } = await admin
            .from("token_redemptions")
            .insert({
                token_id: token.id,
                beneficiary_id: beneficiaryId,
                vendor_id: vendorId,
                token_value_inr: value.token_value,
                menu_value_inr: value.menu_value,
                difference_paid_inr: value.difference_paid,
                co_pay_inr: value.co_pay,
                geo_lat: body.geo?.lat ?? null,
                geo_lng: body.geo?.lng ?? null,
                face_hash_checked: true, // capture required + liveness-gated + vector-matched
                ...serviceLocation,
                // Starts OUTSTANDING even when the beneficiary paid at the
                // counter: the Food Partner holds that ₹10 as pApAmA's agent
                // (CD §D-1 principle 2), and it is not pApAmA's money until
                // remitted AND reconciled. Marking it collected here would
                // release settlements against money pApAmA has not received.
                contribution_expected_inr: contributionExpected,
                contribution_status: initialContributionStatus(contributionExpected),
            })
            .select("id, payment_status")
            .single();

        if (redemptionError || !redemptionRow) {
            throw new Error(redemptionError?.message ?? "failed to record redemption");
        }
        const redemption = redemptionRow as { id: string; payment_status: string };

        // 2. Fair-usage cooldown log — written BEFORE the burn so a failure ABORTS the
        //    redemption rather than silently leaving fair-usage un-seeded (which would
        //    let this person redeem again with no cooldown/meal-limit trip — the gap
        //    this fix closes). Stores the face EMBEDDING for cross-vendor vector
        //    repeat-detection AND beneficiary_id for the beneficiary-keyed signal. On
        //    failure we roll back the redemption row and 500 — the token is NOT yet
        //    burned, so the vendor can safely retry.
        const { data: cooldownRow, error: cooldownError } = await admin
            .from("redemption_cooldown_log")
            .insert({
                beneficiary_id: beneficiaryId,
                face_hash: faceFingerprint,
                face_embedding: toVectorLiteral(body.face_capture.embedding),
                token_id: token.id,
                vendor_id: vendorId,
            })
            .select("id")
            .single();
        if (cooldownError || !cooldownRow) {
            await admin.from("token_redemptions").delete().eq("id", redemption.id);
            throw new Error(
                `failed to record fair-usage log: ${cooldownError?.message ?? "no row returned"}`
            );
        }
        const cooldownLogId = (cooldownRow as { id: string }).id;

        // 3. Burn the token — guarded on the still-redeemable status (double-scan safe).
        const { data: burned, error: burnError } = await admin
            .from("tokens")
            .update({ status: "redeemed", redeemed_at: nowIso })
            .eq("id", token.id)
            .in("status", ["live", "distributed"])
            .select("id");
        if (burnError) throw new Error(burnError.message);
        if (!burned || burned.length === 0) {
            // Duplicate-redemption attempt: another scan redeemed it first. Flag + roll back
            // BOTH the redemption row and the fair-usage log row we just wrote. We delete the
            // cooldown row by ITS OWN id — NOT by (token_id, vendor_id) — so a losing
            // double-scan removes only the row IT inserted and never the WINNING scan's
            // fair-usage seed (which shares the same token_id + vendor_id). Wiping that seed
            // would let the served beneficiary redeem again with no cooldown/meal-limit trip.
            await flagFraud(admin, {
                flag_type: "duplicate_token",
                severity: "high",
                detection_method: "token_duplication",
                entity: { kind: "token", id: token.id },
                blocked: true,
            });
            await admin.from("token_redemptions").delete().eq("id", redemption.id);
            await admin
                .from("redemption_cooldown_log")
                .delete()
                .eq("id", cooldownLogId);
            throw new BadRequestError("token was already redeemed");
        }

        // Step 4 is a secondary tracking write that runs AFTER the token is already
        // burned. We do NOT throw on its failure — the meal happened and the token is
        // spent, so failing here would leave an inconsistent state and confuse the
        // vendor. Instead we capture the error and surface it in the audit metadata so
        // a silent failure can't quietly weaken forfeiture tracking.
        const secondaryWriteWarnings: { step: string; error: string }[] = [];

        // 4. Forfeited remainder when token value > menu value (owner §4.4).
        if (value.forfeited > 0) {
            const { error: forfeitError } = await admin.from("forfeited_balances").insert({
                token_id: token.id,
                redemption_id: redemption.id,
                forfeited_inr: value.forfeited,
            });
            if (forfeitError) {
                console.error("redemption.create: forfeited-balance insert failed", forfeitError);
                secondaryWriteWarnings.push({ step: "forfeited_balances", error: forfeitError.message });
            } else {
                // Where the remainder goes depends on the token type. NEITHER
                // destination is revenue (A-3 / CD §D-8, F-4 / B-03): both are
                // donated value that has not yet bought a meal, and booking
                // either as revenue records donated money as income to pApAmA.
                //
                // SPECIAL CARE: a ₹100 token on a ₹75 meal leaves ₹25 for the
                //   Common Special Care Pool, funding future special-care meals.
                // STANDARD: a ₹60 token on a ₹50 meal leaves ₹10 for the Meal
                //   Pool, funding another meal for anyone.
                const isSpecialCare = token.token_type === "special_care";
                const ledger = isSpecialCare ? "special_care_pool" : "meal_pool";

                try {
                    await postLedgerEntry({
                        admin,
                        ledger,
                        amountInr: value.forfeited,
                        referenceType: "redemption",
                        referenceId: redemption.id,
                        description: isSpecialCare
                            ? `Special Care surplus to pool on redemption ${redemption.id}`
                            : `unspent value returned to Meal Pool on redemption ${redemption.id}`,
                    });
                } catch (e) {
                    console.error(`redemption.create: ${ledger} ledger posting failed`, e);
                    secondaryWriteWarnings.push({
                        step: `ledger:${ledger}`,
                        error: e instanceof Error ? e.message : String(e),
                    });
                }
            }
        }

        // 5. Vendor daily-capacity counter (addon #4) — bump today's served count.
        //    Best-effort + non-blocking like step 4: the meal already happened and
        //    the token is burned, so a counter failure must NOT fail the redemption.
        //    Atomic upsert via the SQL RPC; tolerant of the addon migration not yet
        //    being applied (the warning is surfaced in the audit metadata).
        try {
            await incrementUsage(vendorId, admin);
        } catch (capErr) {
            const msg = capErr instanceof Error ? capErr.message : String(capErr);
            console.error("redemption.create: capacity-usage increment failed", capErr);
            secondaryWriteWarnings.push({ step: "vendor_capacity_usage", error: msg });
        }

        await audit({
            action: "redemption.create",
            entity_table: "token_redemptions",
            entity_id: redemption.id,
            summary: `redeemed token ${token.id} for ₹${value.menu_value} (payment locked)`,
            metadata: {
                token_id: token.id,
                vendor_id: vendorId,
                beneficiary_id: beneficiaryId,
                value,
                // Present only if a secondary tracking write (steps 3-4) failed.
                ...(secondaryWriteWarnings.length > 0
                    ? { secondary_write_warnings: secondaryWriteWarnings }
                    : {}),
            },
        });

        // Donor transparency (TRANS / demo step 8): alert the donor who funded it.
        if (token.donor_id) {
            const { data: v } = await admin
                .from("vendors")
                .select("name, city")
                .eq("id", vendorId)
                .maybeSingle();
            // Human-readable token reference for the donor (addon2 A5). The proof
            // photo is NOT yet uploaded at redemption time — it rides the later
            // `meal_photo` alert sent when the admin approves the proof.
            const { data: tk } = await admin
                .from("tokens")
                .select("serial_number")
                .eq("id", token.id)
                .maybeSingle();
            const meta = {
                token_reference: tk?.serial_number ?? null,
                // Keys MUST match the donor notifications UI reader
                // (app/donor/notifications/page.tsx) and NotificationMeta:
                // it reads `vendor_name` + `meal_info` — the old `vendor` key
                // and the missing `meal_info` rendered as `undefined`.
                vendor_name: v?.name ?? null,
                meal_info: result.menuItem?.item_name ?? null,
                location: v?.city ?? null,
                // `time` is the canonical scan timestamp the UI reads; `redeemed_at`
                // is kept as an alias so neither reader falls back to created_at.
                time: nowIso,
                redeemed_at: nowIso,
                value_inr: value.menu_value,
                beneficiary_category: result.beneficiary?.category ?? null,
            };

            await dispatchNotification(admin, {
                donorId: token.donor_id,
                kind: "redemption",
                title: "Your token was redeemed",
                // Folds a thank-you line into the redemption alert — this is the
                // notification that renders the re-donate ("Donate again") CTA in the
                // donor UI, so the gratitude + ask land together (TRANS-2).
                message: `A token you funded was redeemed at ${v?.name ?? "a partner vendor"} for a ₹${value.menu_value} meal. Thank you for making it possible.`,
                metadata: meta,
                // Default channels = ['in_app']. Pass ['in_app','email','sms'] here once
                // the email/SMS provider is configured (ASSUMPTIONS.md open item Q4).
            });

            // Thank-you (TRANS-2): a warm follow-up with the re-donate link (the donor
            // UI renders a re-donate CTA for kind:'thank_you'). Separate from the
            // factual redemption alert above so the donor sees both the impact event
            // and the gratitude/ask. Same metadata so the UI can show context.
            await dispatchNotification(admin, {
                donorId: token.donor_id,
                kind: "thank_you",
                title: "Thank you — your gift became a meal",
                message: `Thanks to you, someone was served a meal at ${v?.name ?? "a partner vendor"}. Tap to donate again and fund the next one.`,
                metadata: meta,
            });
        }

        return {
            redemption_id: redemption.id,
            payment_status: redemption.payment_status,
            value,
        };
    }
);

export const GET = defineRoute(
    { feature: "token_redemption", action: "read", scope: "own" },
    async () => {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("token_redemptions")
            .select(
                "id, token_id, token_value_inr, menu_value_inr, difference_paid_inr, co_pay_inr, payment_status, proof_status, proof_review_note, proof_uploaded_at, redeemed_at, created_at"
            )
            .order("redeemed_at", { ascending: false });

        if (error) throw new Error(error.message);

        return { redemptions: data ?? [], total: (data ?? []).length };
    }
);
