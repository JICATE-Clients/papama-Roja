"use client";

import { useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import { shortDateTime } from "@/lib/format";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    ListStates,
    Notice,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useRowAction,
} from "../_ui";

/**
 * Exception queue (F-3 / B-25, CD §D-5) — shared, per the Work Order's
 * "build once" note.
 *
 * Everything inherently risky lands here: token reissues, bank-account changes,
 * reversals, unusual waivers, emergency patterns (E-3) and offline duplicates
 * (E-4). One screen rather than six, because a reviewer should not have to know
 * which card produced a finding in order to look at it.
 *
 * Clearing requires a note. An exception cleared with no explanation leaves no
 * record of who decided it was fine or why, which defeats the point of having
 * flagged it.
 */

interface ExceptionRow {
    id: string;
    exception_type: string;
    entity_table: string;
    entity_id: string;
    vendor_id: string | null;
    severity: string | null;
    detail: string | null;
    emergency_id: string | null;
    status: string;
    created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
    manual_adjustment: "Manual adjustment",
    token_reissue: "Token reissue",
    reversal: "Reversal",
    refund: "Refund",
    manual_entry: "Manual entry",
    bank_account_change: "Bank account change",
    unusual_waiver: "Unusual waiver",
    fraud_linked: "Fraud linked",
    emergency_pattern: "Emergency pattern",
    offline_duplicate: "Offline duplicate",
};

export default function AdminExceptionQueuePage() {
    const canManage = useCan("audit_reports", "update");
    const [note, setNote] = useState<Record<string, string>>({});
    const { items, state, errorMsg, reload } = useAdminList<ExceptionRow>(
        "/api/admin/exception-queue",
        "exceptions",
        "/admin/exception-queue"
    );
    const { run, busyId, actionError } = useRowAction("/api/admin/exception-queue", reload);

    const critical = items.filter((e) => e.severity === "critical").length;

    return (
        <div className="mx-auto max-w-6xl">
            <AdminPageHeader
                title="Exception queue"
                subtitle="Transactions flagged as inherently risky — reissues, bank changes, waivers, offline duplicates."
                count={items.length}
            />

            {critical > 0 && (
                <div className="mb-5">
                    <Notice tone="error" title="Critical findings">
                        {critical === 1
                            ? "1 exception is marked critical."
                            : `${critical} exceptions are marked critical.`}
                    </Notice>
                </div>
            )}

            {actionError && (
                <div className="mb-5">
                    <Notice tone="error" title="Action failed">
                        {actionError}
                    </Notice>
                </div>
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="exceptions"
                emptyHint="Nothing flagged. Reissues, bank changes and offline duplicates appear here automatically."
                table={
                    <TableShell hideCols={[3, 5]}>
                        <TableHead
                            columns={["Type", "Detail", "Severity", "Flagged", "Status", "Action"]}
                        />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((e) => (
                                <tr
                                    key={e.id}
                                    className={
                                        e.severity === "critical"
                                            ? "bg-red-50/60"
                                            : "hover:bg-slate-50"
                                    }
                                >
                                    <td className="px-4 py-3">
                                        <span className="font-medium text-slate-800">
                                            {TYPE_LABEL[e.exception_type] ?? e.exception_type}
                                        </span>
                                        <span className="mt-0.5 block font-mono text-[11px] text-slate-400">
                                            {e.entity_table}
                                        </span>
                                        {/* Severity and Flagged are hidden below md. */}
                                        <span className="mt-1 block text-[11px] text-slate-500 md:hidden">
                                            <Dash>{e.severity}</Dash>
                                            {" · "}
                                            {shortDateTime(e.created_at)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{e.detail}</Dash>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={e.severity} />
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                                        {shortDateTime(e.created_at)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={e.status} />
                                    </td>
                                    <td className="px-4 py-3">
                                        {canManage && (
                                            <div className="flex flex-col gap-1.5">
                                                {/* The note is REQUIRED to clear — the
                                                    server rejects a clear without one. */}
                                                <input
                                                    type="text"
                                                    value={note[e.id] ?? ""}
                                                    onChange={(ev) =>
                                                        setNote((n) => ({
                                                            ...n,
                                                            [e.id]: ev.target.value,
                                                        }))
                                                    }
                                                    placeholder="Why is this fine?"
                                                    className="w-44 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-600"
                                                />
                                                <div className="flex gap-1.5">
                                                    <ActionButton
                                                        tone="primary"
                                                        disabled={
                                                            busyId === e.id ||
                                                            !(note[e.id] ?? "").trim()
                                                        }
                                                        onClick={() =>
                                                            run(e.id, {
                                                                exception_id: e.id,
                                                                action: "clear",
                                                                resolution: note[e.id],
                                                            })
                                                        }
                                                    >
                                                        Clear
                                                    </ActionButton>
                                                    <ActionButton
                                                        tone="danger"
                                                        disabled={busyId === e.id}
                                                        onClick={() =>
                                                            run(e.id, {
                                                                exception_id: e.id,
                                                                action: "escalate",
                                                                resolution: note[e.id],
                                                            })
                                                        }
                                                    >
                                                        Escalate
                                                    </ActionButton>
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}
