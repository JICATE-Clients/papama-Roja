"use client";

import { shortDateTime } from "@/lib/format";
import type { AuditLogResponse } from "@/lib/validation/schemas";

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

// The list route returns metadata (jsonb); the previous table fetched and
// discarded it. Type it locally so the detail drawer can render it.
type AuditRow = AuditLogResponse & { metadata?: Record<string, unknown> | null };

function renderValue(v: unknown): string {
    if (v == null) return "—";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
}

/** Admin audit-logs — append-only, immutable action trail; rows expand to full metadata. */
/** "24 Aug" — the phone-width stamp; the full one returns at md. */
function dayMonth(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? "—"
        : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function AdminAuditLogsPage() {
    const { items, state, errorMsg } = useAdminList<AuditRow>(
        "/api/admin/audit-logs",
        "audit_logs",
        "/admin/audit-logs"
    );

    const table = useClientTable(items, {
        searchKeys: ["action", "entity_table", "summary"],
        pageSize: 20,
    });

    const drawer = useDetailDrawer<AuditRow>();
    const a = drawer.selected;
    const meta = a?.metadata ?? null;
    const sections: DetailSection[] = a
        ? [
              { label: "Action", value: a.action },
              { label: "Actor role", value: a.actor_role ?? "system" },
              { label: "Entity", value: a.entity_table },
              { label: "Entity id", value: a.entity_id, mono: true },
              { label: "When", value: new Date(a.created_at).toLocaleString() },
              { label: "Summary", value: a.summary, full: true },
          ]
        : [];

    return (
        <div>
            <AdminPageHeader
                title="Audit logs"
                subtitle="Append-only, immutable trail of every admin action. Click a row for its full metadata. Newest first."
                count={state === "ready" ? items.length : undefined}
            />

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search by action, entity, summary…"
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="audit logs"
                emptyHint="Audit entries will appear here as admin actions are recorded."
                table={
                    <>
                        <TableShell hideCols={[2, 3, 4]}>
                            <TableHead columns={["Action", "Actor role", "Entity", "Summary", "When"]} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((a) => (
                                    <tr
                                        key={a.id}
                                        onClick={() => drawer.openRow(a)}
                                        className="cursor-pointer hover:bg-slate-50"
                                    >
                                        <td className="px-2 py-3 font-medium text-slate-900 md:px-4">
                                            <span className="break-words">{a.action}</span>
                                            {a.summary && (
                                                <span className="mt-0.5 block font-normal leading-snug text-slate-500 md:hidden">
                                                    {a.summary}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            {a.actor_role ? (
                                                <StatusBadge value={a.actor_role} />
                                            ) : (
                                                <span className="text-xs text-slate-400">system</span>
                                            )}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            {a.entity_table}
                                            {a.entity_id && (
                                                <span className="ml-1 font-mono text-xs text-slate-400">
                                                    {a.entity_id}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <Dash>{a.summary}</Dash>
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-3 text-slate-500 md:whitespace-normal md:px-4">
                                            <span className="md:hidden">{dayMonth(a.created_at)}</span>
                                            <span className="hidden md:inline">
                                                {shortDateTime(a.created_at)}
                                            </span>
                                        </td>
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
                title={a?.action ?? "Audit entry"}
                subtitle={a ? new Date(a.created_at).toLocaleString() : undefined}
                sections={sections}
            >
                {a && (
                    <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Metadata
                        </h3>
                        {meta && Object.keys(meta).length > 0 ? (
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                                {Object.entries(meta).map(([k, v]) => (
                                    <div key={k} className="contents">
                                        <dt className="font-mono text-xs text-slate-500">{k}</dt>
                                        <dd className="break-all font-mono text-xs text-slate-800">
                                            {renderValue(v)}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        ) : (
                            <p className="text-sm text-slate-400">No metadata recorded.</p>
                        )}
                    </section>
                )}
            </DetailDrawer>
        </div>
    );
}
