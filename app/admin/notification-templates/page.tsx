"use client";

import { useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";

import {
    ActionButton,
    AdminPageHeader,
    ListStates,
    TableHead,
    TableShell,
    useAdminList,
    useToast,
} from "../_ui";

/**
 * Admin notification-templates page (addon2 A2) — edit the donor-facing copy for
 * each notification kind/channel. {{var}} placeholders (e.g. {{vendor_name}},
 * {{value_inr}}) are substituted at send time; deactivating a row falls back to
 * the route's built-in copy. Gated under audit_reports (admin edits).
 */

interface TemplateRow {
    id: string;
    kind: string;
    channel: string;
    subject: string;
    body_template: string;
    is_active: boolean;
    version: number;
    updated_at: string;
}

export default function AdminNotificationTemplatesPage() {
    const canManage = useCan("audit_reports", "update");
    const { items, state, errorMsg, reload } = useAdminList<TemplateRow>(
        "/api/admin/notification-templates",
        "templates",
        "/admin/notification-templates"
    );

    const columns = ["Kind", "Channel", "Subject & body", "Active", "Ver"];
    if (canManage) columns.push("Edit");

    return (
        <div>
            <AdminPageHeader
                title="Notification templates"
                subtitle="Editable copy for donor alerts. Use {{placeholders}} like {{vendor_name}} / {{value_inr}}; inactive templates fall back to built-in copy."
                count={state === "ready" ? items.length : undefined}
            />

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="templates"
                emptyHint="Templates are seeded per notification kind/channel."
                table={
                    <TableShell hideCols={[1, 2, 4, 5]}>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((t) => (
                                <TemplateRowView
                                    key={t.id}
                                    row={t}
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

function TemplateRowView({
    row,
    canManage,
    reload,
}: {
    row: TemplateRow;
    canManage: boolean;
    reload: () => Promise<void>;
}) {
    const toast = useToast();
    const [editing, setEditing] = useState(false);
    const [subject, setSubject] = useState(row.subject);
    const [body, setBody] = useState(row.body_template);
    const [saving, setSaving] = useState(false);

    async function patch(payload: Record<string, unknown>, okMsg: string) {
        setSaving(true);
        try {
            const res = await fetch("/api/admin/notification-templates", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: row.id, ...payload }),
            });
            if (!res.ok) {
                const b = await res.json().catch(() => ({}));
                toast.error(b.error ?? `Save failed (${res.status})`);
                return;
            }
            toast.success(okMsg);
            setEditing(false);
            await reload();
        } catch {
            toast.error("Network error — please try again.");
        } finally {
            setSaving(false);
        }
    }

    const inputBase =
        "w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 disabled:opacity-60";

    return (
        <tr className="hover:bg-slate-50 align-top">
            <td className="px-2 md:px-4 py-3 font-mono text-xs font-medium text-slate-900">{row.kind}</td>
            <td className="px-2 md:px-4 py-3 text-slate-500">{row.channel}</td>
            <td className="px-2 md:px-4 py-3 text-slate-700">
                {/* Kind is an 88px mono column; reprinted here so a phone still
                    shows which notification a row is. */}
                <span className="mb-1 block font-mono text-[11px] font-medium text-slate-500 md:hidden">
                    {row.kind}
                </span>
                {editing ? (
                    <div className="flex flex-col gap-1.5">
                        <input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            disabled={saving}
                            placeholder="Subject"
                            className={inputBase}
                        />
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            disabled={saving}
                            rows={3}
                            placeholder="Body with {{placeholders}}"
                            className={inputBase}
                        />
                    </div>
                ) : (
                    <div>
                        <div className="font-medium">{row.subject}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{row.body_template}</div>
                    </div>
                )}
            </td>
            <td className="px-2 md:px-4 py-3">
                <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                >
                    {row.is_active ? "active" : "inactive"}
                </span>
            </td>
            <td className="px-2 md:px-4 py-3 text-slate-500">{row.version}</td>
            {canManage && (
                <td className="px-2 md:px-4 py-3">
                    {editing ? (
                        <div className="flex flex-wrap gap-1.5">
                            <ActionButton
                                tone="primary"
                                disabled={saving}
                                onClick={() => patch({ subject, body_template: body }, "Template saved.")}
                            >
                                Save
                            </ActionButton>
                            <ActionButton tone="neutral" disabled={saving} onClick={() => setEditing(false)}>
                                Cancel
                            </ActionButton>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            <ActionButton tone="neutral" disabled={false} onClick={() => setEditing(true)}>
                                Edit
                            </ActionButton>
                            <ActionButton
                                tone="neutral"
                                disabled={saving}
                                onClick={() =>
                                    patch(
                                        { is_active: !row.is_active },
                                        row.is_active ? "Deactivated." : "Activated."
                                    )
                                }
                            >
                                {row.is_active ? "Deactivate" : "Activate"}
                            </ActionButton>
                        </div>
                    )}
                </td>
            )}
        </tr>
    );
}
