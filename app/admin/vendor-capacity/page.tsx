"use client";

import { useMemo } from "react";

import {
    AdminPageHeader,
    BoolBadge,
    Dash,
    FilterBar,
    ListStates,
    Pagination,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useClientTable,
} from "../_ui";

type CapacityRow = {
    vendor_id: string;
    name: string;
    status: string;
    is_open: boolean;
    stock_exhausted: boolean;
    temporary_closure_until: string | null;
    daily_meal_capacity: number | null;
    served_today: number;
    remaining_today: number | null;
};

/** Admin read-only view of vendor availability + today's capacity usage (addon #4). */
export default function AdminVendorCapacityPage() {
    const { items, state, errorMsg } = useAdminList<CapacityRow>(
        "/api/admin/vendor-capacity",
        "vendors",
        "/admin/vendor-capacity"
    );

    const table = useClientTable(items, {
        searchKeys: ["name", "status"],
        tabKey: "status",
        pageSize: 20,
    });

    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Approved", value: "approved", count: table.tabCounts.approved },
            { label: "Suspended", value: "suspended", count: table.tabCounts.suspended },
            { label: "Pending", value: "pending", count: table.tabCounts.pending },
        ],
        [table.tabCounts]
    );

    function availabilityLabel(r: CapacityRow): string {
        if (!r.is_open) return "closed";
        if (r.stock_exhausted) return "out of stock";
        if (r.temporary_closure_until && new Date(r.temporary_closure_until).getTime() > Date.now())
            return "temp closed";
        if (r.daily_meal_capacity != null && r.served_today >= r.daily_meal_capacity)
            return "at capacity";
        return "open";
    }

    return (
        <div>
            <AdminPageHeader
                title="Vendor capacity"
                subtitle="Each outlet's live availability and today's served count. Vendors set these from their own portal; redemptions throttle when capacity limits are enabled."
                count={state === "ready" ? items.length : undefined}
            />

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search vendors…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="vendors"
                emptyHint="Approved vendors will appear here with their availability and daily usage."
                table={
                    <>
                        <TableShell hideCols={[3, 4, 5, 6]}>
                            <TableHead
                                columns={[
                                    "Vendor",
                                    "Status",
                                    "Availability",
                                    "Open",
                                    "Capacity",
                                    "Served today",
                                    "Remaining",
                                ]}
                            />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((r) => (
                                    <tr key={r.vendor_id} className="hover:bg-slate-50">
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                            <Dash>{r.name}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={r.status} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={availabilityLabel(r)} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <BoolBadge value={r.is_open} yes="Open" no="Closed" />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-700">
                                            {r.daily_meal_capacity != null ? r.daily_meal_capacity : "—"}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-700">{r.served_today}</td>
                                        <td className="px-2 md:px-4 py-3 text-slate-700">
                                            {r.remaining_today != null ? r.remaining_today : "—"}
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
