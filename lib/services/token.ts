import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveQrPayload, qrHashOf } from "@/app/api/_lib/tokenQr";
import { BadRequestError, NotFoundError } from "@/lib/api/handler";
import type { AppUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/services/audit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lost-token + revalidation service (spec §3.2 Token rules [M2-5] — moved from
 * Phase 2 into Phase 1). Mirrors the mint/rollback discipline of
 * lib/services/emergency.ts::issueEmergencyToken.
 */

type Client = SupabaseClient;

const REDEEMABLE_STATUSES = ["live", "distributed"];

interface TokenRow {
    id: string;
    status: string;
    serial_number: string;
    value_inr: number;
    token_type: string;
    donor_id: string | null;
    beneficiary_id: string | null;
    campaign_id: string | null;
    is_emergency: boolean;
    expires_at: string | null;
}

const TOKEN_SELECT =
    "id, status, serial_number, value_inr, token_type, donor_id, beneficiary_id, campaign_id, is_emergency, expires_at";

// ---------------------------------------------------------------------------
// #17 — Lost-token workflow
// ---------------------------------------------------------------------------

export interface ReportTokenLostInput {
    tokenId: string;
    reason?: string | null;
    /** Ownership check for the donor self-service route — admin callers omit it. */
    expectedDonorId?: string | null;
}

export interface ReportTokenLostResult {
    old_token_id: string;
    new_token_id: string;
    new_serial: string;
    value_inr: number;
}

/**
 * Report a token lost: block it instantly (status -> 'blocked'), then mint a
 * same-value replacement referencing `replacement_for_token_id`. Only a
 * `live`/`distributed` token can be reported lost. Rolls back the block if
 * minting the replacement fails, so a lost-token report never strands a token
 * in limbo without a replacement.
 */
export async function reportTokenLost(
    input: ReportTokenLostInput,
    actor: AppUser,
    client?: Client
): Promise<ReportTokenLostResult> {
    const admin = client ?? (createAdminClient() as unknown as Client);

    const { data: tokenRow, error: fetchError } = await admin
        .from("tokens")
        .select(TOKEN_SELECT)
        .eq("id", input.tokenId)
        .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!tokenRow) throw new NotFoundError("token not found");
    const token = tokenRow as TokenRow;

    // Ownership check (donor self-service route) — a mismatch reads as "not
    // found" rather than 403 so a donor can't probe another donor's token ids.
    if (input.expectedDonorId && token.donor_id !== input.expectedDonorId) {
        throw new NotFoundError("token not found");
    }

    if (!REDEEMABLE_STATUSES.includes(token.status)) {
        throw new BadRequestError(
            `only a live/distributed token can be reported lost (status is '${token.status}')`
        );
    }

    // 1. Block the old token — CAS on its still-current status so a concurrent
    //    redemption/report-loss race resolves to one winner.
    const nowIso = new Date().toISOString();
    const { data: blocked, error: blockError } = await admin
        .from("tokens")
        .update({ status: "blocked", cancelled_at: nowIso })
        .eq("id", token.id)
        .eq("status", token.status)
        .select("id");
    if (blockError) throw new Error(blockError.message);
    if (!blocked || blocked.length === 0) {
        throw new BadRequestError("token status changed concurrently — retry");
    }

    // 2. Mint the replacement — same value/type/holder/expiry, a continuation
    //    of the original grant, not a new one.
    const newId = randomUUID();
    const { data: minted, error: mintError } = await admin
        .from("tokens")
        .insert({
            id: newId,
            serial_number: `PPM-RPL-${Date.now().toString(36).toUpperCase()}`,
            qr_hash: qrHashOf(deriveQrPayload(newId)),
            token_type: token.token_type,
            value_inr: token.value_inr,
            status: token.status,
            donor_id: token.donor_id,
            beneficiary_id: token.beneficiary_id,
            campaign_id: token.campaign_id,
            is_emergency: token.is_emergency,
            expires_at: token.expires_at,
            replacement_for_token_id: token.id,
        })
        .select("id, serial_number")
        .single();
    if (mintError || !minted) {
        // Compensate: un-block the old token so a failed replacement never
        // strands it in 'blocked' with nothing to redeem.
        await admin
            .from("tokens")
            .update({ status: token.status, cancelled_at: null })
            .eq("id", token.id);
        throw new Error(mintError?.message ?? "failed to mint replacement token");
    }

    await writeAuditLog(
        {
            actor,
            action: "token.report_lost",
            entity_table: "tokens",
            entity_id: token.id,
            summary: `token ${token.serial_number} reported lost; blocked and replaced by ${minted.serial_number}`,
            metadata: {
                new_token_id: minted.id,
                new_serial: minted.serial_number,
                reason: input.reason ?? null,
            },
        },
        admin
    );

    return {
        old_token_id: token.id,
        new_token_id: minted.id,
        new_serial: minted.serial_number,
        value_inr: token.value_inr,
    };
}

// ---------------------------------------------------------------------------
// #22 — Token revalidation
// ---------------------------------------------------------------------------

export interface RevalidateTokenResult {
    token_id: string;
    old_expires_at: string | null;
    new_expires_at: string;
    restored_status: "live" | "distributed";
}

/**
 * RETIRED (A-2 / B-23, client decision confirmed 18 Aug 2026).
 *
 * Revalidation reactivated the SAME token, which directly contradicts the
 * approved model: an expired token is PERMANENTLY non-redeemable, and the only
 * route back is a controlled reissue — a NEW token with a new ID, new QR and new
 * dates, permanently linked to the original, approved by an admin with a reason.
 * Extending the original leaves a QR in circulation that was supposed to be dead.
 *
 * The function is kept as a hard stop rather than deleted so that any caller,
 * queued job or stale client still pointing at it fails loudly and traceably
 * instead of hitting a missing export.
 *
 * NOT gated on `token_revalidation_allowed` any more. That key is forced false
 * by migration 20260907000004 and documented as retired, but a config an admin
 * can toggle is not a retirement — flipping it back must not resurrect a
 * behaviour the client has retired. The check is unconditional and in code.
 */
export async function revalidateToken(
    _tokenId: string,
    _actor: AppUser,
    _client?: Client
): Promise<RevalidateTokenResult> {
    throw new BadRequestError(
        "token revalidation has been retired — an expired token is permanently non-redeemable; raise a controlled reissue instead"
    );
}

