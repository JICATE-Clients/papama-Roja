"use client";

import { useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import BeneficiaryRegisterForm from "@/components/beneficiary/BeneficiaryRegisterForm";

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

type RegistrationRow = {
    id: string;
    full_name: string | null;
    category: string;
    contact: string | null;
    location_hint: string | null;
    status: string;
    face_hash_present: boolean;
    aadhaar_present: boolean;
    document_count: number;
    beneficiary_id: string | null;
    review_notes: string | null;
    created_at: string;
};

const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : null);

/** Admin beneficiary-registration queue — submit, review, approve/reject (BEN, demo step 2). */
export default function BeneficiaryRegistrationsPage() {
    const canCreate = useCan("beneficiary_registration", "create");
    const canManage = useCan("beneficiary_registration", "update");
    const { items, state, errorMsg, reload } = useAdminList<RegistrationRow>(
        "/api/admin/beneficiary-registrations",
        "registrations",
        "/admin/beneficiary-registrations"
    );

    const table = useClientTable(items, {
        searchKeys: ["full_name", "category", "contact"],
        tabKey: "status",
        pageSize: 15,
    });

    // Pending first — it's the actionable queue.
    const tabs = useMemo(
        () => [
            { label: "Pending", value: "pending", count: table.tabCounts.pending },
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Approved", value: "approved", count: table.tabCounts.approved },
            { label: "Rejected", value: "rejected", count: table.tabCounts.rejected },
        ],
        [table.tabCounts]
    );

    const drawer = useDetailDrawer<RegistrationRow>();
    const r = drawer.selected;
    const sections: DetailSection[] = r
        ? [
              { label: "Name", value: r.full_name },
              { label: "Category", value: r.category.replace(/_/g, " ") },
              { label: "Contact", value: r.contact },
              { label: "Status", value: r.status },
              { label: "Submitted", value: date(r.created_at) },
              {
                  label: "Identity",
                  value: `${r.face_hash_present ? "face ✓" : "no face"}${
                      r.aadhaar_present ? " · aadhaar ✓" : ""
                  } · ${r.document_count} doc(s)`,
                  full: true,
              },
              { label: "Location hint", value: r.location_hint, full: true },
              ...(r.review_notes ? [{ label: "Review notes", value: r.review_notes, full: true }] : []),
              ...(r.beneficiary_id
                  ? [{ label: "Beneficiary", value: r.beneficiary_id, mono: true, full: true }]
                  : []),
          ]
        : [];

    const columns = ["Name", "Category", "Contact", "Identity", "Status", "Submitted"];
    if (canManage) columns.push("Decision");

    return (
        <div>
            <AdminPageHeader
                title="Beneficiary registrations"
                subtitle="Submit and review eligibility. Approval creates an active, verified beneficiary with category-driven auto-expiry."
                count={state === "ready" ? items.length : undefined}
            />

            {canCreate && <BeneficiaryRegisterForm onDone={reload} heading="Register a beneficiary (staff)" />}

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search by name, category, contact…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="registrations"
                emptyHint="Submit a registration above to start the approval queue."
                table={
                    <>
                        <TableShell hideCols={[2, 3, 4, 6]}>
                            <TableHead columns={columns} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((r) => (
                                    <tr
                                        key={r.id}
                                        onClick={() => drawer.openRow(r)}
                                        className="cursor-pointer hover:bg-slate-50"
                                    >
                                        <td className="px-2 md:px-4 py-3 text-slate-800">
                                            <Dash>{r.full_name}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 capitalize text-slate-700">
                                            {r.category.replace(/_/g, " ")}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <Dash>{r.contact}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-xs text-slate-500">
                                            {r.face_hash_present ? "face ✓" : "no face"}
                                            {r.aadhaar_present ? " · aadhaar ✓" : ""}
                                            {r.document_count > 0 ? ` · ${r.document_count} doc(s)` : ""}
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={r.status} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            {new Date(r.created_at).toLocaleDateString()}
                                        </td>
                                        {canManage && (
                                            <td className="px-2 md:px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                {r.status === "pending" ? (
                                                    <DecisionButtons id={r.id} onDone={reload} />
                                                ) : (
                                                    <span className="text-xs text-slate-400">—</span>
                                                )}
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
                title={r?.full_name ?? "Registration"}
                subtitle="Eligibility submission"
                status={r?.status}
                sections={sections}
            />
        </div>
    );
}

function DecisionButtons({ id, onDone }: { id: string; onDone: () => void }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [notes, setNotes] = useState("");
    const [expiry, setExpiry] = useState(""); // YYYY-MM-DD (approve only)

    async function decide(decision: "approve" | "reject") {
        setBusy(true);
        setErr(null);
        try {
            const payload: Record<string, unknown> = { decision };
            if (notes.trim()) payload.review_notes = notes.trim();
            if (decision === "approve" && expiry) {
                payload.eligibility_expires_at = new Date(`${expiry}T00:00:00.000Z`).toISOString();
            }
            const res = await fetch(`/api/admin/beneficiary-registrations/${id}/decide`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed.");
        } finally {
            // Always clear busy — even on success — so the buttons re-enable if the
            // row stays mounted (e.g. the "All" tab keeps decided rows visible).
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-col gap-1.5">
            <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
                placeholder="Review notes (optional)"
                className="w-44 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
            />
            <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                disabled={busy}
                title="Eligibility expiry date (optional). Leave blank to auto-compute from config: pregnancy uses special_care_post_delivery_months; patient uses patient_eligibility_months. Other categories get no expiry."
                className="w-44 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
            />
            <div className="flex flex-wrap items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => decide("approve")}
                    disabled={busy}
                    className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
                >
                    Approve
                </button>
                <button
                    type="button"
                    onClick={() => decide("reject")}
                    disabled={busy}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                    Reject
                </button>
                {err && <span className="text-[10px] text-red-700">{err}</span>}
            </div>
        </div>
    );
}
