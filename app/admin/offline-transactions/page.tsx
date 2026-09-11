"use client";

import { useEffect, useState } from "react";

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
 * Offline emergency captures + the unsynced-device view (E-4 / B-30, CD §D-9).
 *
 * THE DEVICE VIEW IS THE IMPORTANT HALF, and it is the easy one to leave out.
 * The queue shows captures that ARRIVED. The device list shows devices that
 * captured and have not come back — meals served with no record reaching the
 * platform. Without it, nobody knows that happened.
 *
 * Approving does NOT burn a token here. It marks the capture validated; the
 * redemption is raised through the normal engine so expiry, geographic scope,
 * Food Partner standing and fraud blocks all still run. CD §D-6 lists those as
 * things Emergency Mode never overrides, and an admin clicking Approve is not
 * an exception to that.
 */

interface OfflineRow {
    id: string;
    token_id: string | null;
    food_partner_id: string | null;
    emergency_id: string | null;
    captured_at: string;
    received_at: string;
    token_meal_type: string | null;
    waiver_status: boolean;
    status: string;
    device_reference: string;
    source: string;
    rejection_reason: string | null;
    conflicts_with: string | null;
}

interface DeviceRow {
    device_reference: string;
    label: string | null;
    last_seen_at: string | null;
    last_sync_at: string | null;
    pending_reported: number;
    is_compromised: boolean;
    compromised_note: string | null;
}

export default function AdminOfflineTransactionsPage() {
    const canManage = useCan("token_redemption", "update");
    const [reason, setReason] = useState<Record<string, string>>({});
    const [devices, setDevices] = useState<DeviceRow[]>([]);

    const { items, state, errorMsg, reload } = useAdminList<OfflineRow>(
        "/api/admin/offline-transactions",
        "transactions",
        "/admin/offline-transactions"
    );
    const { run, busyId, actionError } = useRowAction(
        "/api/admin/offline-transactions",
        reload
    );

    // The device roster is a second view of the same route. Loaded separately so
    // a failure here never hides the capture queue.
    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const res = await fetch("/api/admin/offline-transactions?view=devices", {
                    cache: "no-store",
                    credentials: "same-origin",
                });
                if (!res.ok) return;
                const body = (await res.json()) as { devices?: DeviceRow[] };
                if (active) setDevices(body.devices ?? []);
            } catch {
                // Non-fatal: the queue below is still worth showing.
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    const duplicates = items.filter((t) => t.status === "duplicate").length;
    const stale = devices.filter((d) => d.pending_reported > 0);

    return (
        <div className="mx-auto max-w-6xl">
            <AdminPageHeader
                title="Offline captures"
                subtitle="Emergency transactions recorded without connectivity, awaiting validation."
                count={items.length}
            />

            {duplicates > 0 && (
                <div className="mb-5">
                    <Notice tone="warn" title="Duplicate captures need a decision">
                        {duplicates} capture(s) claim the same token. Neither side is accepted
                        automatically — a duplicate may be a crash retry, two volunteers helping
                        one person, or deliberate reuse, and only a human can tell them apart.
                    </Notice>
                </div>
            )}

            {stale.length > 0 && (
                <div className="mb-5">
                    <Notice tone="error" title="Devices holding unsynced captures">
                        {stale.map((d) => d.label ?? d.device_reference).join(", ")} — meals may
                        have been served with no record reaching the platform.
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
                resourceLabel="offline captures"
                emptyHint="Nothing captured offline. This fills only during an authorised emergency."
                table={
                    <TableShell hideCols={[3, 5]}>
                        <TableHead
                            columns={["Token", "Source", "Captured", "Received", "Status", "Action"]}
                        />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((t) => (
                                <tr
                                    key={t.id}
                                    className={
                                        t.status === "duplicate"
                                            ? "bg-amber-50/60"
                                            : "hover:bg-slate-50"
                                    }
                                >
                                    <td className="px-4 py-3">
                                        <span className="font-mono text-xs text-slate-800">
                                            <Dash>{t.token_id?.slice(0, 8)}</Dash>
                                        </span>
                                        {t.waiver_status && (
                                            <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                                                ₹10 waived
                                            </span>
                                        )}
                                        {t.rejection_reason && (
                                            <span className="mt-1 block text-xs text-red-700">
                                                {t.rejection_reason}
                                            </span>
                                        )}
                                        <span className="mt-1 block text-[11px] text-slate-500 md:hidden">
                                            {t.source === "food_partner" ? "Food Partner" : "Volunteer"}
                                            {" · "}
                                            {shortDateTime(t.captured_at)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                        {t.source === "food_partner" ? "Food Partner" : "Volunteer"}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                                        {shortDateTime(t.captured_at)}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                                        {shortDateTime(t.received_at)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={t.status} />
                                    </td>
                                    <td className="px-4 py-3">
                                        {canManage && (
                                            <div className="flex flex-col gap-1.5">
                                                <input
                                                    type="text"
                                                    value={reason[t.id] ?? ""}
                                                    onChange={(ev) =>
                                                        setReason((r) => ({
                                                            ...r,
                                                            [t.id]: ev.target.value,
                                                        }))
                                                    }
                                                    placeholder="Reason (reject only)"
                                                    className="w-44 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-600"
                                                />
                                                <div className="flex gap-1.5">
                                                    <ActionButton
                                                        tone="primary"
                                                        disabled={busyId === t.id}
                                                        onClick={() =>
                                                            run(t.id, {
                                                                offline_txn_id: t.id,
                                                                action: "approve",
                                                            })
                                                        }
                                                    >
                                                        Approve
                                                    </ActionButton>
                                                    <ActionButton
                                                        tone="danger"
                                                        disabled={
                                                            busyId === t.id ||
                                                            !(reason[t.id] ?? "").trim()
                                                        }
                                                        onClick={() =>
                                                            run(t.id, {
                                                                offline_txn_id: t.id,
                                                                action: "reject",
                                                                reason: reason[t.id],
                                                            })
                                                        }
                                                    >
                                                        Reject
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

            {devices.length > 0 && (
                <section className="mt-10">
                    <h2 className="mb-3 text-[15px] font-semibold text-slate-900">Devices</h2>
                    <TableShell hideCols={[3]}>
                        <TableHead columns={["Device", "Last sync", "Pending", "State"]} />
                        <tbody className="divide-y divide-slate-100">
                            {devices.map((d) => (
                                <tr key={d.device_reference} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                                        {d.label ?? d.device_reference}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                                        {d.last_sync_at ? shortDateTime(d.last_sync_at) : "never"}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                        {d.pending_reported}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge
                                            value={d.is_compromised ? "compromised" : "ok"}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                </section>
            )}
        </div>
    );
}
