import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Triple-ledger financial architecture (spec §3.1 F-10, §5 [M1-12], addon #18).
 * Every money movement posts a row here: `donation`, `vendor_payable`, or
 * `revenue`. Settlement reconciliation reports derive from this table, not
 * ad-hoc queries — "every rupee must be traceable."
 *
 * Reconciliation invariant: `donation == vendor_payable + revenue` once every
 * integration point below is wired — every credited rupee in `donation`
 * eventually either sits in `vendor_payable` (accrued-but-unpaid or already
 * paid out) or moves to `revenue` (forfeited balances). `reconcileLedgers()`
 * is the concrete, checkable version of that claim.
 *
 * `ledger_entries` is append-only (no update/delete RLS policy, mirrors
 * audit_logs discipline) — a correction is a new offsetting entry, never an
 * edit.
 */

export type LedgerName = "donation" | "vendor_payable" | "revenue";

export interface PostLedgerEntryArgs {
    admin: SupabaseClient;
    ledger: LedgerName;
    /** Positive = credit, negative = debit. */
    amountInr: number;
    referenceType: string;
    referenceId: string;
    description: string;
}

export async function postLedgerEntry(args: PostLedgerEntryArgs): Promise<{ id: string }> {
    const { data, error } = await args.admin
        .from("ledger_entries")
        .insert({
            ledger: args.ledger,
            amount: args.amountInr,
            reference_type: args.referenceType,
            reference_id: args.referenceId,
            description: args.description,
        })
        .select("id")
        .single();
    if (error || !data) throw new Error(error?.message ?? "failed to post ledger entry");
    return { id: (data as { id: string }).id };
}

export async function getLedgerBalance(admin: SupabaseClient, ledger: LedgerName): Promise<number> {
    const { data, error } = await admin.from("ledger_entries").select("amount").eq("ledger", ledger);
    if (error) throw new Error(error.message);
    return ((data ?? []) as { amount: number }[]).reduce((sum, r) => sum + Number(r.amount), 0);
}

export interface LedgerEntryRow {
    id: string;
    ledger: LedgerName;
    amount: number;
    reference_type: string;
    reference_id: string;
    description: string | null;
    created_at: string;
}

/**
 * One ledger's entries, newest first. Capped rather than paged: the trail is
 * append-only and read for spot-checking and tracing, not bulk export (the
 * reports module owns that), and an unbounded read of a table that only ever
 * grows is a slow query waiting to happen.
 *
 * Pass the SESSION client, not the service-role one — the RLS policies are what
 * scope a vendor to their own `vendor_payable` rows.
 */
export async function listLedgerEntries(
    client: SupabaseClient,
    ledger: LedgerName,
    limit = 200
): Promise<LedgerEntryRow[]> {
    const { data, error } = await client
        .from("ledger_entries")
        .select("id, ledger, amount, reference_type, reference_id, description, created_at")
        .eq("ledger", ledger)
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as LedgerEntryRow[];
}

export async function getLedgerEntriesForReference(
    admin: SupabaseClient,
    referenceType: string,
    referenceId: string
): Promise<LedgerEntryRow[]> {
    const { data, error } = await admin
        .from("ledger_entries")
        .select("id, ledger, amount, reference_type, reference_id, description, created_at")
        .eq("reference_type", referenceType)
        .eq("reference_id", referenceId)
        .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LedgerEntryRow[];
}

export interface ReconcileResult {
    donation: number;
    vendor_payable: number;
    revenue: number;
    balanced: boolean;
    discrepancy: number;
}

/** Checks the reconciliation invariant: donation == vendor_payable + revenue. */
export async function reconcileLedgers(admin: SupabaseClient): Promise<ReconcileResult> {
    const [donation, vendorPayable, revenue] = await Promise.all([
        getLedgerBalance(admin, "donation"),
        getLedgerBalance(admin, "vendor_payable"),
        getLedgerBalance(admin, "revenue"),
    ]);
    const discrepancy = Math.round((donation - (vendorPayable + revenue)) * 100) / 100;
    return {
        donation,
        vendor_payable: vendorPayable,
        revenue,
        balanced: Math.abs(discrepancy) < 0.01,
        discrepancy,
    };
}
