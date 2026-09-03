"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/donor/Navbar";
import { TokenQrCode } from "@/components/donor/TokenQrCode";
import { PrintableToken } from "@/components/donor/PrintableToken";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { TokenItem } from "@/lib/donor/types/contract";
import { inr, shortDate, shortDateTime } from "@/lib/format";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { Printer } from "@phosphor-icons/react/dist/ssr/Printer";
import { Warning } from "@phosphor-icons/react/dist/ssr/Warning";

function useCountdown(expiresAt: string | undefined, isActive: boolean) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isClose, setIsClose] = useState(false);

  useEffect(() => {
    if (!expiresAt || !isActive) {
      setTimeLeft(null);
      setIsClose(false);
      return;
    }

    function updateCountdown() {
      const difference = +new Date(expiresAt!) - +new Date();
      if (difference <= 0) {
        setTimeLeft("Expired");
        setIsClose(true);
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);

      // Warning when within 7 days
      if (days < 7) {
        setIsClose(true);
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      } else {
        setIsClose(false);
        setTimeLeft(null);
      }
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // update every minute
    return () => clearInterval(interval);
  }, [expiresAt, isActive]);

  return { timeLeft, isClose };
}

export default function TokenDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [token, setToken] = useState<TokenItem | null>(null);
  const [loading, setLoading] = useState(true);
  // Printed/anti-copy token view (DIST-5). When open, the print stylesheet hides
  // everything except `.print-token` so a clean physical token reaches the page.
  const [showPrint, setShowPrint] = useState(false);

  function handlePrint() {
    setShowPrint(true);
    // Let the printable card mount before invoking the browser print dialog.
    setTimeout(() => window.print(), 50);
  }

  async function loadToken() {
    try {
      const res = await ApiClient.getTokens();
      const match = res.tokens.find((t) => t.token_id === id);
      if (match) {
        setToken(match);
      }
    } catch (error) {
      console.error("Error loading token details:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadToken();

    window.addEventListener("papama_data_update", loadToken);
    return () => {
      window.removeEventListener("papama_data_update", loadToken);
    };
  }, [id]);

  // `live` is the donor-usable (pre-redemption) status in the authoritative enum.
  const isLive = token?.status === "live";
  const { timeLeft, isClose } = useCountdown(token?.expires_at, isLive);

  const statusColors: Record<string, string> = {
    // Authoritative token_status enum (token-flow.md)
    generated: "bg-blue-50 text-blue-700 border-blue-200 ",
    live: "bg-emerald-50 text-emerald-700 border-emerald-200 ",
    in_admin_pool: "bg-amber-50 text-amber-700 border-amber-200 ",
    assigned_to_volunteer: "bg-purple-50 text-purple-700 border-purple-200 ",
    distributed: "bg-cyan-50 text-cyan-700 border-cyan-200 ",
    redeemed: "bg-zinc-100 text-zinc-600 border-zinc-200 ",
    expired: "bg-red-50 text-red-700 border-red-200 ",
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 ">
      <Navbar />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Link */}
        <div className="mb-6">
          <Link
            href="/donor/tokens"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:underline"
          >
            <ArrowLeft size={14} weight="bold" aria-hidden />
            Back to Token Ledger
          </Link>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        ) : token ? (
          <div className="space-y-8">
            {/* Header Details Card */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm md:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                    Food Token Certificate
                  </span>
                  <h1 className="mt-1 font-mono text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 break-all">
                    {token.serial_number
                      ? token.serial_number
                      : `${token.token_id.substring(0, 8).toUpperCase()}…`}
                  </h1>
                  <p className="mt-1 text-sm font-medium text-zinc-700 ">
                    Type: <span className="uppercase text-emerald-600 ">{token.type.replace("_", " ")}</span>
                  </p>
                </div>
                <div className="self-start sm:self-center flex flex-wrap items-center gap-2">
                  {token.type === "special_care" && (
                    <span className="inline-flex rounded-full bg-rose-50 text-rose-700 border-rose-200 px-3 py-1 text-xs font-semibold border">
                      SPECIAL CARE
                    </span>
                  )}
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase ${statusColors[token.status]}`}>
                    {token.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Expiry Warning Banner (Active Timer) */}
            {isClose && timeLeft && (
              <div className="rounded-2xl border border-amber-200 bg-amber-500/5 p-6 shadow-sm text-amber-800 animate-pulse">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Clock size={20} weight="duotone" aria-hidden />
                  Voucher Expiring Soon!
                </h3>
                <p className="mt-2 text-xs font-medium">
                  This active food voucher will expire in <strong className="font-semibold">{timeLeft}</strong>. Please ensure it is assigned and claimed soon.
                </p>
              </div>
            )}

            {/* Special Care Instructions Banner */}
            {token.type === "special_care" && token.special_instructions && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/35 p-6 shadow-sm ">
                <h3 className="text-sm font-semibold text-rose-800 flex items-center gap-1.5">
                  <Warning size={20} weight="duotone" className="text-rose-600" aria-hidden />
                  Special Care Instructions
                </h3>
                <p className="mt-2 text-xs text-rose-700 font-medium">
                  {token.special_instructions}
                </p>
              </div>
            )}

            {/* Token Lifecycle Timeline & Cert */}
            <div className="grid gap-8 md:grid-cols-3">
              {/* Timeline Journey */}
              <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm md:col-span-2">
                <h2 className="text-base font-medium text-zinc-900 ">
                  Token Lifecycle Path
                </h2>
                <p className="text-zinc-400 text-xs mt-0.5">
                  Audit logs representing the lifecycle of this food token.
                </p>

                {/* Timeline Steps */}
                <div className="mt-8 space-y-8 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200 ">

                  {/* Step 1: Minted */}
                  <div className="relative pl-10 flex items-start gap-4">
                    <div className="absolute left-1.5 h-6 w-6 rounded-full border-2 border-emerald-500 bg-emerald-100 flex items-center justify-center -translate-x-1/2">
                      <div className="h-2 w-2 rounded-full bg-emerald-600 " />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-900 ">
                        Token Generated
                      </h4>
                      <p className="mt-1 text-xs text-zinc-500 ">
                        Voucher created from credit conversion. Cryptographic token and value verified.
                      </p>
                      <span className="mt-2 inline-block font-mono text-[11px] text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded ">
                        Issued At: {shortDateTime(token.issued_at)}
                      </span>
                    </div>
                  </div>

                  {/* Step 2: Current Status / Redeemed */}
                  <div className="relative pl-10 flex items-start gap-4">
                    <div className={`absolute left-1.5 h-6 w-6 rounded-full border-2 flex items-center justify-center -translate-x-1/2 ${
                      token.status === "redeemed"
                        ? "border-emerald-500 bg-emerald-100 "
                        : token.status === "expired"
                        ? "border-red-500 bg-red-100 "
                        : "border-blue-400 bg-blue-50 "
                    }`}>
                      <div className={`h-2 w-2 rounded-full ${
                        token.status === "redeemed"
                          ? "bg-emerald-600"
                          : token.status === "expired"
                          ? "bg-red-600"
                          : "bg-blue-500"
                      }`} />
                    </div>
                    <div>
                      {token.status === "redeemed" && (
                        <>
                          <h4 className="text-sm font-semibold text-zinc-900 ">
                            Token Redeemed
                          </h4>
                          <p className="mt-1 text-xs text-zinc-500 ">
                            Voucher scanned and redeemed for meal:{" "}
                            <strong className="font-medium text-zinc-700 ">
                              {token.meal_info || "Lunch — Wholesome Meal"}
                            </strong>.
                          </p>
                          <p className="mt-1 text-xs text-zinc-500 ">
                            Vendor: <strong className="font-semibold text-zinc-700 ">{token.vendor_name}</strong> ({token.location})
                          </p>
                          {token.beneficiary_category && (
                            <p className="mt-1 text-xs text-zinc-500 ">
                              Beneficiary Category: <span className="uppercase text-[11px] font-semibold text-amber-600">{token.beneficiary_category.replace("_", " ")}</span>
                            </p>
                          )}
                          <span className="mt-2 inline-block font-mono text-[11px] text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded ">
                            Redeemed At: {shortDateTime(token.redeemed_at || "")}
                          </span>
                        </>
                      )}

                      {token.status === "expired" && (
                        <>
                          <h4 className="text-sm font-semibold text-zinc-900 ">
                            Token Expired
                          </h4>
                          <p className="mt-1 text-xs text-zinc-500 ">
                            This token expired unused.
                          </p>
                          {token.expires_at && (
                            <span className="mt-2 inline-block font-mono text-[11px] text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded ">
                              Expired At: {shortDateTime(token.expires_at)}
                            </span>
                          )}
                        </>
                      )}

                      {isLive && (
                        <>
                          <h4 className="text-sm font-semibold text-zinc-900 ">
                            Live / Awaiting Scan
                          </h4>
                          <p className="mt-1 text-xs text-zinc-500 ">
                            Voucher is live and ready to be presented at any participating Anna Canteen or kitchen counter.
                          </p>
                          {token.expires_at && (
                            <span className="mt-2 inline-block font-mono text-[11px] text-blue-600 bg-blue-50/50 px-2 py-0.5 rounded font-semibold">
                              Expires On: {shortDate(token.expires_at)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Verification & Actions Column */}
              <div className="space-y-6 md:col-span-1">
                {/* QR Code Card — rendered client-side via the `qrcode` package (no external requests). */}
                {isLive && (
                  <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm text-center flex flex-col items-center">
                    <h3 className="text-base font-medium text-zinc-900 mb-4">
                      Voucher QR Code
                    </h3>
                    <div className="p-4 bg-white rounded-2xl border border-zinc-200 shadow-inner flex items-center justify-center">
                      <TokenQrCode payload={token.qr_payload} size={140} />
                    </div>
                    <div className="mt-3 font-mono text-[11px] text-zinc-400 break-all select-all">
                      {token.qr_payload}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
                      Counter staff will scan this code to issue 1 meal (worth {inr(token.value)}).
                    </p>
                    {/* Printed / anti-copy token (DIST-5): generate a print-ready
                        physical token with an anti-copy watermark + area-lock. */}
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="no-print mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white py-2.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 active:scale-[.98] "
                    >
                      <Printer size={16} weight="duotone" aria-hidden />
                      Print anti-copy token
                    </button>
                  </div>
                )}

                {/* Schedule for an occasion (DIST-6) — only meaningful while the
                    token is still distributable (live or in the admin pool). */}
                {(token.status === "live" || token.status === "in_admin_pool") && (
                  <Link
                    href={`/donor/tokens/${id}/schedule`}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 "
                  >
                    <CalendarBlank size={16} weight="duotone" aria-hidden />
                    Schedule for an occasion
                  </Link>
                )}

                {/* Verification box — real serial / QR payload */}
                <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm ">
                  <h3 className="text-base font-medium text-zinc-900 ">
                    Verification
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Token verification details.
                  </p>

                  <div className="mt-6 space-y-4 text-xs">
                    {token.serial_number && (
                      <div>
                        <span className="font-medium text-zinc-400 ">
                          Serial Number
                        </span>
                        <p className="font-mono text-[11px] text-zinc-700 break-all bg-zinc-50 p-2.5 rounded mt-1 select-all">
                          {token.serial_number}
                        </p>
                      </div>
                    )}

                    <div>
                      <span className="font-medium text-zinc-400 ">
                        Voucher Token ID
                      </span>
                      <p className="font-mono text-[11px] text-zinc-700 break-all bg-zinc-50 p-2.5 rounded mt-1 select-all">
                        {token.token_id}
                      </p>
                    </div>

                    <div>
                      <span className="font-medium text-zinc-400 ">
                        QR Payload
                      </span>
                      <p className="font-mono text-[11px] text-zinc-700 break-all bg-zinc-50 p-2.5 rounded mt-1 select-all">
                        {token.qr_payload}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Printed / anti-copy token overlay (DIST-5). On screen this is a
                dismissible preview; when printing, the `@media print` rules below
                hide everything except `.print-token`. */}
            {showPrint && token && (
              <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
                <div className="my-auto w-full max-w-md">
                  <PrintableToken token={token} />
                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowPrint(false)}
                      className="w-1/3 rounded-xl border border-zinc-200 bg-white py-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="flex-1 rounded-lg bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 py-3 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-[.98]"
                    >
                      Print this token
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Print stylesheet: when the browser print dialog is active, render
                only the printable token card on a clean page. */}
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                .print-token, .print-token * { visibility: visible !important; }
                .print-token {
                  position: absolute; left: 0; top: 0; width: 100%;
                  border-color: #18181b !important;
                }
                .no-print { display: none !important; }
              }
            `}</style>
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200 ">
            <h3 className="text-sm font-semibold text-zinc-900 ">
              Token Not Found
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              The requested token ID does not exist in your ledger.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
