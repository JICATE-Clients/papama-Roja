import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { BadRequestError, NotFoundError } from "@/lib/api/handler";
import type { AppUser } from "@/lib/auth";
import { refundCredit } from "@/lib/services/creditRefund";
import { writeAuditLog } from "@/lib/services/audit";
import type { PaymentFailureReason } from "@/lib/types/enums";

/**
 * Payment-failure + refund-request workflow (spec §3.1 F-10 [M2-4], addon
 * #14/#20). Default applied (client Q3/§11.2 #3): refunds ONLY for
 * failed/duplicate payment-gateway cases, never voluntary withdrawal —
 * enforced at the schema level (refunds.payment_failure_id NOT NULL), not
 * just here.
 *
 * Phase 1 has no live payment-gateway webhook (ASSUMPTIONS.md, client Q17),
 * so `payment_failures` rows are admin-logged via manual reconciliation.
 */

type Client = SupabaseClient;

export interface LogPaymentFailureInput {
    donationId?: string | null;
    /** Omit to read it off `donationId`'s donation. */
    donorId?: string | null;
    /** Omit to read it off `donationId`'s donation. */
    amountInr?: number | null;
    reason: PaymentFailureReason;
    maxRetries?: number | null;
    notes?: string | null;
}

export async function logPaymentFailure(
    admin: Client,
    input: LogPaymentFailureInput,
    actor: AppUser
): Promise<{ id: string }> {
    let donorId = input.donorId ?? null;
    let amountInr = input.amountInr ?? null;

    // Reconciliation usually starts from the charge that failed, so a donation
    // id alone is enough — the donor and the amount are already on that row and
    // copying them by hand is how a failure record ends up disagreeing with the
    // donation it describes. An explicit donorId/amountInr always wins, for the
    // failure that has no donation behind it.
    if (input.donationId && (donorId == null || amountInr == null)) {
        const { data: donation, error: donationError } = await admin
            .from("donations")
            .select("id, donor_id, amount_inr")
            .eq("id", input.donationId)
            .maybeSingle();
        if (donationError) throw new Error(donationError.message);
        if (!donation) throw new NotFoundError("donation not found");
        const row = donation as { donor_id: string | null; amount_inr: number };
        donorId = donorId ?? row.donor_id;
        amountInr = amountInr ?? Number(row.amount_inr);
    }

    // A guest/unattributed donation has no donor to refund — the credit was
    // never granted to anyone, so there is nothing to reverse.
    if (!donorId) throw new BadRequestError("this donation has no donor to refund");
    if (amountInr == null) throw new BadRequestError("an amount is required");

    const { data, error } = await admin
        .from("payment_failures")
        .insert({
            donation_id: input.donationId ?? null,
            donor_id: donorId,
            amount_inr: amountInr,
            reason: input.reason,
            detected_by: actor.id,
            max_retries: input.maxRetries ?? null,
            notes: input.notes ?? null,
        })
        .select("id")
        .single();
    if (error || !data) throw new Error(error?.message ?? "failed to log payment failure");

    await writeAuditLog(
        {
            actor,
            action: "payment_failure.log",
            entity_table: "payment_failures",
            entity_id: data.id,
            summary: `payment failure logged for donor ${donorId}: ₹${amountInr} (${input.reason})`,
            metadata: {
                donor_id: donorId,
                amount_inr: amountInr,
                reason: input.reason,
                donation_id: input.donationId ?? null,
            },
        },
        admin
    );

    return { id: data.id };
}

export interface RequestRefundInput {
    paymentFailureId: string;
    donorId: string;
    amountInr: number;
    reason: string;
}

/**
 * Donor (or admin on their behalf) requests a refund against an existing,
 * still-open payment_failures row. Ownership + status + amount-ceiling are
 * all checked here; the NOT NULL FK is the schema-level backstop.
 */
export async function requestRefund(
    admin: Client,
    input: RequestRefundInput,
    requestedBy: AppUser
): Promise<{ id: string }> {
    const { data: pf, error: pfError } = await admin
        .from("payment_failures")
        .select("id, donor_id, amount_inr, status")
        .eq("id", input.paymentFailureId)
        .maybeSingle();
    if (pfError) throw new Error(pfError.message);
    if (!pf) throw new NotFoundError("payment failure not found");
    const paymentFailure = pf as { id: string; donor_id: string | null; amount_inr: number; status: string };

    // Ownership mismatch reads as not-found — never leak another donor's row.
    if (paymentFailure.donor_id !== input.donorId) {
        throw new NotFoundError("payment failure not found");
    }
    if (paymentFailure.status !== "open") {
        throw new BadRequestError(`payment failure is '${paymentFailure.status}', not open`);
    }
    if (input.amountInr > Number(paymentFailure.amount_inr)) {
        throw new BadRequestError("refund amount cannot exceed the failed payment amount");
    }

    const { data, error } = await admin
        .from("refunds")
        .insert({
            donor_id: input.donorId,
            payment_failure_id: input.paymentFailureId,
            amount_inr: input.amountInr,
            reason: input.reason,
            requested_by: requestedBy.id,
        })
        .select("id")
        .single();
    if (error || !data) throw new Error(error?.message ?? "failed to create refund request");

    await writeAuditLog(
        {
            actor: requestedBy,
            action: "refund.request",
            entity_table: "refunds",
            entity_id: data.id,
            summary: `refund requested: ₹${input.amountInr} against payment failure ${input.paymentFailureId}`,
            metadata: { payment_failure_id: input.paymentFailureId, amount_inr: input.amountInr },
        },
        admin
    );

    return { id: data.id };
}

export interface DecideRefundResult {
    id: string;
    status: "rejected" | "completed";
    reversed?: number;
}

/**
 * Admin approve/reject a pending refund request. Approve reverses credit via
 * refundCredit() (posting the donation-ledger reversal, addon #18) and
 * resolves the underlying payment_failure; reject is a plain status update.
 */
export async function decideRefund(
    admin: Client,
    refundId: string,
    decision: "approve" | "reject",
    decidedBy: AppUser,
    note?: string | null
): Promise<DecideRefundResult> {
    const { data: row, error: fetchError } = await admin
        .from("refunds")
        .select("id, donor_id, amount_inr, status, payment_failure_id, reason")
        .eq("id", refundId)
        .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!row) throw new NotFoundError("refund not found");
    const refund = row as {
        id: string;
        donor_id: string;
        amount_inr: number;
        status: string;
        payment_failure_id: string;
        reason: string;
    };
    if (refund.status !== "pending") {
        throw new BadRequestError(`refund is '${refund.status}', not pending`);
    }

    const nowIso = new Date().toISOString();

    if (decision === "reject") {
        const { error } = await admin
            .from("refunds")
            .update({ status: "rejected", decided_by: decidedBy.id, decided_at: nowIso, decision_note: note ?? null })
            .eq("id", refundId)
            .eq("status", "pending");
        if (error) throw new Error(error.message);

        await writeAuditLog(
            {
                actor: decidedBy,
                action: "refund.reject",
                entity_table: "refunds",
                entity_id: refundId,
                summary: `refund rejected: ${note ?? "no note"}`,
                metadata: { note: note ?? null },
            },
            admin
        );

        return { id: refundId, status: "rejected" };
    }

    const result = await refundCredit({
        admin,
        donorId: refund.donor_id,
        amountInr: Number(refund.amount_inr),
        reason: refund.reason,
        ledgerReference: { referenceType: "refund", referenceId: refundId },
    });

    const { error: refundUpdateError } = await admin
        .from("refunds")
        .update({ status: "completed", decided_by: decidedBy.id, decided_at: nowIso, decision_note: note ?? null })
        .eq("id", refundId)
        .eq("status", "pending");
    if (refundUpdateError) throw new Error(refundUpdateError.message);

    const { error: pfUpdateError } = await admin
        .from("payment_failures")
        .update({ status: "resolved", resolved_at: nowIso })
        .eq("id", refund.payment_failure_id);
    if (pfUpdateError) throw new Error(pfUpdateError.message);

    await writeAuditLog(
        {
            actor: decidedBy,
            action: "refund.approve",
            entity_table: "refunds",
            entity_id: refundId,
            summary: `refund approved: ₹${result.reversed} reversed${result.partial ? " (partial)" : ""}`,
            metadata: { reversed: result.reversed, partial: result.partial },
        },
        admin
    );

    return { id: refundId, status: "completed", reversed: result.reversed };
}
