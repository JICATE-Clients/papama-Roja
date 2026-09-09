import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/volunteer-requests/[id]/decide — the admin grants, partially
 * grants, or denies a volunteer token request (token-flow Path-B allocation).
 *
 * Gated by `token_distribution/update` (scope all). The request must be pending.
 *
 * The claim + allocation are done ATOMICALLY inside the
 * `decide_volunteer_request` Postgres function (one locked transaction):
 *   DENY  → status='denied', decided_by=admin, decided_count=0.
 *   GRANT / PARTIALLY_GRANT → validate count vs requested, then allocate via
 *     allocate_pooled_tokens (active gate + concurrent cap + oldest-first pool
 *     pull + 'volunteer_request_grant' records) and finalise the request — all
 *     under a FOR UPDATE lock on the request row.
 *
 * Doing it in the DB closes the double-grant TOCTOU the old read→allocate→update
 * sequence had: a concurrent second decide (double-click / two admins / retry)
 * now blocks on the row lock and then trips the pending check, allocating nothing
 * instead of granting a second batch of tokens for the same request.
 *
 * All DB work runs on the service-role client after the matrix check.
 */
const decideSchema = z.object({
    decision: z.enum(["granted", "partially_granted", "denied"]),
    decided_count: z.number().int().positive().optional(),
});

export const POST = defineRoute<{ id: string }>(
    { feature: "token_distribution", action: "update" },
    async ({ req, user, params, audit }) => {
        const body = await parseBody(req, decideSchema);
        const requestId = params.id;

        const admin = createAdminClient();

        // Atomic decision: row-lock the request, validate, allocate (grant) and
        // finalise in ONE transaction. The function raises plain exceptions for
        // every business-rule failure (not found / already decided / bad count /
        // inactive volunteer / over cap / pool too small) — surface them as 400s.
        const { data, error } = await admin.rpc("decide_volunteer_request", {
            p_request_id: requestId,
            p_decision: body.decision,
            p_decided_count: body.decided_count ?? null,
            p_admin_id: user.id,
        });
        if (error) throw new BadRequestError(error.message);

        const result = ((data ?? []) as {
            token_ids: string[] | null;
            volunteer_user_id: string | null;
            granted_count: number;
            skipped_for_scope: number | null;
        }[])[0];
        const grantedCount = result?.granted_count ?? 0;
        // F-5: pool tokens FIFO passed over because their geographic scope
        // excludes this volunteer's zone. Logged on this channel too — CD
        // §D-10A's requirement covers admin assignment AND request grants.
        const skippedForScope = Number(result?.skipped_for_scope ?? 0);
        const movedIds = result?.token_ids ?? [];
        const volunteerUserId = result?.volunteer_user_id ?? null;

        await audit({
            action: "volunteer.allocate",
            entity_table: "volunteer_token_requests",
            entity_id: requestId,
            summary:
                body.decision === "denied"
                    ? `denied volunteer request ${requestId}`
                    : `${body.decision} volunteer request ${requestId}: ${grantedCount} tokens`,
            metadata: {
                volunteer_user_id: volunteerUserId,
                decision: body.decision,
                granted_count: grantedCount,
                skipped_for_scope: skippedForScope,
                token_ids: movedIds,
            },
        });

        return {
            request_id: requestId,
            granted_count: grantedCount,
            skipped_for_scope: skippedForScope,
        };
    }
);
