import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { flagException } from "@/lib/services/riskAudit";

/**
 * Offline emergency transaction sync (E-4 / B-30, CD §D-9).
 * Design: docs/design-offline-emergency-transactions.md
 *
 * THE CENTRAL RULE: an offline capture does NOT redeem a token. It records that
 * a meal was served. The token is burned only here, at sync, after full normal
 * validation. Capture is a record of intent; this is where the rules run.
 *
 * NOTHING IS BYPASSED. CD §D-6 lists what Emergency Mode never overrides — token
 * expiry, geographic restriction, token validity, Food Partner suspension,
 * compliance holds, fraud blocks — and offline is not an exception to that list.
 * Relaxed VERIFICATION (E-2) is a separate thing from relaxed VALIDATION, which
 * does not exist.
 *
 * THE DEVICE IS NOT TRUSTED. `captured_at` is the device clock, which is a value
 * an attacker controls. The emergency window is checked against the SERVER's
 * knowledge of the emergency period, never the device's claim.
 */

type Client = SupabaseClient;

export type OfflineTxnSource = "food_partner" | "volunteer";

/** One capture as it arrives from a device. */
export interface OfflineCapture {
    id: string;
    token_id: string | null;
    volunteer_id?: string | null;
    food_partner_id?: string | null;
    beneficiary_identifier?: string | null;
    emergency_id: string | null;
    captured_at: string;
    token_meal_type?: string | null;
    waiver_status?: boolean;
    device_reference: string;
    source: OfflineTxnSource;
}

export type ValidationOutcome =
    | "validated"
    | "rejected"
    | "duplicate"
    | "pending_offline_validation";

export interface ValidationResult {
    id: string;
    outcome: ValidationOutcome;
    reason: string;
    conflictsWith?: string | null;
}

/**
 * Window checks that do not need the database.
 *
 * Separated out so the trust boundary is testable on its own: everything here
 * takes the device's claims and the server's facts and decides using the
 * server's. `emergencyActiveAt` is supplied by the caller from the emergency
 * record — the device's `emergency_id` is only a pointer, never proof.
 */
export function checkCaptureWindow(input: {
    capturedAt: string;
    receivedAt: string;
    emergencyStart: string | null;
    emergencyEnd: string | null;
    maxSyncWindowHours: number | null;
}): { ok: boolean; reason: string } {
    const captured = Date.parse(input.capturedAt);
    if (Number.isNaN(captured)) {
        return { ok: false, reason: "capture timestamp is not a valid date" };
    }

    // A capture claiming to be from the future is a wrong or tampered clock.
    const received = Date.parse(input.receivedAt);
    if (captured > received + 5 * 60_000) {
        return { ok: false, reason: "capture timestamp is in the future — device clock is wrong" };
    }

    if (!input.emergencyStart || !input.emergencyEnd) {
        return { ok: false, reason: "no emergency period on record for this capture" };
    }

    // THE emergency-only rule, decided by the SERVER's period.
    if (captured < Date.parse(input.emergencyStart) || captured > Date.parse(input.emergencyEnd)) {
        return {
            ok: false,
            reason: "capture falls outside the emergency period — offline capture is emergency-only",
        };
    }

    // NULL = not enforced, and it says so. Never a guessed default: these four
    // limits are the client's to set (design §11).
    if (input.maxSyncWindowHours != null) {
        const ageHours = (received - captured) / 3_600_000;
        if (ageHours > input.maxSyncWindowHours) {
            return {
                ok: false,
                reason: `capture is ${Math.round(ageHours)}h old, beyond the ${input.maxSyncWindowHours}h sync window`,
            };
        }
    }

    return { ok: true, reason: "within the emergency period and the sync window" };
}

/**
 * Find conflicts for a set of captures.
 *
 * CD §D-9 requires cross-batch duplicate-token detection with NO silent accept
 * and NO silent delete. So this never picks a winner.
 *
 * "Earliest wins" is rejected deliberately: a duplicate has at least three
 * explanations — a volunteer retrying after a crash, two volunteers helping the
 * same person, or deliberate reuse — and the system cannot tell them apart.
 * Auto-picking the earliest would silently discard a genuine second meal, or
 * silently accept fraud. Both failures are invisible. A human decides.
 */
export function findConflicts(
    captures: readonly OfflineCapture[],
    alreadySeenTokenIds: ReadonlySet<string>
): Map<string, string> {
    const conflicts = new Map<string, string>();
    const firstByToken = new Map<string, string>();

    for (const c of captures) {
        if (!c.token_id) continue;

        // Conflict with something already in the system (an earlier batch, or an
        // online redemption).
        if (alreadySeenTokenIds.has(c.token_id)) {
            conflicts.set(c.id, c.token_id);
            continue;
        }

        const first = firstByToken.get(c.token_id);
        if (first) {
            // BOTH sides are marked. Flagging only the second would be an
            // implicit "earliest wins".
            conflicts.set(c.id, first);
            conflicts.set(first, c.id);
        } else {
            firstByToken.set(c.token_id, c.id);
        }
    }

    return conflicts;
}

export interface SyncBatchResult {
    received: number;
    validated: number;
    rejected: number;
    duplicates: number;
    results: ValidationResult[];
}

/**
 * Validate and record one uploaded batch.
 *
 * Idempotent: `offline_transactions.id` is the device-generated primary key, so
 * a re-uploaded batch collides rather than duplicating. A device that syncs,
 * loses the response and retries must not create a second set of claims.
 *
 * Order matters. Conflicts are detected across the WHOLE batch before anything
 * is validated — otherwise the first of two conflicting captures would validate
 * and burn a token before its twin was seen, which is the silent-accept CD §D-9
 * forbids.
 */
export async function syncOfflineBatch(
    client: Client,
    captures: readonly OfflineCapture[],
    opts: { maxSyncWindowHours: number | null }
): Promise<SyncBatchResult> {
    const result: SyncBatchResult = {
        received: captures.length,
        validated: 0,
        rejected: 0,
        duplicates: 0,
        results: [],
    };
    if (captures.length === 0) return result;

    const receivedAt = new Date().toISOString();

    // --- 1. Which tokens are already spoken for? -----------------------------
    const tokenIds = captures.map((c) => c.token_id).filter((t): t is string => Boolean(t));
    const seen = new Set<string>();

    if (tokenIds.length > 0) {
        const { data: redeemed } = await client
            .from("token_redemptions")
            .select("token_id")
            .in("token_id", tokenIds);
        for (const r of (redeemed ?? []) as { token_id: string }[]) seen.add(r.token_id);

        const { data: priorOffline } = await client
            .from("offline_transactions")
            .select("token_id, id")
            .in("token_id", tokenIds)
            .in("status", ["pending_offline_validation", "validated", "duplicate"]);
        for (const r of (priorOffline ?? []) as { token_id: string | null }[]) {
            if (r.token_id) seen.add(r.token_id);
        }
    }

    const conflicts = findConflicts(captures, seen);

    // --- 2. Compromised devices ----------------------------------------------
    // Design §7: once a device is physically gone, marking it compromised is the
    // only server-side control left. Its captures never validate.
    const deviceRefs = [...new Set(captures.map((c) => c.device_reference))];
    const compromised = new Set<string>();
    const { data: devices } = await client
        .from("offline_devices")
        .select("device_reference, is_compromised")
        .in("device_reference", deviceRefs);
    for (const d of (devices ?? []) as { device_reference: string; is_compromised: boolean }[]) {
        if (d.is_compromised) compromised.add(d.device_reference);
    }

    // --- 3. Emergency periods, from the SERVER ------------------------------
    const emergencyIds = [
        ...new Set(captures.map((c) => c.emergency_id).filter((e): e is string => Boolean(e))),
    ];
    const periods = new Map<string, { start: string; end: string }>();
    if (emergencyIds.length > 0) {
        const { data: emergencies } = await client
            .from("emergencies")
            .select("id, activated_at, ends_at")
            .in("id", emergencyIds);
        for (const e of (emergencies ?? []) as {
            id: string;
            activated_at: string;
            ends_at: string;
        }[]) {
            periods.set(e.id, { start: e.activated_at, end: e.ends_at });
        }
    }

    // --- 4. Decide each capture ----------------------------------------------
    for (const capture of captures) {
        let outcome: ValidationOutcome = "pending_offline_validation";
        let reason = "";
        const conflictsWith = conflicts.get(capture.id) ?? null;

        if (conflictsWith) {
            outcome = "duplicate";
            reason = "the same token was captured more than once — needs a human decision";
        } else if (compromised.has(capture.device_reference)) {
            outcome = "rejected";
            reason = "captured on a device reported compromised";
        } else if (!capture.token_id) {
            outcome = "rejected";
            reason = "no token reference on the capture";
        } else {
            const period = capture.emergency_id ? periods.get(capture.emergency_id) : undefined;
            const window = checkCaptureWindow({
                capturedAt: capture.captured_at,
                receivedAt,
                emergencyStart: period?.start ?? null,
                emergencyEnd: period?.end ?? null,
                maxSyncWindowHours: opts.maxSyncWindowHours,
            });
            if (!window.ok) {
                outcome = "rejected";
                reason = window.reason;
            } else {
                // Everything the device could be wrong about has been checked.
                // The remaining checks — token status, expiry, geographic scope,
                // Food Partner standing — are the redemption engine's, and run
                // when an admin approves this capture into a real redemption.
                outcome = "pending_offline_validation";
                reason = "accepted for validation";
            }
        }

        const { error } = await client.from("offline_transactions").upsert(
            {
                id: capture.id,
                token_id: capture.token_id,
                volunteer_id: capture.volunteer_id ?? null,
                food_partner_id: capture.food_partner_id ?? null,
                beneficiary_identifier: capture.beneficiary_identifier ?? null,
                emergency_id: capture.emergency_id,
                captured_at: capture.captured_at,
                token_meal_type: capture.token_meal_type ?? null,
                waiver_status: capture.waiver_status ?? false,
                device_reference: capture.device_reference,
                source: capture.source,
                status: outcome,
                rejection_reason: outcome === "rejected" ? reason : null,
                conflicts_with: conflictsWith,
                received_at: receivedAt,
            },
            { onConflict: "id", ignoreDuplicates: false }
        );

        if (error) {
            result.results.push({ id: capture.id, outcome: "rejected", reason: error.message });
            result.rejected += 1;
            continue;
        }

        // A duplicate goes to the shared exception queue (F-3), which is exactly
        // what the Work Order's "build once" note anticipated.
        if (outcome === "duplicate") {
            await flagException(client, {
                exceptionType: "offline_duplicate",
                entityTable: "offline_transactions",
                entityId: capture.id,
                vendorId: capture.food_partner_id ?? null,
                severity: "major",
                detail: `token captured offline more than once (source: ${capture.source}, device: ${capture.device_reference})`,
                emergencyId: capture.emergency_id,
            });
            result.duplicates += 1;
        } else if (outcome === "rejected") {
            result.rejected += 1;
        }

        result.results.push({ id: capture.id, outcome, reason, conflictsWith });
    }

    // --- 5. Device bookkeeping so the unsynced view stays honest -------------
    for (const ref of deviceRefs) {
        await client.from("offline_devices").upsert(
            {
                device_reference: ref,
                last_seen_at: receivedAt,
                last_sync_at: receivedAt,
                pending_reported: 0,
            },
            { onConflict: "device_reference", ignoreDuplicates: false }
        );
    }

    return result;
}
