"use client";

import { useMemo } from "react";

import { useCan } from "@/components/auth/AppUserProvider";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    FilterBar,
    ListStates,
    StatusBadge,
    TableHead,
    TableShell,
    useAction,
    useAdminList,
    useClientTable,
} from "../_ui";

/** One settlement-audit-queue row joined with its settlement header. */
interface AuditRow {
    id: string;
    settlement_id: string;
    reason: string | null;
    status: string;
    selected_at: string | null;
    reviewed_at: string | null;
    vendor_id: string | null;
    vendor_name: string | null;
    amount: number | null;
    settlement_status: string | null;
    on_hold: boolean;
}

/**
 * Admin settlement-audit page (addon #10) — the review queue for settlements
 * pulled randomly (settlement_random_audit_rate) or flagged by duplicate-proof
 * detection. Clearing releases any hold; flagging holds the payout until release.
 */
export default function SettlementAuditPage() {
    const canManage = useCan("vendor_settlement", "update");

    const { items, state, errorMsg, reload } = useAdminList<AuditRow>(
        "/api/admin/settlement-audit",
        "queue",
        "/admin/settlement-audit"
    );

    const review = useAction({
        method: "PATCH",
        endpoint: () => "/api/admin/settlement-audit",
        onDone: reload,
        successMessage: (d) => `Audit ${String(d.status ?? "updated")}.`,
    });

    const table = useClientTable(items, {
        searchKeys: ["vendor_name", "reason", "settlement_id"],
        tabKey: "status",
        pageSize: 15,
    });

    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Pending", value: "pending", count: table.tabCounts.pending },
            { label: "Cleared", value: "cleared", count: table.tabCounts.cleared },
            { label: "Flagged", value: "flagged", count: table.tabCounts.flagged },
        ],
        [table.tabCounts]
    );

    const columns = ["Vendor", "Amount", "Reason", "Settlement", "Audit status", "Selected"];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Settlement audit"
                subtitle="Settlements pulled for review — random samples and duplicate-proof flags. Clear to release; flag to hold the payout."
                count={state === "ready" ? items.length : undefined}
            />

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search vendor, reason, settlement…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="audit entries"
                emptyHint="Settlements flagged or randomly sampled for audit will appear here after a settlement run."
                table={
                    <TableShell hideCols={[3, 4, 6]}>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {table.rows.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50">
                                    <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                        <Dash>{r.vendor_name}</Dash>
                                    </td>
                                    <td className="px-2 md:px-4 py-3 text-slate-700">
                                        {r.amount != null ? `₹${r.amount.toLocaleString("en-IN")}` : "—"}
                                    </td>
                                    <td className="px-2 md:px-4 py-3 text-slate-600">
                                        <Dash>{r.reason ? r.reason.replace(/_/g, " ") : null}</Dash>
                                    </td>
                                    <td className="px-2 md:px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            {r.settlement_status && (
                                                <StatusBadge value={r.settlement_status} />
                                            )}
                                            {r.on_hold && <StatusBadge value="held" />}
                                        </div>
                                    </td>
                                    <td className="px-2 md:px-4 py-3">
                                        <StatusBadge value={r.status} />
                                    </td>
                                    <td className="px-2 md:px-4 py-3 text-slate-500">
                                        {r.selected_at
                                            ? new Date(r.selected_at).toLocaleDateString()
                                            : "—"}
                                    </td>
                                    {canManage && (
                                        <td className="px-2 md:px-4 py-3">
                                            {r.status === "pending" ? (
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <ActionButton
                                                        tone="primary"
                                                        disabled={review.busyId === r.id}
                                                        onClick={() =>
                                                            review.run(r.id, { id: r.id, action: "clear" })
                                                        }
                                                    >
                                                        Clear
                                                    </ActionButton>
                                                    <ActionButton
                                                        tone="danger"
                                                        disabled={review.busyId === r.id}
                                                        onClick={() =>
                                                            review.run(
                                                                r.id,
                                                                { id: r.id, action: "flag" },
                                                                "Flag this settlement? The payout will be held until you release it."
                                                            )
                                                        }
                                                    >
                                                        Flag
                                                    </ActionButton>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400">—</span>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}
