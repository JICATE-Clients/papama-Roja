"use client";

import { useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";

import {
    AdminPageHeader,
    BoolBadge,
    Dash,
    FilterBar,
    ListStates,
    Notice,
    Pagination,
    SectionHeading,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useClientTable,
} from "../_ui";

type VendorQuality = {
    vendor_id: string;
    name: string;
    status: string;
    rating_avg: number | null;
    feedback_count: number;
    complaint_count: number;
    quality_score: number | null;
};

type FeedbackRow = {
    id: string;
    vendor_id: string;
    vendor_name: string | null;
    rating: number;
    comment: string | null;
    is_complaint: boolean;
    created_at: string;
};

type InspectionRow = {
    id: string;
    vendor_id: string;
    vendor_name: string | null;
    inspection_date: string;
    hygiene_score: number | null;
    passed: boolean | null;
    notes: string | null;
    created_at: string;
};

function Stars({ rating }: { rating: number }) {
    return (
        <span className="text-amber-500" aria-label={`${rating} out of 5`}>
            {"★".repeat(rating)}
            <span className="text-slate-300">{"★".repeat(Math.max(0, 5 - rating))}</span>
        </span>
    );
}

function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
}

/** Admin vendor feedback, quality summary, auto-suspend review + surprise inspections (addon #9). */
export default function AdminVendorFeedbackPage() {
    const canManage = useCan("vendor_management", "create");

    // Both arrays come from the same endpoint; two small reads keeps the state
    // machine (loading/forbidden/error) trivial and consistent.
    const quality = useAdminList<VendorQuality>("/api/admin/vendor-feedback", "vendors", "/admin/vendor-feedback");
    const feedback = useAdminList<FeedbackRow>("/api/admin/vendor-feedback", "feedback", "/admin/vendor-feedback");
    const feedbackTable = useClientTable(feedback.items, {
        searchKeys: ["vendor_name", "comment"],
        pageSize: 12,
    });
    /*
     * "Recent feedback" and "Inspections" are append-only logs — they only ever
     * get longer. Both shipped rendering every row with no search and no paging.
     * The vendor-quality table above is bounded by the vendor count, so it is
     * left as a full list on purpose.
     */
    const inspections = useAdminList<InspectionRow>(
        "/api/admin/vendor-inspections",
        "inspections",
        "/admin/vendor-feedback"
    );

    const rankedVendors = useMemo(
        () => quality.items.filter((v) => v.feedback_count > 0),
        [quality.items]
    );

    return (
        <div className="space-y-10">
            <AdminPageHeader
                title="Vendor feedback"
                subtitle="Beneficiary ratings, complaints and surprise inspections. Auto-suspend (when enabled) acts on the quality summary below."
            />

            {/* Quality summary --------------------------------------------------- */}
            <section>
                <SectionHeading
                    title="Quality summary"
                    subtitle="Aggregated rating and complaint signals per vendor (only vendors with feedback)."
                />
                <ListStates
                    state={quality.state}
                    errorMsg={quality.errorMsg}
                    isEmpty={rankedVendors.length === 0}
                    resourceLabel="vendor quality"
                    emptyHint="Once beneficiaries rate vendors, their quality scores appear here."
                    table={
                        <TableShell hideCols={[3, 4, 5]}>
                            <TableHead
                                columns={["Vendor", "Status", "Avg rating", "Feedback", "Complaints", "Quality score"]}
                            />
                            <tbody className="divide-y divide-slate-100">
                                {rankedVendors.map((v) => (
                                    <tr key={v.vendor_id} className="hover:bg-slate-50">
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                            <Dash>{v.name}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={v.status} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-700">
                                            {v.rating_avg != null ? v.rating_avg.toFixed(2) : "—"}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-700">{v.feedback_count}</td>
                                        <td className="px-2 md:px-4 py-3 text-slate-700">{v.complaint_count}</td>
                                        <td className="px-2 md:px-4 py-3 text-slate-700">
                                            {v.quality_score != null ? v.quality_score.toFixed(1) : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableShell>
                    }
                />
            </section>

            {/* Feedback log ------------------------------------------------------ */}
            <section>
                <SectionHeading title="Recent feedback" subtitle="Latest beneficiary ratings and complaints." />

                {feedback.state === "ready" && feedback.items.length > 0 && (
                    <FilterBar
                        search={feedbackTable.search}
                        onSearch={feedbackTable.setSearch}
                        searchPlaceholder="Search feedback by vendor or comment…"
                    />
                )}
                <ListStates
                    state={feedback.state}
                    errorMsg={feedback.errorMsg}
                    isEmpty={feedback.items.length === 0}
                    resourceLabel="feedback"
                    emptyHint="Beneficiary feedback will appear here as it arrives."
                    table={
                        <>
                        <TableShell hideCols={[1, 4]}>
                            <TableHead columns={["Date", "Vendor", "Rating", "Complaint", "Comment"]} />
                            <tbody className="divide-y divide-slate-100">
                                {feedbackTable.rows.map((f) => (
                                    <tr key={f.id} className="hover:bg-slate-50">
                                        <td className="px-2 md:px-4 py-3 text-slate-500">{fmtDate(f.created_at)}</td>
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                            <Dash>{f.vendor_name}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <Stars rating={f.rating} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <BoolBadge value={f.is_complaint} yes="Complaint" no="—" danger />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <Dash>{f.comment}</Dash>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableShell>
                        <Pagination
                            page={feedbackTable.page}
                            pageCount={feedbackTable.pageCount}
                            onPage={feedbackTable.setPage}
                        />
                        </>
                    }
                />
            </section>

            {/* Surprise inspections --------------------------------------------- */}
            <section>
                <SectionHeading
                    title="Surprise inspections"
                    subtitle="Staff-recorded hygiene/quality inspections."
                />

                {canManage && (
                    <InspectionForm
                        vendors={quality.items}
                        onDone={() => {
                            void inspections.reload();
                        }}
                    />
                )}

                <ListStates
                    state={inspections.state}
                    errorMsg={inspections.errorMsg}
                    isEmpty={inspections.items.length === 0}
                    resourceLabel="inspections"
                    emptyHint="Recorded inspections will appear here."
                    table={
                        <TableShell hideCols={[1, 5]}>
                            <TableHead columns={["Date", "Vendor", "Hygiene", "Result", "Notes"]} />
                            <tbody className="divide-y divide-slate-100">
                                {inspections.items.map((r) => (
                                    <tr key={r.id} className="hover:bg-slate-50">
                                        <td className="px-2 md:px-4 py-3 text-slate-500">{fmtDate(r.inspection_date)}</td>
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                            <Dash>{r.vendor_name}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-700">
                                            {r.hygiene_score != null ? `${r.hygiene_score}/5` : "—"}
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            {r.passed == null ? (
                                                <span className="text-slate-400">—</span>
                                            ) : (
                                                <BoolBadge value={r.passed} yes="Passed" no="Failed" danger={!r.passed} />
                                            )}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            <Dash>{r.notes}</Dash>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableShell>
                    }
                />
            </section>
        </div>
    );
}

function InspectionForm({
    vendors,
    onDone,
}: {
    vendors: VendorQuality[];
    onDone: () => void;
}) {
    const [vendorId, setVendorId] = useState("");
    const [hygiene, setHygiene] = useState("");
    const [passed, setPassed] = useState<"" | "true" | "false">("");
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [ok, setOk] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null);
        setOk(false);
        if (!vendorId) {
            setErr("Choose a vendor.");
            return;
        }
        const payload: Record<string, unknown> = { vendor_id: vendorId };
        if (hygiene) payload.hygiene_score = Number(hygiene);
        if (passed) payload.passed = passed === "true";
        if (notes.trim()) payload.notes = notes.trim();

        setBusy(true);
        try {
            const res = await fetch("/api/admin/vendor-inspections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            setOk(true);
            setVendorId("");
            setHygiene("");
            setPassed("");
            setNotes("");
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to record inspection.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form
            onSubmit={submit}
            className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
        >
            <p className="mb-3 text-sm font-medium text-slate-700">Record an inspection</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <select
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                >
                    <option value="">Select vendor…</option>
                    {vendors.map((v) => (
                        <option key={v.vendor_id} value={v.vendor_id}>
                            {v.name}
                        </option>
                    ))}
                </select>
                <select
                    value={hygiene}
                    onChange={(e) => setHygiene(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                >
                    <option value="">Hygiene score…</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                            {n} / 5
                        </option>
                    ))}
                </select>
                <select
                    value={passed}
                    onChange={(e) => setPassed(e.target.value as "" | "true" | "false")}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                >
                    <option value="">Result…</option>
                    <option value="true">Passed</option>
                    <option value="false">Failed</option>
                </select>
                <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                    {busy ? "Recording…" : "Record inspection"}
                </button>
                {ok && <span className="text-xs font-medium text-green-700">Recorded.</span>}
                {err && <span className="text-xs font-medium text-red-700">{err}</span>}
            </div>
            {vendors.length === 0 && (
                <div className="mt-3">
                    <Notice tone="info" title="No vendors yet">
                        Vendors must be onboarded before an inspection can be recorded.
                    </Notice>
                </div>
            )}
        </form>
    );
}
