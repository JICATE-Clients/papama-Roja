"use client";

import { useState } from "react";
import { inr, shortDateTime } from "@/lib/format";

import {
  useVendorFetch,
  PageHeader,
  ListStates,
  TableShell,
  TableHead,
  StatusBadge,
  Dash,
  Notice,
} from "../_ui";

/**
 * Vendor redemptions + proof status. Each served meal locks its payment until an
 * admin approves the uploaded proof. This page lets a vendor:
 *   - see every redemption's payment + proof status, and
 *   - (re)upload proof for any redemption still awaiting it — including ones an
 *     admin REJECTED (the rejection reason is shown so they can fix and resubmit).
 * Approved proofs read "released"; submitted ones read "awaiting review".
 */

interface Redemption {
  id: string;
  menu_value_inr: number;
  payment_status: string;
  proof_status: string | null;
  proof_review_note: string | null;
  redeemed_at: string | null;
}

function fmtDate(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : shortDateTime(v);
}

export default function VendorRedemptionsPage() {
  const { data, state, errorMsg, reload } = useVendorFetch<Redemption[]>(
    "/api/vendor/redemptions",
    "redemptions",
    "/vendor/redemptions"
  );
  const rows = data ?? [];

  return (
    <div>
      <PageHeader
        title="Redemptions & proof"
        subtitle="Track each served meal. Payment is released once an admin approves your uploaded proof."
        count={state === "ready" ? rows.length : undefined}
      />

      <ListStates
        state={state}
        errorMsg={errorMsg}
        isEmpty={rows.length === 0}
        resourceLabel="redemptions"
        emptyHint="Redemptions appear here after you scan a token and serve a meal."
      >
        <TableShell hideCols={[2]}>
          <TableHead columns={["Redemption", "Meal", "When", "Payment", "Proof"]} />
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 align-top last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.id.slice(0, 8)}…</td>
                <td className="px-4 py-3 text-slate-900">{inr(r.menu_value_inr)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  <Dash>{fmtDate(r.redeemed_at)}</Dash>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge value={r.payment_status} />
                </td>
                <td className="px-4 py-3">
                  <ProofCell redemption={r} onUploaded={reload} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </ListStates>
    </div>
  );
}

function ProofCell({
  redemption,
  onUploaded,
}: {
  redemption: Redemption;
  onUploaded: () => void;
}) {
  const { proof_status, payment_status, proof_review_note } = redemption;

  // Approved (payment released) or admin-held — nothing for the vendor to do.
  if (proof_status === "approved" || payment_status === "released") {
    return <StatusBadge value="approved" />;
  }
  if (payment_status !== "locked") {
    return <StatusBadge value={payment_status} />;
  }
  if (proof_status === "submitted") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium capitalize text-amber-700 ring-1 ring-inset ring-amber-600/20">
        awaiting review
      </span>
    );
  }

  // null (no proof yet) or 'rejected' → the vendor can (re)upload.
  return (
    <div className="space-y-2">
      {proof_status === "rejected" && (
        <Notice tone="error" title="Proof rejected">
          {proof_review_note ?? "Please re-upload clearer proof."}
        </Notice>
      )}
      <ReuploadForm redemptionId={redemption.id} onUploaded={onUploaded} />
    </div>
  );
}

function ReuploadForm({
  redemptionId,
  onUploaded,
}: {
  redemptionId: string;
  onUploaded: () => void;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!photo || !receipt) {
      setErr("Both a plate photo and a receipt are required.");
      return;
    }
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("photo", photo);
    fd.append("receipt", receipt);
    try {
      const res = await fetch(`/api/vendor/redemptions/${redemptionId}/proof`, {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed (${res.status}).`);
      }
      onUploaded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wide text-slate-400">
          Plate photo
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="mt-0.5 block w-full text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-900 file:px-2 file:py-1 file:text-xs file:text-white"
          />
        </label>
        <label className="text-[10px] uppercase tracking-wide text-slate-400">
          Receipt
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            className="mt-0.5 block w-full text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-900 file:px-2 file:py-1 file:text-xs file:text-white"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={busy || !photo || !receipt}
        className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Submit proof for review"}
      </button>
      {err && <p className="text-[10px] text-red-700">{err}</p>}
    </div>
  );
}
