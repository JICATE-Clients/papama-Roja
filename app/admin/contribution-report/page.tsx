"use client";

import { useEffect, useState } from "react";

import { inr } from "@/lib/format";

import { AdminPageHeader, Notice, SkeletonTable, StatTile } from "../_ui";

/**
 * Contribution report (F-1 / B-01, CD §D-1's seven lines).
 *
 * The client's four principles behind these numbers:
 *   1. the ₹10 is a contribution to pApAmA, NOT Food Partner revenue;
 *   2. the Food Partner collects it only as pApAmA's authorised agent;
 *   3. a settlement is released only once it is received/reconciled;
 *   4. waiver recording and reconciliation must exist in Phase 1.
 *
 * EXPECTED AND COLLECTED ARE SHOWN SEPARATELY ON PURPOSE. The gap between them
 * is the shortfall — money policy said was due that nobody handed over.
 * Collapsing them into one figure would hide the number this report exists to
 * surface.
 *
 * REMITTED is what Food Partners have DECLARED; RECEIVED is what pApAmA has
 * confirmed. A declaration is not a receipt, and only the second releases a
 * settlement.
 */

interface Report {
    expected: number;
    collected: number;
    remitted: number;
    received_reconciled: number;
    outstanding: number;
    waived: number;
    finally_settled: number;
    period: { from: string | null; to: string | null };
}

export default function AdminContributionReportPage() {
    const [report, setReport] = useState<Report | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const res = await fetch("/api/admin/contribution-report", {
                    cache: "no-store",
                    credentials: "same-origin",
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    if (active) setError(body.error ?? `Couldn’t load the report (${res.status})`);
                    return;
                }
                const body = (await res.json()) as { report: Report };
                if (active) setReport(body.report);
            } catch {
                if (active) setError("Couldn’t reach the server.");
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    const shortfall = report ? report.expected - report.collected : 0;
    const accounted = report
        ? report.received_reconciled + report.outstanding + report.waived
        : 0;
    const balances = report ? accounted === report.expected : true;

    return (
        <div className="mx-auto max-w-6xl">
            <AdminPageHeader
                title="Beneficiary contribution"
                subtitle="The ₹10 contribution — expected, collected, remitted, reconciled, outstanding, waived and settled."
            />

            {error && (
                <div className="mb-5">
                    <Notice tone="error" title="Couldn’t load the report">
                        {error}
                    </Notice>
                </div>
            )}

            {loading && <SkeletonTable />}

            {report && (
                <>
                    {/* An invariant worth leading with: every rupee expected must
                        sit in exactly one of received / outstanding / waived. If
                        it doesn't, the report is wrong and nothing below it can
                        be trusted. */}
                    <div className="mb-6">
                        {balances ? (
                            <Notice tone="ok" title="The report reconciles">
                                Every rupee expected is accounted for as received, outstanding or
                                waived.
                            </Notice>
                        ) : (
                            <Notice tone="error" title="The report does NOT reconcile">
                                {inr(report.expected)} expected but {inr(accounted)} accounted for.
                                Investigate before relying on these figures.
                            </Notice>
                        )}
                    </div>

                    <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <StatTile label="Expected" value={inr(report.expected)} />
                        <StatTile label="Collected at the till" value={inr(report.collected)} />
                        <StatTile label="Remitted (declared)" value={inr(report.remitted)} />
                        <StatTile
                            label="Received & reconciled"
                            value={inr(report.received_reconciled)}
                        />
                    </section>

                    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <StatTile label="Outstanding" value={inr(report.outstanding)} />
                        <StatTile label="Waived" value={inr(report.waived)} />
                        <StatTile label="Finally settled" value={inr(report.finally_settled)} />
                        <StatTile label="Shortfall at the till" value={inr(shortfall)} />
                    </section>

                    <div className="mt-8 space-y-3 text-sm text-slate-600">
                        <p>
                            <strong className="text-slate-800">Outstanding blocks payment.</strong>{" "}
                            A settlement cannot be paid while any of its lines has an unreconciled
                            contribution — the Food Partner holds that money as pApAmA&apos;s agent
                            until it is remitted and confirmed.
                        </p>
                        <p>
                            <strong className="text-slate-800">
                                Remitted is not the same as received.
                            </strong>{" "}
                            A Food Partner declaring a remittance is a claim; reconciliation is
                            pApAmA confirming it arrived. Only the second releases a settlement.
                        </p>
                        <p>
                            <strong className="text-slate-800">Shortfall</strong> is what policy
                            said was due minus what was actually handed over at the counter. It is
                            shown separately so it cannot hide inside the totals.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
