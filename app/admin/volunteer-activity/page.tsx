"use client";

import { useMemo, useState } from "react";

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

/** A volunteer row with zone + rolled-up field-activity counts. */
interface ActivityRow {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    assigned_area: string | null;
    approved_at: string | null;
    created_at: string;
    tokens_distributed: number;
    registrations_assisted: number;
    activity_total: number;
    active_days: number;
    last_active_at: string | null;
}

/**
 * Admin volunteer-activity page (addon #13) — assign each volunteer a geographic
 * zone and review their field activity (tokens distributed, registrations
 * assisted). Zone enforcement is gated by system_config volunteer_zones_enabled;
 * assignment is always available so zones can be set up ahead of enabling.
 */
export default function VolunteerActivityPage() {
    const canManage = useCan("token_distribution", "update");

    const { items, state, errorMsg, reload } = useAdminList<ActivityRow>(
        "/api/admin/volunteer-activity",
        "volunteers",
        "/admin/volunteer-activity"
    );

    const assign = useAction({
        method: "PATCH",
        endpoint: () => "/api/admin/volunteer-activity",
        onDone: reload,
        successMessage: () => "Zone updated.",
    });

    const table = useClientTable(items, {
        searchKeys: ["full_name", "email", "assigned_area"],
        tabKey: "status",
        pageSize: 15,
    });

    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Active", value: "active", count: table.tabCounts.active },
            { label: "Pending", value: "pending", count: table.tabCounts.pending },
            { label: "Suspended", value: "suspended", count: table.tabCounts.suspended },
        ],
        [table.tabCounts]
    );

    const columns = [
        "Volunteer",
        "Zone",
        "Tokens distributed",
        "Registrations assisted",
        "Active days",
        "Last active",
        "Status",
    ];
    if (canManage) columns.push("Assign zone");

    return (
        <div>
            <AdminPageHeader
                title="Volunteer activity"
                subtitle="Assign volunteer zones and review field activity. Zone enforcement is gated by the volunteer_zones_enabled config flag."
                count={state === "ready" ? items.length : undefined}
            />

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search name, email, zone…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="volunteers"
                emptyHint="Volunteers will appear here once they are registered."
                table={
                    <TableShell hideCols={[2, 3, 4, 5, 6]}>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {table.rows.map((v) => (
                                <tr key={v.id} className="hover:bg-slate-50">
                                    <td className="px-2 md:px-4 py-3">
                                        <div className="font-medium text-slate-900">
                                            <Dash>{v.full_name}</Dash>
                                        </div>
                                        {/* The email is the widest thing in the row (165px of a 342px
                                            card) and only the name is needed to tell volunteers apart
                                            here; the address is on /admin/volunteers. */}
                                        <div className="hidden text-xs text-slate-500 md:block">
                                            <Dash>{v.email}</Dash>
                                        </div>
                                    </td>
                                    <td className="px-2 md:px-4 py-3 text-slate-700">
                                        <Dash>{v.assigned_area}</Dash>
                                    </td>
                                    <td className="px-2 md:px-4 py-3 text-slate-700">{v.tokens_distributed}</td>
                                    <td className="px-2 md:px-4 py-3 text-slate-700">
                                        {v.registrations_assisted}
                                    </td>
                                    <td className="px-2 md:px-4 py-3 text-slate-700">{v.active_days}</td>
                                    <td className="px-2 md:px-4 py-3 text-slate-500 text-xs">
                                        {v.last_active_at
                                            ? new Date(v.last_active_at).toLocaleDateString()
                                            : "—"}
                                    </td>
                                    <td className="px-2 md:px-4 py-3">
                                        <StatusBadge value={v.status} />
                                    </td>
                                    {canManage && (
                                        <td className="px-2 md:px-4 py-3">
                                            <ZoneAssign
                                                current={v.assigned_area}
                                                busy={assign.busyId === v.id}
                                                onSave={(area) =>
                                                    assign.run(v.id, {
                                                        volunteer_id: v.id,
                                                        assigned_area: area,
                                                    })
                                                }
                                            />
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

/** Inline zone editor: text input pre-filled with the current zone + Save. */
function ZoneAssign({
    current,
    busy,
    onSave,
}: {
    current: string | null;
    busy: boolean;
    onSave: (area: string | null) => void;
}) {
    const [value, setValue] = useState(current ?? "");
    const dirty = (value.trim() || null) !== (current ?? null);

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="zone / area"
                className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 md:w-32"
            />
            <ActionButton
                tone="primary"
                disabled={busy || !dirty}
                onClick={() => onSave(value.trim() === "" ? null : value.trim())}
            >
                {busy ? "Saving…" : "Save"}
            </ActionButton>
        </div>
    );
}
