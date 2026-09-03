"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/donor/Navbar";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { RedemptionHistoryItem } from "@/lib/donor/types/contract";
import { shortDateTime } from "@/lib/format";

const CATEGORY_MAP = {
  pregnant_women: { label: "Pregnant Women", icon: "🤱", color: "bg-pink-50 text-pink-700 border-pink-200 " },
  patient: { label: "Caregiver / Patient", icon: "🏥", color: "bg-blue-50 text-blue-700 border-blue-200 " },
  disability: { label: "Differently Abled", icon: "♿", color: "bg-purple-50 text-purple-700 border-purple-200 " },
  disaster_affected: { label: "Disaster Affected", icon: "⛈️", color: "bg-amber-50 text-amber-700 border-amber-200 " },
} as const;

export default function ImpactPage() {
  const [mealsSponsored, setMealsSponsored] = useState(0);
  const [redemptions, setRedemptions] = useState<RedemptionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadImpactData() {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.getDashboard();
      setMealsSponsored(res.meals_sponsored);
      setRedemptions(res.redemption_history);
    } catch (err) {
      console.error("Error loading impact data:", err);
      setError(err instanceof Error ? err.message : "Failed to load your impact data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadImpactData();

    // Listen for custom background events
    window.addEventListener("papama_data_update", loadImpactData);
    return () => {
      window.removeEventListener("papama_data_update", loadImpactData);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 ">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-zinc-900 ">
            Your Social Impact
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 max-w-2xl leading-relaxed">
            Every token voucher you purchase is redeemed directly for fresh, hot meals. See exactly who your contributions helped and where.
          </p>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="mt-8 text-center py-16 bg-white rounded-2xl border border-zinc-200/80 ">
            <span className="text-3xl">⚠️</span>
            <h3 className="mt-4 text-sm font-semibold text-zinc-900 ">
              Couldn&apos;t load your impact
            </h3>
            <p className="mt-1 text-xs text-zinc-500">{error}</p>
            <button
              onClick={loadImpactData}
              className="mt-4 rounded-lg bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-[.98]"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-12">
            {/* Impact Metric Hero */}
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200/80 bg-gradient-to-br from-emerald-50 to-teal-50/50 p-6 shadow-sm md:col-span-1 flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 ">
                    Total Sponsored Meals
                  </span>
                  <div className="mt-2 text-5xl font-bold text-emerald-700 ">
                    {mealsSponsored}
                  </div>
                </div>
                <p className="mt-4 text-xs font-medium text-zinc-500 leading-normal">
                  Your direct funding has provided nutritious, wholesome food packages to Chennai communities.
                </p>
              </div>

              {/* Impact Categories Chart/Summary */}
              <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm md:col-span-2">
                <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider text-[11px] text-zinc-400">
                  Impact Beneficiary Categories
                </h3>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {Object.entries(CATEGORY_MAP).map(([key, config]) => {
                    const count = redemptions.filter((r) => r.beneficiary_category === key).length;
                    return (
                      <div key={key} className="rounded-xl border border-zinc-100 p-4 text-center ">
                        <span className="text-3xl block mb-2">{config.icon}</span>
                        <span className="text-xs font-semibold text-zinc-900 block">
                          {config.label}
                        </span>
                        <span className="text-base font-bold text-emerald-600 mt-1 block">
                          {count} Meal{count === 1 ? "" : "s"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Redemption History / Thank-You Cards Section */}
            <div>
              <h2 className="text-base font-medium text-zinc-900 ">
                Redemption Thank-You Cards
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Real-time logs of served meals with grateful notifications from beneficiaries.
              </p>

              {redemptions.length > 0 ? (
                <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {redemptions.map((red) => {
                    const category = CATEGORY_MAP[
                      red.beneficiary_category as keyof typeof CATEGORY_MAP
                    ] || {
                      label: "Beneficiary",
                      icon: "🍲",
                      color: "bg-zinc-50 text-zinc-700",
                    };
                    return (
                      <div
                        key={red.token_id}
                        className="rounded-2xl border border-zinc-200/60 bg-white p-5 shadow-sm flex flex-col justify-between relative overflow-hidden transition hover:shadow-md"
                      >
                        {/* Ribbon marker */}
                        <div className="absolute top-0 right-0 w-2.5 h-full bg-emerald-500/20" />

                        <div className="space-y-4">
                          {/* Verified meal photo (addon2 A5) — present once proof is approved */}
                          {red.meal_photo_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={red.meal_photo_url}
                              alt="Photo of the meal you funded"
                              className="-mx-1 h-40 w-full rounded-xl object-cover"
                            />
                          )}

                          {/* Beneficiary Header */}
                          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-3 ">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${category.color}`}>
                              <span>{category.icon}</span>
                              {category.label}
                            </span>
                            <span className="font-mono text-[11px] text-zinc-400 uppercase font-medium">
                              {red.token_reference
                                ? `Ref: ${red.token_reference}`
                                : `Voucher ID: ${red.token_id.substring(0, 8)}...`}
                            </span>
                          </div>

                          {/* Heartwarming Thank-You quote */}
                          <div className="italic text-zinc-600 text-xs font-medium leading-relaxed">
                            &ldquo;A hot plate of {red.meal_info} was served. Thank you for your care and support!&rdquo;
                          </div>

                          {/* Details */}
                          <div className="text-[11px] text-zinc-500 space-y-1">
                            <p className="flex justify-between gap-2">
                              <span className="text-zinc-400 font-medium shrink-0">Canteen Point:</span>
                              <strong className="font-semibold text-zinc-800 text-right break-words">{red.vendor_name}</strong>
                            </p>
                            <p className="flex justify-between gap-2">
                              <span className="text-zinc-400 font-medium shrink-0">Location:</span>
                              <span className="text-right break-words">{red.location}</span>
                            </p>
                            <p className="flex justify-between">
                              <span className="text-zinc-400 font-medium">Redeemed At:</span>
                              <span className="font-mono text-[11px]">{shortDateTime(red.time)}</span>
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-zinc-100 text-center space-y-2">
                          <span className="text-[11px] font-semibold text-emerald-600 uppercase flex items-center justify-center gap-1">
                            ❤ MEAL FULLY REDEEMED
                          </span>
                          <Link
                            href="/donor/donate"
                            className="inline-block text-[11px] font-semibold text-emerald-600 hover:underline"
                          >
                            Donate again
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-8 text-center py-16 bg-white rounded-2xl border border-zinc-200/80 ">
                  <span className="text-3xl">🍲</span>
                  <h3 className="mt-4 text-sm font-semibold text-zinc-900 ">
                    No Meal Redemptions Yet
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Once you convert credits to tokens and they are redeemed in partner canteens, thank-you cards will appear here.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
