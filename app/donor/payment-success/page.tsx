"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/donor/Navbar";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { inr, shortDateTime } from "@/lib/format";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";

function SuccessReceipt() {
  const searchParams = useSearchParams();

  const id = searchParams.get("id") || "N/A";
  const amount = searchParams.get("amount") || "0";
  const method = searchParams.get("method") || "upi";
  const added = searchParams.get("added") || "0";
  const balance = searchParams.get("balance") || "0";
  const reached = searchParams.get("reached") === "true";
  const at = searchParams.get("at") || new Date().toISOString();

  // The mint threshold is admin-tunable (system_config.standard_token_value) —
  // never hard-code it. Read the real value from /api/donor/credits so the
  // "threshold reached" copy reflects the actual configured amount.
  const [threshold, setThreshold] = useState<number | null>(null);
  useEffect(() => {
    if (!reached) return;
    ApiClient.getCredits()
      .then((c) => setThreshold(c.threshold > 0 ? c.threshold : null))
      .catch(() => setThreshold(null));
  }, [reached]);

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xl md:p-10 text-center">
      {/* Animated Success Badge */}
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ">
        <Check size={32} weight="bold" aria-hidden />
      </div>

      <h1 className="mt-4 text-2xl sm:text-3xl font-medium tracking-tight text-zinc-900 ">
        Payment Successful!
      </h1>
      <p className="mt-2 text-sm text-zinc-500 ">
        Your donation has been verified. Credits were successfully added to your balance.
      </p>

      {/* Ticket Receipt */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200/60 bg-zinc-50/50 text-left">
        <div className="border-b border-dashed border-zinc-200 px-6 py-4 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Transaction Receipt</span>
          <span className="font-mono text-[11px] text-zinc-400 font-semibold uppercase">{id.substring(0, 8)}...</span>
        </div>

        <div className="p-6 space-y-4 text-xs font-medium text-zinc-600 ">
          <div className="flex justify-between">
            <span className="text-zinc-400">Amount Paid:</span>
            <span className="text-zinc-900 text-sm font-semibold">{inr(Number(amount))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Payment Method:</span>
            <span className="text-zinc-950 uppercase">{method}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Credit Added:</span>
            <span className="text-emerald-600 font-semibold">+{inr(Number(added))} Credits</span>
          </div>
          <div className="flex justify-between border-t border-zinc-100/80 pt-4 ">
            <span className="text-zinc-400">New Credit Balance:</span>
            <span className="text-zinc-900 font-bold text-sm">{inr(Number(balance))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Timestamp:</span>
            <span className="font-normal text-[11px] text-zinc-400">{shortDateTime(at)}</span>
          </div>
        </div>
      </div>

      {/* Threshold Alert Banner */}
      {reached && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 text-emerald-800 text-left">
          <div className="flex gap-2.5">
            <span className="text-base">🚀</span>
            <div>
              <p className="text-xs font-semibold">Credit Threshold Reached!</p>
              <p className="mt-0.5 text-[11px] leading-normal font-medium opacity-90">
                You have met the conversion threshold{threshold != null ? ` (${inr(threshold)}+)` : ""}. You can now generate food voucher tokens and support partner canteens.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Actions */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row justify-center">
        {reached ? (
          <Link
            href="/donor/credit?convert=true"
            className="flex-1 rounded-lg bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 py-3 text-xs font-semibold text-white transition hover:bg-emerald-700 shadow-md active:scale-[.98] text-center"
          >
            Convert Credits to Token
          </Link>
        ) : (
          <Link
            href="/donor/donate"
            className="flex-1 rounded-xl border border-zinc-200 bg-white py-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition active:scale-[.98] text-center "
          >
            Donate More
          </Link>
        )}
        <Link
          href="/donor/dashboard"
          className="flex-1 rounded-xl bg-zinc-900 py-3 text-xs font-semibold text-white transition hover:bg-zinc-700 active:scale-[.98] text-center "
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 ">
      <Navbar />

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12 sm:px-6 lg:px-8 flex flex-col justify-center">
        <Suspense fallback={
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        }>
          <SuccessReceipt />
        </Suspense>
      </main>
    </div>
  );
}
