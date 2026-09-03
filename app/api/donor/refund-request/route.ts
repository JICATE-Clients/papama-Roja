import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveDonorId } from "@/lib/donor/server-identity";
import { requestRefund } from "@/lib/services/refund";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundRequestSchema } from "@/lib/validation/schemas";

/**
 * POST /api/donor/refund-request — donor self-initiates a refund against an
 * existing, still-open payment_failures row (addon #20). Gated by
 * `refunds_failed_payments/create` scope own. The service writes its own
 * audit row.
 */
/**
 * GET /api/donor/refund-request — the donor's OWN open payment failures and
 * their refund requests, so the page can offer a refund against a real row.
 *
 * Why the service-role client, filtered by the resolved donor id:
 *   `payment_failures` RLS is staff-only (`payment_failures_select_staff`,
 *   migration 20260716090008) while the matrix grants donor `read: own`
 *   (lib/permissions/matrix.ts). Without a read the donor can never learn the
 *   `payment_failure_id` that POST below requires, so the whole self-service
 *   path is unreachable. Same shape as the donor dashboard's scoped read: the
 *   guard authorises, the donor id is resolved from the session and every query
 *   is pinned to it, so no other donor's row can be returned.
 *   Aligning RLS with the matrix would let this move back to the session client.
 */
export const GET = defineRoute(
    { feature: "refunds_failed_payments", action: "read", scope: "own" },
    async ({ user }) => {
        const admin = createAdminClient();
        const donorId = await resolveDonorId(user, admin);
        if (!donorId) throw new BadRequestError("no donor profile for this account");

        const { data: failures, error: failureError } = await admin
            .from("payment_failures")
            .select("id, amount_inr, reason, status, created_at")
            .eq("donor_id", donorId)
            .eq("status", "open")
            .order("created_at", { ascending: false })
            .limit(100);
        if (failureError) throw new Error(failureError.message);

        const { data: refunds, error: refundError } = await admin
            .from("refunds")
            .select("id, payment_failure_id, amount_inr, reason, status, decided_at, decision_note, created_at")
            .eq("donor_id", donorId)
            .order("created_at", { ascending: false })
            .limit(100);
        if (refundError) throw new Error(refundError.message);

        // A failure with a request already against it is not offerable again;
        // the donor sees it in the requests list instead.
        const claimed = new Set(
            ((refunds ?? []) as { payment_failure_id: string }[]).map((r) => r.payment_failure_id)
        );

        return {
            payment_failures: ((failures ?? []) as {
                id: string;
                amount_inr: number;
                reason: string;
                status: string;
                created_at: string;
            }[])
                .filter((f) => !claimed.has(f.id))
                .map((f) => ({ ...f, amount_inr: Number(f.amount_inr) })),
            refunds: ((refunds ?? []) as { amount_inr: number }[]).map((r) => ({
                ...r,
                amount_inr: Number(r.amount_inr),
            })),
        };
    }
);

export const POST = defineRoute(
    { feature: "refunds_failed_payments", action: "create", scope: "own" },
    async ({ req, user }) => {
        const body = await parseBody(req, refundRequestSchema);
        const admin = createAdminClient();

        const donorId = await resolveDonorId(user, admin);
        if (!donorId) throw new BadRequestError("no donor profile for this account");

        return requestRefund(
            admin,
            {
                paymentFailureId: body.payment_failure_id,
                donorId,
                amountInr: body.amount_inr,
                reason: body.reason,
            },
            user
        );
    }
);
