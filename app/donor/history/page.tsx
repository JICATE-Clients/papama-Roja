"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/donor/Navbar";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { DashboardDonationHistoryItem } from "@/lib/donor/types/contract";
import { inr, shortDateTime } from "@/lib/format";

export default function HistoryPage() {
  const [history, setHistory] = useState<DashboardDonationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory() {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.getDashboard();
      setHistory(res.donation_history);
    } catch (err) {
      console.error("Error loading donation history:", err);
      setError(err instanceof Error ? err.message : "Failed to load donation history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();

    // Listen for custom background events
    window.addEventListener("papama_data_update", loadHistory);
    return () => {
      window.removeEventListener("papama_data_update", loadHistory);
    };
  }, []);

  const totalDonationsCount = history.length;
  const totalAmountDonated = history.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 ">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-zinc-900 ">
              Donation History
            </h1>
            <p className="mt-1.5 text-sm text-zinc-500 ">
              Review all financial contributions made to your credit balance.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 sm:gap-4 self-start md:self-center">
            <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-center shadow-sm ">
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-bold">Donations Count</span>
              <p className="text-lg font-bold text-zinc-900 ">{totalDonationsCount} Tx</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-center shadow-sm ">
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-bold">Total Contributed</span>
              <p className="text-lg font-bold text-emerald-600 ">{inr(totalAmountDonated)}</p>
            </div>
          </div>
        </div>

        {/* History Table */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm ">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <span className="text-3xl">⚠️</span>
              <h3 className="mt-4 text-sm font-semibold text-zinc-900 ">
                Couldn&apos;t load your history
              </h3>
              <p className="mt-1 text-xs text-zinc-500">{error}</p>
              <button
                onClick={loadHistory}
                className="mt-4 rounded-lg bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-[.98]"
              >
                Retry
              </button>
            </div>
          ) : history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs text-zinc-500 font-medium">
                <thead className="bg-zinc-50/50 text-[11px] font-bold uppercase text-zinc-400 border-b border-zinc-200/80 ">
                  <tr>
                    <th scope="col" className="hidden md:table-cell px-6 py-4">Donation ID</th>
                    <th scope="col" className="px-6 py-4">Credits Added</th>
                    <th scope="col" className="px-6 py-4">Transaction Date</th>
                    <th scope="col" className="px-6 py-4">Verification Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 ">
                  {history.map((item) => (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-zinc-50/30 "
                    >
                      <td className="hidden md:table-cell px-6 py-4 font-mono font-semibold text-zinc-500 uppercase">
                        {item.id}
                      </td>
                      <td className="px-6 py-4 font-bold text-emerald-600 text-sm">
                        {inr(item.amount)}
                      </td>
                      <td className="px-6 py-4 text-zinc-400">
                        {shortDateTime(item.at)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          VERIFIED SUCCESS
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16">
              <span className="text-3xl">📭</span>
              <h3 className="mt-4 text-sm font-semibold text-zinc-900 ">
                No Donations Found
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                You have not made any contributions yet. Go to the Donate page to get started.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
