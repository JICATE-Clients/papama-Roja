"use client";

import { useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type { NgoPartnerResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    DetailDrawer,
    FilterBar,
    ListStates,
    Notice,
    Pagination,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useClientTable,
    useDetailDrawer,
    useRowAction,
    type DetailSection,
} from "../_ui";

type NgoRow = NgoPartnerResponse & {
    address?: string | null;
    notes?: string | null;
    contact_phone?: string | null;
};

/** Admin NGO partners page — registry with create + status management + detail (M13, spec §5). */
export default function AdminNgoPartnersPage() {
    const canCreate = useCan("audit_reports", "create");
    const canManage = useCan("audit_reports", "update");
    const { items, state, errorMsg, reload } = useAdminList<NgoRow>(
        "/api/admin/ngo-partners",
        "ngo_partners",
        "/admin/ngo-partners"
    );
    const { run, busyId, actionError } = useRowAction("/api/admin/ngo-partners", reload);

    const table = useClientTable(items, {
        searchKeys: ["name", "focus_area", "city"],
        tabKey: "status",
        pageSize: 15,
    });
    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Active", value: "active", count: table.tabCounts.active },
            { label: "Suspended", value: "suspended", count: table.tabCounts.suspended },
            { label: "Inactive", value: "inactive", count: table.tabCounts.inactive },
        ],
        [table.tabCounts]
    );

    const drawer = useDetailDrawer<NgoRow>();
    const n = drawer.selected;
    const sections: DetailSection[] = n
        ? [
              { label: "Name", value: n.name },
              { label: "Status", value: n.status },
              { label: "Reg. number", value: n.registration_number },
              { label: "Focus area", value: n.focus_area },
              { label: "Contact person", value: n.contact_person },
              { label: "Contact email", value: n.contact_email },
              { label: "Contact phone", value: n.contact_phone },
              { label: "City", value: n.city },
              { label: "Address", value: n.address, full: true },
              ...(n.notes ? [{ label: "Notes", value: n.notes, full: true }] : []),
          ]
        : [];

    const columns = ["Name", "Reg. number", "Focus", "Contact", "City", "Status"];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="NGO partners"
                subtitle="Partner NGOs and organisations. Register new partners, manage status, click a row for full contact details."
                count={state === "ready" ? items.length : undefined}
            />

            {canCreate && <NgoCreateForm onDone={reload} />}

            {actionError && (
                <div className="mb-4">
                    <Notice tone="error" title="Action failed">
                        {actionError}
                    </Notice>
                </div>
            )}

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search by name, focus, city…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="NGO partners"
                emptyHint="Register a partner above to start the registry."
                table={
                    <>
                        <TableShell hideCols={[2, 3, 4, 5]}>
                            <TableHead columns={columns} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((n) => (
                                    <tr
                                        key={n.id}
                                        onClick={() => drawer.openRow(n)}
                                        className="cursor-pointer hover:bg-slate-50"
                                    >
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">{n.name}</td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <Dash>{n.registration_number}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <Dash>{n.focus_area}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <Dash>{n.contact_person ?? n.contact_email}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <Dash>{n.city}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={n.status} />
                                        </td>
                                        {canManage && (
                                            <td className="px-2 md:px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {n.status !== "active" && (
                                                        <ActionButton
                                                            tone="primary"
                                                            disabled={busyId === n.id}
                                                            onClick={() => run(n.id, { id: n.id, status: "active" })}
                                                        >
                                                            Activate
                                                        </ActionButton>
                                                    )}
                                                    {n.status !== "suspended" && (
                                                        <ActionButton
                                                            tone="neutral"
                                                            disabled={busyId === n.id}
                                                            onClick={() => run(n.id, { id: n.id, status: "suspended" })}
                                                        >
                                                            Suspend
                                                        </ActionButton>
                                                    )}
                                                    {n.status !== "inactive" && (
                                                        <ActionButton
                                                            tone="neutral"
                                                            disabled={busyId === n.id}
                                                            onClick={() => run(n.id, { id: n.id, status: "inactive" })}
                                                        >
                                                            Deactivate
                                                        </ActionButton>
                                                    )}
                                                </div>
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
                title={n?.name ?? "NGO partner"}
                subtitle={n?.focus_area ?? undefined}
                status={n?.status}
                sections={sections}
            />
        </div>
    );
}

function NgoCreateForm({ onDone }: { onDone: () => void }) {
    const [name, setName] = useState("");
    const [regNo, setRegNo] = useState("");
    const [focus, setFocus] = useState("");
    const [contact, setContact] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");
    const [city, setCity] = useState("");
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function submit() {
        if (!name.trim()) {
            setErr("Name is required.");
            return;
        }
        setBusy(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch("/api/admin/ngo-partners", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    registration_number: regNo.trim() || undefined,
                    focus_area: focus.trim() || undefined,
                    contact_person: contact.trim() || undefined,
                    contact_email: email.trim() || undefined,
                    contact_phone: phone.trim() || undefined,
                    address: address.trim() || undefined,
                    city: city.trim() || undefined,
                    notes: notes.trim() || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            setMsg("Partner registered.");
            setName("");
            setRegNo("");
            setFocus("");
            setContact("");
            setEmail("");
            setPhone("");
            setAddress("");
            setCity("");
            setNotes("");
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to register partner.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Register an NGO partner</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Name (required)" value={name} onChange={setName} disabled={busy} />
                <Field label="Registration number" value={regNo} onChange={setRegNo} disabled={busy} />
                <Field label="Focus area" value={focus} onChange={setFocus} disabled={busy} />
                <Field label="Contact person" value={contact} onChange={setContact} disabled={busy} />
                <Field label="Contact email" value={email} onChange={setEmail} disabled={busy} />
                <Field label="Contact phone" value={phone} onChange={setPhone} disabled={busy} />
                <Field label="City" value={city} onChange={setCity} disabled={busy} />
                <Field label="Address" value={address} onChange={setAddress} disabled={busy} />
                <Field label="Notes" value={notes} onChange={setNotes} disabled={busy} />
            </div>
            <div className="mt-3 flex items-center gap-3">
                <button
                    type="button"
                    onClick={submit}
                    disabled={busy}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                    {busy ? "Saving…" : "Register partner"}
                </button>
                {msg && <span className="text-xs font-medium text-green-700">{msg}</span>}
                {err && <span className="text-xs font-medium text-red-700">{err}</span>}
            </div>
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    disabled,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
}) {
    return (
        <label className="text-xs text-slate-600">
            {label}
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            />
        </label>
    );
}
