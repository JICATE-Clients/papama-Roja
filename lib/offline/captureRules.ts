/**
 * Offline capture — the PURE decision logic (E-4 / B-30).
 * Design: docs/design-offline-emergency-transactions.md
 *
 * No browser APIs here, deliberately. The IndexedDB and service-worker plumbing
 * lives in ./deviceQueue.ts; everything that decides WHETHER a capture may be
 * recorded, WHAT it contains, and WHAT to forget after a sync is here, so it can
 * be tested in Node without a browser. Those decisions are where a mistake
 * would cost a meal or accept a forgery; the plumbing is not.
 */

/** What the server granted while the device was still online. */
export interface OfflineAuthorisation {
    authorised: true;
    emergency_id: string;
    emergency_ref: string | null;
    /** Offline capture must stop at this instant, by the device's own clock. */
    expires_at: string;
    waiver_enabled: boolean;
    source: "food_partner" | "volunteer";
    food_partner_id: string | null;
    issued_at: string;
}

/** One queued capture, exactly as it will be uploaded. */
export interface QueuedCapture {
    id: string;
    token_id: null;
    qr_hash: string;
    emergency_id: string;
    captured_at: string;
    waiver_status: boolean;
    device_reference: string;
    source: "food_partner" | "volunteer";
    food_partner_id: string | null;
}

export type CaptureDecision =
    | { allowed: true }
    | { allowed: false; reason: string };

/**
 * May this device record a capture right now?
 *
 * Refuses when there is no cached authorisation — the device never connected
 * during the emergency, and it must not authorise itself — and when the cached
 * authorisation has expired by the device clock.
 *
 * The device clock is not trusted by the SERVER, but it is the only clock the
 * device has. Using it here is about stopping capture promptly, not about
 * proving anything; proof happens at sync.
 */
export function canCapture(
    auth: OfflineAuthorisation | null,
    now: Date,
    pendingCount: number,
    maxPending: number | null
): CaptureDecision {
    if (!auth || auth.authorised !== true) {
        return {
            allowed: false,
            reason:
                "offline recording is not authorised on this device — it must connect during an active emergency first",
        };
    }
    const expiry = Date.parse(auth.expires_at);
    if (Number.isNaN(expiry) || now.getTime() >= expiry) {
        return {
            allowed: false,
            reason: `the emergency authorisation for ${auth.emergency_ref ?? "this device"} has expired`,
        };
    }
    // NULL = not enforced (a client value that has not been set). Never guessed.
    if (maxPending != null && pendingCount >= maxPending) {
        return {
            allowed: false,
            reason: `this device already holds ${pendingCount} unsynced records — connect and sync before recording more`,
        };
    }
    return { allowed: true };
}

/**
 * Build the record for one capture.
 *
 * Carries the QR HASH, never the raw payload. The payload is a bearer
 * credential: stored on a field device that may be lost, it would be a
 * redeemable meal. Its hash cannot be presented at a till, because redemption
 * hashes what is scanned.
 *
 * Carries no beneficiary identifier and no face data. The design's strongest
 * control is that a stolen device yields nothing personal.
 */
export function buildCapture(input: {
    id: string;
    qrHash: string;
    auth: OfflineAuthorisation;
    deviceReference: string;
    now: Date;
}): QueuedCapture {
    return {
        id: input.id,
        token_id: null,
        qr_hash: input.qrHash,
        emergency_id: input.auth.emergency_id,
        captured_at: input.now.toISOString(),
        waiver_status: input.auth.waiver_enabled,
        device_reference: input.deviceReference,
        source: input.auth.source,
        food_partner_id: input.auth.food_partner_id,
    };
}

/**
 * After an upload, which queued ids may the device forget?
 *
 * Only ids the server explicitly RECORDED, whatever their outcome. A rejected
 * or duplicate capture is still recorded server-side and reviewed there, so
 * keeping it on the device adds nothing but exposure.
 *
 * On a whole-request failure (offline again, 5xx, auth, capture switched off)
 * NOTHING is forgotten. Losing a record of a meal that was served is the one
 * outcome this queue exists to prevent; re-sending one is harmless, because the
 * device-generated id makes the server idempotent.
 */
export function idsToForget(
    httpStatus: number,
    body: unknown,
    uploadedIds: readonly string[]
): string[] {
    if (httpStatus < 200 || httpStatus >= 300) return [];
    const results = (body as { results?: { id?: unknown }[] } | null)?.results;
    if (!Array.isArray(results)) return [];
    const recorded = new Set(
        results.map((r) => r?.id).filter((id): id is string => typeof id === "string")
    );
    return uploadedIds.filter((id) => recorded.has(id));
}

/** Upload in bounded batches — the server caps a batch at 200. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}
