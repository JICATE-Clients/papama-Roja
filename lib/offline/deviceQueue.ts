"use client";

import {
    buildCapture,
    canCapture,
    chunk,
    idsToForget,
    type OfflineAuthorisation,
    type QueuedCapture,
} from "@/lib/offline/captureRules";

/**
 * Offline capture — the DEVICE plumbing (E-4 / B-30).
 *
 * IndexedDB rather than localStorage: localStorage is synchronous, string-only,
 * capped near 5 MB and has no transactions, and a queue that must not lose a
 * record of a served meal needs atomic writes.
 *
 * Every decision (may I capture, what goes in the record, what may I forget)
 * lives in ./captureRules.ts and is unit-tested; this file only moves bytes.
 */

const DB_NAME = "papama-offline";
const DB_VERSION = 1;
const CAPTURES = "captures";
const META = "meta";
const AUTH_KEY = "authorisation";
const DEVICE_KEY = "device_reference";

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(CAPTURES)) {
                db.createObjectStore(CAPTURES, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function tx<T>(
    store: string,
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
    return openDb().then(
        (db) =>
            new Promise<T | undefined>((resolve, reject) => {
                const t = db.transaction(store, mode);
                const req = fn(t.objectStore(store));
                t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
                t.onerror = () => reject(t.error);
                t.onabort = () => reject(t.error);
            })
    );
}

/** sha256 hex of the scanned payload — the raw payload is never stored. */
export async function sha256Hex(payload: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/** A stable per-install id. Not a fingerprint — just "this browser profile". */
export async function deviceReference(): Promise<string> {
    const existing = await tx<string>(META, "readonly", (s) => s.get(DEVICE_KEY));
    if (existing) return existing;
    const ref = `dev-${crypto.randomUUID()}`;
    await tx(META, "readwrite", (s) => s.put(ref, DEVICE_KEY));
    return ref;
}

export async function getAuthorisation(): Promise<OfflineAuthorisation | null> {
    return (await tx<OfflineAuthorisation>(META, "readonly", (s) => s.get(AUTH_KEY))) ?? null;
}

/**
 * Refresh the cached authorisation. Call whenever the device is online.
 * A server answer of "not authorised" CLEARS the cache, so a closed emergency
 * cannot linger on the device.
 */
export async function refreshAuthorisation(): Promise<OfflineAuthorisation | null> {
    try {
        const res = await fetch("/api/offline/authorisation", {
            cache: "no-store",
            credentials: "same-origin",
        });
        if (!res.ok) return getAuthorisation();
        const body = (await res.json()) as OfflineAuthorisation | { authorised: false };
        if (body.authorised) {
            await tx(META, "readwrite", (s) => s.put(body, AUTH_KEY));
            return body;
        }
        await tx(META, "readwrite", (s) => s.delete(AUTH_KEY));
        return null;
    } catch {
        // Offline: keep whatever was cached — that is exactly its purpose.
        return getAuthorisation();
    }
}

export async function pendingCaptures(): Promise<QueuedCapture[]> {
    return (await tx<QueuedCapture[]>(CAPTURES, "readonly", (s) => s.getAll())) ?? [];
}

/**
 * Record one capture from a scanned QR payload. Refuses (with a reason) when the
 * device is not authorised, the authorisation has expired, or the pending cap —
 * when one has been set — is reached.
 */
export async function recordCapture(
    qrPayload: string,
    maxPending: number | null = null
): Promise<{ recorded: boolean; reason?: string; capture?: QueuedCapture }> {
    const auth = await getAuthorisation();
    const pending = await pendingCaptures();
    const decision = canCapture(auth, new Date(), pending.length, maxPending);
    if (!decision.allowed) return { recorded: false, reason: decision.reason };

    const capture = buildCapture({
        id: crypto.randomUUID(),
        qrHash: await sha256Hex(qrPayload.trim()),
        auth: auth!,
        deviceReference: await deviceReference(),
        now: new Date(),
    });
    await tx(CAPTURES, "readwrite", (s) => s.put(capture));

    // Ask the service worker to sync when connectivity returns. Best-effort:
    // Background Sync does not exist on iOS Safari, so the foreground retry in
    // useOfflineQueue is the primary path and this is only an enhancement.
    try {
        const reg = (await navigator.serviceWorker?.ready) as
            | (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })
            | undefined;
        await reg?.sync?.register("papama-offline-sync");
    } catch {
        /* no Background Sync — foreground retry covers it */
    }

    return { recorded: true, capture };
}

/**
 * Upload everything pending. Forgets only what the server confirmed it
 * RECORDED; on any failure keeps everything, because losing a record of a meal
 * is the one outcome this exists to prevent.
 */
export async function flushQueue(): Promise<{ uploaded: number; forgotten: number; failed: boolean }> {
    const pending = await pendingCaptures();
    if (pending.length === 0) return { uploaded: 0, forgotten: 0, failed: false };

    let forgotten = 0;
    let failed = false;
    for (const batch of chunk(pending, 200)) {
        try {
            const res = await fetch("/api/offline/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ captures: batch }),
            });
            const body = await res.json().catch(() => null);
            const forget = idsToForget(res.status, body, batch.map((c) => c.id));
            if (forget.length < batch.length) failed = true;
            for (const id of forget) {
                await tx(CAPTURES, "readwrite", (s) => s.delete(id));
            }
            forgotten += forget.length;
        } catch {
            failed = true;
            break; // still offline — stop, keep everything
        }
    }
    return { uploaded: pending.length, forgotten, failed };
}
