"use client";

import { useCan } from "@/components/auth/AppUserProvider";

import { useMemo } from "react";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    FilterBar,
    ListStates,
    Pagination,
    StatusBadge,
    TableHead,
    TableShell,
    useAction,
    useAdminList,
    useClientTable,
} from "../_ui";

/**
 * Admin complaints queue (addon2 A3) — beneficiary complaints (vendor_feedback
 * flagged is_complaint) with a triage lifecycle: open → investigating →
 * resolved/dismissed. Gated by vendor_management (admin + vendor_manager).
 */

interface ComplaintRow {
    id: string;
    vendor_id: string;
    vendor_name: string;
    rating: number;
    comment: string | null;
    complaint_status: string | null;
    resolution: string | null;
    resolved_at: string | null;
    created_at: string;
}

export default function AdminComplaintsPage() {
    const canManage = useCan("vendor_management", "update");
    const { items, state, errorMsg, reload } = useAdminList<ComplaintRow>(
        "/api/admin/complaints",
        "complaints",
        "/admin/complaints"
    );

    /**
     * This is a work queue, so it only ever grows — and it shipped with neither
     * search nor paging, which meant the only way to find a complaint was to
     * scroll the whole list. `complaint_status` is nullable in the data (an
     * untriaged row has no status), so rows are normalised to "open" for both
     * the tab counts and the filter.
     */
    const rows = useMemo(
        () => items.map((c) => ({ ...c, complaint_status: c.complaint_status ?? "open" })),
        [items]
    );

    const table = useClientTable(rows, {
        searchKeys: ["vendor_name", "comment", "resolution"],
        tabKey: "complaint_status",
        pageSize: 15,
    });

    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Open", value: "open", count: table.tabCounts.open },
            { label: "Investigating", value: "investigating", count: table.tabCounts.investigating },
            { label: "Resolved", value: "resolved", count: table.tabCounts.resolved },
            { label: "Dismissed", value: "dismissed", count: table.tabCounts.dismissed },
        ],
        [table.tabCounts]
    );

    const triage = useAction({
        method: "PATCH",
        endpoint: () => "/api/admin/complaints",
        onDone: reload,
        successMessage: (d) => `Complaint marked ${d.complaint_status ?? "updated"}.`,
    });

    const columns = ["Date", "Vendor", "Rating", "Complaint", "Status", "Resolution"];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Complaints"
                subtitle="Beneficiary complaints about vendors. Triage each: start investigating, then resolve or dismiss with a note."
                count={state === "ready" ? items.length : undefined}
            />

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search by vendor, comment, resolution…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="complaints"
                emptyHint="Complaints raised by beneficiaries will appear here."
                table={
                    <>
                    <TableShell hideCols={[1, 3, 4, 6]}>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {table.rows.map((c) => {
                                const status = c.complaint_status ?? "open";
                                const busy = triage.busyId === c.id;
                                return (
                                    <tr key={c.id} className="hover:bg-slate-50 align-top">
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            {new Date(c.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-800">{c.vendor_name}</td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">{c.rating}★</td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600 max-w-xs">
                                            <Dash>{c.comment}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={status} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500 max-w-xs">
                                            <Dash>{c.resolution}</Dash>
                                        </td>
                                        {canManage && (
                                            <td className="px-2 md:px-4 py-3">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {status === "open" && (
                                                        <ActionButton
                                                            tone="neutral"
                                                            disabled={busy}
                                                            onClick={() =>
                                                                triage.run(c.id, {
                                                                    id: c.id,
                                                                    complaint_status: "investigating",
                                                                })
                                                            }
                                                        >
                                                            Investigate
                                                        </ActionButton>
                                                    )}
                                                    {status !== "resolved" && status !== "dismissed" && (
                                                        <>
                                                            <ActionButton
                                                                tone="primary"
                                                                disabled={busy}
                                                                onClick={() => {
                                                                    const note = window.prompt(
                                                                        "Resolution note (how was this complaint resolved?)"
                                                                    );
                                                                    if (!note) return;
                                                                    triage.run(c.id, {
                                                                        id: c.id,
                                                                        complaint_status: "resolved",
                                                                        resolution: note,
                                                                    });
                                                                }}
                                                            >
                                                                Resolve
                                                            </ActionButton>
                                                            <ActionButton
                                                                tone="warn"
                                                                disabled={busy}
                                                                onClick={() => {
                                                                    const note = window.prompt(
                                                                        "Reason for dismissing this complaint?"
                                                                    );
                                                                    if (!note) return;
                                                                    triage.run(c.id, {
                                                                        id: c.id,
                                                                        complaint_status: "dismissed",
                                                                        resolution: note,
                                                                    });
                                                                }}
                                                            >
                                                                Dismiss
                                                            </ActionButton>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </TableShell>
                    <Pagination page={table.page} pageCount={table.pageCount} onPage={table.setPage} />
                    </>
                }
            />
        </div>
    );
}
