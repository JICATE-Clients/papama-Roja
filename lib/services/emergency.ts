import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveQrPayload, qrHashOf } from "@/app/api/_lib/tokenQr";
import { BadRequestError } from "@/lib/api/handler";
import { checkEmergencyGate } from "@/lib/services/emergencyEvent";
import type { AppUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/services/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNumber } from "@/lib/system-config";

/**
 * activateEmergencyOverride (addon #9) — a time-boxed system_config override
 * activated during emergency mode (e.g. temporarily raising the meal limit).
 * The toggle for `emergency_mode_enabled` itself is NOT here — that's the
 * existing generic PATCH /api/admin/system-config route (already admin-only
 * and audited, satisfying spec §11.2 #5's single-admin-authority default; no
 * new authorization surface was added for it).
 */

/**
 * Emergency / disaster-relief service (addon #8).
 *
 * Issues a relief food token during an emergency (flood, cyclone, accident, …):
 * mints a Standard token marked `is_emergency = true`, parks it in the admin pool
 * (`in_admin_pool`, Path B — the existing volunteer-allocation flow then hands it
 * out), records WHO issued it and WHY in `emergency_token_grants`, and writes the
 * audit trail. The RELAXED meal-limit / cooldown behaviour is NOT here — it is
 * already wired into the redemption engine (Wave 1), driven by the
 * `emergency_mode_enabled` config flag.
 *
 * Mirrors the mint discipline of app/api/admin/pool/mint: value comes from the
 * `standard_token_value` config (never invented — throws if unset), expiry from
 * `token_expiry_days` when set, one-time QR stored only as its non-reversible
 * hash (SEC-5). UNLIKE the pool mint, a relief token is NOT funded by deducting
 * donor/guest-pool credit — emergency relief deliberately issues outside the
 * normal funding path. Keep this an admin-only action (the route guards it).
 *
 * OPEN ITEM — DISASTER-AFFECTED PROOF (client Q7): how a beneficiary PROVES they
 * are disaster-affected — and whether a relief token may only be redeemed with
 * such proof — is UNDECIDED. This service does NOT gate on any proof; `reason` is
 * a free-text note only.
 *   TODO(client Q7): once the proof rules are decided, enforce proof capture /
 *   verification before (or at) issuance/redemption of an emergency token.
 */

type Client = SupabaseClient;

export interface IssueEmergencyTokenInput {
    /** Free-text justification recorded on the grant + audit trail. */
    reason?: string | null;
    /**
     * The emergency this token is issued under (E-1 / CD §D-6). REQUIRED in
     * practice: an emergency token cannot exist without an active emergency
     * record. Typed optional only so existing callers fail with the clear
     * message from the gate rather than a type error at a call site that has no
     * emergency to give.
     */
    emergencyId?: string | null;
}

export interface IssueEmergencyTokenResult {
    token_id: string;
    serial_number: string;
    value_inr: number;
    grant_id: string;
}

/** PPM-EMG serial so a relief token is recognisable at a glance. */
function emergencySerial(): string {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `PPM-EMG-${stamp}-${rand}`;
}

/**
 * Mint + record one emergency-relief token. Runs on the service-role client
 * (pass one in for tests; defaults to createAdminClient). The CALLER must have
 * already passed the admin permission check (the route guard does this).
 */
export async function issueEmergencyToken(
    input: IssueEmergencyTokenInput,
    actor: AppUser,
    client?: Client
): Promise<IssueEmergencyTokenResult> {
    const admin = client ?? (createAdminClient() as unknown as Client);

    // E-1 (CD §D-6): an emergency token cannot be issued without an ACTIVE
    // emergency record. Checked FIRST, before anything is minted — the whole
    // point is that relaxed limits and waived contributions never apply with no
    // authorised emergency behind them. The gate also rejects a row still
    // flagged active whose end date has passed: that is the indefinite emergency
    // mode CD §D-6 forbids.
    const gate = await checkEmergencyGate(admin as never, input.emergencyId);
    if (!gate.allowed || !gate.emergency) {
        throw new BadRequestError(gate.reason);
    }

    // Value from config — never invented (throws MissingConfigError → 5xx if unset).
    const value = await getNumber("standard_token_value", admin as never);

    // Expiry from token_expiry_days when configured; open-ended otherwise.
    let expiresAt: string | null = null;
    try {
        const days = await getNumber("token_expiry_days", admin as never);
        expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    } catch {
        // token_expiry_days unset — open-ended relief token.
    }

    // 1. Mint the relief token straight into the admin pool, flagged emergency.
    const id = randomUUID();
    const { data: minted, error: mintError } = await admin
        .from("tokens")
        .insert({
            id,
            serial_number: emergencySerial(),
            qr_hash: qrHashOf(deriveQrPayload(id)),
            token_type: "standard",
            value_inr: value,
            status: "in_admin_pool",
            is_emergency: true,
            expires_at: expiresAt,
            // Tag the token to its emergency so closure reconciliation can
            // account for it (CD §D-6).
            emergency_id: gate.emergency.id,
        })
        .select("id, serial_number")
        .single();
    if (mintError || !minted) {
        throw new Error(mintError?.message ?? "failed to mint emergency token");
    }

    // 2. Record the grant trail. On failure, roll back the just-minted token so a
    //    relief token never exists without its issued-by/reason provenance.
    const { data: grant, error: grantError } = await admin
        .from("emergency_token_grants")
        .insert({
            token_id: minted.id,
            issued_by: actor.id,
            reason: input.reason ?? null,
        })
        .select("id")
        .single();
    if (grantError || !grant) {
        await admin.from("tokens").delete().eq("id", minted.id);
        throw new Error(grantError?.message ?? "failed to record emergency token grant");
    }

    // 3. Audit trail (single audit writer — lib/services/audit).
    await writeAuditLog({
        actor,
        action: "emergency.token.grant",
        entity_table: "tokens",
        entity_id: minted.id,
        summary: `issued emergency relief token ${minted.serial_number} (₹${value}) into the admin pool`,
        metadata: {
            grant_id: grant.id,
            value_inr: value,
            reason: input.reason ?? null,
            is_emergency: true,
        },
    });

    return {
        token_id: minted.id,
        serial_number: minted.serial_number,
        value_inr: value,
        grant_id: grant.id,
    };
}

export interface ActivateOverrideInput {
    configKey: string;
    overrideValue: string;
    reason?: string | null;
}

export interface ActivateOverrideResult {
    id: string;
    expires_at: string | null;
}

/**
 * Activate a time-boxed config override during emergency mode. Applies the
 * override to `system_config` immediately (same write the generic admin
 * route makes) and records it in `emergency_overrides` with a computed
 * `expires_at` — NULL when `emergency_mode_max_duration_days` is unset, i.e.
 * the override never auto-reverts until an admin sets a duration (soft-skip,
 * never invented — AGENTS.md discipline).
 */
export async function activateEmergencyOverride(
    input: ActivateOverrideInput,
    actor: AppUser,
    client?: Client
): Promise<ActivateOverrideResult> {
    const admin = client ?? (createAdminClient() as unknown as Client);

    // --- Extension guard (Work Order Q-3 / B-14, CD §D-6) --------------------
    // Activating an override for a key that already has an active one is not a
    // fresh activation — it is an EXTENSION: it overwrites the config again and
    // starts a new auto-revert window, so an emergency relaxation can be kept
    // alive indefinitely by repeating the call. The first activation may be
    // urgent enough to excuse a blank reason; every extension after it must say
    // why, because that is the audit trail for how long a relaxation ran and on
    // whose authority.
    const { data: activeRow } = await admin
        .from("emergency_overrides")
        .select("id")
        .eq("config_key", input.configKey)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

    if (activeRow && !input.reason?.trim()) {
        throw new BadRequestError(
            `an override for '${input.configKey}' is already active — extending it requires a reason`
        );
    }

    let maxDays: number | null = null;
    try {
        maxDays = await getNumber("emergency_mode_max_duration_days", admin as never);
    } catch {
        maxDays = null; // no auto-revert window configured
    }
    const expiresAt = maxDays != null ? new Date(Date.now() + maxDays * 86_400_000).toISOString() : null;

    const { data: cfgRow } = await admin
        .from("system_config")
        .select("value")
        .eq("key", input.configKey)
        .maybeSingle();
    const previousValue = (cfgRow as { value: string | null } | null)?.value ?? null;

    const { error: cfgError } = await admin
        .from("system_config")
        .update({ value: input.overrideValue, updated_by: actor.id, updated_at: new Date().toISOString() })
        .eq("key", input.configKey);
    if (cfgError) throw new Error(cfgError.message);

    const { data: row, error } = await admin
        .from("emergency_overrides")
        .insert({
            config_key: input.configKey,
            override_value: input.overrideValue,
            previous_value: previousValue,
            reason: input.reason ?? null,
            activated_by: actor.id,
            expires_at: expiresAt,
        })
        .select("id")
        .single();
    if (error || !row) throw new Error(error?.message ?? "failed to record emergency override");

    await writeAuditLog(
        {
            actor,
            action: "emergency.override.activate",
            entity_table: "emergency_overrides",
            entity_id: row.id,
            summary: `${input.configKey} overridden to '${input.overrideValue}'${
                expiresAt ? ` until ${expiresAt}` : " (no auto-revert configured)"
            }`,
            metadata: {
                config_key: input.configKey,
                from: previousValue,
                to: input.overrideValue,
                expires_at: expiresAt,
            },
        },
        admin
    );

    return { id: row.id, expires_at: expiresAt };
}

export interface RevertOverrideResult {
    id: string;
    reverted: boolean;
}

/**
 * Manually revert an active emergency override before its auto-revert window
 * elapses. Restores the original `system_config` value ONLY if it still
 * holds the override's value unchanged (CAS-style) — skips the restore
 * silently if an admin already changed it since, so a stale revert can never
 * clobber a newer intentional change.
 */
export async function revertEmergencyOverride(
    overrideId: string,
    actor: AppUser,
    client?: Client
): Promise<RevertOverrideResult> {
    const admin = client ?? (createAdminClient() as unknown as Client);

    const { data: row, error: fetchError } = await admin
        .from("emergency_overrides")
        .select("id, config_key, override_value, previous_value, is_active")
        .eq("id", overrideId)
        .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!row) throw new Error("emergency override not found");
    const override = row as {
        id: string;
        config_key: string;
        override_value: string;
        previous_value: string | null;
        is_active: boolean;
    };
    if (!override.is_active) return { id: overrideId, reverted: false };

    const { data: updated, error: updateError } = await admin
        .from("emergency_overrides")
        .update({ is_active: false, reverted_at: new Date().toISOString(), reverted_by: actor.id })
        .eq("id", overrideId)
        .eq("is_active", true)
        .select("id");
    if (updateError) throw new Error(updateError.message);
    if (!updated || updated.length === 0) return { id: overrideId, reverted: false };

    // CAS restore to the PRE-override value: only touches system_config if it
    // still holds the override's value unchanged — an admin's newer intentional
    // change since activation is never clobbered.
    await admin
        .from("system_config")
        .update({
            value: override.previous_value,
            updated_by: actor.id,
            updated_at: new Date().toISOString(),
        })
        .eq("key", override.config_key)
        .eq("value", override.override_value);

    await writeAuditLog(
        {
            actor,
            action: "emergency.override.revert",
            entity_table: "emergency_overrides",
            entity_id: overrideId,
            summary: `emergency override on ${override.config_key} manually reverted`,
            metadata: { config_key: override.config_key },
        },
        admin
    );

    return { id: overrideId, reverted: true };
}
