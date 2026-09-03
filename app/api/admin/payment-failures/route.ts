import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { GUEST_POOL_EMAIL } from "@/lib/donations/guest-pool";
import { logPaymentFailure } from "@/lib/services/refund";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
    paymentFailureCreateRequestSchema,
    paymentFailureDismissRequestSchema,
    type PaymentFailureResponse,
} from "@/lib/validation/schemas";

/**
 * /api/admin/payment-failures — admin-logged failed/duplicate
 * payments (spec §3.1 F-10 [M2-4], addon #14). Phase 1 has no live gateway
 * webhook (ASSUMPTIONS.md, client Q17), so this is a manual reconciliation
 * entry point. Gated by `refunds_failed_payments` (admin CRUD, compliance
 * read-only). The service writes its own audit row on POST.
 */
export const GET = defineRoute({ feature: "refunds_failed_payments", action: "read" }, async () => {
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data, error } = await supabase
        .from("payment_failures")
        .select(
            "id, donation_id, donor_id, amount_inr, reason, retry_count, max_retries, status, notes, created_at, resolved_at"
        )
        .order("created_at", { ascending: false })
        .limit(500);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as {
        id: string;
        donation_id: string | null;
        donor_id: string | null;
        amount_inr: number;
        reason: PaymentFailureResponse["reason"];
        retry_count: number;
        max_retries: number | null;
        status: PaymentFailureResponse["status"];
        notes: string | null;
        created_at: string;
        resolved_at: string | null;
    }[];

    // Resolve donor names in one batch, same as the donations list — a UUID is
    // unreadable in a table, and the id has no business leaving this endpoint.
    const donorIds = [...new Set(rows.map((r) => r.donor_id).filter(Boolean) as string[])];
    const donorById = new Map<string, { name: string | null; email: string | null }>();
    if (donorIds.length > 0) {
        const { data: donors } = await admin
            .from("donors")
            .select("id, name, email")
            .in("id", donorIds);
        for (const d of (donors ?? []) as { id: string; name: string | null; email: string | null }[]) {
            donorById.set(d.id, { name: d.name, email: d.email });
        }
    }

    // Which failures already carry a refund request. Without this the admin
    // cannot tell an untouched failure from one that is already in the queue
    // below, and would log a second request against the same charge.
    const refundedIds = new Set<string>();
    if (rows.length > 0) {
        const { data: refunds } = await admin
            .from("refunds")
            .select("payment_failure_id")
            .in(
                "payment_failure_id",
                rows.map((r) => r.id)
            );
        for (const r of (refunds ?? []) as { payment_failure_id: string }[]) {
            refundedIds.add(r.payment_failure_id);
        }
    }

    const payment_failures: PaymentFailureResponse[] = rows.map((r) => {
        const donor = r.donor_id ? donorById.get(r.donor_id) : null;
        const isPool = donor?.email === GUEST_POOL_EMAIL;
        return {
            id: r.id,
            donation_id: r.donation_id,
            donor_label: isPool ? "Guest pool (anonymous)" : (donor?.name ?? "Unattributed"),
            amount_inr: Number(r.amount_inr),
            reason: r.reason,
            retry_count: r.retry_count,
            max_retries: r.max_retries,
            status: r.status,
            notes: r.notes,
            created_at: r.created_at,
            resolved_at: r.resolved_at,
            has_refund: refundedIds.has(r.id),
        };
    });

    return { payment_failures, total: payment_failures.length };
});

export const POST = defineRoute(
    { feature: "refunds_failed_payments", action: "create" },
    async ({ req, user }) => {
        const body = await parseBody(req, paymentFailureCreateRequestSchema);
        const admin = createAdminClient();

        // donor_id / amount_inr are optional here: the schema guarantees either
        // they are present or a donation_id is, and the service reads them off
        // that donation.
        return logPaymentFailure(
            admin,
            {
                donationId: body.donation_id ?? null,
                donorId: body.donor_id ?? null,
                amountInr: body.amount_inr ?? null,
                reason: body.reason,
                maxRetries: body.max_retries ?? null,
                notes: body.notes ?? null,
            },
            user
        );
    }
);

/**
 * PATCH — dismiss an open failure without refunding it.
 *
 * Nothing could set `dismissed` before this: refund approval moves a row to
 * `resolved`, and that was the only writer. A failure logged in error, or one the
 * bank later confirms went through, sat `open` forever and kept appearing in the
 * donor's "request a refund" list.
 *
 * A failure with a refund already against it is left alone — closing it here
 * would strand that request pointing at a dead parent, and the refund decision is
 * the one that should resolve it.
 */
export const PATCH = defineRoute(
    { feature: "refunds_failed_payments", action: "update" },
    async ({ req, audit }) => {
        const body = await parseBody(req, paymentFailureDismissRequestSchema);
        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("payment_failures")
            .select("id, status, amount_inr, notes")
            .eq("id", body.payment_failure_id)
            .maybeSingle();
        if (fetchError) throw new Error(fetchError.message);
        if (!data) throw new NotFoundError("payment failure not found");
        const failure = data as { id: string; status: string; amount_inr: number; notes: string | null };

        if (failure.status !== "open") {
            throw new BadRequestError(`payment failure is '${failure.status}', not open`);
        }

        const { data: refund } = await admin
            .from("refunds")
            .select("id")
            .eq("payment_failure_id", body.payment_failure_id)
            .maybeSingle();
        if (refund) {
            throw new BadRequestError(
                "a refund has been requested against this failure — decide the refund instead"
            );
        }

        // The dismissal reason is appended to `notes` rather than overwriting it:
        // whatever was recorded when the failure was logged is the context that
        // makes the dismissal readable later.
        const notes = failure.notes
            ? `${failure.notes}\n[dismissed] ${body.note}`
            : `[dismissed] ${body.note}`;

        const { error: updateError } = await admin
            .from("payment_failures")
            .update({ status: "dismissed", resolved_at: new Date().toISOString(), notes })
            .eq("id", body.payment_failure_id)
            .eq("status", "open");
        if (updateError) throw new Error(updateError.message);

        await audit({
            action: "payment_failure.dismiss",
            entity_table: "payment_failures",
            entity_id: body.payment_failure_id,
            summary: `payment failure dismissed (₹${failure.amount_inr}): ${body.note}`,
            metadata: { note: body.note, amount_inr: failure.amount_inr },
        });

        return { id: body.payment_failure_id, status: "dismissed" };
    }
);