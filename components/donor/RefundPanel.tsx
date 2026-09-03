"use client";

import { useEffect, useState } from "react";

import { ApiClient } from "@/lib/donor/services/apiClient";
import type { RefundOverview } from "@/lib/donor/types/contract";
import { inr, shortDate } from "@/lib/format";

const REFUND_REASON_LABEL: Record<string, string> = {
  gateway_failed: "Payment failed at the gateway",
  duplicate_charge: "Charged twice",
  chargeback: "Chargeback",
  other: "Other",
};

/**
 * Refunds, shown on the credit page because a refund IS a credit correction —
 * it reverses credit that should not have been granted, it does not send money
 * back to a bank account (donations stay non-withdrawable by policy).
 *
 * The panel renders nothing at all when the donor has no failed payment and has
 * never raised a request. A donor whose payments all worked should not have to
 * read about refunds to understand their balance.
 *
 * A request can only ever be raised against a failure pApAmA has already logged
 * — that is the client-approved rule (refunds only for failed/duplicate
 * payments, never voluntary withdrawal), and it is enforced in the database, not
 * just here.
 */
export default function RefundPanel() {
  const [data, setData] = useState<RefundOverview | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setData(await ApiClient.getRefundOverview());
    } catch {
      // A refund panel that cannot load is not worth an error banner on the
      // credit page — the balance above it is the reason the donor came here.
      setData({ payment_failures: [], refunds: [] });
    }
  }

  // The setState lives in the promise callback, not in the effect body — and
  // the cancelled flag keeps a late response from writing to an unmounted panel
  // (the donor can leave the credit page while this is in flight).
  useEffect(() => {
    let cancelled = false;
    ApiClient.getRefundOverview()
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ payment_failures: [], refunds: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data || (data.payment_failures.length === 0 && data.refunds.length === 0)) return null;

  const submit = async (failureId: string, amount: number) => {
    if (!reason.trim()) {
      setErr("Tell us what went wrong.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await ApiClient.requestRefund(failureId, amount, reason.trim());
      setOpenFor(null);
      setReason("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
      <h3 className="text-base font-medium text-zinc-900">Refunds</h3>
      <p className="mt-0.5 text-xs text-zinc-400">
        A refund reverses credit from a payment that failed or was charged twice. It is a
        correction to your balance, not a transfer back to your bank.
      </p>

      {data.payment_failures.length > 0 && (
        <div className="mt-5 space-y-3">
          {data.payment_failures.map((f) => (
            <div key={f.id} className="rounded-xl border border-amber-200 bg-amber-500/5 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-zinc-900">
                  {inr(f.amount_inr)} · {REFUND_REASON_LABEL[f.reason] ?? f.reason}
                </p>
                <span className="text-[11px] text-zinc-400">{shortDate(f.created_at)}</span>
              </div>
              {openFor === f.id ? (
                <div className="mt-3 space-y-2">
                  <label htmlFor={`refund-reason-${f.id}`} className="text-[11px] font-semibold text-zinc-600">
                    What happened?
                  </label>
                  <input
                    id={`refund-reason-${f.id}`}
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={busy}
                    placeholder="e.g. my card was charged twice for this donation"
                    className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-xs text-zinc-900"
                  />
                  {err && <p className="text-[11px] font-medium text-rose-500">{err}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => submit(f.id, f.amount_inr)}
                      disabled={busy}
                      className="flex-1 cursor-pointer rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy ? "Sending…" : "Request refund"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenFor(null);
                        setErr(null);
                      }}
                      className="cursor-pointer rounded-lg border border-zinc-200 px-4 py-2.5 text-xs font-semibold hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpenFor(f.id);
                    setReason("");
                    setErr(null);
                  }}
                  className="mt-2 cursor-pointer text-xs font-semibold text-emerald-700 underline underline-offset-2"
                >
                  Request a refund
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {data.refunds.length > 0 && (
        <div className="mt-5 divide-y divide-zinc-100">
          {data.refunds.map((r) => (
            <div key={r.id} className="py-3.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold text-zinc-900">{inr(r.amount_inr)} requested</p>
                <span
                  className={`text-[11px] font-semibold ${
                    r.status === "completed"
                      ? "text-emerald-600"
                      : r.status === "rejected"
                        ? "text-rose-500"
                        : "text-zinc-400"
                  }`}
                >
                  {r.status === "completed" ? "Refunded" : r.status === "rejected" ? "Declined" : "Under review"}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                {shortDate(r.created_at)}
                {r.decision_note ? ` · ${r.decision_note}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
