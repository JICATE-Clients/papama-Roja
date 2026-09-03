"use client";

import { useEffect, useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import { inr, shortDate } from "@/lib/format";
import type { PaymentFailureResponse, RefundResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    ListStates,
    SectionHeading,
    StatusBadge,
    TableHead,
    TableShell,
    useAction,
    useAdminList,
} from "../_ui";

/** Why the payment failed, in words an admin can act on rather than an enum. */
const FAILURE_REASON_LABEL: Record<string, string> = {
    gateway_failed: "Gateway failed",
    duplicate_charge: "Duplicate charge",
    chargeback: "Chargeback",
    other: "Other",
};

/** A donation an admin can log a failure against (from /api/admin/donations). */
type DonationOption = {
    id: string;
    amount_inr: number;
    donor_label: string;
    created_at: string;
    is_guest: boolean;
};

/**
 * Admin refunds — the failed-payment reconciliation queue and the refund
 * decisions that hang off it (addon #14/#20).
 *
 * The two tables are deliberately on one page and in this order: a refund
 * cannot exist without a payment failure behind it (`refunds.payment_failure_id`
 * is NOT NULL by design — the schema-level enforcement of "refunds only for
 * failed/duplicate payments, never voluntary withdrawal"). Splitting them across
 * two pages would hide that dependency from the person deciding.
 *
 * Approving reverses donor credit and posts a ledger reversal, so it is
 * confirmed; rejecting requires a note (the route refuses one without).
 */
export default function AdminRefundsPage() {
    const canDecide = useCan("refunds_failed_payments", "update");
    const canLog = useCan("refunds_failed_payments", "create");
    const [showLog, setShowLog] = useState(false);

    const refunds = useAdminList<RefundResponse>("/api/admin/refunds", "refunds", "/admin/refunds");
    const failures = useAdminList<PaymentFailureResponse>(
        "/api/admin/payment-failures",
        "payment_failures",
        "/admin/refunds"
    );

    const reloadBoth = async () => {
        await Promise.all([refunds.reload(), failures.reload()]);
    };

    // Rejecting needs a reason on the record, so the button opens a note field
    // rather than firing straight away.
    const [rejecting, setRejecting] = useState<Record<string, string>>({});

    const decide = useAction({
        method: "PATCH",
        endpoint: (id) => `/api/admin/refunds/${id}`,
        onDone: reloadBoth,
        successMessage: (d) =>
            d.status === "completed" ? "Refund approved — credit reversed." : "Refund rejected.",
    });

    const approve = (id: string, amount: number, donor: string) =>
        decide.run(
            id,
            { decision: "approve" },
            `Approve this refund? ${inr(amount)} of ${donor}'s credit will be reversed and posted to the ledger.`
        );

    const reject = (id: string) => {
        const note = (rejecting[id] ?? "").trim();
        if (!note) return;
        void decide.run(id, { decision: "reject", note }).then(() => {
            setRejecting((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        });
    };

    // Dismissing a failure also needs a reason on the record, so it opens a note
    // field rather than firing straight away — same shape as rejecting a refund.
    const [dismissing, setDismissing] = useState<Record<string, string>>({});

    const dismiss = useAction({
        method: "PATCH",
        endpoint: () => "/api/admin/payment-failures",
        onDone: reloadBoth,
        successMessage: () => "Payment failure dismissed.",
    });

    const runDismiss = (id: string) => {
        const note = (dismissing[id] ?? "").trim();
        if (!note) return;
        void dismiss.run(id, { payment_failure_id: id, note }).then(() => {
            setDismissing((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        });
    };

    const pendingCount = useMemo(
        () => refunds.items.filter((r) => r.status === "pending").length,
        [refunds.items]
    );
    const openFailures = useMemo(
        () => failures.items.filter((f) => f.status === "open" && !f.has_refund).length,
        [failures.items]
    );

    // Amount is hidden below md and reprinted under the donor name instead:
    // measured, four columns of this content need 427px inside a 358px card on a
    // 390px phone. Who and how much are the two that must survive; the decision
    // buttons cannot be the thing that drops, since that is the page's whole job.
    const refundColumns = ["Donor", "Amount", "Payment failed", "Donor’s reason", "Status", "Requested"];
    if (canDecide) refundColumns.push("Actions");

    const failureColumns = ["Donor", "Amount", "Reason", "Status", "Retries", "Logged"];
    if (canDecide) failureColumns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Refunds"
                subtitle="Failed or duplicate payments, and the refund requests raised against them. Approving reverses donor credit and posts a ledger entry — it does not send money to a bank account."
                count={refunds.state === "ready" ? pendingCount : undefined}
                action={
                    canLog ? (
                        <button
                            type="button"
                            onClick={() => setShowLog((o) => !o)}
                            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
                        >
                            {showLog ? "Cancel" : "Log a payment failure"}
                        </button>
                    ) : null
                }
            />

            {canLog && showLog && (
                <LogFailureForm
                    onDone={() => {
                        setShowLog(false);
                        void reloadBoth();
                    }}
                />
            )}

            <SectionHeading
                title="Refund requests"
                subtitle={
                    pendingCount > 0
                        ? `${pendingCount} awaiting a decision.`
                        : "Nothing awaiting a decision."
                }
            />
            <ListStates
                state={refunds.state}
                errorMsg={refunds.errorMsg}
                isEmpty={refunds.items.length === 0}
                resourceLabel="refund requests"
                emptyHint="A donor raises a request against one of their failed payments; it lands here for a decision."
                table={
                    <TableShell hideCols={[2, 3, 4, 6]}>
                        <TableHead columns={refundColumns} />
                        <tbody className="divide-y divide-slate-100">
                            {refunds.items.map((r) => (
                                <tr key={r.id} className="align-top">
                                    <td className="px-2 py-3 font-medium text-slate-900 md:px-4">
                                        {r.donor_label}
                                        <span className="mt-0.5 block tabular-nums font-normal text-slate-500 md:hidden">
                                            {inr(r.amount_inr)}
                                        </span>
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-3 tabular-nums text-slate-700 md:px-4">
                                        {inr(r.amount_inr)}
                                    </td>
                                    <td className="px-2 py-3 text-slate-600 md:px-4">
                                        {r.payment_failure_reason
                                            ? FAILURE_REASON_LABEL[r.payment_failure_reason]
                                            : "—"}
                                    </td>
                                    <td className="px-2 py-3 text-slate-600 md:px-4">
                                        <Dash>{r.reason}</Dash>
                                    </td>
                                    <td className="px-2 py-3 md:px-4">
                                        <StatusBadge value={r.status} />
                                        {r.decision_note && (
                                            <p className="mt-1 hidden max-w-[22ch] text-[11px] leading-snug text-slate-400 md:block">
                                                {r.decision_note}
                                            </p>
                                        )}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-3 text-slate-500 md:px-4">
                                        {shortDate(r.created_at)}
                                    </td>
                                    {canDecide && (
                                        <td className="px-2 py-3 md:px-4">
                                            {r.status !== "pending" ? (
                                                <span className="text-xs text-slate-400">—</span>
                                            ) : rejecting[r.id] != null ? (
                                                <div className="flex flex-col gap-1.5">
                                                    <input
                                                        type="text"
                                                        autoFocus
                                                        aria-label="Reason for rejecting"
                                                        value={rejecting[r.id]}
                                                        onChange={(e) =>
                                                            setRejecting((prev) => ({
                                                                ...prev,
                                                                [r.id]: e.target.value,
                                                            }))
                                                        }
                                                        placeholder="Why is this rejected?"
                                                        className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
                                                    />
                                                    <div className="flex gap-1.5">
                                                        <ActionButton
                                                            tone="danger"
                                                            disabled={
                                                                decide.busyId === r.id ||
                                                                !rejecting[r.id].trim()
                                                            }
                                                            onClick={() => reject(r.id)}
                                                        >
                                                            Confirm
                                                        </ActionButton>
                                                        <ActionButton
                                                            tone="neutral"
                                                            disabled={decide.busyId === r.id}
                                                            onClick={() =>
                                                                setRejecting((prev) => {
                                                                    const next = { ...prev };
                                                                    delete next[r.id];
                                                                    return next;
                                                                })
                                                            }
                                                        >
                                                            Cancel
                                                        </ActionButton>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    <ActionButton
                                                        tone="primary"
                                                        disabled={decide.busyId === r.id}
                                                        onClick={() =>
                                                            approve(r.id, r.amount_inr, r.donor_label)
                                                        }
                                                    >
                                                        Approve
                                                    </ActionButton>
                                                    <ActionButton
                                                        tone="danger"
                                                        disabled={decide.busyId === r.id}
                                                        onClick={() =>
                                                            setRejecting((prev) => ({ ...prev, [r.id]: "" }))
                                                        }
                                                    >
                                                        Reject
                                                    </ActionButton>
                                                </div>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                }
            />

            <div className="mt-8">
                <SectionHeading
                    title="Payment failures"
                    subtitle={
                        openFailures > 0
                            ? `${openFailures} open with no refund request yet.`
                            : "No open failures without a request."
                    }
                />
                <ListStates
                    state={failures.state}
                    errorMsg={failures.errorMsg}
                    isEmpty={failures.items.length === 0}
                    resourceLabel="payment failures"
                    emptyHint="Phase 1 has no gateway webhook, so failures are logged here by hand during reconciliation."
                    table={
                        <TableShell hideCols={[2, 3, 5, 6]}>
                            <TableHead columns={failureColumns} />
                            <tbody className="divide-y divide-slate-100">
                                {failures.items.map((f) => (
                                    <tr key={f.id}>
                                        <td className="px-2 py-3 font-medium text-slate-900 md:px-4">
                                            {f.donor_label}
                                            {/* Amount AND reason ride here below md: adding the
                                                Dismiss column pushed a four-column table to 421px
                                                inside a 358px card. */}
                                            <span className="mt-0.5 block font-normal text-slate-500 md:hidden">
                                                <span className="tabular-nums">{inr(f.amount_inr)}</span>
                                                {" · "}
                                                {FAILURE_REASON_LABEL[f.reason] ?? f.reason}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-3 tabular-nums text-slate-700 md:px-4">
                                            {inr(f.amount_inr)}
                                        </td>
                                        <td className="px-2 py-3 text-slate-600 md:px-4">
                                            {FAILURE_REASON_LABEL[f.reason] ?? f.reason}
                                        </td>
                                        <td className="px-2 py-3 md:px-4">
                                            <StatusBadge value={f.status} />
                                            {f.has_refund && (
                                                <p className="mt-1 text-[11px] text-slate-400">
                                                    refund requested
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-2 py-3 tabular-nums text-slate-500 md:px-4">
                                            {f.retry_count}
                                            {f.max_retries != null ? ` / ${f.max_retries}` : ""}
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-3 text-slate-500 md:px-4">
                                            {shortDate(f.created_at)}
                                        </td>
                                        {canDecide && (
                                            <td className="px-2 py-3 md:px-4">
                                                {f.status !== "open" || f.has_refund ? (
                                                    <span className="text-xs text-slate-400">—</span>
                                                ) : dismissing[f.id] != null ? (
                                                    <div className="flex flex-col gap-1.5">
                                                        <input
                                                            type="text"
                                                            autoFocus
                                                            aria-label="Reason for dismissing"
                                                            value={dismissing[f.id]}
                                                            onChange={(e) =>
                                                                setDismissing((prev) => ({
                                                                    ...prev,
                                                                    [f.id]: e.target.value,
                                                                }))
                                                            }
                                                            placeholder="Why is this not a failure?"
                                                            className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
                                                        />
                                                        <div className="flex gap-1.5">
                                                            <ActionButton
                                                                tone="warn"
                                                                disabled={
                                                                    dismiss.busyId === f.id ||
                                                                    !dismissing[f.id].trim()
                                                                }
                                                                onClick={() => runDismiss(f.id)}
                                                            >
                                                                Confirm
                                                            </ActionButton>
                                                            <ActionButton
                                                                tone="neutral"
                                                                disabled={dismiss.busyId === f.id}
                                                                onClick={() =>
                                                                    setDismissing((prev) => {
                                                                        const next = { ...prev };
                                                                        delete next[f.id];
                                                                        return next;
                                                                    })
                                                                }
                                                            >
                                                                Cancel
                                                            </ActionButton>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <ActionButton
                                                        tone="neutral"
                                                        disabled={dismiss.busyId === f.id}
                                                        onClick={() =>
                                                            setDismissing((prev) => ({ ...prev, [f.id]: "" }))
                                                        }
                                                    >
                                                        Dismiss
                                                    </ActionButton>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </TableShell>
                    }
                />
            </div>
        </div>
    );
}

/**
 * Log a failed or duplicate charge against a donation. The donation carries the
 * donor and the amount, so neither is typed in — re-keying them is how a failure
 * record ends up disagreeing with the donation it describes. Guest-pool
 * donations are excluded: there is no donor whose credit could be reversed.
 */
function LogFailureForm({ onDone }: { onDone: () => void }) {
    const [donations, setDonations] = useState<DonationOption[]>([]);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [donationId, setDonationId] = useState("");
    const [reason, setReason] = useState("gateway_failed");
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/admin/donations", { cache: "no-store", credentials: "same-origin" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((body: { donations: DonationOption[] }) => {
                if (cancelled) return;
                setDonations((body.donations ?? []).filter((d) => !d.is_guest));
                setLoadState("ready");
            })
            .catch(() => !cancelled && setLoadState("error"));
        return () => {
            cancelled = true;
        };
    }, []);

    async function submit() {
        setErr(null);
        if (!donationId) {
            setErr("Pick the donation that failed.");
            return;
        }
        setBusy(true);
        try {
            const res = await fetch("/api/admin/payment-failures", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    donation_id: donationId,
                    reason,
                    notes: notes.trim() || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not log the failure.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-1 text-sm font-medium text-slate-700">Log a payment failure</p>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
                Phase 1 has no payment-gateway webhook, so a failed or duplicated charge is recorded
                here by hand. The donor and the amount come from the donation. Logging a failure does
                not refund anything — it opens the door for the donor to request one.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs text-slate-600 sm:col-span-2">
                    Donation
                    <select
                        value={donationId}
                        onChange={(e) => setDonationId(e.target.value)}
                        disabled={busy || loadState !== "ready"}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    >
                        <option value="">
                            {loadState === "loading"
                                ? "Loading donations…"
                                : loadState === "error"
                                  ? "Couldn’t load donations"
                                  : "Select a donation…"}
                        </option>
                        {donations.map((d) => (
                            <option key={d.id} value={d.id}>
                                {inr(d.amount_inr)} · {d.donor_label} · {shortDate(d.created_at)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs text-slate-600">
                    Reason
                    <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={busy}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    >
                        {Object.entries(FAILURE_REASON_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs text-slate-600 sm:col-span-2 lg:col-span-3">
                    Notes (optional)
                    <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        disabled={busy}
                        placeholder="Bank reference, ticket number, what the donor reported…"
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    />
                </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={submit}
                    disabled={busy || loadState !== "ready"}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                    {busy ? "Logging…" : "Log failure"}
                </button>
                {err && <span className="text-xs font-medium text-red-700">{err}</span>}
            </div>
        </div>
    );
}
