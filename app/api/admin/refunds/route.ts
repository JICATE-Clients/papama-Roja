import { defineRoute } from "@/lib/api/handler";
import { GUEST_POOL_EMAIL } from "@/lib/donations/guest-pool";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PaymentFailureReason } from "@/lib/types/enums";
import type { RefundResponse } from "@/lib/validation/schemas";

/**
 * GET /api/admin/refunds — list refund requests (admin/compliance; a donor's
 * own rows are visible too via RLS, but this route is mounted under /admin
 * for staff use). Gated by `refunds_failed_payments/read`.
 *
 * The donor name and the originating failure's reason are resolved here rather
 * than left to the caller: a decision made without seeing WHY the payment
 * failed is made blind, and the donor UUID has no business in a list body.
 */
export const GET = defineRoute({ feature: "refunds_failed_payments", action: "read" }, async () => {
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data, error } = await supabase
        .from("refunds")
        .select(
            "id, donor_id, payment_failure_id, amount_inr, reason, requested_by, status, decided_by, decided_at, decision_note, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(500);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as {
        id: string;
        donor_id: string;
        payment_failure_id: string;
        amount_inr: number;
        reason: string;
        status: RefundResponse["status"];
        decided_at: string | null;
        decision_note: string | null;
        created_at: string;
    }[];

    const donorIds = [...new Set(rows.map((r) => r.donor_id).filter(Boolean))];
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

    const failureIds = [...new Set(rows.map((r) => r.payment_failure_id).filter(Boolean))];
    const reasonByFailure = new Map<string, PaymentFailureReason>();
    if (failureIds.length > 0) {
        const { data: failures } = await admin
            .from("payment_failures")
            .select("id, reason")
            .in("id", failureIds);
        for (const f of (failures ?? []) as { id: string; reason: PaymentFailureReason }[]) {
            reasonByFailure.set(f.id, f.reason);
        }
    }

    const refunds: RefundResponse[] = rows.map((r) => {
        const donor = donorById.get(r.donor_id);
        const isPool = donor?.email === GUEST_POOL_EMAIL;
        return {
            id: r.id,
            donor_label: isPool ? "Guest pool (anonymous)" : (donor?.name ?? "Unattributed"),
            payment_failure_id: r.payment_failure_id,
            payment_failure_reason: reasonByFailure.get(r.payment_failure_id) ?? null,
            amount_inr: Number(r.amount_inr),
            reason: r.reason,
            status: r.status,
            decided_at: r.decided_at,
            decision_note: r.decision_note,
            created_at: r.created_at,
        };
    });

    return { refunds, total: refunds.length };
});
