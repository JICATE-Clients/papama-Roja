"use client";

import Link from "next/link";
import { DashboardResponse, TokenItem } from "@/lib/donor/types/contract";
import { inr, shortDate } from "@/lib/format";
import { SectionIcon } from "@/components/nav/SectionIcon";

interface DashboardOverviewProps {
  dashboard: DashboardResponse;
  tokens: TokenItem[];
}

export default function DashboardOverview({
  dashboard,
  tokens,
}: DashboardOverviewProps) {
  const totalTokens = tokens.length;
  // `live` is the donor-usable status; pool/volunteer/distributed are in-flight.
  const liveTokens = tokens.filter((t) => t.status === "live").length;
  const redeemedTokens = tokens.filter((t) => t.status === "redeemed").length;
  const expiredTokens = tokens.filter((t) => t.status === "expired").length;
  const inFlightTokens = tokens.filter((t) =>
    ["generated", "in_admin_pool", "assigned_to_volunteer", "distributed"].includes(t.status)
  ).length;

  const redemptionRate =
    totalTokens > 0 ? Math.round((redeemedTokens / totalTokens) * 100) : 0;

  const stats = [
    {
      name: "Total Donated Amount",
      value: inr(dashboard.total_donations),
      icon: <SectionIcon name="heart" color="#C98A15" size={20} />,
      color: "bg-[#C98A15]/12",
      description: `${dashboard.total_tokens} lifetime tokens minted`,
    },
    {
      name: "Meals Sponsored",
      value: dashboard.meals_sponsored,
      icon: <SectionIcon name="menu" color="#D4643C" size={20} />,
      color: "bg-[#D4643C]/12",
      description: "Direct beneficiary meals funded",
    },
    {
      name: "Token Redemption Rate",
      value: `${redemptionRate}%`,
      icon: <SectionIcon name="impact" color="#0B7A55" size={20} />,
      color: "bg-[#0B7A55]/12",
      description: `${redeemedTokens} of ${totalTokens} tokens redeemed`,
    },
    {
      name: "Available Credits",
      value: inr(dashboard.total_credit),
      icon: <SectionIcon name="wallet" color="#B8860B" size={20} />,
      color: "bg-[#B8860B]/12",
      description: "Non-withdrawable credits balance",
    },
  ];

  const statuses = [
    {
      name: "Live",
      count: liveTokens,
      color: "bg-blue-500",
      textColor: "text-blue-600 ",
      description: "Ready to be redeemed",
    },
    {
      name: "Redeemed",
      count: redeemedTokens,
      color: "bg-emerald-500",
      textColor: "text-emerald-600 ",
      description: "Successfully claimed at partner canteens",
    },
    {
      name: "In Distribution",
      count: inFlightTokens,
      color: "bg-amber-500",
      textColor: "text-amber-600 ",
      description: "In the admin pool or with a volunteer",
    },
    {
      name: "Expired",
      count: expiredTokens,
      color: "bg-red-500",
      textColor: "text-red-500 ",
      description: "Expired before canteen scanning",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-800 to-teal-700 p-6 text-white shadow-xl md:p-8">
        <h1 className="text-2xl sm:text-3xl font-medium tracking-tight">
          Welcome back!
        </h1>
        <p className="mt-2 max-w-xl text-emerald-100/80 text-sm md:text-base font-medium leading-relaxed">
          Your donations have sponsored <strong>{dashboard.meals_sponsored} meals</strong> directly to beneficiaries at locations like Anna Canteen and local primary schools.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/donor/donate"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-emerald-800 shadow transition hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-1 focus-visible:ring-offset-emerald-800 active:scale-[.98]"
          >
            Donate Money
          </Link>
          <Link
            href="/donor/credit"
            className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-1 focus-visible:ring-offset-emerald-800 active:scale-[.98]"
          >
            Manage & Convert Credit
          </Link>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm "
          >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <span className="text-sm font-medium text-zinc-500 ">
                {stat.name}
              </span>
              <div className={`rounded-xl p-2.5 ${stat.color}`}>{stat.icon}</div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold tracking-tight text-zinc-900 ">
                {stat.value}
              </span>
              <p className="mt-1 text-xs text-zinc-400 ">
                {stat.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts & Breakdown */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Token Status Breakdown */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm lg:col-span-1">
          <h2 className="text-base font-medium text-zinc-900 ">
            Token Status Breakdown
          </h2>
          <p className="text-zinc-400 text-xs mt-1">
            Current status of all generated food tokens.
          </p>

          <div className="mt-6 space-y-4">
            {statuses.map((status) => {
              const percentage =
                totalTokens > 0
                  ? Math.round((status.count / totalTokens) * 100)
                  : 0;
              return (
                <div key={status.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-zinc-700 ">
                      {status.name}
                    </span>
                    <span className={`font-semibold ${status.textColor}`}>
                      {status.count} ({percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-100 ">
                    <div
                      className={`h-full rounded-full ${status.color}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400 ">
                    {status.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Token Activity Feed */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div>
              <h2 className="text-base font-medium text-zinc-900 ">
                Recent Generated Tokens
              </h2>
              <p className="text-zinc-400 text-xs mt-1">
                Food tokens created and waiting for redemption.
              </p>
            </div>
            <Link
              href="/donor/tokens"
              className="shrink-0 whitespace-nowrap text-xs font-medium text-emerald-600 hover:underline"
            >
              View Token Registry
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {tokens.length === 0 ? (
              <p className="text-center text-sm py-8 text-zinc-400">
                No active tokens found. Convert credits to tokens.
              </p>
            ) : (
              tokens.slice(0, 3).map((token) => (
                <div
                  key={token.token_id}
                  className="flex items-start justify-between rounded-xl border border-zinc-200/60 p-4 transition-colors hover:bg-zinc-50/50 "
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-1 h-2.5 w-2.5 rounded-full ${
                        token.status === "live"
                          ? "bg-blue-500"
                          : token.status === "redeemed"
                          ? "bg-emerald-500"
                          : token.status === "expired"
                          ? "bg-red-500"
                          : "bg-amber-500"
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/donor/tokens/${token.token_id || ''}`}
                          className="font-mono text-xs font-semibold text-zinc-700 hover:text-emerald-600"
                        >
                          {/* The donor-facing reference is the serial number.
                              This used to print `qr_payload` — the value a
                              vendor scans to redeem the token — which is both
                              unreadable and not something to list on screen. */}
                          {token.serial_number
                            ? token.serial_number
                            : token.token_id
                            ? `${token.token_id.substring(0, 8)}…`
                            : 'TOKEN'}
                        </Link>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                            token.status === "live"
                              ? "bg-blue-50 text-blue-700 "
                              : token.status === "redeemed"
                              ? "bg-emerald-50 text-emerald-700 "
                              : token.status === "expired"
                              ? "bg-red-50 text-red-700 "
                              : "bg-amber-50 text-amber-700 "
                          }`}
                        >
                          {token.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-zinc-900 ">
                        {token.type ? token.type.replace("_", " ").toUpperCase() : "STANDARD"} TOKEN · Value {inr(token.value || 50)}
                      </p>
                      {token.status === "redeemed" && token.vendor_name && (
                        <p className="mt-1 text-[11px] text-zinc-500 leading-normal">
                          Meal ({token.meal_info || "Food"}) was served at <strong>{token.vendor_name}</strong> in {token.location || "Unknown location"}.
                        </p>
                      )}
                      {token.status === "redeemed" && !token.vendor_name && (
                        <p className="mt-1 text-[11px] text-zinc-400 ">
                          Redeemed on {token.redeemed_at ? shortDate(token.redeemed_at) : "Unknown date"}
                        </p>
                      )}
                      {token.status === "live" && (
                        <p className="mt-1 text-[11px] text-zinc-400">
                          Issued on {token.issued_at ? shortDate(token.issued_at) : "Recently"}
                        </p>
                      )}
                      {token.is_special_care && token.special_instructions && (
                        <p className="mt-1 text-[11px] font-medium text-rose-600 bg-rose-50/20 p-1.5 rounded">
                          Instruction: {token.special_instructions}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="text-[11px] text-zinc-400 font-medium">
                    {token.issued_at ? shortDate(token.issued_at) : "Unknown"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Donation History Section */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm ">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div>
            <h2 className="text-base font-medium text-zinc-900 ">
              Recent Financial Donations
            </h2>
            <p className="text-zinc-400 text-xs mt-1">
              Audit trails of your financial contributions to your credit balance.
            </p>
          </div>
          <Link
            href="/donor/history"
            className="shrink-0 whitespace-nowrap text-xs font-medium text-emerald-600 hover:underline"
          >
            View Full History
          </Link>
        </div>

        <div className="mt-6 overflow-x-auto">
          {dashboard.donation_history.length === 0 ? (
            <p className="text-center text-sm py-8 text-zinc-400">
              No donations recorded yet.
            </p>
          ) : (
            <table className="w-full text-left text-xs font-medium">
              <thead>
                <tr className="border-b border-zinc-200/60 text-[11px] font-semibold uppercase text-zinc-400 ">
                  <th className="hidden pb-3 pr-4 sm:table-cell">Donation ID</th>
                  <th className="pb-3 px-4">Amount Donated</th>
                  <th className="pb-3 px-4">Allocated Status</th>
                  <th className="pb-3 pl-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100/50 ">
                {dashboard.donation_history.slice(0, 3).map((item) => (
                  <tr key={item.id} className="text-zinc-700 ">
                    <td className="hidden py-3 pr-4 font-mono font-semibold text-zinc-500 uppercase sm:table-cell">
                      {item.id.substring(0, 8)}...
                    </td>
                    <td className="py-3 px-4 font-semibold text-emerald-600 ">
                      {inr(item.amount)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ">
                        SUCCESS
                      </span>
                    </td>
                    <td className="py-3 pl-4 text-right text-zinc-400">
                      {shortDate(item.at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Monthly Summary Section */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm ">
        <h2 className="text-base font-medium text-zinc-900 ">
          Monthly Summary
        </h2>
        <p className="text-zinc-400 text-xs mt-1">
          Donations contributed and meals sponsored, month by month.
        </p>

        <div className="mt-6 overflow-x-auto">
          {dashboard.monthly_summary.length === 0 ? (
            <p className="text-center text-sm py-8 text-zinc-400">
              No monthly activity yet.
            </p>
          ) : (
            <table className="w-full text-left text-xs font-medium">
              <thead>
                <tr className="border-b border-zinc-200/60 text-[11px] font-semibold uppercase text-zinc-400 ">
                  <th className="pb-3 pr-4">Month</th>
                  <th className="pb-3 px-4 text-right">Donated</th>
                  <th className="pb-3 pl-4 text-right">Meals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100/50 ">
                {dashboard.monthly_summary.map((m) => (
                  <tr key={m.month} className="text-zinc-700 ">
                    <td className="py-3 pr-4 font-semibold text-zinc-700 ">
                      {m.month}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-600 ">
                      {inr(m.donated)}
                    </td>
                    <td className="py-3 pl-4 text-right text-zinc-500 ">
                      {m.meals}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
