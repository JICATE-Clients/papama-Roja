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
 * Emergency register (E-1 / B-26, CD §D-6).
 *
 * DECLARING AN EMERGENCY IS NOT A ROUTINE FORM, and this screen says so rather
 * than presenting it as one. An active emergency can switch on relaxed
 * verification and the automatic ₹10 waiver for every redemption inside its
 * geographic scope — it changes what happens at the till, not just what a
 * report says.
 *
 * Both relaxations default OFF. CD §D-6 lets an administrator decide them
 * deliberately; an emergency does not assume either.
 *
 * NO INDEFINITE EMERGENCY MODE: an end date is required, extension carries a
 * mandatory reason, and every extension is kept as history.
 */

interface EmergencyRow {
    id: string;
    emergency_ref: string;
    title: string;
    reason: string;
    status: string;
    activated_at: string;
    ends_at: string;
    extended_count: number;
    scope_city: string | null;
    contribution_waiver_enabled: boolean;
    verification_relaxation_enabled: boolean;
    closed_at: string | null;
    scope_district: { name: string | null } | null;
    scope_state: { name: string | null } | null;
}

export default function AdminEmergenciesPage() {
    const canCreate = useCan("emergency_disaster_mode", "create");
    const canManage = useCan("emergency_disaster_mode", "update");
    const [showForm, setShowForm] = useState(false);
    const [reason, setReason] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const { items, state, errorMsg, reload } = useAdminList<EmergencyRow>(
        "/api/admin/emergencies",
        "emergencies",
        "/admin/emergencies"
    );
    const { run, busyId, actionError } = useRowAction("/api/admin/emergencies", reload);

    const active = items.filter((e) => e.status === "active");

    async function declare(form: HTMLFormElement) {
        const fd = new FormData(form);
        setSaving(true);
        setFormError(null);
        try {
            const res = await fetch("/api/admin/emergencies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    emergency_ref: String(fd.get("emergency_ref") ?? "").toUpperCase(),
                    title: fd.get("title"),
                    reason: fd.get("reason"),
                    ends_at: new Date(String(fd.get("ends_at"))).toISOString(),
                    scope_city: String(fd.get("scope_city") ?? "") || undefined,
                    contribution_waiver_enabled: fd.get("waiver") === "on",
                    verification_relaxation_enabled: fd.get("relax") === "on",
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setFormError(body.error ?? `Failed (${res.status})`);
                return;
            }
            form.reset();
            setShowForm(false);
            await reload();
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="mx-auto max-w-6xl">
            <AdminPageHeader
                title="Emergencies"
                subtitle="Authorised humanitarian emergencies. An active one can relax verification and waive the ₹10 contribution."
                count={items.length}
                action={
                    canCreate ? (
                        <ActionButton
                            tone="primary"
                            disabled={false}
                            onClick={() => setShowForm((s) => !s)}
                        >
                            {showForm ? "Cancel" : "Declare emergency"}
                        </ActionButton>
                    ) : undefined
                }
            />

            {active.length > 0 && (
                <div className="mb-5">
                    <Notice tone="warn" title="Emergency mode is active">
                        {active
                            .map(
                                (e) =>
                                    `${e.emergency_ref} until ${shortDateTime(e.ends_at)}` +
                                    (e.contribution_waiver_enabled ? " · ₹10 waived" : "") +
                                    (e.verification_relaxation_enabled ? " · face skip allowed" : "")
                            )
                            .join(" — ")}
                    </Notice>
                </div>
            )}

            {(actionError || formError) && (
                <div className="mb-5">
                    <Notice tone="error" title="Action failed">
                        {actionError ?? formError}
                    </Notice>
                </div>
            )}

            {showForm && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void declare(e.currentTarget);
                    }}
                    className="mb-8 rounded-2xl bg-white p-6 ring-1 ring-slate-900/[0.06]"
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700">
                                Emergency ID
                            </span>
                            <input
                                name="emergency_ref"
                                required
                                placeholder="TN-FLOOD-2026-001"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-slate-600"
                            />
                            <span className="mt-1 block text-xs text-slate-500">
                                Quoted in reports and donor communications.
                            </span>
                        </label>
                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700">Title</span>
                            <input
                                name="title"
                                required
                                placeholder="Coimbatore floods"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600"
                            />
                        </label>
                        <label className="block text-sm sm:col-span-2">
                            <span className="mb-1 block font-medium text-slate-700">Reason</span>
                            <textarea
                                name="reason"
                                required
                                rows={2}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600"
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700">Ends at</span>
                            <input
                                name="ends_at"
                                type="datetime-local"
                                required
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600"
                            />
                            <span className="mt-1 block text-xs text-slate-500">
                                Required — there is no indefinite emergency mode.
                            </span>
                        </label>
                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700">
                                City scope (optional)
                            </span>
                            <input
                                name="scope_city"
                                placeholder="Leave blank for nationwide"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600"
                            />
                        </label>
                    </div>

                    {/* Spelled out because these two change what happens at every
                        till inside the scope, not what a report says. */}
                    <fieldset className="mt-5 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-amber-900">
                            These change live behaviour
                        </legend>
                        <label className="flex items-start gap-2 text-sm text-amber-900">
                            <input type="checkbox" name="waiver" className="mt-0.5" />
                            <span>
                                <strong>Waive the ₹10 contribution</strong> for every redemption in
                                scope. The Food Partner still receives the full meal value.
                            </span>
                        </label>
                        <label className="mt-3 flex items-start gap-2 text-sm text-amber-900">
                            <input type="checkbox" name="relax" className="mt-0.5" />
                            <span>
                                <strong>Allow face verification to be skipped.</strong> Token
                                validity, geographic scope, Food Partner status and fraud blocks
                                still apply.
                            </span>
                        </label>
                    </fieldset>

                    <div className="mt-5">
                        <ActionButton tone="primary" disabled={saving} onClick={() => {}}>
                            {saving ? "Declaring…" : "Declare emergency"}
                        </ActionButton>
                    </div>
                </form>
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="emergencies"
                emptyHint="None declared. Emergency mode is off."
                table={
                    <TableShell hideCols={[3, 5]}>
                        <TableHead
                            columns={["Emergency", "Scope", "Relaxations", "Ends", "Status", "Action"]}
                        />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((e) => (
                                <tr
                                    key={e.id}
                                    className={
                                        e.status === "active" ? "bg-amber-50/50" : "hover:bg-slate-50"
                                    }
                                >
                                    <td className="px-4 py-3">
                                        <span className="font-mono text-xs font-medium text-slate-800">
                                            {e.emergency_ref}
                                        </span>
                                        <span className="mt-0.5 block text-slate-700">
                                            {e.title}
                                        </span>
                                        {e.extended_count > 0 && (
                                            <span className="mt-0.5 block text-[11px] text-amber-700">
                                                extended {e.extended_count}×
                                            </span>
                                        )}
                                        <span className="mt-1 block text-[11px] text-slate-500 md:hidden">
                                            ends {shortDateTime(e.ends_at)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>
                                            {e.scope_city ??
                                                e.scope_district?.name ??
                                                e.scope_state?.name ??
                                                "Nationwide"}
                                        </Dash>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-600">
                                        {e.contribution_waiver_enabled ? "₹10 waived" : "—"}
                                        <br />
                                        {e.verification_relaxation_enabled ? "face skip" : "—"}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                                        {shortDateTime(e.ends_at)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={e.status} />
                                    </td>
                                    <td className="px-4 py-3">
                                        {canManage && e.status === "active" && (
                                            <div className="flex flex-col gap-1.5">
                                                <input
                                                    type="text"
                                                    value={reason[e.id] ?? ""}
                                                    onChange={(ev) =>
                                                        setReason((r) => ({
                                                            ...r,
                                                            [e.id]: ev.target.value,
                                                        }))
                                                    }
                                                    placeholder="Reason (to extend)"
                                                    className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-600"
                                                />
                                                <div className="flex gap-1.5">
                                                    <ActionButton
                                                        tone="warn"
                                                        disabled={
                                                            busyId === e.id ||
                                                            !(reason[e.id] ?? "").trim()
                                                        }
                                                        onClick={() =>
                                                            run(
                                                                e.id,
                                                                {
                                                                    emergency_id: e.id,
                                                                    action: "extend",
                                                                    reason: reason[e.id],
                                                                    new_ends_at: new Date(
                                                                        Date.parse(e.ends_at) +
                                                                            7 * 86_400_000
                                                                    ).toISOString(),
                                                                },
                                                                "Extend this emergency by 7 days?"
                                                            )
                                                        }
                                                    >
                                                        Extend 7d
                                                    </ActionButton>
                                                    <ActionButton
                                                        tone="primary"
                                                        disabled={busyId === e.id}
                                                        onClick={() =>
                                                            run(
                                                                e.id,
                                                                {
                                                                    emergency_id: e.id,
                                                                    action: "close",
                                                                },
                                                                "Close this emergency? Relaxations end immediately and a closure reconciliation is written."
                                                            )
                                                        }
                                                    >
                                                        Close
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
