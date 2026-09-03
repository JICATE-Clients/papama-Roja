"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/donor/Navbar";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { TokenItem } from "@/lib/donor/types/contract";
import Link from "next/link";
import { inr, shortDate } from "@/lib/format";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";

export default function TokensLedgerPage() {
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [selectedType, setSelectedType] = useState<string>("All");

  async function loadTokens() {
    try {
      const res = await ApiClient.getTokens();
      setTokens(res.tokens);
    } catch (error) {
      console.error("Error loading token ledger:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTokens();

    // Listen for custom background events
    window.addEventListener("papama_data_update", loadTokens);
    return () => {
      window.removeEventListener("papama_data_update", loadTokens);
    };
  }, []);

  const filteredTokens = useMemo(() => {
    let result = tokens;

    if (selectedStatus !== "All") {
      result = result.filter((t) => t.status === selectedStatus);
    }

    if (selectedType !== "All") {
      result = result.filter((t) => t.type === selectedType.toLowerCase());
    }

    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.token_id.toLowerCase().includes(query) ||
          t.qr_payload.toLowerCase().includes(query) ||
          (t.special_instructions && t.special_instructions.toLowerCase().includes(query))
      );
    }

    return result;
  }, [searchQuery, selectedStatus, selectedType, tokens]);

  // Filter labels map to the authoritative token_status enum values (all 7 states).
  const statuses: { label: string; value: string }[] = [
    { label: "All", value: "All" },
    { label: "Live", value: "live" },
    { label: "In Pool", value: "in_admin_pool" },
    { label: "With Volunteer", value: "assigned_to_volunteer" },
    { label: "Distributed", value: "distributed" },
    { label: "Redeemed", value: "redeemed" },
    { label: "Expired", value: "expired" },
  ];
  const types = ["All", "Standard", "Special_Care"];

  const statusBadges: Record<string, string> = {
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

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-zinc-900 ">
            Token Ledger Registry
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 max-w-2xl leading-relaxed">
            View the complete cryptographic record of all food canteen voucher tokens you have generated.
          </p>
        </div>

        {/* Filter Toolbar */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200/80 pb-6 ">
          {/* Search bar */}
          <div className="relative w-full sm:max-w-md">
            <span className="absolute inset-y-0 left-3 flex items-center text-zinc-400">
              <MagnifyingGlass size={20} weight="bold" aria-hidden />
            </span>
            <input
              type="text"
              placeholder="Search by token ID or payload..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-zinc-200 pl-10 pr-4 text-xs font-medium text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 "
            />
          </div>

          {/* Filters Wrapper */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Status tabs */}
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((status) => {
                const isSelected = selectedStatus === status.value;
                return (
                  <button
                    key={status.value}
                    onClick={() => setSelectedStatus(status.value)}
                    className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ${
                      isSelected
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-white border border-zinc-200/60 text-zinc-600 hover:bg-zinc-50 "
                    }`}
                  >
                    {status.label}
                  </button>
                );
              })}
            </div>

            {/* Type Filter Select */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase">Type:</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="rounded-xl border border-zinc-200/60 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 "
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm ">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            </div>
          ) : filteredTokens.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs text-zinc-500 font-medium pa-tcol-hide-2 pa-tcol-hide-5 pa-tcol-hide-6">
                <thead className="bg-zinc-50/50 text-[11px] font-bold uppercase text-zinc-400 border-b border-zinc-200/80 ">
                  <tr>
                    <th scope="col" className="px-2 py-4 md:px-6">Token ID</th>
                    <th scope="col" className="px-2 py-4 md:px-6">Type</th>
                    <th scope="col" className="px-2 py-4 md:px-6">Status</th>
                    <th scope="col" className="px-2 py-4 md:px-6">Value</th>
                    <th scope="col" className="px-2 py-4 md:px-6">Issued At</th>
                    <th scope="col" className="px-2 py-4 md:px-6">Expiration / Redemption</th>
                    <th scope="col" className="px-2 py-4 md:px-6 text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 ">
                  {filteredTokens.map((token) => (
                    <tr
                      key={token.token_id}
                      className="transition-colors hover:bg-zinc-50/30 "
                    >
                      <td className="whitespace-nowrap px-2 py-4 md:px-6 font-mono font-semibold text-zinc-900">
                        {token.serial_number || `${token.token_id.substring(0, 8)}…`}
                      </td>
                      <td className="px-2 py-4 md:px-6 uppercase font-semibold text-[11px]">
                        <span className={token.type === "special_care" ? "text-rose-600 " : "text-zinc-600"}>
                          {token.type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-2 py-4 md:px-6">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${statusBadges[token.status]}`}>
                          {token.status}
                        </span>
                      </td>
                      <td className="px-2 py-4 md:px-6 font-semibold text-zinc-800 ">
                        {inr(token.value)}
                      </td>
                      <td className="px-2 py-4 md:px-6 text-zinc-400">
                        {shortDate(token.issued_at)}
                      </td>
                      <td className="px-2 py-4 md:px-6 text-zinc-400">
                        {token.status === "redeemed" && token.redeemed_at ? (
                          <div>
                            <span className="font-medium text-emerald-600 ">Redeemed</span>
                            <p className="text-[11px] text-zinc-400 font-normal">
                              {shortDate(token.redeemed_at)}
                            </p>
                          </div>
                        ) : token.status === "expired" ? (
                          <span className="text-red-500 font-semibold">Expired</span>
                        ) : (
                          <div>
                            <span className="font-medium text-blue-600 capitalize">
                              {token.status.replace(/_/g, " ")}
                            </span>
                            {token.expires_at && (
                              <p className="text-[11px] text-zinc-400 font-normal">
                                Expires: {shortDate(token.expires_at)}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-4 md:px-6 text-right">
                        <Link
                          href={`/donor/tokens/${token.token_id}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 hover:underline"
                        >
                          {token.status === "live" ? "Show QR" : (
                            <>
                              <span className="md:hidden">Verify</span>
                              <span className="hidden md:inline">Verify Journey</span>
                            </>
                          )}
                          <ArrowRight size={14} weight="bold" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16">
              <span className="text-3xl">🎫</span>
              <h3 className="mt-4 text-sm font-semibold text-zinc-900 ">
                No Tokens Registered
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Try selecting a different status/type or adjust the search query.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
