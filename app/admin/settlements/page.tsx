"use client";

import { useEffect, useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type { SettlementResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    DetailDrawer,
    FilterBar,
    ListStates,
    Pagination,
    RunJobBar,
    StatusBadge,
    TableHead,
    TableShell,
    useAction,
    useAdminList,
    useClientTable,
    useDetailDrawer,
    type DetailSection,
} from "../_ui";

type SettlementRow = SettlementResponse & { _tab: string };

interface SettlementDetail {
    settlement: SettlementResponse & {
        hold_note: string | null;
        period_start: string | null;
        period_end: string | null;
        created_at: string | null;
    };
    lines: {
        line_id: string;
        redemption_id: string | null;
        amount_inr: number;
        redeemed_at: string | null;
        menu_value_inr: number | null;
        difference_paid_inr: number | null;
        co_pay_inr: number | null;
    }[];
    payout_total: number;
}

const rupee = (n: number | null | undefined) => (n != null ? `₹${n.toLocaleString("en-IN")}` : "—");
const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : null);

/** Admin settlements — headers, payout detail, lifecycle + hold/override (contract §8). */
export default function AdminSettlementsPage() {
    const canManage = useCan("vendor_settlement", "update");
    const canRun = useCan("vendor_settlement", "create");
    const { items, state, errorMsg, reload } = useAdminList<SettlementResponse>(
        "/api/admin/settlements",
        "settlements",
        "/admin/settlements"
    );

    // A held settlement filters under "held"; otherwise by its lifecycle status.
    const rows: SettlementRow[] = useMemo(
        () => items.map((s) => ({ ...s, _tab: s.on_hold ? "held" : s.status })),
        [items]
    );

    const table = useClientTable(rows, {
        searchKeys: ["vendor_name", "vendor_id", "period"],
        tabKey: "_tab",
        pageSize: 15,
    });

    // Dashboard deep-links: ?hold=true → Held tab, ?status=X → that status tab.
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        if (q.get("hold") === "true") table.setActiveTab("held");
        else {
            const st = q.get("status");
            if (st) table.setActiveTab(st);
        }
        // run once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Pending", value: "pending", count: table.tabCounts.pending },
            { label: "Locked", value: "locked", count: table.tabCounts.locked },
            { label: "Reconciled", value: "reconciled", count: table.tabCounts.reconciled },
            { label: "Paid", value: "paid", count: table.tabCounts.paid },
            { label: "Held", value: "held", count: table.tabCounts.held },
        ],
        [table.tabCounts]
    );

    const action = useAction({
        method: "PATCH",
        endpoint: () => "/api/admin/settlements",
        onDone: reload,
        successMessage: () => "Settlement updated.",
    });

    const drawer = useDetailDrawer<SettlementResponse>();
    const [detail, setDetail] = useState<SettlementDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    useEffect(() => {
        const sel = drawer.selected;
        if (!sel) {
            setDetail(null);
            return;
        }
        let cancelled = false;
        setDetail(null);
        setDetailLoading(true);
        fetch(`/api/admin/settlements/${sel.settlement_id}`, { credentials: "same-origin", cache: "no-store" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((d: SettlementDetail) => !cancelled && setDetail(d))
            .catch(() => !cancelled && setDetail(null))
            .finally(() => !cancelled && setDetailLoading(false));
        return () => {
            cancelled = true;
        };
    }, [drawer.selected]);

    const columns = ["Vendor", "Period", "Amount", "Status", "Line items", "Settled"];

    const s = detail?.settlement;
    const sections: DetailSection[] = s
        ? [
              { label: "Vendor", value: s.vendor_name ?? s.vendor_id, mono: !s.vendor_name },
              { label: "Cycle", value: s.period.replace(/_/g, " ") },
              { label: "Amount", value: rupee(s.amount) },
              { label: "Line items", value: s.line_items },
              { label: "Window", value: s.period_start ? `${date(s.period_start)} – ${date(s.period_end)}` : null, full: true },
              { label: "Settled", value: date(s.settled_at) },
              { label: "On hold", value: s.on_hold ? "Yes" : "No" },
              ...(s.hold_note ? [{ label: "Hold note", value: s.hold_note, full: true }] : []),
          ]
        : [];

    const act = (id: string, a: string, confirmText?: string) =>
        action.run(id, { settlement_id: id, action: a }, confirmText);

    return (
        <div>
            <AdminPageHeader
                title="Settlements"
                subtitle="Run a cycle to aggregate proof-released redemptions into per-vendor payouts; click a row to see the line-items, then lock → reconcile → pay."
                count={state === "ready" ? items.length : undefined}
            />

            {canRun && <RunSettlementBar onDone={reload} />}

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search by vendor, period…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="settlements"
                emptyHint="Settlements will appear here once settlement cycles run."
                table={
                    <>
                        <TableShell hideCols={[5, 6]}>
                            <TableHead columns={columns} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((s) => (
                                    <tr
                                        key={s.settlement_id}
                                        onClick={() => drawer.openRow(s)}
                                        className="cursor-pointer hover:bg-slate-50"
                                    >
                                        <td className="px-2 md:px-4 py-3 text-slate-700">
                                            {s.vendor_name ? (
                                                <span className="font-medium">{s.vendor_name}</span>
                                            ) : (
                                                <span className="font-mono text-xs text-slate-500">
                                                    {s.vendor_id.slice(0, 8)}…
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 capitalize text-slate-700">
                                            {s.period.replace(/_/g, " ")}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">{rupee(s.amount)}</td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={s.status} />
                                            {s.on_hold && (
                                                <span className="ml-1.5 inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-600/20">
                                                    held
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">{s.line_items}</td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            <Dash>
                                                {s.settled_at ? new Date(s.settled_at).toLocaleDateString() : null}
                                            </Dash>
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
                title={s?.vendor_name ?? "Settlement"}
                subtitle="Payout breakdown"
                status={s?.status ?? drawer.selected?.status}
                sections={sections}
                loading={detailLoading}
                actions={
                    canManage && s
                        ? (() => {
                              const id = s.settlement_id;
                              const busy = action.busyId === id;
                              return (
                                  <>
                                      {s.status === "pending" && (
                                          <ActionButton tone="neutral" disabled={busy} onClick={() => act(id, "lock")}>
                                              Lock
                                          </ActionButton>
                                      )}
                                      {s.status === "locked" && (
                                          <>
                                              <ActionButton tone="primary" disabled={busy} onClick={() => act(id, "reconcile")}>
                                                  Reconcile
                                              </ActionButton>
                                              <ActionButton tone="neutral" disabled={busy} onClick={() => act(id, "unlock")}>
                                                  Unlock
                                              </ActionButton>
                                          </>
                                      )}
                                      {s.status === "reconciled" && (
                                          <ActionButton
                                              tone="primary"
                                              disabled={busy || s.on_hold}
                                              onClick={() =>
                                                  act(id, "pay", `Mark this settlement paid (${rupee(s.amount)})?`)
                                              }
                                          >
                                              Mark paid
                                          </ActionButton>
                                      )}
                                      {s.status !== "paid" &&
                                          (s.on_hold ? (
                                              <ActionButton tone="primary" disabled={busy} onClick={() => act(id, "release")}>
                                                  Release
                                              </ActionButton>
                                          ) : (
                                              <ActionButton
                                                  tone="neutral"
                                                  disabled={busy}
                                                  onClick={() =>
                                                      act(id, "hold", "Hold this settlement? It can't be paid until released.")
                                                  }
                                              >
                                                  Hold
                                              </ActionButton>
                                          ))}
                                  </>
                              );
                          })()
                        : null
                }
            >
                {detail && (
                    <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Line items ({detail.lines.length})
                        </h3>
                        {detail.lines.length === 0 ? (
                            <p className="text-sm text-slate-400">No line items on this settlement.</p>
                        ) : (
                            <div className="overflow-hidden rounded-lg border border-slate-200">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 text-slate-500">
                                        <tr>
                                            <th className="px-2 py-1.5 text-left font-medium">Redeemed</th>
                                            <th className="px-2 py-1.5 text-right font-medium">Menu</th>
                                            <th className="px-2 py-1.5 text-right font-medium">Diff</th>
                                            <th className="px-2 py-1.5 text-right font-medium">Co-pay</th>
                                            <th className="px-2 py-1.5 text-right font-medium">Payout</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {detail.lines.map((l) => (
                                            <tr key={l.line_id}>
                                                <td className="px-2 py-1.5 text-slate-600">
                                                    {l.redeemed_at ? new Date(l.redeemed_at).toLocaleDateString() : "—"}
                                                </td>
                                                <td className="px-2 py-1.5 text-right text-slate-700">
                                                    {rupee(l.menu_value_inr)}
                                                </td>
                                                <td className="px-2 py-1.5 text-right text-slate-700">
                                                    {rupee(l.difference_paid_inr)}
                                                </td>
                                                <td className="px-2 py-1.5 text-right text-slate-700">
                                                    {rupee(l.co_pay_inr)}
                                                </td>
                                                <td className="px-2 py-1.5 text-right font-medium text-slate-900">
                                                    {rupee(l.amount_inr)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50">
                                        <tr>
                                            <td className="px-2 py-1.5 font-medium text-slate-700" colSpan={4}>
                                                Payout total
                                            </td>
                                            <td className="px-2 py-1.5 text-right font-semibold text-slate-900">
                                                {rupee(detail.payout_total)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                        {s && detail.payout_total !== s.amount && (
                            <p className="mt-2 text-xs text-orange-600">
                                ⚠ Line-item total {rupee(detail.payout_total)} differs from header amount{" "}
                                {rupee(s.amount)}.
                            </p>
                        )}
                    </section>
                )}
            </DetailDrawer>
        </div>
    );
}

/** Admin control to run a settlement cycle — aggregates released redemptions into payouts. */
function RunSettlementBar({ onDone }: { onDone: () => void }) {
    const [period, setPeriod] = useState<"daily" | "twice_weekly" | "weekly">("weekly");

    return (
        <RunJobBar
            label="Run settlement cycle:"
            endpoint="/api/admin/settlements/run"
            buttonText="Run settlement"
            busyText="Running…"
            body={() => ({ period })}
            successMessage={(d) =>
                Number(d.settlements_created) > 0
                    ? `Created ${d.settlements_created} settlement(s) totalling ₹${Number(
                          d.total_amount
                      ).toLocaleString("en-IN")} across ${d.line_items} redemption(s).`
                    : "No proof-released redemptions are awaiting settlement."
            }
            onDone={onDone}
        >
            <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as typeof period)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
                <option value="daily">Daily</option>
                <option value="twice_weekly">Twice weekly</option>
                <option value="weekly">Weekly</option>
            </select>
        </RunJobBar>
    );
}
