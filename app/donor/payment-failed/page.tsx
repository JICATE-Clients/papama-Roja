"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import Navbar from "@/components/donor/Navbar";
import { X } from "@phosphor-icons/react/dist/ssr/X";

function FailureCard() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "An unknown error occurred during transaction verification.";

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xl md:p-10 text-center">
      {/* Animated Failure Icon */}
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 ">
        <X size={32} weight="bold" aria-hidden />
      </div>

      <h1 className="mt-4 text-2xl sm:text-3xl font-medium tracking-tight text-zinc-900 ">
        Payment Failed
      </h1>
      <p className="mt-2 text-sm text-zinc-500 ">
        We could not complete your donation at this moment. Don’t worry, if your account was charged, a refund will be processed.
      </p>

      {/* Error Details */}
      <div className="mt-6 rounded-xl bg-red-500/5 border border-red-500/10 p-4 text-left">
        <span className="text-[11px] font-semibold text-red-600 uppercase tracking-wider block">Error Reference</span>
        <p className="mt-1 text-xs font-medium text-red-800 leading-relaxed break-words">
          {error}
        </p>
      </div>

      {/* Troubleshooting Tips */}
      <div className="mt-6 text-left space-y-2 text-[11px] text-zinc-500 leading-normal">
        <p className="font-semibold text-zinc-700 ">Please try the following:</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Check that you have sufficient balance in your bank/card account.</li>
          <li>Verify your network connection and retry the payment.</li>
          <li>Choose a different payment method (e.g. Card instead of UPI).</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row justify-center">
        <Link
          href="/donor/donate"
          className="flex-1 rounded-lg bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 py-3 text-xs font-semibold text-white transition hover:bg-emerald-700 shadow-md active:scale-[.98] text-center"
        >
          Retry Payment
        </Link>
        <Link
          href="/donor/dashboard"
          className="flex-1 rounded-xl bg-zinc-900 py-3 text-xs font-semibold text-white transition hover:bg-zinc-800 active:scale-[.98] text-center "
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 ">
      <Navbar />

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12 sm:px-6 lg:px-8 flex flex-col justify-center">
        <Suspense fallback={
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        }>
          <FailureCard />
        </Suspense>
      </main>
    </div>
  );
}
