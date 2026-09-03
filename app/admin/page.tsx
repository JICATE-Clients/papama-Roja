import Link from "next/link";

import { StatTiles, TILE_ICONS, type ColourTile } from "./DashboardTiles";
import {
    MoneyChart,
    PipelineChart,
    type MoneyPoint,
    type PipelineSlice,
} from "./DashboardCharts";
import { shortDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBoolean } from "@/lib/system-config";
import { getTransparencyStats, type TransparencyStats } from "@/lib/services/transparency";

/**
 * Admin console home — KPI strip + recent-activity feed + a directory of the
 * feed. The section directory moved into the sidebar. Each page fetches its GET
 * /api/admin/* route; the route itself enforces the role gate. The KPIs are read
 * server-side through the session client (RLS-scoped), so staff who lack a
 * table's read simply see 0 there rather than an error. Alert KPIs deep-link to
 * the matching filtered list.
 *
 * The section directory lives in ./adminSections (shared with AdminSidebar and
 * AdminBottomNav — single source of truth), grouped for the sidebar.
 */

async function countRows(
    supabase: Awaited<ReturnType<typeof createClient>>,
    table: string,
    filter?: { column: string; value: string | boolean }
): Promise<number> {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = q.eq(filter.column, filter.value);
    const { count } = await q;
    return count ?? 0;
}

interface Kpi {
    label: string;
    value: number;
    alert?: boolean;
    /** When set, the card becomes a deep-link to the matching filtered list. */
    href?: string;
}

async function loadKpis(): Promise<Kpi[]> {
    const supabase = await createClient();
    const [donations, tokens, redemptions, proofsToReview, openFraud, heldSettlements] =
        await Promise.all([
            countRows(supabase, "donations"),
            countRows(supabase, "tokens"),
            countRows(supabase, "token_redemptions"),
            countRows(supabase, "token_redemptions", { column: "proof_status", value: "submitted" }),
            countRows(supabase, "fraud_flags", { column: "status", value: "open" }),
            countRows(supabase, "vendor_settlements", { column: "on_hold", value: true }),
        ]);
    return [
        { label: "Donations", value: donations },
        { label: "Tokens minted", value: tokens, href: "/admin/tokens" },
        { label: "Redemptions", value: redemptions },
        { label: "Proofs to review", value: proofsToReview, alert: proofsToReview > 0, href: "/admin/proofs" },
        { label: "Open fraud flags", value: openFraud, alert: openFraud > 0, href: "/admin/fraud?status=open" },
        {
            label: "Settlements on hold",
            value: heldSettlements,
            alert: heldSettlements > 0,
            href: "/admin/settlements?hold=true",
        },
    ];
}

interface ActivityRow {
    id: string;
    action: string;
    summary: string | null;
    actor_role: string | null;
    created_at: string;
}

/** Rows the integration suite wrote. See the note in loadRecentActivity. */
const TEST_TAG = "_test_integration_";

/**
 * Recent activity for the dashboard.
 *
 * Entries written by the integration suite are filtered OUT of this feed but
 * deliberately left in the table. `audit_logs` has only INSERT and SELECT
 * policies — it is append-only by design, and deleting from it would break the
 * one guarantee the product makes about its own records. So the rows stay; they
 * just don't get to be the headline. /admin/audit-logs still shows everything,
 * because that page IS the trail and hiding rows there would be dishonest.
 *
 * Over-fetches so the filter can still yield a full page: 18 of the 55 rows
 * currently carry the tag, and a plain limit(10) returned nothing but those.
 */
async function loadRecentActivity(): Promise<ActivityRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
        .from("audit_logs")
        .select("id, action, summary, actor_role, created_at")
        .order("created_at", { ascending: false })
        .limit(60);

    return ((data ?? []) as ActivityRow[])
        .filter((a) => !a.action?.includes(TEST_TAG) && !a.summary?.includes(TEST_TAG))
        .slice(0, 10);
}

/**
 * Community-impact stats (addon #14), merged onto the admin home. Uses the
 * service-role client (not the RLS session client) because the published flag
 * lives in system_config — not session-readable — and the numbers come from the
 * SECURITY DEFINER function public.public_transparency_stats(). Aggregate-only,
 * no PII. Shown to admins even while unpublished, so they can preview the numbers
 * before flipping transparency_dashboard_enabled on in System config.
 */
async function loadTransparency(): Promise<{ enabled: boolean; stats: TransparencyStats | null }> {
    const admin = createAdminClient();
    let enabled = false;
    try {
        enabled = await getBoolean("transparency_dashboard_enabled", admin as never);
    } catch {
        enabled = false;
    }
    try {
        const stats = await getTransparencyStats(admin);
        return { enabled, stats };
    } catch {
        return { enabled, stats: null };
    }
}

/**
 * Cumulative money raised, one point per day that had a gift, plus a final point
 * at today so the line reaches the present rather than stopping at the last
 * donation. Completed donations only — a pending one has not been paid.
 */
async function loadMoneySeries(): Promise<MoneyPoint[]> {
    const supabase = await createClient();
    const { data } = await supabase
        .from("donations")
        .select("created_at, amount_inr")
        .eq("status", "completed")
        .order("created_at", { ascending: true });

    const rows = (data ?? []) as { created_at: string; amount_inr: number }[];
    if (rows.length === 0) return [];

    // Collapse to one entry per day, then accumulate.
    const perDay = new Map<string, number>();
    for (const r of rows) {
        const day = r.created_at.slice(0, 10);
        perDay.set(day, (perDay.get(day) ?? 0) + Number(r.amount_inr));
    }

    let running = 0;
    const points: MoneyPoint[] = [];
    for (const [date, amount] of [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        running += amount;
        points.push({ date, total: running });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (points[points.length - 1].date !== today) points.push({ date: today, total: running });
    return points;
}

/** Every minted token, grouped by the state it is currently in. */
async function loadPipeline(): Promise<PipelineSlice[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("tokens").select("status");

    const counts = new Map<string, number>();
    for (const r of (data ?? []) as { status: string }[]) {
        counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    }
    // Fixed order so a colour never moves between states as counts change.
    const ORDER = ["live", "distributed", "redeemed", "expired", "blocked"];
    return [...counts.entries()]
        .sort((a, b) => {
            const ai = ORDER.indexOf(a[0]);
            const bi = ORDER.indexOf(b[0]);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        })
        .map(([status, count]) => ({ status, count }));
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
/** "1 beneficiary" / "4 cities" — the banner reads as a sentence, so it has to agree. */
const plural = (n: number, one: string, many = `${one}s`) =>
    `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const num = (n: number) => n.toLocaleString("en-IN");

export default async function AdminHomePage() {
    const [kpis, activity, transparency, money, pipeline] = await Promise.all([
        loadKpis(),
        loadRecentActivity(),
        loadTransparency(),
        loadMoneySeries(),
        loadPipeline(),
    ]);

    // Anything needing a human decision leads. Everything else is a counter.
    const needsAction = kpis.filter((k) => k.alert);
    const st = transparency.stats;

    const byLabel = (l: string) => num(kpis.find((k) => k.label === l)?.value ?? 0);
    const tiles: ColourTile[] = [
        { label: "Donations", value: byLabel("Donations"), tone: "orange", icon: TILE_ICONS.Gift, href: "/admin/donations" },
        { label: "Tokens minted", value: byLabel("Tokens minted"), tone: "gold", icon: TILE_ICONS.Ticket, href: "/admin/tokens" },
        { label: "Redemptions", value: byLabel("Redemptions"), tone: "teal", icon: TILE_ICONS.Receipt },
        { label: "Proofs to review", value: byLabel("Proofs to review"), tone: "blue", icon: TILE_ICONS.Camera, href: "/admin/proofs" },
        { label: "Open fraud flags", value: byLabel("Open fraud flags"), tone: "red", icon: TILE_ICONS.ShieldWarning, href: "/admin/fraud?status=open" },
        { label: "Settlements on hold", value: byLabel("Settlements on hold"), tone: "bronze", icon: TILE_ICONS.Bank, href: "/admin/settlements?hold=true" },
    ];

    return (
        <div className="mx-auto max-w-6xl">
            <header className="mb-8">
                <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Dashboard</h1>
                <p className="mt-1.5 text-[15px] text-slate-500">
                    {needsAction.length > 0
                        ? `${needsAction.length} ${needsAction.length === 1 ? "queue needs" : "queues need"} your attention.`
                        : "Nothing is waiting on you."}
                </p>
            </header>

            {needsAction.length === 0 && (
                <p className="mb-8 flex items-center gap-2.5 text-sm text-slate-500">
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-500" />
                    All queues clear &mdash; no proofs, fraud flags or held settlements waiting.
                </p>
            )}

            {/* PROGRAMME IMPACT — the same tile treatment as the counters below.
                Tones are ordered so no two adjacent tiles share a family. */}
            {st && (
                <section className="mb-10">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <SectionLabel className="mb-0">Programme impact</SectionLabel>
                        <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                transparency.enabled
                                    ? "bg-green-100 text-green-800"
                                    : "bg-amber-100 text-amber-800"
                            }`}
                        >
                            {transparency.enabled ? "Published" : "Not published"}
                        </span>
                    </div>

                    <StatTiles
                        tiles={[
                            {
                                label: "Total donations",
                                value: inr(st.total_donations_inr),
                                sub: `${plural(st.meals_sponsored, "meal")} sponsored`,
                                tone: "emerald",
                                icon: TILE_ICONS.HandHeart,
                                wide: true,
                            },
                            { label: "Meals served", value: num(st.meals_served), tone: "orange", icon: TILE_ICONS.ForkKnife },
                            { label: "Active vendors", value: num(st.active_vendors), tone: "teal", icon: TILE_ICONS.Storefront, href: "/admin/vendors" },
                            { label: "Beneficiaries", value: num(st.active_beneficiaries), tone: "rose", icon: TILE_ICONS.UsersThree, href: "/admin/beneficiaries" },
                            { label: "Cities", value: num(st.cities_covered), tone: "blue", icon: TILE_ICONS.MapPin },
                        ]}
                    />
                </section>
            )}

            {/* LEDGER TOTALS — the operational counters, as colour-coded tiles.
                Each takes its hue from the sidebar entry it links to. */}
            <section className="mb-10">
                <SectionLabel>Ledger totals</SectionLabel>
                <StatTiles tiles={tiles} />
            </section>

            {transparency.stats && !transparency.enabled && (
                <div className="mb-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50/70 px-5 py-4 ring-1 ring-amber-200/80">
                    <p className="text-[13px] text-slate-600">
                        The public <code className="font-mono">/transparency</code> page returns 404 while{" "}
                        <code className="font-mono">transparency_dashboard_enabled</code> is off &mdash; but the
                        landing page links to it in four places.
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                        <Link
                            href="/admin/system-config"
                            className="rounded-lg bg-white px-3.5 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50"
                        >
                            System config
                        </Link>
                        <Link
                            href="/transparency"
                            className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
                        >
                            Preview
                        </Link>
                    </div>
                </div>
            )}

            {/* The two plots. Money is the wide one because the money story is
                the one an admin came for. */}
            <section className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-5">
                <div className="lg:col-span-3">
                    <MoneyChart points={money} />
                </div>
                <div className="lg:col-span-2">
                    <PipelineChart slices={pipeline} />
                </div>
            </section>

            {/* ACTIVITY — a list, not a table in a box. Hairlines between rows
                only; the outer border was doing nothing the shadow doesn't. */}
            <section>
                <div className="mb-3 flex items-baseline justify-between">
                    <SectionLabel className="mb-0">Recent activity</SectionLabel>
                    <Link
                        href="/admin/audit-logs"
                        className="text-xs font-medium text-slate-500 transition hover:text-slate-900"
                    >
                        View audit log &rarr;
                    </Link>
                </div>

                <div className="rounded-2xl bg-white px-2 py-1 shadow-sm ring-1 ring-slate-900/[0.06]">
                    {activity.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-slate-400">No activity recorded yet.</p>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {activity.map((a) => (
                                <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3.5">
                                    <span className="font-mono text-[13px] font-medium text-slate-800">
                                        {a.action}
                                    </span>
                                    {a.summary && (
                                        <span className="min-w-0 flex-1 truncate text-[13px] text-slate-500">
                                            {a.summary}
                                        </span>
                                    )}
                                    <span className="ml-auto shrink-0 text-xs text-slate-400">
                                        {a.actor_role ?? "system"} &middot; {shortDateTime(a.created_at)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>
        </div>
    );
}

function SectionLabel({ children, className = "mb-3" }: { children: React.ReactNode; className?: string }) {
    return (
        <h2 className={`text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 ${className}`}>
            {children}
        </h2>
    );
}
