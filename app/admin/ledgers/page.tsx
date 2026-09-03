"use client";

import { useCallback, useEffect, useState } from "react";

import { inr } from "@/lib/format";

import {
    AdminPageHeader,
    Dash,
    DetailDrawer,
    ListStates,
    Notice,
    SectionHeading,
    StatTile,
    TableHead,
    TableShell,
} from "../_ui";

type LedgerName = "donation" | "vendor_payable" | "revenue";

type LedgerEntry = {
    id: string;
    ledger: LedgerName;
    amount: number;
    reference_type: string;
    reference_id: string;
    description: string | null;
    created_at: string;
};

type Reconciliation = {
    donation: number;
    vendor_payable: number;
    revenue: number;
    balanced: boolean;
    discrepancy: number;
};

const LEDGERS: { key: LedgerName; label: string; blurb: string }[] = [
    { key: "donation", label: "Donation", blurb: "Money in — every credited rupee." },
    {
        key: "vendor_payable",
        label: "Vendor payable",
        blurb: "Money owed to vendors: accrued on an approved meal, cleared when a settlement pays out.",
    },
    {
        key: "revenue",
        label: "Revenue",
        blurb: "What the platform keeps — forfeited balances and the like.",
    },
];

/** `credit_transaction` → `Credit transaction`. */
function sourceLabel(referenceType: string): string {
    const words = referenceType.replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "24 Aug" — the phone-width stamp; the full one returns at md (cf. audit-logs). */
function stampShort(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? "—"
        : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/** A stamped date-time that lines up in a column. */
function stamp(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/**
 * Admin ledgers — the triple-ledger money trail (addon #18) and the
 * reconciliation check on top of it.
 *
 * The point of the page is the invariant: `donation == vendor_payable + revenue`.
 * It leads with that answer rather than burying it under the rows, because a
 * balanced ledger is the claim an auditor is here to test — the entries below
 * exist to show the working.
 *
 * Clicking an entry traces its reference across all three ledgers, which is the
 * "follow one donation to the vendor who got paid for it" story end to end.
 *
 * Nothing on this page mutates: `ledger_entries` is append-only by schema (no
 * update or delete policy at all), so a correction is a new offsetting entry
 * posted by the service that caused it, never an edit made here.
 */
export default function AdminLedgersPage() {
    const [recon, setRecon] = useState<Reconciliation | null>(null);
    const [reconState, setReconState] = useState<"loading" | "ready" | "error">("loading");

    const [active, setActive] = useState<LedgerName>("donation");
    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/admin/ledgers/reconcile", { cache: "no-store", credentials: "same-origin" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((body: Reconciliation) => {
                if (cancelled) return;
                setRecon(body);
                setReconState("ready");
            })
            .catch(() => !cancelled && setReconState("error"));
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/admin/ledgers?ledger=${active}`, { cache: "no-store", credentials: "same-origin" })
            .then(async (r) => {
                if (cancelled) return;
                if (r.status === 403) {
                    setState("forbidden");
                    return;
                }
                const body = await r.json().catch(() => ({}));
                if (!r.ok) {
                    setErrorMsg(body.error ?? `Request failed (${r.status})`);
                    setState("error");
                    return;
                }
                setEntries(body.entries ?? []);
                setState("ready");
            })
            .catch(() => {
                if (cancelled) return;
                setErrorMsg("Network error — please try again.");
                setState("error");
            });
        return () => {
            cancelled = true;
        };
    }, [active]);

    // Tracing one reference across all three ledgers.
    const [trace, setTrace] = useState<LedgerEntry | null>(null);
    const [traceRows, setTraceRows] = useState<LedgerEntry[]>([]);
    const [traceState, setTraceState] = useState<"idle" | "loading" | "ready" | "error">("idle");

    const openTrace = useCallback((entry: LedgerEntry) => {
        setTrace(entry);
        setTraceState("loading");
        fetch(
            `/api/admin/ledgers?reference_type=${encodeURIComponent(entry.reference_type)}&reference_id=${encodeURIComponent(entry.reference_id)}`,
            { cache: "no-store", credentials: "same-origin" }
        )
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((body: { entries: LedgerEntry[] }) => {
                setTraceRows(body.entries ?? []);
                setTraceState("ready");
            })
            .catch(() => setTraceState("error"));
    }, []);

    const activeMeta = LEDGERS.find((l) => l.key === active)!;

    return (
        <div>
            <AdminPageHeader
                title="Ledgers"
                subtitle="Every rupee posts to one of three ledgers. The trail is append-only — a correction is a new offsetting entry, never an edit."
            />

            {reconState === "ready" && recon && (
                <>
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <StatTile label="Donation" value={inr(recon.donation)} small />
                        <StatTile label="Vendor payable" value={inr(recon.vendor_payable)} small />
                        <StatTile label="Revenue" value={inr(recon.revenue)} small />
                    </div>
                    <div className="mb-6">
                        {recon.balanced ? (
                            <Notice tone="ok" title="Fully distributed">
                                Every donated rupee has been paid out or forfeited — donations equal
                                vendor payouts plus revenue, to the paisa.
                            </Notice>
                        ) : recon.discrepancy > 0 ? (
                            /* Money in that has not been spent yet is the NORMAL state, not a
                               fault. Calling it a discrepancy sent an admin hunting for a missing
                               posting that was really just an undistributed balance. */
                            <Notice
                                tone="info"
                                title={`${inr(recon.discrepancy)} received and not yet distributed`}
                            >
                                Donations exceed vendor payouts plus revenue by this much, which is
                                what money still in hand looks like. It only wants investigating if
                                it does not match what you expect to be undistributed.
                            </Notice>
                        ) : (
                            /* The other direction cannot happen honestly: more has been paid out
                               and forfeited than was ever donated. */
                            <Notice
                                tone="error"
                                title={`Over-distributed by ${inr(Math.abs(recon.discrepancy))}`}
                            >
                                Vendor payouts plus revenue exceed everything ever donated, which
                                cannot happen from real activity — a payout or forfeit posted without
                                the donation behind it. Nothing here can be edited to fix it; the
                                correction is a new offsetting entry from whatever posted wrongly.
                            </Notice>
                        )}
                    </div>
                </>
            )}
            {reconState === "error" && (
                <div className="mb-6">
                    <Notice tone="warn" title="Reconciliation unavailable">
                        The balance check could not be run, so the figures above are unverified.
                    </Notice>
                </div>
            )}

            <SectionHeading title="Entries" subtitle={activeMeta.blurb} />

            <div className="mb-3 flex flex-wrap gap-1.5">
                {LEDGERS.map((l) => (
                    <button
                        key={l.key}
                        type="button"
                        onClick={() => {
                            if (l.key === active) return;
                            setState("loading");
                            setActive(l.key);
                        }}
                        aria-pressed={active === l.key}
                        className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition ${
                            active === l.key
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                    >
                        {l.label}
                    </button>
                ))}
            </div>

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={entries.length === 0}
                resourceLabel="ledger entries"
                emptyHint="Entries appear as money moves — a donation credited, a meal approved, a settlement paid."
                table={
                    <TableShell hideCols={[4, 5]}>
                        <TableHead columns={["Posted", "Amount", "Source", "Reference", "Description"]} />
                        <tbody className="divide-y divide-slate-100">
                            {entries.map((e) => (
                                <tr
                                    key={e.id}
                                    onClick={() => openTrace(e)}
                                    className="cursor-pointer hover:bg-slate-50"
                                >
                                    <td className="whitespace-nowrap px-2 py-3 text-slate-500 md:px-4">
                                        <span className="md:hidden">{stampShort(e.created_at)}</span>
                                        <span className="hidden md:inline">{stamp(e.created_at)}</span>
                                    </td>
                                    {/* Sign is the whole meaning of a ledger row, so a debit is
                                        coloured and explicitly signed rather than left to a minus
                                        that reads as a dash at 11px. */}
                                    <td
                                        className={`whitespace-nowrap px-2 py-3 font-medium tabular-nums md:px-4 ${
                                            e.amount < 0 ? "text-red-700" : "text-slate-900"
                                        }`}
                                    >
                                        {e.amount < 0 ? "−" : "+"}
                                        {inr(Math.abs(e.amount))}
                                    </td>
                                    <td className="px-2 py-3 text-slate-600 md:px-4">
                                        {sourceLabel(e.reference_type)}
                                    </td>
                                    <td className="px-2 py-3 font-mono text-[11px] text-slate-400 md:px-4">
                                        {e.reference_id.slice(0, 8)}…
                                    </td>
                                    <td className="px-2 py-3 text-slate-600 md:px-4">
                                        <Dash>{e.description}</Dash>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                }
            />

            <DetailDrawer
                open={trace != null}
                onClose={() => {
                    setTrace(null);
                    setTraceRows([]);
                    setTraceState("idle");
                }}
                title={trace ? sourceLabel(trace.reference_type) : "Trace"}
                subtitle={trace ? trace.reference_id : undefined}
                sections={[]}
            >
                <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Every entry for this reference
                    </h3>
                    {traceState === "loading" && (
                        <p className="text-xs text-slate-400">Loading the trail…</p>
                    )}
                    {traceState === "error" && (
                        <p className="text-xs text-red-700">Couldn’t load the trail.</p>
                    )}
                    {traceState === "ready" && traceRows.length === 0 && (
                        <p className="text-xs text-slate-400">No entries for this reference.</p>
                    )}
                    {traceState === "ready" && traceRows.length > 0 && (
                        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                            {traceRows.map((r) => (
                                <li key={r.id} className="px-3 py-2.5 text-xs">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="font-medium text-slate-700">
                                            {sourceLabel(r.ledger)}
                                        </span>
                                        <span
                                            className={`font-medium tabular-nums ${
                                                r.amount < 0 ? "text-red-700" : "text-slate-900"
                                            }`}
                                        >
                                            {r.amount < 0 ? "−" : "+"}
                                            {inr(Math.abs(r.amount))}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-slate-400">
                                        {stamp(r.created_at)}
                                        {r.description ? ` · ${r.description}` : ""}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </DetailDrawer>
        </div>
    );
}
