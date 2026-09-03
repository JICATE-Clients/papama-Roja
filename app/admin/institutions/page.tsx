"use client";

import { useEffect, useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type {
    InstitutionAllocationResponse,
    NgoPartnerResponse,
} from "@/lib/validation/schemas";

import {
    AdminPageHeader,
    Dash,
    FilterBar,
    ListStates,
    Notice,
    Pagination,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useClientTable,
} from "../_ui";

interface RedemptionReport {
    ngo_partner_id: string;
    period_start: string | null;
    period_end: string | null;
    meals_served: number;
    token_value_inr: number;
    beneficiaries: number;
}

/** Admin institutions page (addon #11) — bulk token allocation + redemption report. */
export default function AdminInstitutionsPage() {
    const canAllocate = useCan("audit_reports", "create");
    const { items, state, errorMsg, reload } = useAdminList<InstitutionAllocationResponse>(
        "/api/admin/institutions",
        "allocations",
        "/admin/institutions"
    );

    const [partners, setPartners] = useState<NgoPartnerResponse[]>([]);
    useEffect(() => {
        fetch("/api/admin/ngo-partners")
            .then((r) => (r.ok ? r.json() : { ngo_partners: [] }))
            .then((d) => setPartners((d.ngo_partners ?? []).filter((p: NgoPartnerResponse) => p.status === "active")))
            .catch(() => setPartners([]));
    }, []);

    const table = useClientTable(items, {
        searchKeys: ["institution_name", "notes"],
        tabKey: "status",
        pageSize: 15,
    });
    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Allocated", value: "allocated", count: table.tabCounts.allocated },
            { label: "Pending", value: "pending", count: table.tabCounts.pending },
            { label: "Cancelled", value: "cancelled", count: table.tabCounts.cancelled },
        ],
        [table.tabCounts]
    );

    const columns = ["Institution", "Tokens", "Status", "Notes", "Allocated"];

    return (
        <div>
            <AdminPageHeader
                title="Institutions"
                subtitle="Bulk-allocate pooled tokens toward partner institutions, then track meals served per institution."
                count={state === "ready" ? items.length : undefined}
            />

            {canAllocate && partners.length > 0 && (
                <AllocateForm partners={partners} onDone={reload} />
            )}
            {canAllocate && partners.length === 0 && (
                <div className="mb-5">
                    <Notice tone="info" title="No active institutions">
                        Register an active NGO partner first (Admin → NGO partners) to allocate tokens to it.
                    </Notice>
                </div>
            )}

            <RedemptionReportPanel partners={partners} />

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search by institution, notes…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="allocations"
                emptyHint="Allocate tokens to an institution above to start the ledger."
                table={
                    <>
                        <TableShell hideCols={[4, 5]}>
                            <TableHead columns={columns} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((a) => (
                                    <tr key={a.id} className="hover:bg-slate-50">
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                            <Dash>{a.institution_name}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-700">{a.token_count}</td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={a.status} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <Dash>{a.notes}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            {new Date(a.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableShell>
                        <Pagination page={table.page} pageCount={table.pageCount} onPage={table.setPage} />
                    </>
                }
            />
        </div>
    );
}

function AllocateForm({
    partners,
    onDone,
}: {
    partners: NgoPartnerResponse[];
    onDone: () => void;
}) {
    const [ngoId, setNgoId] = useState(partners[0]?.id ?? "");
    const [count, setCount] = useState("");
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function submit() {
        const n = Number(count);
        if (!ngoId) {
            setErr("Pick an institution.");
            return;
        }
        if (!Number.isInteger(n) || n <= 0) {
            setErr("Enter a positive whole number of tokens.");
            return;
        }
        setBusy(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch("/api/admin/institutions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ngo_partner_id: ngoId,
                    count: n,
                    notes: notes.trim() || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            setMsg(`Allocated ${data.granted_count} token(s).`);
            setCount("");
            setNotes("");
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Allocation failed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Allocate tokens to an institution</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs text-slate-600">
                    Institution
                    <select
                        value={ngoId}
                        onChange={(e) => setNgoId(e.target.value)}
                        disabled={busy}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    >
                        {partners.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs text-slate-600">
                    Token count
                    <input
                        type="number"
                        min={1}
                        value={count}
                        onChange={(e) => setCount(e.target.value)}
                        disabled={busy}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    />
                </label>
                <label className="text-xs text-slate-600">
                    Notes (optional)
                    <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        disabled={busy}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    />
                </label>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
                Draws the requested count of oldest pooled tokens and marks them distributed via the
                institution. Capped by the <code>institution_bulk_allocation_max</code> config when set.
            </p>
            <div className="mt-3 flex items-center gap-3">
                <button
                    type="button"
                    onClick={submit}
                    disabled={busy}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                    {busy ? "Allocating…" : "Allocate tokens"}
                </button>
                {msg && <span className="text-xs font-medium text-green-700">{msg}</span>}
                {err && <span className="text-xs font-medium text-red-700">{err}</span>}
            </div>
        </div>
    );
}

function RedemptionReportPanel({ partners }: { partners: NgoPartnerResponse[] }) {
    const [ngoId, setNgoId] = useState("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState<RedemptionReport | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function run() {
        if (!ngoId) {
            setErr("Pick an institution.");
            return;
        }
        setBusy(true);
        setErr(null);
        setReport(null);
        try {
            const qs = new URLSearchParams({ report: "redemption", ngo_partner_id: ngoId });
            if (start) qs.set("start", start);
            if (end) qs.set("end", end);
            const res = await fetch(`/api/admin/institutions?${qs.toString()}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            setReport(data.report as RedemptionReport);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Report failed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Per-institution redemption report</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs text-slate-600">
                    Institution
                    <select
                        value={ngoId}
                        onChange={(e) => setNgoId(e.target.value)}
                        disabled={busy}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    >
                        <option value="">Select…</option>
                        {partners.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs text-slate-600">
                    From
                    <input
                        type="date"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                        disabled={busy}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    />
                </label>
                <label className="text-xs text-slate-600">
                    To
                    <input
                        type="date"
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                        disabled={busy}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    />
                </label>
                <div className="flex items-end">
                    <button
                        type="button"
                        onClick={run}
                        disabled={busy}
                        className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                    >
                        {busy ? "Running…" : "Run report"}
                    </button>
                </div>
            </div>
            {err && <p className="mt-2 text-xs font-medium text-red-700">{err}</p>}
            {report && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                    <Stat label="Meals served" value={report.meals_served} />
                    <Stat label="Token value (₹)" value={report.token_value_inr} />
                    <Stat label="Beneficiaries" value={report.beneficiaries} />
                </div>
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="text-lg font-semibold text-slate-900">{value.toLocaleString()}</p>
        </div>
    );
}
