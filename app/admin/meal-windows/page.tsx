"use client";

import { useEffect, useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import { MEAL_TYPES, type MealType } from "@/lib/types/enums";
import type { MealWindowResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    BoolBadge,
    FilterBar,
    ListStates,
    Notice,
    SectionHeading,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useClientTable,
    useToast,
} from "../_ui";

/**
 * Admin meal-windows page (addon #1) — configure the per-slot serving windows the
 * redemption engine enforces when `meal_window_enforcement_enabled` is on. Two
 * levels: GLOBAL windows (no vendor) and per-vendor OVERRIDES. Admins can create,
 * toggle active, edit times, and delete. The seeded global windows ship inactive,
 * and the enforcement flag ships off — so nothing restricts redemption until an
 * admin opts in here AND flips the flag in System config.
 */
export default function AdminMealWindowsPage() {
    return <MealWindowsInner />;
}

type VendorOption = { vendor_id: string; name: string };

function MealWindowsInner() {
    const canManage = useCan("audit_reports", "update");
    const { items, state, errorMsg, reload } = useAdminList<MealWindowResponse>(
        "/api/admin/meal-windows",
        "windows",
        "/admin/meal-windows"
    );

    // Vendor list powers the per-vendor override picker in the create form.
    const [vendors, setVendors] = useState<VendorOption[]>([]);
    useEffect(() => {
        if (!canManage) return;
        let active = true;
        void (async () => {
            const res = await fetch("/api/admin/vendors", { cache: "no-store" });
            if (!res.ok) return;
            const body = (await res.json()) as { vendors?: VendorOption[] };
            if (active) setVendors(body.vendors ?? []);
        })();
        return () => {
            active = false;
        };
    }, [canManage]);

    // Tag each row with a scope label so the tab filter can split global/vendor.
    const tagged = useMemo(
        () => items.map((w) => ({ ...w, scope: w.vendor_id ? "vendor" : "global" })),
        [items]
    );
    const table = useClientTable(tagged, {
        searchKeys: ["meal_type", "vendor_name"],
        tabKey: "scope",
    });

    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Global", value: "global", count: table.tabCounts.global },
            { label: "Per-vendor", value: "vendor", count: table.tabCounts.vendor },
        ],
        [table.tabCounts]
    );

    const columns = ["Meal", "Scope", "Window", "Status"];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Meal windows"
                subtitle="Per-slot serving hours enforced at redemption. Global defaults plus per-vendor overrides."
                count={state === "ready" ? items.length : undefined}
            />

            <Notice tone="info" title="How enforcement works">
                Windows only restrict redemption when <strong>meal_window_enforcement_enabled</strong>{" "}
                is on (System config) <em>and</em> the window is active. A vendor-specific window
                overrides the global window for that vendor. Overnight windows are out of scope —
                start must be before end.
            </Notice>

            {canManage && (
                <div className="mt-5">
                    <CreateWindowForm vendors={vendors} onCreated={reload} />
                </div>
            )}

            <div className="mt-6">
                {state === "ready" && items.length > 0 && (
                    <FilterBar
                        search={table.search}
                        onSearch={table.setSearch}
                        searchPlaceholder="Search meal or vendor…"
                        tabs={tabs}
                        activeTab={table.activeTab}
                        onTab={table.setActiveTab}
                    />
                )}

                <ListStates
                    state={state}
                    errorMsg={errorMsg}
                    isEmpty={items.length === 0}
                    resourceLabel="meal windows"
                    emptyHint="No serving windows configured yet. Create one above to get started."
                    table={
                        <TableShell hideCols={[2, 4]}>
                            <TableHead columns={columns} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((w) => (
                                    <WindowRow
                                        key={w.id}
                                        row={w}
                                        canManage={canManage}
                                        reload={reload}
                                    />
                                ))}
                            </tbody>
                        </TableShell>
                    }
                />
            </div>
        </div>
    );
}

/** Strip Postgres 'HH:MM:SS' down to 'HH:MM' for display + edit inputs. */
function hhmm(t: string): string {
    return t.slice(0, 5);
}

function CreateWindowForm({
    vendors,
    onCreated,
}: {
    vendors: VendorOption[];
    onCreated: () => Promise<void>;
}) {
    const toast = useToast();
    const [mealType, setMealType] = useState<MealType>("breakfast");
    const [vendorId, setVendorId] = useState<string>(""); // "" = global
    const [start, setStart] = useState("06:00");
    const [end, setEnd] = useState("10:00");
    const [active, setActive] = useState(false);
    const [saving, setSaving] = useState(false);

    async function create() {
        if (start >= end) {
            toast.error("Start time must be before end time.");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch("/api/admin/meal-windows", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    meal_type: mealType,
                    vendor_id: vendorId || null,
                    start_time: start,
                    end_time: end,
                    is_active: active,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                toast.error(body.error ?? `Create failed (${res.status})`);
                return;
            }
            toast.success("Meal window created.");
            await onCreated();
        } catch {
            toast.error("Network error — please try again.");
        } finally {
            setSaving(false);
        }
    }

    const field = "rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 disabled:opacity-60";

    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <SectionHeading title="Add a window" subtitle="Leave the vendor as “Global” for a default that applies to every vendor." />
            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                    Meal
                    <select
                        value={mealType}
                        onChange={(e) => setMealType(e.target.value as MealType)}
                        disabled={saving}
                        className={field}
                    >
                        {MEAL_TYPES.map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                    Scope
                    <select
                        value={vendorId}
                        onChange={(e) => setVendorId(e.target.value)}
                        disabled={saving}
                        className={`${field} max-w-[14rem]`}
                    >
                        <option value="">Global (default)</option>
                        {vendors.map((v) => (
                            <option key={v.vendor_id} value={v.vendor_id}>
                                {v.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                    Start
                    <input
                        type="time"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                        disabled={saving}
                        className={field}
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                    End
                    <input
                        type="time"
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                        disabled={saving}
                        className={field}
                    />
                </label>
                <label className="flex items-center gap-2 pb-1.5 text-sm text-slate-700">
                    <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => setActive(e.target.checked)}
                        disabled={saving}
                        className="h-4 w-4 rounded border-slate-300"
                    />
                    Active
                </label>
                <button
                    type="button"
                    onClick={create}
                    disabled={saving}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 active:scale-[.98] disabled:opacity-60"
                >
                    {saving ? "Adding…" : "Add window"}
                </button>
            </div>
        </div>
    );
}

function WindowRow({
    row,
    canManage,
    reload,
}: {
    row: MealWindowResponse;
    canManage: boolean;
    reload: () => Promise<void>;
}) {
    const toast = useToast();
    const [editing, setEditing] = useState(false);
    const [start, setStart] = useState(hhmm(row.start_time));
    const [end, setEnd] = useState(hhmm(row.end_time));
    const [busy, setBusy] = useState(false);

    async function patch(payload: Record<string, unknown>, okMsg: string) {
        setBusy(true);
        try {
            const res = await fetch(`/api/admin/meal-windows/${row.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                toast.error(body.error ?? `Update failed (${res.status})`);
                return false;
            }
            toast.success(okMsg);
            await reload();
            return true;
        } catch {
            toast.error("Network error — please try again.");
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function saveTimes() {
        if (start >= end) {
            toast.error("Start time must be before end time.");
            return;
        }
        const ok = await patch({ start_time: start, end_time: end }, "Window updated.");
        if (ok) setEditing(false);
    }

    async function remove() {
        if (!window.confirm("Delete this meal window?")) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/admin/meal-windows/${row.id}`, { method: "DELETE" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                toast.error(body.error ?? `Delete failed (${res.status})`);
                return;
            }
            toast.success("Window deleted.");
            await reload();
        } catch {
            toast.error("Network error — please try again.");
        } finally {
            setBusy(false);
        }
    }

    const field = "w-24 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 disabled:opacity-60";

    return (
        <tr className="hover:bg-slate-50">
            <td className="px-2 md:px-4 py-3 font-medium capitalize text-slate-900">
                {row.meal_type}
                {/* Status is an 80px badge column; the window times and the
                    edit controls are what this page is for, so the badge moves
                    under the meal name below md. */}
                <span className="mt-1 block font-normal normal-case md:hidden">
                    {row.is_active ? (
                        <StatusBadge value="active" />
                    ) : (
                        <BoolBadge value={false} yes="Active" no="Inactive" />
                    )}
                </span>
            </td>
            <td className="px-2 md:px-4 py-3 text-slate-700">
                {row.vendor_id ? (
                    <span>
                        {row.vendor_name ?? "Vendor"}{" "}
                        <span className="text-xs text-slate-400">(override)</span>
                    </span>
                ) : (
                    <span className="text-slate-500">Global</span>
                )}
            </td>
            <td className="px-2 md:px-4 py-3 text-slate-700">
                {editing ? (
                    <span className="flex items-center gap-1.5">
                        <input
                            type="time"
                            value={start}
                            onChange={(e) => setStart(e.target.value)}
                            disabled={busy}
                            className={field}
                        />
                        <span className="text-slate-400">–</span>
                        <input
                            type="time"
                            value={end}
                            onChange={(e) => setEnd(e.target.value)}
                            disabled={busy}
                            className={field}
                        />
                    </span>
                ) : (
                    <span className="font-mono text-sm">
                        {hhmm(row.start_time)}–{hhmm(row.end_time)}
                    </span>
                )}
            </td>
            <td className="px-2 md:px-4 py-3">
                {row.is_active ? (
                    <StatusBadge value="active" />
                ) : (
                    <BoolBadge value={false} yes="Active" no="Inactive" />
                )}
            </td>
            {canManage && (
                <td className="px-2 md:px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                        {editing ? (
                            <>
                                <ActionButton tone="primary" disabled={busy} onClick={saveTimes}>
                                    Save
                                </ActionButton>
                                <ActionButton
                                    tone="neutral"
                                    disabled={busy}
                                    onClick={() => {
                                        setStart(hhmm(row.start_time));
                                        setEnd(hhmm(row.end_time));
                                        setEditing(false);
                                    }}
                                >
                                    Cancel
                                </ActionButton>
                            </>
                        ) : (
                            <>
                                <ActionButton
                                    tone={row.is_active ? "warn" : "primary"}
                                    disabled={busy}
                                    onClick={() =>
                                        patch(
                                            { is_active: !row.is_active },
                                            row.is_active ? "Window disabled." : "Window enabled."
                                        )
                                    }
                                >
                                    {row.is_active ? "Disable" : "Enable"}
                                </ActionButton>
                                <ActionButton tone="neutral" disabled={busy} onClick={() => setEditing(true)}>
                                    Edit
                                </ActionButton>
                                <ActionButton tone="danger" disabled={busy} onClick={remove}>
                                    Delete
                                </ActionButton>
                            </>
                        )}
                    </div>
                </td>
            )}
        </tr>
    );
}
