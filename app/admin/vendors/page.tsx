"use client";

import { useEffect, useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import { NewVendorForm } from "./NewVendorForm";
import type { VendorAction, VendorResponse } from "@/lib/validation/schemas";

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
    type BtnTone,
    type DetailSection,
} from "../_ui";

// approve/reinstate/reject/suspend/fail_kyc require explicit confirmation.
const CONFIRM_TEXT: Partial<Record<VendorAction, string>> = {
    approve: "Approve this vendor? They will be allowed to accept token redemptions.",
    reinstate: "Reinstate this vendor? They will resume accepting token redemptions.",
    reject: "Reject this vendor? They will not be able to operate.",
    suspend: "Suspend this vendor? Redemptions at this vendor will stop.",
    fail_kyc: "Mark this vendor's KYC as failed?",
};

function actionsFor(v: VendorResponse): { action: VendorAction; label: string; tone: BtnTone }[] {
    const acts: { action: VendorAction; label: string; tone: BtnTone }[] = [];
    if (v.status === "pending") {
        acts.push({ action: "approve", label: "Approve", tone: "primary" });
        acts.push({ action: "reject", label: "Reject", tone: "danger" });
    }
    if (v.status === "approved") acts.push({ action: "suspend", label: "Suspend", tone: "warn" });
    if (v.status === "suspended") acts.push({ action: "reinstate", label: "Reinstate", tone: "primary" });
    if (v.kyc_status !== "verified") acts.push({ action: "verify_kyc", label: "Verify KYC", tone: "neutral" });
    if (v.kyc_status !== "failed") acts.push({ action: "fail_kyc", label: "Fail KYC", tone: "neutral" });
    return acts;
}

type VendorDocument = {
    id: string;
    doc_type: string;
    verification_status: string;
    signed_url: string;
    created_at: string;
};

/**
 * Admin vendors page — registry + lifecycle actions + a full-profile drawer with
 * the uploaded documents (signed URLs). Adopts the shared admin spine.
 */
export default function AdminVendorsPage() {
    const canManage = useCan("vendor_management", "update");
    const canCreate = useCan("vendor_management", "create");
    const [showCreate, setShowCreate] = useState(false);
    const { items, state, errorMsg, reload } = useAdminList<VendorResponse>(
        "/api/admin/vendors",
        "vendors",
        "/admin/vendors"
    );

    const action = useAction({
        method: "PATCH",
        endpoint: () => "/api/admin/vendors",
        onDone: reload,
        successMessage: () => "Vendor updated.",
    });

    const table = useClientTable(items, {
        searchKeys: ["name", "fssai_license", "gst_number"],
        tabKey: "status",
        pageSize: 15,
    });
    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Pending", value: "pending", count: table.tabCounts.pending },
            { label: "Approved", value: "approved", count: table.tabCounts.approved },
            { label: "Suspended", value: "suspended", count: table.tabCounts.suspended },
            { label: "Rejected", value: "rejected", count: table.tabCounts.rejected },
        ],
        [table.tabCounts]
    );

    const drawer = useDetailDrawer<VendorResponse>();
    // Lazily load the vendor's documents when the drawer opens.
    const [docs, setDocs] = useState<VendorDocument[]>([]);
    const [docState, setDocState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    useEffect(() => {
        const v = drawer.selected;
        if (!v) {
            setDocs([]);
            setDocState("idle");
            return;
        }
        let cancelled = false;
        setDocState("loading");
        fetch(`/api/admin/vendors/${v.vendor_id}/documents`, { cache: "no-store", credentials: "same-origin" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((b: { documents: VendorDocument[] }) => {
                if (!cancelled) {
                    setDocs(b.documents ?? []);
                    setDocState("ready");
                }
            })
            .catch(() => !cancelled && setDocState("error"));
        return () => {
            cancelled = true;
        };
    }, [drawer.selected]);

    const v = drawer.selected;
    const sections: DetailSection[] = v
        ? [
              { label: "Name", value: v.name },
              { label: "Status", value: v.status },
              { label: "KYC", value: v.kyc_status },
              { label: "FSSAI licence", value: v.fssai_license },
              { label: "GST number", value: v.gst_number },
              { label: "Hygiene", value: v.hygiene_rating != null ? `${v.hygiene_rating}/5` : null },
              {
                  label: "Geo",
                  value: v.geo ? `${v.geo.lat.toFixed(5)}, ${v.geo.lng.toFixed(5)}` : null,
              },
              {
                  label: "Login",
                  value: v.has_login
                      ? "Linked — the vendor can sign in"
                      : "Unclaimed — no account yet",
              },
              { label: "Registered", value: new Date(v.created_at).toLocaleString(), full: true },
          ]
        : [];

    const runAction = (id: string, a: VendorAction) =>
        action.run(id, { vendor_id: id, action: a }, CONFIRM_TEXT[a]);

    const columns = ["Name", "Status", "KYC", "FSSAI", "GST", "Hygiene", "Registered"];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Vendors"
                subtitle="Registered food vendors and their onboarding/KYC status. Click a vendor for the full profile + documents."
                count={state === "ready" ? items.length : undefined}
                action={
                    canCreate ? (
                        <button
                            type="button"
                            onClick={() => setShowCreate((o) => !o)}
                            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
                        >
                            {showCreate ? "Cancel" : "Add vendor"}
                        </button>
                    ) : null
                }
            />

            {canCreate && showCreate && (
                <NewVendorForm
                    onDone={() => {
                        setShowCreate(false);
                        void reload();
                    }}
                />
            )}

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search by name, FSSAI, GST…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="vendors"
                emptyHint="Vendors will appear here once they are onboarded."
                table={
                    <>
                        <TableShell hideCols={[3, 4, 5, 6, 7]}>
                            <TableHead columns={columns} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((v) => (
                                    <tr
                                        key={v.vendor_id}
                                        onClick={() => drawer.openRow(v)}
                                        className="cursor-pointer hover:bg-slate-50"
                                    >
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">{v.name}</td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={v.status} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={v.kyc_status} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <Dash>{v.fssai_license}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <Dash>{v.gst_number}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            {v.hygiene_rating != null ? `${v.hygiene_rating}/5` : "—"}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            {new Date(v.created_at).toLocaleDateString()}
                                        </td>
                                        {canManage && (
                                            <td className="px-2 md:px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {actionsFor(v).map((a) => (
                                                        <ActionButton
                                                            key={a.action}
                                                            tone={a.tone}
                                                            disabled={action.busyId === v.vendor_id}
                                                            onClick={() => runAction(v.vendor_id, a.action)}
                                                        >
                                                            {a.label}
                                                        </ActionButton>
                                                    ))}
                                                    {actionsFor(v).length === 0 && (
                                                        <span className="text-xs text-slate-400">—</span>
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
                title={v?.name ?? "Vendor"}
                subtitle="Profile & documents"
                status={v?.status}
                sections={sections}
                actions={
                    canManage && v
                        ? actionsFor(v).map((a) => (
                              <ActionButton
                                  key={a.action}
                                  tone={a.tone}
                                  disabled={action.busyId === v.vendor_id}
                                  onClick={() => runAction(v.vendor_id, a.action)}
                              >
                                  {a.label}
                              </ActionButton>
                          ))
                        : null
                }
            >
                {v && (
                    <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Documents
                        </h3>
                        {docState === "loading" && <p className="text-xs text-slate-400">Loading documents…</p>}
                        {docState === "error" && <p className="text-xs text-red-700">Couldn’t load documents.</p>}
                        {docState === "ready" && docs.length === 0 && (
                            <p className="text-xs text-slate-400">No documents uploaded.</p>
                        )}
                        {docState === "ready" && docs.length > 0 && (
                            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                                {docs.map((d) => (
                                    <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                                        <span className="font-medium capitalize text-slate-700">
                                            {d.doc_type.replace(/_/g, " ")}
                                        </span>
                                        <StatusBadge value={d.verification_status} />
                                        <a
                                            href={d.signed_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="ml-auto rounded-md border border-slate-300 px-2.5 py-1 font-medium text-slate-700 transition hover:bg-slate-50"
                                        >
                                            View
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}
            </DetailDrawer>
        </div>
    );
}
