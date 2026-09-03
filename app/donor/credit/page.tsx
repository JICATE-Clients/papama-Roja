"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/donor/Navbar";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { CreditsResponse, ConvertTokenItem } from "@/lib/donor/types/contract";
import RefundPanel from "@/components/donor/RefundPanel";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { inr, shortDate, shortDateTime } from "@/lib/format";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { X } from "@phosphor-icons/react/dist/ssr/X";

type DistributionPath = "use_now" | "authorize_papama";

function CreditContent() {
  const searchParams = useSearchParams();
  const [credits, setCredits] = useState<CreditsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  // Single amount input → mints ONE token.
  const [amount, setAmount] = useState<number>(0);
  const [amountError, setAmountError] = useState<string | null>(null);

  // Successful Conversion Result State (one token per mint).
  const [convertedToken, setConvertedToken] = useState<ConvertTokenItem | null>(null);
  // Path A/B distribution choice, selected BEFORE minting (token-flow §2): the
  // route mints `live` (use_now) or `in_admin_pool` (authorize_papama).
  const [mintPath, setMintPath] = useState<DistributionPath>("use_now");
  // The path the minted token actually committed to (for the success view).
  const [distributionPath, setDistributionPath] = useState<DistributionPath | null>(null);

  // Threshold comes from system_config via /api/donor/credits — never hard-coded.
  // Falls back to 0 (not an invented ₹50) until credits load; all threshold UI is
  // gated behind the `credits` guard below, so 0 is never shown to the user.
  const threshold = credits?.threshold ?? 0;
  const balance = credits?.credit_balance ?? 0;

  async function loadCredits() {
    try {
      const res = await ApiClient.getCredits();
      setCredits(res);
      // Default the amount to the threshold when the balance allows it.
      setAmount(res.credit_balance >= res.threshold ? res.threshold : 0);
    } catch (error) {
      console.warn("Failed to load credits:", error);
    } finally {
      setLoading(false);
    }
  }

  const closeConvertModal = () => {
    setIsConvertOpen(false);
    setConvertedToken(null);
    setMintPath("use_now");
    setDistributionPath(null);
    setConvertError(null);
    setAmountError(null);
    setAmount(credits && credits.credit_balance >= credits.threshold ? credits.threshold : 0);
  };

  useEffect(() => {
    loadCredits();

    // Auto-open modal if URL has ?convert=true
    if (searchParams.get("convert") === "true") {
      setIsConvertOpen(true);
    }

    // Listen for custom background events
    window.addEventListener("papama_data_update", loadCredits);
    return () => {
      window.removeEventListener("papama_data_update", loadCredits);
    };
  }, [searchParams]);

  // Accessible dialog: close on Escape while the modal is open.
  useEffect(() => {
    if (!isConvertOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeConvertModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConvertOpen]);

  const validateAmount = (): string | null => {
    if (!Number.isInteger(amount)) return "Amount must be a whole number.";
    if (amount < threshold) return `Minimum conversion amount is ${inr(threshold)}.`;
    if (amount > balance) return "Amount exceeds available credit balance.";
    return null;
  };

  const onConvertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credits) return;

    const err = validateAmount();
    if (err) {
      setAmountError(err);
      return;
    }
    setAmountError(null);

    setIsConverting(true);
    setConvertError(null);
    try {
      // Mint with the donor's chosen path (token-flow §2): use_now → live,
      // authorize_papama → in_admin_pool. The route honours distribution_path.
      const res = await ApiClient.convertCreditToToken(amount, mintPath);
      setConvertedToken(res.token);
      setDistributionPath(mintPath);
      // Dispatch update to reload Navbar balances
      window.dispatchEvent(new Event("papama_data_update"));
      await loadCredits();
    } catch (err) {
      console.error("Token conversion error:", err);
      setConvertError(err instanceof Error ? err.message : "Failed to convert credits.");
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        {/* i18n reference migration (spec F-8): strings come from lib/i18n via t().
            Remaining pages follow this same key-based pattern. */}
        <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-zinc-900 ">
          {t("donor.credit.title")}
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500 max-w-2xl leading-relaxed">
          {t("donor.credit.subtitle", { threshold })}
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      ) : credits ? (
        <>
          {/* Threshold Reached Alert Banner */}
          {credits.threshold_reached && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-500/5 p-4 text-emerald-800 animate-fade-in shadow-sm">
              <span className="text-lg">⭐</span>
              <div>
                <strong className="font-semibold text-sm">{inr(threshold)} Threshold Achieved</strong>
                <p className="mt-0.5 text-xs font-medium leading-relaxed opacity-90">
                  Your balance is {inr(credits.credit_balance)}. You can convert these credits into {credits.convertible_tokens} food canteen token(s).
                </p>
              </div>
            </div>
          )}

          {/* Core Content Layout */}
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Credit Balance Card */}
            <div className="space-y-6 lg:col-span-1">
              <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm ">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">
                  {t("donor.credit.availableCredits")}
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-zinc-900 ">
                    {inr(credits.credit_balance)}
                  </span>
                  <span className="text-xs font-semibold text-zinc-400 uppercase">INR</span>
                </div>

                {/* Progress bar toward the next threshold block. Uses credits.threshold from system_config. */}
                <div className="mt-4">
                  <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        credits.threshold_reached ? "bg-emerald-500" : "bg-blue-500"
                      }`}
                      style={{
                        // Guard threshold > 0: when standard_token_value is unset
                        // the fallback threshold is 0, and balance/0 yields NaN /
                        // Infinity (an invalid width). Show 0% until it's known.
                        width: `${
                          threshold > 0
                            ? Math.min(100, (credits.credit_balance / threshold) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <p className="mt-2.5 text-[11px] text-zinc-400 font-medium leading-normal">
                    {credits.credit_balance < threshold
                      ? t("donor.credit.needMore", {
                          remaining: threshold - credits.credit_balance,
                          threshold,
                        })
                      : t("donor.credit.sufficient", {
                          count: credits.convertible_tokens ?? 0,
                        })}
                  </p>
                </div>

                {/* CTA Action */}
                <div className="mt-6 space-y-3">
                  <button
                    onClick={() => {
                      setIsConvertOpen(true);
                      setAmount(credits.credit_balance >= threshold ? threshold : 0);
                    }}
                    disabled={!credits.threshold_reached}
                    className="w-full rounded-lg bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 py-3 text-xs font-semibold text-white transition hover:bg-emerald-700 shadow-md active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
                  >
                    {t("donor.credit.convertCta")}
                  </button>
                  <p className="text-[11px] text-center text-rose-500 font-semibold bg-rose-500/5 p-2 rounded border border-rose-500/10">
                    {t("donor.credit.nonWithdrawable")}
                  </p>
                </div>
              </div>
            </div>

            {/* Credit Transaction History */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm lg:col-span-2">
              <h3 className="text-base font-medium text-zinc-900 ">
                Credit Audit Logs
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Cryptographic transaction list of credit deposits and conversions.
              </p>

              <div className="mt-6 space-y-4">
                {credits.transactions && credits.transactions.length > 0 ? (
                  <div className="divide-y divide-zinc-100 ">
                    {credits.transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                        <div>
                          <p className="text-xs font-semibold text-zinc-900 ">
                            {tx.type === "purchase"
                              ? `Added ${inr(tx.amount)} Credits`
                              : `Converted ${inr(Math.abs(tx.amount))} into Tokens`}
                          </p>
                          <span className="text-[11px] text-zinc-400">
                            {shortDateTime(tx.at)}
                          </span>
                        </div>
                        <span
                          className={`font-mono text-xs font-bold ${
                            tx.type === "purchase"
                              ? "text-emerald-600 "
                              : "text-zinc-500"
                          }`}
                        >
                          {tx.type === "purchase" ? "+" : ""}{inr(tx.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-xs py-8 text-zinc-400 font-medium">
                    No transactions logs recorded.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Refunds — only rendered when there is actually something to show */}
          <RefundPanel />

          {/* Conversion Dialog Modal */}
          {isConvertOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={closeConvertModal}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="convert-modal-title"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl "
              >
                {convertedToken ? (
                  /* Success Conversion Receipt + Path A/B fork */
                  <div className="p-6 text-center animate-fade-in">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ">
                      <Check size={24} weight="bold" aria-hidden />
                    </div>
                    <h3 id="convert-modal-title" className="mt-4 text-base font-medium text-zinc-900 ">
                      Token Generated!
                    </h3>
                    <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
                      Successfully converted <strong>{inr(convertedToken.value)} Credit</strong> into <strong>1 token of {inr(convertedToken.value)}</strong>.
                    </p>

                    {/* Voucher detail */}
                    <div className="mt-6 text-left p-1">
                      <div className="rounded-xl border border-zinc-200/60 bg-zinc-50 p-3 text-xs font-medium">
                        <div className="flex justify-between font-mono text-[11px] text-zinc-400">
                          <span>VOUCHER ID</span>
                          <span className="uppercase">{convertedToken.serial_number || convertedToken.token_id.substring(0, 8)}</span>
                        </div>
                        <div className="mt-1 flex justify-between text-zinc-800 ">
                          <span>Value:</span>
                          <span className="text-emerald-600 ">{inr(convertedToken.value)}</span>
                        </div>
                        {convertedToken.expires_at && (
                          <div className="mt-1.5 flex justify-between text-[11px] text-zinc-400 font-normal">
                            <span>Expires On:</span>
                            <span>{shortDate(convertedToken.expires_at)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Resulting distribution status (chosen at mint, token-flow §2) */}
                    <div className="mt-6 text-left rounded-xl border border-zinc-200/60 bg-zinc-50/50 p-3.5">
                      <p className="text-[11px] font-semibold text-zinc-600 ">
                        {distributionPath === "authorize_papama"
                          ? "Authorized to pApAmA"
                          : "Live — held by you"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        {distributionPath === "authorize_papama"
                          ? "This token is now in the admin pool for a volunteer to deliver."
                          : "Keep this token live to redeem or share its QR yourself."}
                      </p>
                    </div>

                    <div className="mt-6 flex flex-col gap-2.5">
                      {/* Primary next step: go straight to THIS token's QR so the
                          donor can show/print/share it (Path A self-distribute).
                          Without this the mint dead-ends and the QR is a scavenger
                          hunt through the ledger. */}
                      <Link
                        href={`/donor/tokens/${convertedToken.token_id}`}
                        onClick={closeConvertModal}
                        className="w-full rounded-lg bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 py-3 text-center text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-[.98] cursor-pointer"
                      >
                        Show / print this token&apos;s QR
                      </Link>
                      <Link
                        href="/donor/tokens"
                        onClick={closeConvertModal}
                        className="text-center text-xs font-semibold text-emerald-600 hover:underline py-1.5"
                      >
                        Track all vouchers in ledger
                      </Link>
                      <button
                        onClick={closeConvertModal}
                        className="text-center text-xs font-medium text-zinc-400 hover:text-zinc-600 py-1"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Input Conversion Config Form */
                  <form onSubmit={onConvertSubmit} className="p-6">
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-100 ">
                      <h3 id="convert-modal-title" className="text-base font-medium text-zinc-900 ">
                        Convert Credits to Token
                      </h3>
                      <button
                        type="button"
                        onClick={closeConvertModal}
                        aria-label="Close dialog"
                        className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 cursor-pointer"
                      >
                        <X size={20} weight="bold" aria-hidden />
                      </button>
                    </div>

                    {convertError && (
                      <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-xs text-red-800 ">
                        {convertError}
                      </div>
                    )}

                    {/* Single Amount Input — mints ONE token of ₹{amount} */}
                    <div className="mt-4 space-y-2">
                      <label htmlFor="convert-amount" className="text-xs font-semibold text-zinc-600 ">
                        Token amount (₹):
                      </label>
                      <input
                        id="convert-amount"
                        type="number"
                        min={threshold}
                        max={balance}
                        step={1}
                        value={Number.isNaN(amount) ? "" : amount}
                        onChange={(e) => {
                          setAmount(e.target.valueAsNumber);
                          setAmountError(null);
                        }}
                        className="w-full text-center font-semibold text-zinc-900 border border-zinc-200 rounded-xl h-11 "
                      />
                      {amountError && (
                        <p className="text-xs text-rose-500 mt-1">{amountError}</p>
                      )}
                      <p className="text-[11px] text-zinc-400 text-center font-medium">
                        Mints 1 token of {inr(Number.isNaN(amount) ? 0 : amount)} · min {inr(threshold)}, max {inr(balance)}
                      </p>
                    </div>

                    {/* Path A/B choice (token-flow §2) — drives the minted status */}
                    <div className="mt-5 space-y-2">
                      <p className="text-xs font-semibold text-zinc-600 ">After minting, this token should:</p>
                      <div className="grid grid-cols-1 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setMintPath("use_now")}
                          aria-pressed={mintPath === "use_now"}
                          className={`rounded-xl border p-3 text-left transition cursor-pointer ${
                            mintPath === "use_now"
                              ? "border-emerald-600 bg-emerald-500/5 text-emerald-800 "
                              : "border-zinc-200 bg-white hover:bg-zinc-50 "
                          }`}
                        >
                          <span className="block text-xs font-semibold">Use it now</span>
                          <span className="text-[11px] text-zinc-400 block mt-0.5">Keep the token live to redeem or share yourself.</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMintPath("authorize_papama")}
                          aria-pressed={mintPath === "authorize_papama"}
                          className={`rounded-xl border p-3 text-left transition cursor-pointer ${
                            mintPath === "authorize_papama"
                              ? "border-emerald-600 bg-emerald-500/5 text-emerald-800 "
                              : "border-zinc-200 bg-white hover:bg-zinc-50 "
                          }`}
                        >
                          <span className="block text-xs font-semibold">Authorize pApAmA to distribute</span>
                          <span className="text-[11px] text-zinc-400 block mt-0.5">Add to the admin pool for a volunteer to deliver.</span>
                        </button>
                      </div>
                    </div>

                    {/* Submit Actions */}
                    <div className="mt-6 flex gap-3">
                      <button
                        type="button"
                        onClick={closeConvertModal}
                        className="w-1/3 rounded-xl border border-zinc-200 py-3 text-xs font-semibold hover:bg-zinc-50 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isConverting || Number.isNaN(amount) || amount < threshold}
                        className="flex-1 rounded-lg bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 py-3 text-xs font-semibold text-white transition hover:bg-emerald-700 shadow-md active:scale-[.98] disabled:opacity-50 cursor-pointer"
                      >
                        {isConverting ? (
                          <span className="flex items-center justify-center gap-1">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Converting...
                          </span>
                        ) : (
                          `Confirm Conversion`
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 text-zinc-500">
          Failed to load credits.
        </div>
      )}
    </div>
  );
}

export default function CreditPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 ">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Suspense fallback={
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        }>
          <CreditContent />
        </Suspense>
      </main>
    </div>
  );
}
