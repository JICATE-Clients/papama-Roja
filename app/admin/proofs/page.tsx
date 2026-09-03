"use client";

import { useCallback, useEffect, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";

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
    type DetailSection,
} from "../_ui";

/**
 * Admin proof-of-service review queue. Vendors upload a plate photo + receipt;
 * payment stays LOCKED until an admin approves the evidence here. A row opens a
 * review drawer with the FULL-SIZE images side-by-side — approving releases real
 * money, so it should not be judged off a thumbnail.
 */

type ProofRow = {
    redemption_id: string;
    vendor_id: string;
    vendor_name: string | null;
    token_value_inr: number;
    menu_value_inr: number;
    settlement_amount_inr: number;
    payment_status: string;
    proof_status: string | null;
    proof_review_note: string | null;
    proof_uploaded_at: string | null;
    redeemed_at: string | null;
    photo_url: string | null;
    receipt_url: string | null;
};

const rupee = (n: number | null | undefined) => (n != null ? `₹${n.toLocaleString("en-IN")}` : "—");
const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-IN") : null);

export default function AdminProofsPage() {
    const canReview = useCan("proof_of_service", "update");
    // Server-side status switch — the proofs route filters by ?status=.
    const [status, setStatus] = useState<"submitted" | "approved" | "rejected">("submitted");
    const { items, state, errorMsg, reload } = useAdminList<ProofRow>(
        `/api/admin/proofs?status=${status}`,
        "proofs",
        "/admin/proofs"
    );

    const table = useClientTable(items, {
        searchKeys: ["vendor_name", "redemption_id"],
        pageSize: 15,
    });

    // Per-tab counts. The list endpoint only returns the SELECTED status (with a
    // `total`), so the three queue sizes are fetched in parallel — once on mount
    // and again after each decision, since approving/rejecting moves a row between
    // queues. A head-only `total` per status keeps this cheap.
    const STATUSES = ["submitted", "approved", "rejected"] as const;
    const [counts, setCounts] = useState<Record<string, number>>({});
    const loadCounts = useCallback(async () => {
        const pairs = await Promise.all(
            STATUSES.map(async (s) => {
                const res = await fetch(`/api/admin/proofs?status=${s}`, { cache: "no-store" });
                if (!res.ok) return [s, undefined] as const;
                const body = (await res.json().catch(() => ({}))) as { total?: number };
                return [s, body.total] as const;
            })
        );
        setCounts((prev) => {
            const next = { ...prev };
            for (const [s, n] of pairs) if (n != null) next[s] = n;
            return next;
        });
        // STATUSES is a stable literal tuple — intentionally omitted from deps.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        void loadCounts();
    }, [loadCounts]);

    const decide = useAction({
        method: "PATCH",
        endpoint: (id) => `/api/admin/proofs/${id}/decide`,
        onDone: async () => {
            await Promise.all([reload(), loadCounts()]);
            drawer.close();
        },
        successMessage: () => "Proof decision recorded.",
    });

    const drawer = useDetailDrawer<ProofRow>();
    const p = drawer.selected;

    const sections: DetailSection[] = p
        ? [
              { label: "Vendor", value: p.vendor_name },
              { label: "Redemption", value: p.redemption_id, mono: true },
              { label: "Token value", value: rupee(p.token_value_inr) },
              { label: "Menu value", value: rupee(p.menu_value_inr) },
              { label: "Payout if approved", value: rupee(p.settlement_amount_inr) },
              { label: "Payment", value: p.payment_status },
              { label: "Redeemed", value: date(p.redeemed_at) },
              { label: "Proof uploaded", value: date(p.proof_uploaded_at) },
              ...(p.proof_review_note ? [{ label: "Review note", value: p.proof_review_note, full: true }] : []),
          ]
        : [];

    function approve(id: string) {
        decide.run(id, { decision: "approve" }, `Approve this proof and release ${rupee(p?.settlement_amount_inr)} for settlement?`);
    }
    function reject(id: string) {
        const note = window.prompt("Reason for rejecting this proof (the vendor will see it):");
        if (note == null) return;
        if (!note.trim()) {
            window.alert("A rejection reason is required.");
            return;
        }
        decide.run(id, { decision: "reject", note: note.trim() });
    }

    const tabs = [
        { label: "Submitted", value: "submitted", count: counts.submitted },
        { label: "Approved", value: "approved", count: counts.approved },
        { label: "Rejected", value: "rejected", count: counts.rejected },
    ];

    return (
        <div>
            <AdminPageHeader
                title="Proof review"
                subtitle="Verify each vendor's plate photo + receipt. Click a row to review the full-size evidence; approving releases the locked payment for settlement."
                count={state === "ready" ? items.length : undefined}
            />

            <FilterBar
                search={table.search}
                onSearch={table.setSearch}
                searchPlaceholder="Search by vendor or redemption…"
                tabs={tabs}
                activeTab={status}
                onTab={(v) => setStatus(v as typeof status)}
            />

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel={`${status} proofs`}
                emptyHint="When vendors upload proof for a redemption, it appears here for approval before any payout."
                table={
                    <>
                        <TableShell>
                            <TableHead columns={["Vendor", "Redemption", "Payout", "Uploaded", "Proof", "Status"]} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((p) => (
                                    <tr
                                        key={p.redemption_id}
                                        onClick={() => drawer.openRow(p)}
                                        className="cursor-pointer hover:bg-slate-50"
                                    >
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                            <Dash>{p.vendor_name}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 font-mono text-xs text-slate-600">
                                            {p.redemption_id.slice(0, 8)}…
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-700">{rupee(p.settlement_amount_inr)}</td>
                                        <td className="px-2 md:px-4 py-3 text-xs text-slate-500">
                                            {p.proof_uploaded_at
                                                ? new Date(p.proof_uploaded_at).toLocaleDateString("en-IN")
                                                : "—"}
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <div className="flex gap-2">
                                                <ProofThumb label="Plate" url={p.photo_url} />
                                                <ProofThumb label="Receipt" url={p.receipt_url} />
                                            </div>
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={p.proof_status ?? "—"} />
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
                title={p?.vendor_name ?? "Proof review"}
                subtitle="Plate photo + receipt"
                status={p?.proof_status ?? undefined}
                sections={sections}
                actions={
                    canReview && p && p.proof_status === "submitted" ? (
                        <>
                            <ActionButton
                                tone="primary"
                                disabled={decide.busyId === p.redemption_id}
                                onClick={() => approve(p.redemption_id)}
                            >
                                Approve & release
                            </ActionButton>
                            <ActionButton
                                tone="danger"
                                disabled={decide.busyId === p.redemption_id}
                                onClick={() => reject(p.redemption_id)}
                            >
                                Reject
                            </ActionButton>
                        </>
                    ) : null
                }
            >
                {p && (
                    <div className="grid grid-cols-2 gap-3">
                        <ProofImage label="Plate photo" url={p.photo_url} />
                        <ProofImage label="Receipt" url={p.receipt_url} />
                    </div>
                )}
            </DetailDrawer>
        </div>
    );
}

/** A small clickable proof thumbnail (opens full image in a new tab). */
function ProofThumb({ label, url }: { label: string; url: string | null }) {
    if (!url) {
        return (
            <span className="flex h-14 w-14 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[9px] text-slate-400">
                no {label.toLowerCase()}
            </span>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={url}
            alt={`${label} proof`}
            className="h-14 w-14 rounded-md border border-slate-200 object-cover"
        />
    );
}

/** Full-size proof image inside the review drawer (click to open original). */
function ProofImage({ label, url }: { label: string; url: string | null }) {
    return (
        <div>
            <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
            {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" title={`Open ${label}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={url}
                        alt={`${label} proof`}
                        className="h-48 w-full rounded-lg border border-slate-200 object-cover transition hover:ring-2 hover:ring-slate-400"
                    />
                </a>
            ) : (
                <div className="flex h-48 w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
                    no {label.toLowerCase()}
                </div>
            )}
        </div>
    );
}
