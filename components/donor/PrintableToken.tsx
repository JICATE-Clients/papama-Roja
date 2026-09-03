"use client";

import { useMemo } from "react";
import { TokenQrCode } from "@/components/donor/TokenQrCode";
import { TokenItem } from "@/lib/donor/types/contract";
import { inr, shortDate } from "@/lib/format";

/**
 * Printed / anti-copy token view (DIST-5, demo script item 3; owner §4.3
 * "Printed Token Handling"). Renders a print-friendly physical token card that:
 *
 *   1. carries the SCANNABLE one-time QR (token.qr_payload) so the printed token
 *      is still redeemable at the counter, AND
 *   2. carries a DISTINCT printed-token payload — `PAPAMA-PRINT:<serial>:<mark>`
 *      — rendered as its own small QR + visible code. This is intentionally NOT
 *      the redeemable payload: it is a printed-copy provenance mark so a printed
 *      token is distinguishable from the on-screen voucher and a photocopy is
 *      traceable to the print run, and
 *   3. shows a diagonal ANTI-COPY / DO NOT DUPLICATE watermark, and
 *   4. surfaces the optional AREA-LOCK (city / locality / PIN) when set, so a
 *      token printed for one region declares that restriction on its face.
 *
 * Everything is derived client-side from the token already on the page — no new
 * data is fetched and the redeemable payload is never altered. `window.print()`
 * is triggered by the parent; the `print-token` / `no-print` classes below drive
 * the print stylesheet so only the token card reaches the page.
 */

/**
 * Stable, non-secret printed-copy mark. NOT a security token (the real
 * anti-duplication secret lives server-side in tokenQr.ts); this is a short,
 * deterministic, human-comparable stamp so two prints of the same token read the
 * same and a photocopy can be matched back to its source token.
 */
function printMark(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export function PrintableToken({ token }: { token: TokenItem }) {
  const serial = token.serial_number || token.token_id.slice(0, 12).toUpperCase();
  const mark = useMemo(
    () => printMark(`${token.token_id}:${token.serial_number ?? ""}`),
    [token.token_id, token.serial_number]
  );
  // DISTINCT printed payload — provenance mark, not the redeemable QR.
  const printedPayload = `PAPAMA-PRINT:${serial}:${mark}`;

  return (
    <div className="print-token relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border-2 border-zinc-900 bg-white p-6 text-zinc-900">
      {/* Diagonal anti-copy watermark (repeats across the face of the token). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex select-none items-center justify-center"
      >
        <span className="rotate-[-30deg] whitespace-nowrap text-2xl font-bold uppercase tracking-widest text-zinc-900/[0.06]">
          ANTI-COPY · DO NOT DUPLICATE · ANTI-COPY · DO NOT DUPLICATE
        </span>
      </div>

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dashed border-zinc-300 pb-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
              pApAmA Food Token
            </p>
            <p className="mt-0.5 text-lg font-bold tracking-tight">{inr(token.value)} Meal Voucher</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-semibold uppercase text-zinc-400">Serial</p>
            <p className="font-mono text-xs font-semibold">{serial}</p>
          </div>
        </div>

        {/* QR codes: scannable (redeemable) + printed provenance mark */}
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex flex-col items-center">
            <div className="rounded-lg border border-zinc-300 bg-white p-2">
              <TokenQrCode payload={token.qr_payload} size={150} />
            </div>
            <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
              Scan to redeem
            </p>
          </div>

          <div className="flex flex-col items-center">
            <div className="rounded-lg border border-zinc-300 bg-white p-2">
              <TokenQrCode payload={printedPayload} size={84} />
            </div>
            <p className="mt-1.5 text-[8px] font-semibold uppercase tracking-wide text-zinc-500">
              Anti-copy mark
            </p>
          </div>
        </div>

        {/* Printed-payload code (distinct from the scannable QR payload) */}
        <div className="mt-3 rounded-lg bg-zinc-100 p-2 text-center">
          <p className="break-all font-mono text-[9px] font-semibold text-zinc-700">{printedPayload}</p>
        </div>

        {/* Area lock — only printed when the token declares one (owner §4.3) */}
        {token.area_lock ? (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-400 bg-amber-50 px-3 py-2">
            <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700">
              Area-Locked
            </span>
            <span className="text-xs font-semibold text-amber-800">{token.area_lock}</span>
          </div>
        ) : (
          <p className="mt-3 text-center text-[9px] font-medium text-zinc-400">
            No area restriction — redeemable at any participating counter
          </p>
        )}

        {/* Footer */}
        <div className="mt-3 border-t border-dashed border-zinc-300 pt-3 text-center">
          <p className="text-[9px] font-medium text-zinc-500">
            {token.expires_at
              ? `Valid until ${shortDate(token.expires_at)}`
              : "One-time use · non-transferable"}
          </p>
          <p className="mt-0.5 text-[8px] text-zinc-400">
            High-security QR · single redemption · reproduction prohibited
          </p>
        </div>
      </div>
    </div>
  );
}
