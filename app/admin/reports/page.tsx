"use client";

import { useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import { REPORT_TYPES, type ReportType } from "@/lib/types/enums";
import type { ComplianceReportResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    DetailDrawer,
    FilterBar,
    ListStates,
    Notice,
    Pagination,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useClientTable,
    useDetailDrawer,
    type DetailSection,
} from "../_ui";

/** Admin reports page — generated compliance/CSR reports + generator + preview (contract §10). */
export default function AdminReportsPage() {
    const canGenerate = useCan("audit_reports", "create");
    const { items, state, errorMsg, reload } = useAdminList<ComplianceReportResponse>(
        "/api/admin/reports",
        "reports",
        "/admin/reports"
    );

    const table = useClientTable(items, {
        searchKeys: ["title", "report_type"],
        tabKey: "report_type",
        pageSize: 15,
    });
    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            ...REPORT_TYPES.map((t) => ({ label: t, value: t, count: table.tabCounts[t] })),
        ],
        [table.tabCounts]
    );

    const drawer = useDetailDrawer<ComplianceReportResponse>();
    const r = drawer.selected;
    const sections: DetailSection[] = r
        ? [
              { label: "Type", value: r.report_type },
              { label: "Title", value: r.title },
              {
                  label: "Period",
                  value: r.period_start || r.period_end ? `${r.period_start ?? "—"} → ${r.period_end ?? "—"}` : "All time",
                  full: true,
              },
              { label: "Created", value: new Date(r.created_at).toLocaleString() },
          ]
        : [];

    const summaryEntries = r?.summary ? Object.entries(r.summary) : [];

    return (
        <div>
            <AdminPageHeader
                title="Reports"
                subtitle="Generated compliance and CSR report exports. Click a report to preview its full summary."
                count={state === "ready" ? items.length : undefined}
            />

            {canGenerate && <GeneratePanel onGenerated={reload} />}

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search by title or type…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="reports"
                emptyHint="No reports yet. Generate one above."
                table={
                    <>
                        <TableShell hideCols={[1, 3, 6]}>
                            <TableHead columns={["Type", "Title", "Period", "Summary", "File", "Created"]} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((r) => (
                                    <tr
                                        key={r.id}
                                        onClick={() => drawer.openRow(r)}
                                        className="cursor-pointer hover:bg-slate-50"
                                    >
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={r.report_type} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                            <Dash>{r.title}</Dash>
                                            {/* Type is a badge column worth 99px on a phone; reprinted
                                                here so the report kind is still visible. */}
                                            <span className="mt-1 block md:hidden">
                                                <StatusBadge value={r.report_type} />
                                            </span>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            {r.period_start || r.period_end ? (
                                                <>
                                                    <Dash>{r.period_start}</Dash> → <Dash>{r.period_end}</Dash>
                                                </>
                                            ) : (
                                                "All time"
                                            )}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <SummaryCell summary={r.summary} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <a
                                                href={`/api/admin/reports/export?id=${r.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline"
                                            >
                                                Export CSV
                                            </a>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            {new Date(r.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableShell>
                        <Pagination page={table.page} pageCount={table.pageCount} onPage={table.setPage} />
                    </>
                }
            />

            <DetailDrawer
                open={drawer.open}
                onClose={drawer.close}
                title={r?.title ?? "Report"}
                subtitle={r?.report_type}
                sections={sections}
                actions={
                    r ? (
                        <a
                            href={`/api/admin/reports/export?id=${r.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
                        >
                            Export CSV
                        </a>
                    ) : null
                }
            >
                {r && (
                    <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Summary
                        </h3>
                        {summaryEntries.length === 0 ? (
                            <p className="text-sm text-slate-400">No summary data.</p>
                        ) : (
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                                {summaryEntries.map(([k, v]) => (
                                    <div key={k} className="contents">
                                        <dt className="capitalize text-slate-500">{k.replace(/_/g, " ")}</dt>
                                        <dd className="font-medium text-slate-800">{String(v)}</dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                    </section>
                )}
            </DetailDrawer>
        </div>
    );
}

function GeneratePanel({ onGenerated }: { onGenerated: () => Promise<void> }) {
    const [reportType, setReportType] = useState<ReportType>("compliance");
    const [periodStart, setPeriodStart] = useState("");
    const [periodEnd, setPeriodEnd] = useState("");
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function generate() {
        setGenerating(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    report_type: reportType,
                    period_start: periodStart || undefined,
                    period_end: periodEnd || undefined,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.error ?? `Generate failed (${res.status})`);
                return;
            }
            await onGenerated();
        } finally {
            setGenerating(false);
        }
    }

    const input =
        "rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 disabled:opacity-60";

    return (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-medium text-slate-700">Generate a report</p>
            <div className="flex flex-col flex-wrap items-stretch gap-3 sm:flex-row sm:items-end">
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                    Type
                    <select
                        value={reportType}
                        onChange={(e) => setReportType(e.target.value as ReportType)}
                        disabled={generating}
                        className={`${input} capitalize`}
                    >
                        {REPORT_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                    From (optional)
                    <input
                        type="date"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                        disabled={generating}
                        className={input}
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                    To (optional)
                    <input
                        type="date"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                        disabled={generating}
                        className={input}
                    />
                </label>
                <ActionButton tone="primary" disabled={generating} onClick={generate}>
                    {generating ? "Generating…" : "Generate"}
                </ActionButton>
            </div>
            {error && (
                <div className="mt-3">
                    <Notice tone="error" title="Couldn’t generate report">
                        {error}
                    </Notice>
                </div>
            )}
        </div>
    );
}

function SummaryCell({ summary }: { summary: Record<string, unknown> }) {
    const entries = Object.entries(summary ?? {});
    if (entries.length === 0) return <span className="text-slate-400">—</span>;
    return (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {entries.slice(0, 4).map(([k, v]) => (
                <span key={k} className="whitespace-nowrap">
                    <span className="text-slate-400">{k.replace(/_/g, " ")}:</span>{" "}
                    <span className="font-medium text-slate-700">{String(v)}</span>
                </span>
            ))}
            {entries.length > 4 && <span className="text-slate-400">+{entries.length - 4} more</span>}
        </div>
    );
}
