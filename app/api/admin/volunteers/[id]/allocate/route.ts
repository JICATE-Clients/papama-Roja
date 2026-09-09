import { z } from "zod";

import { defineRoute, parseBody } from "@/lib/api/handler";
import { allocatePooledTokens } from "@/lib/volunteer/allocation";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/volunteers/[id]/allocate — admin-initiated direct assignment
 * (token-flow §3a). The admin picks a specific volunteer and allocates a chosen
 * number of pool tokens to them, with NO prior volunteer request.
 *
 * Same engine as the §3b request-grant decide route (shared `allocatePooledTokens`:
 * concurrent-limit check + oldest-first pool pull + `assigned_to_volunteer` move +
 * grant records) — it differs only in the recorded channel (`admin_to_volunteer`)
 * and that there is no request row to finalise.
 *
 * Gated by `token_distribution/update` (admin, scope all) — matches the decide
 * route. `[id]` is the `volunteers.id`.
 */
const allocateSchema = z.object({
    count: z.number().int().positive(),
});

export const POST = defineRoute<{ id: string }>(
    { feature: "token_distribution", action: "update" },
    async ({ req, params, audit }) => {
        const body = await parseBody(req, allocateSchema);
        const volunteerId = params.id;

        const admin = createAdminClient();
        const { volunteerUserId, movedIds, skippedForScope } = await allocatePooledTokens(
            admin,
            volunteerId,
            body.count,
            "admin_to_volunteer"
        );

        await audit({
            action: "volunteer.allocate",
            entity_table: "volunteers",
            entity_id: volunteerId,
            summary: `admin allocated ${movedIds.length} token(s) to volunteer ${volunteerId}`,
            metadata: {
                volunteer_id: volunteerId,
                volunteer_user_id: volunteerUserId,
                channel: "admin_to_volunteer",
                granted_count: movedIds.length,
                token_ids: movedIds,
                // F-5: how many pool tokens FIFO passed over because their
                // geographic scope excludes this volunteer's zone. Logged
                // because a silent skip is indistinguishable from an empty
                // pool, and the two need different fixes.
                skipped_for_scope: skippedForScope,
            },
        });

        return {
            volunteer_id: volunteerId,
            granted_count: movedIds.length,
            skipped_for_scope: skippedForScope,
        };
    }
);
