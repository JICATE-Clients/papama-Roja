"use client";

import { useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import { shortDateTime } from "@/lib/format";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    ListStates,
    Notice,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
} from "../_ui";

/**
 * Settlement audit selections (F-3 / B-25, CD §D-5).
 *
 * CD §D-5: "10% random audit is the baseline, not the ceiling."
 *
 * THIS PAGE IS EVIDENCE, NOT A WORKLIST. The queue of settlements to review
 * lives elsewhere; what this shows is HOW each cycle's sample was drawn —
 * population, sample size, the rate in force, and when. A sample you can
 * quietly re-draw after seeing the results is not a sample, so these rows are
 * append-only in the database and there is deliberately no delete here.
 *
 * The minimum of one per cycle is applied AFTER the rate. 10% of three
 * settlements rounds to zero, and a pilot auditing nothing while appearing to
 * have an audit policy is exactly what that minimum exists to prevent.
 */

interface SelectionRow {
    id: string;
    cycle_ref: string;
    cycle_start: string | null;
    cycle_end: string | null;
    population_count: number;
    sample_count: number;
    rate_applied: number | string | null;
    selection_method: string;
    targeted_reason: string | null;
    selected_at: string;
    result: string | null;
    completed_at: string | null;
}

export default function AdminAuditSelectionsPage() {
    const canDraw = useCan("audit_reports", "create");
    const [cycle, setCycle] = useState("");
    const [drawing, setDrawing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { items, state, errorMsg, reload } = useAdminList<SelectionRow>(
        "/api/admin/audit-selections",
        "selections",
        "/admin/audit-selections"
    );

    async function draw() {
        if (!cycle.trim()) return;
        setDrawing(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/audit-selections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cycle_ref: cycle.trim(), method: "random" }),
            });
            if (!res.ok) {
                const b = await res.json().catch(() => ({}));
                setError(b.error ?? `Failed (${res.status})`);
                return;
            }
            setCycle("");
            await reload();
        } finally {
            setDrawing(false);
        }
    }

    return (
        <div className="mx-auto max-w-6xl">
            <AdminPageHeader
                title="Audit selections"
                subtitle="How each cycle's audit sample was drawn — population, size, rate and timestamp."
                count={items.length}
            />

            <div className="mb-6">
                <Notice tone="info" title="10% is the baseline, not the ceiling">
                    Random sampling runs alongside risk-based and exception-based audits. A minimum
                    of one settlement per cycle always applies — so a small cycle is never audited
                    at zero.
                </Notice>
            </div>

            {error && (
                <div className="mb-5">
                    <Notice tone="error" title="Couldn’t draw a sample">
                        {error}
                    </Notice>
                </div>
            )}

            {canDraw && (
                <div className="mb-8 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-5 ring-1 ring-slate-900/[0.06]">
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Cycle</span>
                        <input
                            value={cycle}
                            onChange={(e) => setCycle(e.target.value)}
                            placeholder="2026-09-CYCLE-1"
                            className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600"
                        />
                    </label>
                    <ActionButton
                        tone="primary"
                        disabled={drawing || !cycle.trim()}
                        onClick={() => void draw()}
                    >
                        {drawing ? "Drawing…" : "Draw sample"}
                    </ActionButton>
                    <span className="text-xs text-slate-500">
                        Recorded permanently. A selection cannot be edited or deleted.
                    </span>
                </div>
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="audit selections"
                emptyHint="No sample drawn yet. Draw one to start an audit cycle."
                table={
                    <TableShell hideCols={[3, 5]}>
                        <TableHead
                            columns={["Cycle", "Sample", "Rate", "Method", "Drawn", "Result"]}
                        />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((s) => (
                                <tr key={s.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-800">
                                        {s.cycle_ref}
                                        <span className="mt-1 block text-[11px] text-slate-500 md:hidden">
                                            {shortDateTime(s.selected_at)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                        {/* Sample AND population — the sample alone
                                            proves nothing without what it was drawn
                                            from. */}
                                        <span className="font-medium">{s.sample_count}</span>
                                        <span className="text-slate-400">
                                            {" "}
                                            of {s.population_count}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        {s.rate_applied == null ? (
                                            <span className="text-slate-400">not set</span>
                                        ) : (
                                            `${Math.round(Number(s.rate_applied) * 100)}%`
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={s.selection_method} />
                                        {s.targeted_reason && (
                                            <span className="mt-1 block text-xs text-slate-500">
                                                {s.targeted_reason}
                                            </span>
                                        )}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                                        {shortDateTime(s.selected_at)}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{s.result}</Dash>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}
