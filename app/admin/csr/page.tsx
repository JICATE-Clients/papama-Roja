"use client";

import { useCallback, useEffect, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type {
    ComplianceReportResponse,
    CorporateCsrProfileResponse,
} from "@/lib/validation/schemas";

import {
    AdminPageHeader,
    Dash,
    ListStates,
    Notice,
    TableHead,
    TableShell,
} from "../_ui";

type ListState = "loading" | "ready" | "forbidden" | "error";

interface CsrFeed {
    profiles: CorporateCsrProfileResponse[];
    reports: ComplianceReportResponse[];
    certificates_enabled: boolean;
}

/** Admin Corporate CSR page (addon #7) — generate + view aggregated CSR reports. */
export default function AdminCsrPage() {
    const canGenerate = useCan("audit_reports", "create");
    const [feed, setFeed] = useState<CsrFeed>({ profiles: [], reports: [], certificates_enabled: false });
    const [state, setState] = useState<ListState>("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const res = await fetch("/api/admin/csr", { cache: "no-store" });
        if (res.status === 403) {
            setState("forbidden");
            return;
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setErrorMsg(body.error ?? `Request failed (${res.status})`);
            setState("error");
            return;
        }
        const body = (await res.json()) as CsrFeed;
        setFeed({
            profiles: body.profiles ?? [],
            reports: body.reports ?? [],
            certificates_enabled: !!body.certificates_enabled,
        });
        setState("ready");
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    return (
        <div>
            <AdminPageHeader
                title="Corporate CSR"
                subtitle="Aggregate corporate-donor donations into CSR reports by company, campaign and financial year."
                count={state === "ready" ? feed.reports.length : undefined}
            />

            {canGenerate && <GenerateForm profiles={feed.profiles} onDone={reload} />}

            {/* 80G certificate affordance — gated OFF (blocked feature). */}
            <div className="mb-5">
                <Notice tone={feed.certificates_enabled ? "info" : "warn"} title="80G utilisation certificates">
                    {feed.certificates_enabled
                        ? "80G certificates are enabled, but generation is not implemented yet (provider pending)."
                        : "Disabled. 80G utilisation certificates need an 80G registration and an email/PDF provider before they can be issued."}
                </Notice>
            </div>

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={feed.reports.length === 0}
                resourceLabel="CSR reports"
                emptyHint="Generate a CSR report above."
                table={
                    <TableShell>
                        <TableHead columns={["Title", "Period", "Companies", "Total (₹)", "Tokens", "Generated"]} />
                        <tbody className="divide-y divide-slate-100">
                            {feed.reports.map((r) => {
                                const totals = (r.summary?.totals ?? {}) as Record<string, number>;
                                return (
                                    <tr key={r.id} className="hover:bg-slate-50">
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                            <Dash>{r.title}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            {r.period_start || r.period_end
                                                ? `${r.period_start ?? "…"} → ${r.period_end ?? "…"}`
                                                : "All time"}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-700">{totals.companies ?? 0}</td>
                                        <td className="px-2 md:px-4 py-3 text-slate-700">
                                            {(totals.total_inr ?? 0).toLocaleString()}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-700">{totals.tokens_funded ?? 0}</td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            {new Date(r.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}

function GenerateForm({
    profiles,
    onDone,
}: {
    profiles: CorporateCsrProfileResponse[];
    onDone: () => void;
}) {
    const [donorId, setDonorId] = useState("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function submit() {
        setBusy(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch("/api/admin/csr", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    donor_id: donorId || undefined,
                    period_start: start || undefined,
                    period_end: end || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            setMsg(`Report generated (₹${(data.summary?.totals?.total_inr ?? 0).toLocaleString()}).`);
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Generation failed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Generate a CSR report</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs text-slate-600">
                    Company (optional)
                    <select
                        value={donorId}
                        onChange={(e) => setDonorId(e.target.value)}
                        disabled={busy}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    >
                        <option value="">All corporate donors</option>
                        {profiles.map((p) => (
                            <option key={p.id} value={p.donor_id}>
                                {p.company_name}
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
                        onClick={submit}
                        disabled={busy}
                        className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                    >
                        {busy ? "Generating…" : "Generate report"}
                    </button>
                </div>
            </div>
            <div className="mt-2 flex gap-3">
                {msg && <span className="text-xs font-medium text-green-700">{msg}</span>}
                {err && <span className="text-xs font-medium text-red-700">{err}</span>}
                {profiles.length === 0 && (
                    <span className="text-xs text-slate-400">
                        No corporate donors registered yet — reports will be empty until a donor registers via Donor → Corporate CSR.
                    </span>
                )}
            </div>
        </div>
    );
}
