import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { syncOfflineBatch, type OfflineCapture } from "@/lib/services/offlineSync";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBoolean, getNumber } from "@/lib/system-config";

/**
 * POST /api/offline/sync — upload a batch of offline emergency captures
 * (E-4 / B-30, CD §D-9). Design: docs/design-offline-emergency-transactions.md
 *
 * Serves BOTH capture routes confirmed 18 Aug — the Food Partner redemption
 * screen (primary) and the Volunteer App (secondary) — under identical controls.
 * `source` is mandatory on every record because post-emergency review runs
 * separately by source.
 *
 * Gated on `token_redemption/create` scope own: the same permission an online
 * redemption needs. Offline capture must not open a wider surface than the thing
 * it stands in for.
 *
 * WHAT THIS DOES NOT DO: it does not redeem anything. Captures land as
 * PENDING OFFLINE VALIDATION and become real redemptions only when an admin
 * approves them through the normal engine. That is the whole design.
 */
const captureSchema = z.object({
    // Device-generated (it cannot ask the server for one) and the primary key,
    // so a re-uploaded batch is idempotent rather than duplicated.
    id: z.string().uuid(),
    token_id: z.string().uuid().nullable(),
    volunteer_id: z.string().uuid().nullable().optional(),
    food_partner_id: z.string().uuid().nullable().optional(),
    beneficiary_identifier: z.string().trim().max(200).nullable().optional(),
    emergency_id: z.string().uuid().nullable(),
    captured_at: z.string().datetime(),
    token_meal_type: z.string().trim().max(40).nullable().optional(),
    waiver_status: z.boolean().optional(),
    device_reference: z.string().trim().min(1).max(200),
    // Mandatory — confirmed 18 Aug. No default: a record whose source is
    // guessed cannot be reviewed by source.
    source: z.enum(["food_partner", "volunteer"]),
});

const syncSchema = z.object({
    // Batched rather than one-at-a-time so conflicts can be detected across the
    // WHOLE batch before anything validates. Capped so a compromised device
    // cannot flood the queue in a single request.
    captures: z.array(captureSchema).min(1).max(200),
});

export const POST = defineRoute(
    { feature: "token_redemption", action: "create", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, syncSchema);
        const admin = createAdminClient();

        // Master switch. The capability is BUILT but ships off — CD §D-9 makes
        // offline capture an emergency-only exception, and an exception that is
        // on by default is not an exception.
        let enabled = false;
        try {
            enabled = await getBoolean("offline_capture_enabled", admin as never);
        } catch {
            enabled = false; // unset → off. Never guessed on.
        }
        if (!enabled) {
            throw new BadRequestError(
                "offline capture is not enabled — it is an emergency-only capability and must be switched on by an administrator"
            );
        }

        // NULL = not enforced, and the sync says so rather than inventing a
        // window. These limits are the client's to set (design §11).
        let maxSyncWindowHours: number | null = null;
        try {
            maxSyncWindowHours = await getNumber("offline_max_sync_window_hours", admin as never);
        } catch {
            maxSyncWindowHours = null;
        }

        const result = await syncOfflineBatch(
            admin,
            body.captures as OfflineCapture[],
            { maxSyncWindowHours }
        );

        await audit({
            action: "offline.sync",
            entity_table: "offline_transactions",
            entity_id: body.captures[0].id,
            summary:
                `synced ${result.received} offline capture(s): ` +
                `${result.duplicates} duplicate, ${result.rejected} rejected`,
            metadata: {
                received: result.received,
                duplicates: result.duplicates,
                rejected: result.rejected,
                devices: [...new Set(body.captures.map((c) => c.device_reference))],
                sources: [...new Set(body.captures.map((c) => c.source))],
                synced_by: user.id,
            },
        });

        return {
            received: result.received,
            pending_validation: result.received - result.rejected - result.duplicates,
            duplicates: result.duplicates,
            rejected: result.rejected,
            results: result.results,
        };
    }
);
