"use client";

import { useVendorFetch, PageHeader, ListStates, TableShell, TableHead, StatusBadge, Dash } from "../_ui";
import { inr, shortDate } from "@/lib/format";

/**
 * Settlement row shape is assumed (the backend contract didn't pin it). We render
 * the columns we expect and degrade gracefully (em-dash) when a field is absent.
 */
interface Settlement {
  id?: string;
  // The settlement record's cadence label (daily/twice_weekly/weekly). The API
  // field is `period` — the page previously read `s.cycle`, which never existed,
  // so the "Cycle" column always showed an em-dash.
  period?: string;
  period_start?: string;
  period_end?: string;
  amount?: number;
  status?: string;
  [key: string]: unknown;
}

function fmtDate(v?: string) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : shortDate(v);
}

export default function VendorSettlementsPage() {
  // GET /api/vendor/settlements → { settlements: [...], total }
  const { data: settlements, state, errorMsg } = useVendorFetch<Settlement[]>(
    "/api/vendor/settlements",
    "settlements",
    "/vendor/settlements"
  );

  const rows = settlements ?? [];

  return (
    <div>
      <PageHeader
        title="Settlements"
        subtitle="Payouts from your completed, proof-released redemptions."
        count={state === "ready" ? rows.length : undefined}
      />

      <ListStates
        state={state}
        errorMsg={errorMsg}
        isEmpty={rows.length === 0}
        resourceLabel="settlements"
        emptyHint="Settlements appear once cycles run."
      >
        <TableShell>
          <TableHead columns={["Cycle", "Period", "Amount", "Status"]} />
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.id ?? i} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-700">
                  <Dash>{s.period}</Dash>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {fmtDate(s.period_start) || fmtDate(s.period_end) ? (
                    <span>
                      {fmtDate(s.period_start) ?? "—"} – {fmtDate(s.period_end) ?? "—"}
                    </span>
                  ) : (
                    <Dash>{null}</Dash>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-900">
                  {s.amount != null ? inr(s.amount) : <Dash>{null}</Dash>}
                </td>
                <td className="px-4 py-3">
                  {s.status ? <StatusBadge value={s.status} /> : <Dash>{null}</Dash>}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </ListStates>
    </div>
  );
}
