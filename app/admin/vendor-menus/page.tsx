"use client";

import { useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";

import {
    AdminPageHeader,
    Dash,
    DetailDrawer,
    FilterBar,
    ListStates,
    Pagination,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useClientTable,
    useDetailDrawer,
    type DetailSection,
} from "../_ui";

type MenuRow = {
    id: string;
    vendor_id: string;
    vendor_name: string;
    item_name: string;
    price: number | null;
    nutrition_category: string | null;
    is_special_care_equivalent: boolean;
    special_care_equivalent_approved: boolean;
    approval_status: string;
    created_at: string;
};

/** Admin vendor-menu approval queue — propose → approve/reject (incl. Special-Care equivalents). */
export default function AdminVendorMenusPage() {
    const canManage = useCan("vendor_menu_pricing", "update");
    const { items, state, errorMsg, reload } = useAdminList<MenuRow>(
        "/api/admin/vendor-menus",
        "menus",
        "/admin/vendor-menus"
    );

    // Special-care-only filter (these substitutions need extra scrutiny) is
    // orthogonal to the status tabs, so it filters the list up front.
    const [scOnly, setScOnly] = useState(false);
    const base = useMemo(
        () => (scOnly ? items.filter((m) => m.is_special_care_equivalent) : items),
        [items, scOnly]
    );

    const table = useClientTable(base, {
        searchKeys: ["vendor_name", "item_name", "nutrition_category"],
        tabKey: "approval_status",
        pageSize: 15,
    });

    const tabs = useMemo(
        () => [
            { label: "Pending", value: "pending", count: table.tabCounts.pending },
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Approved", value: "approved", count: table.tabCounts.approved },
            { label: "Rejected", value: "rejected", count: table.tabCounts.rejected },
        ],
        [table.tabCounts]
    );

    const drawer = useDetailDrawer<MenuRow>();
    const m = drawer.selected;
    const sections: DetailSection[] = m
        ? [
              { label: "Vendor", value: m.vendor_name },
              { label: "Item", value: m.item_name },
              { label: "Price", value: m.price != null ? `₹${m.price}` : null },
              { label: "Category", value: m.nutrition_category?.replace(/_/g, " ") },
              { label: "Status", value: m.approval_status },
              {
                  label: "Special-care equivalent",
                  value: m.is_special_care_equivalent
                      ? m.special_care_equivalent_approved
                          ? "Yes — equivalence approved"
                          : "Yes — equivalence pending review"
                      : "No",
                  full: true,
              },
          ]
        : [];

    const columns = ["Vendor", "Item", "Price", "Category", "Special-care", "Status"];
    if (canManage) columns.push("Decision");

    return (
        <div>
            <AdminPageHeader
                title="Vendor menus"
                subtitle="Approve vendor-proposed menu items. Approving a Special-Care-equivalent item records the equivalence approval."
                count={state === "ready" ? items.length : undefined}
            />

            {state === "ready" && items.length > 0 && (
                <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="w-full sm:flex-1">
                        <FilterBar
                            search={table.search}
                            onSearch={table.setSearch}
                            searchPlaceholder="Search by vendor, item, category…"
                            tabs={tabs}
                            activeTab={table.activeTab}
                            onTab={table.setActiveTab}
                        />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <input
                            type="checkbox"
                            checked={scOnly}
                            onChange={(e) => setScOnly(e.target.checked)}
                            className="rounded border-slate-300"
                        />
                        Special-care only
                    </label>
                </div>
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="menu items"
                emptyHint="Menu items proposed by vendors will appear here for review."
                table={
                    <>
                        <TableShell hideCols={[1, 4, 5]}>
                            <TableHead columns={columns} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((m) => (
                                    <tr
                                        key={m.id}
                                        onClick={() => drawer.openRow(m)}
                                        className="cursor-pointer hover:bg-slate-50"
                                    >
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                            <Dash>{m.vendor_name}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-800">
                                            <Dash>{m.item_name}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            {m.price != null ? `₹${m.price}` : "—"}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 capitalize text-slate-700">
                                            <Dash>{m.nutrition_category?.replace(/_/g, " ")}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-xs text-slate-500">
                                            {m.is_special_care_equivalent
                                                ? m.special_care_equivalent_approved
                                                    ? "equiv ✓ approved"
                                                    : "equiv (pending)"
                                                : "—"}
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={m.approval_status} />
                                        </td>
                                        {canManage && (
                                            <td className="px-2 md:px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                {m.approval_status === "pending" ? (
                                                    <DecisionButtons
                                                        id={m.id}
                                                        isSpecialCareEquivalent={m.is_special_care_equivalent}
                                                        onDone={reload}
                                                    />
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
                title={m?.item_name ?? "Menu item"}
                subtitle={m?.vendor_name}
                status={m?.approval_status}
                sections={sections}
            />
        </div>
    );
}

function DecisionButtons({
    id,
    isSpecialCareEquivalent,
    onDone,
}: {
    id: string;
    isSpecialCareEquivalent: boolean;
    onDone: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function decide(decision: "approve" | "reject") {
        setBusy(true);
        setErr(null);
        try {
            const body: { decision: "approve" | "reject"; special_care_equivalent?: boolean } = { decision };
            if (decision === "approve" && isSpecialCareEquivalent) {
                body.special_care_equivalent = true;
            }
            const res = await fetch(`/api/admin/vendor-menus/${id}/decide`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed.");
        } finally {
            // Always clear busy — even on success — so the buttons re-enable if the
            // row stays mounted (e.g. the "All" tab keeps decided rows visible).
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <button
                type="button"
                onClick={() => decide("approve")}
                disabled={busy}
                className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
            >
                Approve
            </button>
            <button
                type="button"
                onClick={() => decide("reject")}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
                Reject
            </button>
            {err && <span className="text-[10px] text-red-700">{err}</span>}
        </div>
    );
}
