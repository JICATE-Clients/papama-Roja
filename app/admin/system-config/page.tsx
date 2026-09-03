"use client";

import { Fragment, useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type { SystemConfigRow } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    FilterBar,
    ListStates,
    TableHead,
    TableShell,
    useAdminList,
    useClientTable,
    useToast,
} from "../_ui";

/**
 * Admin system-config page — admin-tunable rules read at runtime (contract §1).
 * Admins can edit a row's value inline; the server coerces it to the row's
 * `value_type`. A null `value` is intentional ("unset", e.g.
 * max_tokens_per_volunteer pending the mentor's number) and can be set via
 * "Unset" — never a guessed default.
 *
 * Adopts the shared spine: FilterBar search + category tabs, save/unset errors
 * routed through toasts (the <ToastHost> is mounted once in app/admin/layout.tsx).
 */
export default function AdminSystemConfigPage() {
    return <SystemConfigInner />;
}

/** A config row tagged with a derived display category (drives the tab filter). */
type TaggedConfigRow = SystemConfigRow & { category: string };

/**
 * A config key rendered with a wrap opportunity after every underscore.
 *
 * snake_case has no natural break point, so `beneficiary_registration_auto_approve`
 * is one unbreakable word to the browser and holds the Key column at 282px inside
 * a 342px card on a phone. `<wbr>` lets it wrap at the underscores instead — and
 * unlike a zero-width space it contributes no character, so copying the key still
 * yields exactly what is in the database.
 */
function ConfigKeyName({ value }: { value: string }) {
    const parts = value.split("_");
    return (
        <>
            {parts.map((part, i) => (
                <Fragment key={i}>
                    {i > 0 && (
                        <>
                            _<wbr />
                        </>
                    )}
                    {part}
                </Fragment>
            ))}
        </>
    );
}

/** Group a config key into a human category for the tab bar. */
function categoryOf(key: string): string {
    if (key.startsWith("token") || key.includes("expiry") || key.includes("standard")) return "token";
    if (key.includes("special_care") || key.includes("patient") || key.includes("eligibility"))
        return "eligibility";
    if (
        key.includes("meal") ||
        key.includes("cooldown") ||
        key.includes("radius") ||
        key.includes("city") ||
        key.includes("co_contribution") ||
        key.includes("redemption")
    )
        return "redemption";
    if (key.includes("vendor") || key.includes("courier") || key.includes("settlement")) return "vendor";
    return "other";
}

function SystemConfigInner() {
    const canManage = useCan("audit_reports", "update");
    const { items, state, errorMsg, reload } = useAdminList<SystemConfigRow>(
        "/api/admin/system-config",
        "config",
        "/admin/system-config"
    );

    // Tag each row with its category so the shared client-table can tab on it.
    const tagged = useMemo<TaggedConfigRow[]>(
        () => items.map((c) => ({ ...c, category: categoryOf(c.key) })),
        [items]
    );

    const table = useClientTable(tagged, {
        searchKeys: ["key", "description"],
        tabKey: "category",
        // No pagination — the config set is small and edits are easier all-on-one-page.
    });

    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Token", value: "token", count: table.tabCounts.token },
            { label: "Redemption", value: "redemption", count: table.tabCounts.redemption },
            { label: "Eligibility", value: "eligibility", count: table.tabCounts.eligibility },
            { label: "Vendor", value: "vendor", count: table.tabCounts.vendor },
            { label: "Other", value: "other", count: table.tabCounts.other },
        ],
        [table.tabCounts]
    );

    const columns = ["Key", "Value", "Type", "Description", "Updated"];
    if (canManage) columns.push("Edit");

    return (
        <div>
            <AdminPageHeader
                title="System config"
                subtitle="Admin-tunable rules read at runtime. Unset values are shown, never guessed."
                count={state === "ready" ? items.length : undefined}
            />

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search key or description…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="config rows"
                emptyHint="Configuration rows will appear here once they are seeded."
                table={
                    <TableShell hideCols={[3, 4, 5]}>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {table.rows.map((c) => (
                                <ConfigRow
                                    key={c.key}
                                    row={c}
                                    canManage={canManage}
                                    reload={reload}
                                />
                            ))}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}

function ConfigRow({
    row,
    canManage,
    reload,
}: {
    row: SystemConfigRow;
    canManage: boolean;
    reload: () => Promise<void>;
}) {
    const toast = useToast();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<string>(row.value ?? "");
    const [saving, setSaving] = useState(false);

    function startEdit() {
        setDraft(row.value ?? (row.value_type === "boolean" ? "true" : ""));
        setEditing(true);
    }

    async function save(unset: boolean) {
        let value: string | number | boolean | null;
        if (unset) {
            value = null;
        } else if (row.value_type === "number") {
            value = draft.trim() === "" ? null : Number(draft);
        } else if (row.value_type === "boolean") {
            value = draft === "true";
        } else {
            value = draft;
        }

        setSaving(true);
        try {
            const res = await fetch("/api/admin/system-config", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: row.key, value }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                toast.error(body.error ?? `Save failed (${res.status})`);
                return;
            }
            toast.success(unset ? `Unset ${row.key}.` : `Saved ${row.key}.`);
            setEditing(false);
            await reload();
        } catch {
            toast.error("Network error — please try again.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <tr className="hover:bg-slate-50">
            <td className="px-2 md:px-4 py-3 font-mono text-xs font-medium text-slate-900">
                <ConfigKeyName value={row.key} />
            </td>
            <td className="px-2 md:px-4 py-3 text-slate-700">
                {editing ? (
                    <ValueEditor row={row} draft={draft} setDraft={setDraft} disabled={saving} />
                ) : row.value == null ? (
                    <span className="text-xs italic text-amber-600">unset</span>
                ) : (
                    <span className="font-medium">{row.value}</span>
                )}
            </td>
            <td className="px-2 md:px-4 py-3 text-slate-500">{row.value_type}</td>
            <td className="px-2 md:px-4 py-3 text-slate-600">
                <Dash>{row.description}</Dash>
            </td>
            <td className="px-2 md:px-4 py-3 text-slate-500">
                {new Date(row.updated_at).toLocaleDateString()}
            </td>
            {canManage && (
                <td className="px-2 md:px-4 py-3">
                    {editing ? (
                        <div className="flex flex-wrap gap-1.5">
                            <ActionButton tone="primary" disabled={saving} onClick={() => save(false)}>
                                Save
                            </ActionButton>
                            <ActionButton tone="neutral" disabled={saving} onClick={() => save(true)}>
                                Unset
                            </ActionButton>
                            <ActionButton
                                tone="neutral"
                                disabled={saving}
                                onClick={() => setEditing(false)}
                            >
                                Cancel
                            </ActionButton>
                        </div>
                    ) : (
                        <ActionButton tone="neutral" disabled={false} onClick={startEdit}>
                            Edit
                        </ActionButton>
                    )}
                </td>
            )}
        </tr>
    );
}

function ValueEditor({
    row,
    draft,
    setDraft,
    disabled,
}: {
    row: SystemConfigRow;
    draft: string;
    setDraft: (v: string) => void;
    disabled: boolean;
}) {
    const base =
        "rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 disabled:opacity-60";

    if (row.value_type === "boolean") {
        return (
            <select
                value={draft === "true" ? "true" : "false"}
                onChange={(e) => setDraft(e.target.value)}
                disabled={disabled}
                className={base}
            >
                <option value="true">true</option>
                <option value="false">false</option>
            </select>
        );
    }

    return (
        <input
            type={row.value_type === "number" ? "number" : "text"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled}
            placeholder={row.value_type === "number" ? "number (blank = unset)" : "value"}
            className={`${base} w-40`}
        />
    );
}
