"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminPageHeader, ListStates, StatTile, TableHead, TableShell } from "../_ui";

/**
 * Admin analytics dashboard (addon2 A1) — meals served, donation trends, vendor
 * performance, token utilisation, financial + fraud summaries, and city /
 * category breakdowns. Charts are dependency-free CSS bars (one emerald system,
 * labelled values) so `main` stays buildable and demo-ready.
 */

type ListState = "loading" | "ready" | "forbidden" | "error";

interface NameCount {
    label: string;
    count: number;
}
interface TrendPoint {
    period: string;
    value: number;
}
interface VendorPerf {
    vendor_id: string;
    name: string;
    redemptions: number;
    rating_avg: number | null;
    quality_score: number | null;
}
interface Analytics {
    meals_served_total: number;
    meals_trend_30d: TrendPoint[];
    donation_total_inr: number;
    donation_count: number;
    donation_trend_6m: TrendPoint[];
    token_utilisation: NameCount[];
    financial: {
        donated_inr: number;
        settlements_paid_inr: number;
        settlements_pending_inr: number;
        forfeited_inr: number;
    };
    fraud_open_by_severity: NameCount[];
    top_vendors: VendorPerf[];
    city_wise: NameCount[];
    category_wise: NameCount[];
}

const rupee = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;
const pretty = (s: string) => s.replace(/_/g, " ");

export default function AdminAnalyticsPage() {
    const router = useRouter();
    const [data, setData] = useState<Analytics | null>(null);
    const [state, setState] = useState<ListState>("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await fetch("/api/admin/analytics", { cache: "no-store" });
        if (res.status === 401) {
            router.push("/login?redirect=/admin/analytics");
            return;
        }
        if (res.status === 403) {
            setState("forbidden");
            return;
        }
        if (!res.ok) {
            const b = await res.json().catch(() => ({}));
            setErrorMsg(b.error ?? `Request failed (${res.status})`);
            setState("error");
            return;
        }
        const b = (await res.json()) as { analytics: Analytics };
        setData(b.analytics);
        setState("ready");
    }, [router]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div>
            <AdminPageHeader
                title="Analytics"
                subtitle="Platform-wide impact, donations, vendor performance, token utilisation, finance and fraud — by city and beneficiary category."
            />

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={!data}
                resourceLabel="analytics"
                emptyHint="Analytics will populate as donations and redemptions accrue."
                table={data ? <Dashboard a={data} /> : <div />}
            />
        </div>
    );
}

function Dashboard({ a }: { a: Analytics }) {
    return (
        <div className="space-y-8">
            {/* KPI tiles */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Meals served" value={a.meals_served_total.toLocaleString("en-IN")} />
                <StatTile label="Donations (total)" value={rupee(a.donation_total_inr)} />
                <StatTile label="Donations (count)" value={a.donation_count.toLocaleString("en-IN")} />
                <StatTile label="Forfeited value" value={rupee(a.financial.forfeited_inr)} />
            </div>

            {/* Trends */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Meals served — last 30 days">
                    <TrendBars points={a.meals_trend_30d} />
                </Card>
                <Card title="Donations — last 6 months (₹)">
                    <BarList
                        items={a.donation_trend_6m.map((p) => ({ label: p.period, count: p.value }))}
                        format={rupee}
                    />
                </Card>
            </div>

            {/* Utilisation + financial */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Token utilisation (by status)">
                    <BarList items={a.token_utilisation.map((t) => ({ ...t, label: pretty(t.label) }))} />
                </Card>
                <Card title="Financial summary">
                    <div className="grid grid-cols-2 gap-4">
                        <StatTile small label="Donated" value={rupee(a.financial.donated_inr)} />
                        <StatTile small label="Settlements paid" value={rupee(a.financial.settlements_paid_inr)} />
                        <StatTile
                            small
                            label="Settlements pending"
                            value={rupee(a.financial.settlements_pending_inr)}
                        />
                        <StatTile small label="Forfeited" value={rupee(a.financial.forfeited_inr)} />
                    </div>
                </Card>
            </div>

            {/* City + category */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Redemptions by city">
                    <BarList items={a.city_wise} />
                </Card>
                <Card title="Redemptions by beneficiary category">
                    <BarList items={a.category_wise.map((c) => ({ ...c, label: pretty(c.label) }))} />
                </Card>
            </div>

            {/* Fraud + top vendors */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Open fraud flags (by severity)">
                    {a.fraud_open_by_severity.length === 0 ? (
                        <p className="text-sm text-slate-500">No open fraud flags. 🎉</p>
                    ) : (
                        <BarList items={a.fraud_open_by_severity.map((f) => ({ ...f, label: pretty(f.label) }))} />
                    )}
                </Card>
                <Card title="Top vendors (by redemptions)">
                    {a.top_vendors.length === 0 ? (
                        <p className="text-sm text-slate-500">No redemptions yet.</p>
                    ) : (
                        // Rating and Quality are both scores; Quality is the one that
                        // drops below md so the mini table fits a phone card.
                        <TableShell hideCols={[4]}>
                            <TableHead columns={["Vendor", "Redemptions", "Rating", "Quality"]} />
                            <tbody className="divide-y divide-slate-100">
                                {a.top_vendors.map((v) => (
                                    <tr key={v.vendor_id} className="hover:bg-slate-50">
                                        <td className="px-2 md:px-4 py-2.5 text-slate-800">{v.name}</td>
                                        <td className="px-2 md:px-4 py-2.5 text-slate-700">{v.redemptions}</td>
                                        <td className="px-2 md:px-4 py-2.5 text-slate-600">
                                            {v.rating_avg != null ? `${v.rating_avg}★` : "—"}
                                        </td>
                                        <td className="px-2 md:px-4 py-2.5 text-slate-600">
                                            {v.quality_score != null ? v.quality_score : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableShell>
                    )}
                </Card>
            </div>
        </div>
    );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        // min-w-0: a grid item is min-width:auto by default, so the mini table
        // below propagated its min-content up and widened the whole column past
        // the viewport on a 360px phone. Let the card shrink; the table scrolls.
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-800">{title}</h3>
            {children}
        </div>
    );
}

/** Horizontal labelled bars for a small category set. */
function BarList({ items, format }: { items: NameCount[]; format?: (n: number) => string }) {
    if (items.length === 0) return <p className="text-sm text-slate-500">No data yet.</p>;
    const max = Math.max(1, ...items.map((i) => i.count));
    return (
        <div className="space-y-2.5">
            {items.map((i) => (
                <div key={i.label} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-xs font-medium capitalize text-slate-600" title={i.label}>
                        {i.label}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                        <div
                            className="h-full rounded bg-emerald-500"
                            style={{ width: `${Math.round((i.count / max) * 100)}%` }}
                        />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs font-semibold text-slate-700">
                        {format ? format(i.count) : i.count.toLocaleString("en-IN")}
                    </span>
                </div>
            ))}
        </div>
    );
}

/** Compact vertical spark-bars for a daily trend. */
function TrendBars({ points }: { points: TrendPoint[] }) {
    const max = Math.max(1, ...points.map((p) => p.value));
    const total = points.reduce((s, p) => s + p.value, 0);
    return (
        <div>
            <div className="flex h-28 items-end gap-0.5">
                {points.map((p) => (
                    <div
                        key={p.period}
                        className="flex-1 rounded-t bg-emerald-500/80 transition-all hover:bg-emerald-600"
                        style={{ height: `${Math.max(2, Math.round((p.value / max) * 100))}%` }}
                        title={`${p.period}: ${p.value}`}
                    />
                ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
                {total.toLocaleString("en-IN")} meals over {points.length} days · peak {max}/day
            </p>
        </div>
    );
}
