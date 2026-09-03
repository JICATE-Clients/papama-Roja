"use client";

import { useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type { VolunteerResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    DetailDrawer,
    FilterBar,
    ListStates,
    Pagination,
    StatusBadge,
    TableHead,
    TableShell,
    useAction,
    useAdminList,
    useClientTable,
    useDetailDrawer,
    useToast,
} from "../_ui";

/** A pending/decided token-allocation request from a volunteer. */
interface VolunteerRequestRow {
    id: string;
    volunteer_id: string;
    volunteer_name: string | null;
    requested_count: number;
    decided_count: number | null;
    status: string;
    created_at: string;
}

/**
 * Admin volunteers page — registry of volunteers who hold/distribute tokens
 * (Path B). Toasts resolve to the <ToastHost> mounted once in app/admin/layout.tsx.
 */
export default function AdminVolunteersPage() {
    const canManage = useCan("token_distribution", "update");
    const canCreate = useCan("token_distribution", "create");

    const { items, state, errorMsg, reload } = useAdminList<VolunteerResponse>(
        "/api/admin/volunteers",
        "volunteers",
        "/admin/volunteers"
    );
    // Volunteer requests power both the queue section AND each volunteer's
    // detail-drawer history, so they are loaded once here.
    const requests = useAdminList<VolunteerRequestRow>(
        "/api/admin/volunteer-requests",
        "requests",
        "/admin/volunteers"
    );

    // Status actions (PATCH) + §3a allocation (POST) — both via the unified runner.
    const statusAction = useAction({
        method: "PATCH",
        endpoint: () => "/api/admin/volunteers",
        onDone: reload,
        successMessage: () => "Volunteer updated.",
    });
    const allocate = useAction({
        method: "POST",
        endpoint: (id) => `/api/admin/volunteers/${id}/allocate`,
        onDone: reload,
        successMessage: (d) => `Allocated ${d.granted_count ?? ""} token(s).`,
    });

    // Filter + status tabs + pagination over the registry.
    const table = useClientTable(items, {
        searchKeys: ["full_name", "email", "phone"],
        tabKey: "status",
        pageSize: 12,
    });

    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Pending", value: "pending", count: table.tabCounts.pending },
            { label: "Active", value: "active", count: table.tabCounts.active },
            { label: "Suspended", value: "suspended", count: table.tabCounts.suspended },
            { label: "Inactive", value: "inactive", count: table.tabCounts.inactive },
        ],
        [table.tabCounts]
    );

    const drawer = useDetailDrawer<VolunteerResponse>();

    const columns = ["Name", "Email", "Phone", "Status", "Joined"];
    if (canManage) columns.push("Actions");

    // The selected volunteer's request history (client-filtered from the loaded set).
    const selectedRequests = useMemo(
        () =>
            drawer.selected
                ? (requests.items ?? []).filter((r) => r.volunteer_id === drawer.selected!.id)
                : [],
        [drawer.selected, requests.items]
    );

    return (
        <div>
            <AdminPageHeader
                title="Volunteers"
                subtitle="Volunteers who receive, hold and distribute tokens to beneficiaries."
                count={state === "ready" ? items.length : undefined}
            />

            {canCreate && (
                <div className="mb-6">
                    <AddVolunteerForm onCreated={reload} />
                </div>
            )}

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search name, email, phone…"
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
                    <>
                        <TableShell hideCols={[2, 3, 5]}>
                            <TableHead columns={columns} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((v) => (
                                    <tr
                                        key={v.id}
                                        onClick={() => drawer.openRow(v)}
                                        className="cursor-pointer hover:bg-slate-50"
                                    >
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                            <Dash>{v.full_name}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <Dash>{v.email}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <Dash>{v.phone}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={v.status} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            {new Date(v.created_at).toLocaleDateString()}
                                        </td>
                                        {canManage && (
                                            // Stop row-open when clicking an action.
                                            <td
                                                className="px-2 md:px-4 py-3"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <VolunteerActions
                                                    id={v.id}
                                                    status={v.status}
                                                    busy={statusAction.busyId === v.id}
                                                    run={statusAction.run}
                                                    allocate={(id, count) =>
                                                        allocate.run(id, { count })
                                                    }
                                                    allocBusy={allocate.busyId === v.id}
                                                />
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </TableShell>
                        <Pagination
                            page={table.page}
                            pageCount={table.pageCount}
                            onPage={table.setPage}
                        />
                    </>
                }
            />

            <VolunteerDetailDrawer
                volunteer={drawer.selected}
                requests={selectedRequests}
                onClose={drawer.close}
                canManage={canManage}
                allocate={(id, count) => allocate.run(id, { count })}
                allocBusy={drawer.selected ? allocate.busyId === drawer.selected.id : false}
            />

            <div className="mt-10">
                <VolunteerRequestsSection
                    canManage={canManage}
                    items={requests.items}
                    state={requests.state}
                    errorMsg={requests.errorMsg}
                    reload={requests.reload}
                />
            </div>
        </div>
    );
}

/** Volunteer drill-down: profile + request history + allocate-from-pool footer. */
function VolunteerDetailDrawer({
    volunteer,
    requests,
    onClose,
    canManage,
    allocate,
    allocBusy,
}: {
    volunteer: VolunteerResponse | null;
    requests: VolunteerRequestRow[];
    onClose: () => void;
    canManage: boolean;
    allocate: (id: string, count: number) => void;
    allocBusy: boolean;
}) {
    const [count, setCount] = useState("");

    if (!volunteer) return null;

    const granted = requests
        .filter((r) => r.status === "granted" || r.status === "partially_granted")
        .reduce((sum, r) => sum + (r.decided_count ?? 0), 0);

    function submitAllocate() {
        const n = Number(count);
        if (!Number.isInteger(n) || n <= 0) return;
        allocate(volunteer!.id, n);
        setCount("");
    }

    return (
        <DetailDrawer
            open={true}
            onClose={onClose}
            title={volunteer.full_name ?? "Volunteer"}
            subtitle={volunteer.email ?? undefined}
            status={volunteer.status}
            sections={[
                { label: "Full name", value: volunteer.full_name },
                { label: "Status", value: <StatusBadge value={volunteer.status} /> },
                { label: "Email", value: volunteer.email },
                { label: "Phone", value: volunteer.phone },
                { label: "Requests", value: requests.length },
                { label: "Tokens granted (lifetime)", value: granted },
                { label: "Joined", value: new Date(volunteer.created_at).toLocaleString() },
                { label: "Volunteer id", value: volunteer.id, mono: true, full: true },
            ]}
            actions={
                canManage && volunteer.status === "active" ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-slate-600">
                            Allocate from pool:
                        </span>
                        <input
                            type="number"
                            min={1}
                            step={1}
                            value={count}
                            onChange={(e) => setCount(e.target.value)}
                            placeholder="count"
                            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                        />
                        <ActionButton tone="primary" disabled={allocBusy} onClick={submitAllocate}>
                            {allocBusy ? "Allocating…" : "Allocate"}
                        </ActionButton>
                    </div>
                ) : undefined
            }
        >
            {/* Request history sub-table (richer content via children). */}
            <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                    Request history
                </p>
                {requests.length === 0 ? (
                    <p className="text-sm text-slate-500">No token requests yet.</p>
                ) : (
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Requested</th>
                                    <th className="px-3 py-2 font-medium">Granted</th>
                                    <th className="px-3 py-2 font-medium">Status</th>
                                    <th className="px-3 py-2 font-medium">Submitted</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {requests.map((r) => (
                                    <tr key={r.id}>
                                        <td className="px-3 py-2 text-slate-700">{r.requested_count}</td>
                                        <td className="px-3 py-2 text-slate-700">
                                            <Dash>{r.decided_count != null ? r.decided_count : null}</Dash>
                                        </td>
                                        <td className="px-3 py-2">
                                            <StatusBadge value={r.status} />
                                        </td>
                                        <td className="px-3 py-2 text-slate-500">
                                            {new Date(r.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </DetailDrawer>
    );
}

/**
 * Admin "Add volunteer" form — collapsible. POSTs to /api/admin/volunteers, which
 * creates the auth user, flips the role to 'volunteer', and inserts the linked
 * profile (active). On success the registry reloads and the form resets.
 */
function AddVolunteerForm({ onCreated }: { onCreated: () => Promise<void> }) {
    const toast = useToast();
    const [open, setOpen] = useState(false);
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function reset() {
        setFullName("");
        setEmail("");
        setPhone("");
        setPassword("");
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!fullName.trim() || !email.trim() || password.length < 6) {
            setError("Name, email, and a password of at least 6 characters are required.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/volunteers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    full_name: fullName.trim(),
                    email: email.trim(),
                    password,
                    phone: phone.trim() || undefined,
                }),
            });
            if (res.status === 401) {
                window.location.href = "/login?redirect=/admin/volunteers";
                return;
            }
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = data.error ?? `Could not create volunteer (${res.status}).`;
                setError(msg);
                toast.error(msg);
                return;
            }
            toast.success(`Volunteer '${fullName.trim()}' created — they sign in at /volunteer/login.`);
            reset();
            await onCreated();
        } catch {
            const msg = "Network error — please try again.";
            setError(msg);
            toast.error(msg);
        } finally {
            setBusy(false);
        }
    }

    if (!open) {
        return (
            <ActionButton tone="primary" disabled={false} onClick={() => setOpen(true)}>
                Add volunteer
            </ActionButton>
        );
    }

    return (
        <form
            onSubmit={submit}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Add a volunteer</h2>
                <ActionButton
                    tone="neutral"
                    disabled={busy}
                    onClick={() => {
                        setOpen(false);
                        setError(null);
                    }}
                >
                    Cancel
                </ActionButton>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Full name
                    <input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Email
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="off"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Phone (optional)
                    <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Temporary password
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="at least 6 characters"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                    />
                </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                    {busy ? "Creating…" : "Create volunteer"}
                </button>
                {error && <span className="text-xs font-medium text-red-700">{error}</span>}
            </div>
            <p className="mt-2 text-xs text-slate-400">
                Share the email and temporary password with the volunteer — they sign in at
                /volunteer/login and can hold, distribute, and request tokens.
            </p>
        </form>
    );
}

function VolunteerActions({
    id,
    status,
    busy,
    run,
    allocate,
    allocBusy,
}: {
    id: string;
    status: VolunteerResponse["status"];
    busy: boolean;
    run: (rowId: string, payload: Record<string, unknown>, confirmText?: string) => void;
    allocate: (id: string, count: number) => void;
    allocBusy: boolean;
}) {
    const act = (action: string, confirmText?: string) =>
        run(id, { volunteer_id: id, action }, confirmText);

    const [allocating, setAllocating] = useState(false);
    const [count, setCount] = useState("");

    function submitAllocate() {
        const n = Number(count);
        if (!Number.isInteger(n) || n <= 0) return;
        allocate(id, n);
        setCount("");
        setAllocating(false);
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {status === "pending" && (
                <>
                    <ActionButton tone="primary" disabled={busy} onClick={() => act("approve")}>
                        Approve
                    </ActionButton>
                    <ActionButton
                        tone="danger"
                        disabled={busy}
                        onClick={() =>
                            act("reject", "Reject this volunteer application? They will not be able to hold tokens.")
                        }
                    >
                        Reject
                    </ActionButton>
                </>
            )}
            {status === "active" && (
                <>
                    {/* §3a admin-initiated direct assignment from the admin pool. */}
                    {allocating ? (
                        <>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={count}
                                onChange={(e) => setCount(e.target.value)}
                                placeholder="count"
                                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                            />
                            <ActionButton tone="primary" disabled={allocBusy} onClick={submitAllocate}>
                                Confirm
                            </ActionButton>
                            <ActionButton
                                tone="neutral"
                                disabled={allocBusy}
                                onClick={() => setAllocating(false)}
                            >
                                Cancel
                            </ActionButton>
                        </>
                    ) : (
                        <ActionButton
                            tone="primary"
                            disabled={allocBusy}
                            onClick={() => setAllocating(true)}
                        >
                            Allocate
                        </ActionButton>
                    )}
                    <ActionButton
                        tone="warn"
                        disabled={busy}
                        onClick={() =>
                            act("suspend", "Suspend this volunteer? They cannot receive tokens while suspended.")
                        }
                    >
                        Suspend
                    </ActionButton>
                    <ActionButton tone="neutral" disabled={busy} onClick={() => act("deactivate")}>
                        Deactivate
                    </ActionButton>
                </>
            )}
            {(status === "suspended" || status === "inactive") && (
                <ActionButton tone="primary" disabled={busy} onClick={() => act("activate")}>
                    Activate
                </ActionButton>
            )}
        </div>
    );
}

/**
 * Token requests queue — lists the loaded requests and, for pending rows, lets an
 * authorised admin grant (full), partially grant (a count), or deny via
 * POST /api/admin/volunteer-requests/[id]/decide. Reloads after each decision.
 */
function VolunteerRequestsSection({
    canManage,
    items,
    state,
    errorMsg,
    reload,
}: {
    canManage: boolean;
    items: VolunteerRequestRow[];
    state: ReturnType<typeof useAdminList>["state"];
    errorMsg: string | null;
    reload: () => Promise<void>;
}) {
    const decide = useAction({
        method: "POST",
        endpoint: (id) => `/api/admin/volunteer-requests/${id}/decide`,
        onDone: reload,
        successMessage: () => "Request decided.",
    });

    const columns = ["Volunteer", "Requested", "Granted", "Status", "Submitted"];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Token requests"
                subtitle="Volunteer requests to be allocated tokens. Grant in full, grant a partial count, or deny."
                count={state === "ready" ? items.length : undefined}
            />

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="token requests"
                emptyHint="Volunteer token requests will appear here once they are submitted."
                table={
                    <TableShell hideCols={[3, 4, 5]}>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50">
                                    <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                        <Dash>{r.volunteer_name}</Dash>
                                        {/* Status is a 94px badge column; who / how many / the decide
                                            buttons are what this page is for, so the badge moves under
                                            the name below md rather than the count or the actions. */}
                                        <span className="mt-1 block font-normal md:hidden">
                                            <StatusBadge value={r.status} />
                                        </span>
                                    </td>
                                    <td className="px-2 md:px-4 py-3 text-slate-700">{r.requested_count}</td>
                                    <td className="px-2 md:px-4 py-3 text-slate-700">
                                        <Dash>{r.decided_count != null ? r.decided_count : null}</Dash>
                                    </td>
                                    <td className="px-2 md:px-4 py-3">
                                        <StatusBadge value={r.status} />
                                    </td>
                                    <td className="px-2 md:px-4 py-3 text-slate-500">
                                        {new Date(r.created_at).toLocaleDateString()}
                                    </td>
                                    {canManage && (
                                        <td className="px-2 md:px-4 py-3">
                                            <RequestActions
                                                request={r}
                                                busy={decide.busyId === r.id}
                                                decide={(id, body) => decide.run(id, body)}
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

/** Per-row decide controls: Grant (full), Partial (count input), Deny. Pending rows only. */
function RequestActions({
    request,
    busy,
    decide,
}: {
    request: VolunteerRequestRow;
    busy: boolean;
    decide: (
        id: string,
        body: { decision: "granted" | "partially_granted" | "denied"; decided_count?: number }
    ) => void;
}) {
    const [partial, setPartial] = useState(false);
    const [count, setCount] = useState("");

    if (request.status !== "pending") {
        return <span className="text-xs text-slate-400">—</span>;
    }

    function submitPartial() {
        const n = Number(count);
        if (!Number.isInteger(n) || n <= 0 || n > request.requested_count) return;
        decide(request.id, { decision: "partially_granted", decided_count: n });
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <ActionButton
                tone="primary"
                disabled={busy}
                onClick={() => decide(request.id, { decision: "granted" })}
            >
                Grant
            </ActionButton>
            {partial ? (
                <>
                    <input
                        type="number"
                        min={1}
                        max={request.requested_count}
                        step={1}
                        value={count}
                        onChange={(e) => setCount(e.target.value)}
                        placeholder="count"
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                    />
                    <ActionButton tone="neutral" disabled={busy} onClick={submitPartial}>
                        Confirm
                    </ActionButton>
                </>
            ) : (
                <ActionButton tone="neutral" disabled={busy} onClick={() => setPartial(true)}>
                    Partial
                </ActionButton>
            )}
            <ActionButton
                tone="danger"
                disabled={busy}
                onClick={() => decide(request.id, { decision: "denied" })}
            >
                Deny
            </ActionButton>
        </div>
    );
}
