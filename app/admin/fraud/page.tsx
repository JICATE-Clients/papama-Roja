"use client";

import { useEffect, useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type { FraudFlagDetailResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    BoolBadge,
    Dash,
    DetailDrawer,
    FilterBar,
    ListStates,
    Pagination,
    RunJobBar,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useClientTable,
    useDetailDrawer,
    useRowAction,
    type DetailSection,
} from "../_ui";

type FraudRow = FraudFlagDetailResponse & {
    resolved_by?: string | null;
    resolution_notes?: string | null;
    resolved_at?: string | null;
};

const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : null);

/** Admin fraud page — flags with severity, detection method, block state + resolution (contract §9). */
export default function AdminFraudPage() {
    const canManage = useCan("fraud_monitoring", "update");
    const canScan = useCan("fraud_monitoring", "create");
    const { items, state, errorMsg, reload } = useAdminList<FraudRow>(
        "/api/admin/fraud",
        "fraud_flags",
        "/admin/fraud"
    );
    const { run, busyId, actionError } = useRowAction("/api/admin/fraud", reload);

    const table = useClientTable(items, {
        searchKeys: ["flag_type", "severity", "detection_method", "entity_label"],
        tabKey: "status",
        pageSize: 15,
    });

    // Dashboard deep-link: /admin/fraud?status=open lands on the Open tab.
    useEffect(() => {
        const st = new URLSearchParams(window.location.search).get("status");
        if (st) table.setActiveTab(st);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Open", value: "open", count: table.tabCounts.open },
            { label: "Resolved", value: "resolved", count: table.tabCounts.resolved },
            { label: "Dismissed", value: "dismissed", count: table.tabCounts.dismissed },
        ],
        [table.tabCounts]
    );

    const [pendingAction, setPendingAction] = useState<
        Record<string, { action: "resolve" | "dismiss" | "unblock"; notes: string } | undefined>
    >({});
    const openNotes = (id: string, action: "resolve" | "dismiss" | "unblock") =>
        setPendingAction((p) => ({ ...p, [id]: { action, notes: "" } }));
    const cancelNotes = (id: string) =>
        setPendingAction((p) => {
            const n = { ...p };
            delete n[id];
            return n;
        });
    function submitNotes(id: string) {
        const pending = pendingAction[id];
        if (!pending) return;
        cancelNotes(id);
        run(id, { flag_id: id, action: pending.action, notes: pending.notes.trim() || undefined });
    }

    const drawer = useDetailDrawer<FraudRow>();
    const f = drawer.selected;
    const sections: DetailSection[] = f
        ? [
              { label: "Type", value: f.flag_type.replace(/_/g, " ") },
              { label: "Severity", value: f.severity },
              { label: "Status", value: f.status },
              { label: "Detection", value: f.detection_method?.replace(/_/g, " ") },
              { label: "Blocked", value: f.blocked ? "Yes" : "No" },
              { label: "Created", value: date(f.created_at) },
              { label: "Entity", value: f.entity_label ? `${f.entity_label} (${f.entity.kind})` : f.entity.kind },
              { label: "Entity id", value: f.entity.id, mono: true, full: true },
              ...(f.resolved_at ? [{ label: "Resolved at", value: date(f.resolved_at) }] : []),
              ...(f.resolved_by ? [{ label: "Resolved by", value: f.resolved_by, mono: true }] : []),
              ...(f.resolution_notes
                  ? [{ label: "Resolution notes", value: f.resolution_notes, full: true }]
                  : []),
          ]
        : [];

    const columns = ["Type", "Severity", "Status", "Detection", "Entity", "Blocked", "Created"];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Fraud"
                subtitle="Flagged tokens, beneficiaries and vendors. Click a flag for its detail & resolution trail; run a sweep for vendor volume anomalies."
                count={state === "ready" ? items.length : undefined}
            />

            {canScan && (
                <RunJobBar
                    label="Vendor anomaly sweep:"
                    endpoint="/api/admin/fraud/scan"
                    buttonText="Run fraud scan"
                    busyText="Scanning…"
                    successMessage={(d) =>
                        Number(d.flags_created) > 0
                            ? `Sweep raised ${d.flags_created} new vendor-anomaly flag(s).`
                            : "No vendor volume anomalies detected."
                    }
                    onDone={reload}
                />
            )}

            {actionError && (
                <div className="mb-4">
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
                </div>
            )}

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search by type, severity, detection…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="fraud flags"
                emptyHint="Fraud flags will appear here as detections are raised."
                table={
                    <>
                        <TableShell hideCols={[4, 5, 6, 7]}>
                            <TableHead columns={columns} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((f) => (
                                    <tr
                                        key={f.id}
                                        onClick={() => drawer.openRow(f)}
                                        className="cursor-pointer hover:bg-slate-50"
                                    >
                                        <td className="px-2 md:px-4 py-3 font-medium capitalize text-slate-900">
                                            {f.flag_type.replace(/_/g, " ")}
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={f.severity} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={f.status} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 capitalize text-slate-600">
                                            <Dash>{f.detection_method?.replace(/_/g, " ")}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            {/* Name first, kind underneath. The full uuid was the
                                                whole cell before, which told a triager nothing they
                                                could act on without a second lookup. */}
                                            <div className="font-medium text-slate-800">
                                                {f.entity_label ?? (
                                                    <span className="font-mono text-xs text-slate-400">
                                                        {f.entity.id.slice(0, 8)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs capitalize text-slate-400">{f.entity.kind}</div>
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <BoolBadge value={f.blocked} danger yes="Blocked" no="No" />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            {new Date(f.created_at).toLocaleDateString()}
                                        </td>
                                        {canManage && (
                                            <td className="px-2 md:px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                {pendingAction[f.id] ? (
                                                    <div className="space-y-1.5">
                                                        <input
                                                            type="text"
                                                            autoFocus
                                                            aria-label="Resolution notes"
                                                            value={pendingAction[f.id]!.notes}
                                                            onChange={(e) =>
                                                                setPendingAction((prev) => ({
                                                                    ...prev,
                                                                    [f.id]: { ...prev[f.id]!, notes: e.target.value },
                                                                }))
                                                            }
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") submitNotes(f.id);
                                                                if (e.key === "Escape") cancelNotes(f.id);
                                                            }}
                                                            className="block w-full min-w-[150px] rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700"
                                                            placeholder="Optional notes…"
                                                        />
                                                        <div className="flex gap-1.5">
                                                            <ActionButton
                                                                tone="primary"
                                                                disabled={busyId === f.id}
                                                                onClick={() => submitNotes(f.id)}
                                                            >
                                                                Confirm
                                                            </ActionButton>
                                                            <ActionButton
                                                                tone="neutral"
                                                                disabled={busyId === f.id}
                                                                onClick={() => cancelNotes(f.id)}
                                                            >
                                                                Cancel
                                                            </ActionButton>
                                                        </div>
                                                    </div>
                                                ) : f.status === "open" ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        <ActionButton
                                                            tone="primary"
                                                            disabled={busyId === f.id}
                                                            onClick={() => openNotes(f.id, "resolve")}
                                                        >
                                                            Resolve
                                                        </ActionButton>
                                                        <ActionButton
                                                            tone="neutral"
                                                            disabled={busyId === f.id}
                                                            onClick={() => openNotes(f.id, "dismiss")}
                                                        >
                                                            Dismiss
                                                        </ActionButton>
                                                        {f.blocked && (
                                                            <ActionButton
                                                                tone="neutral"
                                                                disabled={busyId === f.id}
                                                                onClick={() => openNotes(f.id, "unblock")}
                                                            >
                                                                Unblock
                                                            </ActionButton>
                                                        )}
                                                    </div>
                                                ) : f.blocked ? (
                                                    <ActionButton
                                                        tone="neutral"
                                                        disabled={busyId === f.id}
                                                        onClick={() => openNotes(f.id, "unblock")}
                                                    >
                                                        Unblock
                                                    </ActionButton>
                                                ) : (
                                                    <span className="text-xs text-slate-400">—</span>
                                                )}
                                            </td>
                                        )}
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
                title={f ? `${f.flag_type.replace(/_/g, " ")} flag` : "Fraud flag"}
                subtitle={f ? `${f.entity.kind} · ${f.severity}` : undefined}
                status={f?.status}
                sections={sections}
            />
        </div>
    );
}
