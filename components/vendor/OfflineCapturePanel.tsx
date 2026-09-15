"use client";

import { useCallback, useEffect, useState } from "react";

import type { OfflineAuthorisation } from "@/lib/offline/captureRules";
import {
  flushQueue,
  pendingCaptures,
  recordCapture,
  refreshAuthorisation,
} from "@/lib/offline/deviceQueue";

/**
 * Offline emergency capture on the Food Partner scan screen (E-4 / B-30).
 *
 * Renders NOTHING unless the server has authorised this device for an active
 * emergency, or records are still waiting to sync. In normal operation the
 * till looks exactly as it did before.
 *
 * Recording offline does not serve a redemption. It queues a record that lands
 * as PENDING OFFLINE VALIDATION; an administrator decides it later.
 */
export default function OfflineCapturePanel({ qrPayload }: { qrPayload: string }) {
  const [auth, setAuth] = useState<OfflineAuthorisation | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      setPending((await pendingCaptures()).length);
    } catch {
      /* IndexedDB unavailable (private mode) — panel stays inert */
    }
  }, []);

  const sync = useCallback(async () => {
    try {
      const r = await flushQueue();
      if (r.uploaded > 0) {
        setMessage(
          r.failed
            ? { tone: "warn", text: `Synced ${r.forgotten} of ${r.uploaded}. The rest will retry when the connection is steady.` }
            : { tone: "ok", text: `Synced ${r.forgotten} offline record(s). They are awaiting admin validation.` }
        );
      }
    } finally {
      await refreshCount();
    }
  }, [refreshCount]);

  useEffect(() => {
    setOnline(navigator.onLine);
    (async () => {
      setAuth(await refreshAuthorisation());
      await refreshCount();
      if (navigator.onLine) await sync();
    })();

    // Service worker only relays Background Sync; it caches nothing.
    navigator.serviceWorker?.register("/offline-sync-sw.js").catch(() => undefined);
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === "papama-offline-sync") void sync();
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    // Foreground retry is the PRIMARY path: iOS Safari has no Background Sync.
    const goOnline = async () => {
      setOnline(true);
      setAuth(await refreshAuthorisation());
      await sync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [refreshCount, sync]);

  if (!auth && pending === 0) return null;

  async function onRecord() {
    setMessage(null);
    if (!qrPayload.trim()) {
      setMessage({ tone: "error", text: "Scan the token QR first." });
      return;
    }
    setBusy(true);
    try {
      const r = await recordCapture(qrPayload);
      if (!r.recorded) {
        setMessage({ tone: "error", text: r.reason ?? "Could not record offline." });
      } else {
        setMessage({ tone: "ok", text: "Recorded offline. It will sync automatically when the connection returns." });
        await refreshCount();
      }
    } catch {
      setMessage({ tone: "error", text: "This browser cannot store offline records." });
    } finally {
      setBusy(false);
    }
  }

  const tones = {
    ok: "text-green-700",
    warn: "text-amber-700",
    error: "text-red-600",
  };

  return (
    <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-800">
        Emergency offline recording
      </h2>
      {auth ? (
        <p className="mt-1 text-sm text-amber-900">
          {auth.emergency_ref ?? "An emergency"} is active. If the network is down, scan the token and record it
          here — it is checked and approved later, not redeemed now. Allowed until{" "}
          {new Date(auth.expires_at).toLocaleString()}.
        </p>
      ) : (
        <p className="mt-1 text-sm text-amber-900">
          Offline recording is no longer authorised on this device. Records already taken will still sync.
        </p>
      )}
      <p className="mt-2 text-xs text-amber-800">
        {online ? "Online" : "Offline"} · {pending} record(s) waiting to sync
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {auth && (
          <button
            type="button"
            onClick={onRecord}
            disabled={busy}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800 disabled:opacity-60"
          >
            {busy ? "Recording…" : "Record offline"}
          </button>
        )}
        {pending > 0 && online && (
          <button
            type="button"
            onClick={() => void sync()}
            className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
          >
            Sync now
          </button>
        )}
      </div>
      {message && <p className={`mt-2 text-sm ${tones[message.tone]}`}>{message.text}</p>}
    </section>
  );
}
