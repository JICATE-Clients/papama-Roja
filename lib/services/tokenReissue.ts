import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveQrPayload, qrHashOf } from "@/app/api/_lib/tokenQr";
import { BadRequestError, NotFoundError } from "@/lib/api/handler";
import type { AppUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/services/audit";
import { postLedgerEntry } from "@/lib/services/ledger";
import { flagException } from "@/lib/services/riskAudit";
import { planReissue, type ReissueSource } from "@/lib/services/tokenReissuePlan";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNumber } from "@/lib/system-config";

/**
 * Controlled reissue of an EXPIRED token (Work Order A-2 / B-23, CD §D-2A).
 *
 *   admin review → approve with reason → NEW token (new ID, new QR, new dates)
 *   permanently linked via `replacement_for_token_id` → original stays
 *   permanently `expired`.
 *
 * This replaces the retired revalidation, which revived the SAME token and left
 * a QR in circulation that was supposed to be dead. Nothing here touches the
 * original's status: the sweep expired it and it stays expired forever.
 *
 * The decisions (is it eligible, what the new token looks like, whether value
 * comes back out of the Meal Pool) are pure and tested in tokenReissuePlan.ts.
 * This file only reads and writes.
 */

type Client = SupabaseClient;

const SOURCE_SELECT =
    "id, serial_number, status, token_type, value_inr, donor_id, donation_id, campaign_id, " +
    "beneficiary_id, is_emergency, emergency_id, distribution_mode, geographic_scope, " +
    "scope_state_id, scope_district_id, scope_city, scope_pincode, area_lock, " +
    "special_care_category_id, redeemed_at, value_returned_to_pool_at";

export interface ReissueResult {
    original_token_id: string;
    original_serial: string;
    new_token_id: string;
    new_serial: string;
    value_inr: number;
    new_status: string;
    new_expires_at: string | null;
    pool_debit_ledger_id: string | null;
}

export async function reissueExpiredToken(
    input: { tokenId: string; reason: string },
    actor: AppUser,
    client?: Client
): Promise<ReissueResult> {
    const admin = client ?? (createAdminClient() as unknown as Client);

    const { data: row, error } = await admin
        .from("tokens")
        .select(SOURCE_SELECT)
        .eq("id", input.tokenId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new NotFoundError("token not found");
    const original = row as unknown as ReissueSource;

    const { data: existing, error: existingError } = await admin
        .from("tokens")
        .select("id, serial_number")
        .eq("replacement_for_token_id", original.id)
        .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    // The configured validity. Read, never assumed: an unset value is an
    // administrator's to fix, not something to default around.
    let expiryDays: number | null = null;
    try {
        expiryDays = await getNumber("token_expiry_days", admin as never);
    } catch {
        expiryDays = null;
    }

    const nowIso = new Date().toISOString();
    const plan = planReissue({
        original,
        existingReplacementSerial: (existing as { serial_number: string } | null)?.serial_number ?? null,
        reason: input.reason,
        expiryDays,
        now: nowIso,
    });
    if (!plan.ok) throw new BadRequestError(plan.error);

    const newId = randomUUID();
    const newSerial = `PPM-RIS-${Date.now().toString(36).toUpperCase()}`;
    const { data: minted, error: mintError } = await admin
        .from("tokens")
        .insert({
            ...plan.newToken,
            id: newId,
            serial_number: newSerial,
            qr_hash: qrHashOf(deriveQrPayload(newId)),
            reissued_by: actor.id,
        })
        .select("id, serial_number")
        .single();
    if (mintError || !minted) {
        // 23505 = the unique replacement index: someone else approved it first.
        if ((mintError as { code?: string } | null)?.code === "23505") {
            throw new BadRequestError("this token has already been reissued");
        }
        throw new Error(mintError?.message ?? "failed to mint the reissued token");
    }

    // The expiry sweep returned the original's value to the Meal Pool. The new
    // token now carries that value, so it comes back OUT — otherwise the same
    // money sits in the pool and on a live token at once.
    let poolDebitId: string | null = null;
    if (plan.poolDebitInr > 0) {
        try {
            const entry = await postLedgerEntry({
                admin,
                ledger: "meal_pool",
                amountInr: -plan.poolDebitInr,
                referenceType: "token",
                referenceId: newId,
                description: `value reissued from expired token ${original.serial_number} to ${newSerial}`,
            });
            poolDebitId = entry.id;
        } catch (e) {
            // Compensate: a reissued token whose value was never drawn from the
            // pool would double-count donated money. Remove it and fail loudly.
            await admin.from("tokens").delete().eq("id", newId);
            throw new Error(
                `reissue rolled back — the Meal Pool debit failed: ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }

    await writeAuditLog(
        {
            actor,
            action: "token.reissue",
            entity_table: "tokens",
            entity_id: original.id,
            summary: `expired token ${original.serial_number} reissued as ${newSerial}`,
            metadata: {
                new_token_id: newId,
                new_serial: newSerial,
                reason: plan.reason,
                value_inr: original.value_inr,
                distribution_mode: original.distribution_mode,
                new_status: plan.newToken.status,
                new_expires_at: plan.newToken.expires_at,
                pool_debit_inr: plan.poolDebitInr,
                pool_debit_ledger_id: poolDebitId,
            },
        },
        admin
    );

    // F-3: reissues are one of the inherently risky kinds that must appear in
    // the exception queue. Never throws — the reissue itself is valid.
    await flagException(admin as never, {
        exceptionType: "token_reissue",
        entityTable: "tokens",
        entityId: newId,
        detail: `expired token ${original.serial_number} reissued as ${newSerial}: ${plan.reason}`,
    });

    return {
        original_token_id: original.id,
        original_serial: original.serial_number,
        new_token_id: newId,
        new_serial: newSerial,
        value_inr: original.value_inr,
        new_status: plan.newToken.status,
        new_expires_at: plan.newToken.expires_at,
        pool_debit_ledger_id: poolDebitId,
    };
}
