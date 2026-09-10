import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * GET   /api/admin/offline-transactions — the offline queue + the unsynced view.
 * PATCH /api/admin/offline-transactions — resolve one capture.
 *
 * E-4 / B-30, CD §D-9. Design: docs/design-offline-emergency-transactions.md
 *
 * THE UNSYNCED VIEW IS THE POINT OF THIS SCREEN. CD §D-9 requires admin
 * visibility of unsynchronised transactions, and the reason is stark: if a
 * device captures meals and never returns, those meals were served with no
 * record reaching the platform. Without this view nobody knows that happened.
 * The queue of things that DID arrive is the easy half.
 *
 * `?view=devices` returns the device roster with staleness; the default returns
 * captures awaiting a decision.
 */
export const GET = defineRoute(
    { feature: "token_redemption", action: "read" },
    async ({ req }) => {
        const supabase = await createClient();
        const view = req.nextUrl.searchParams.get("view");
        const source = req.nextUrl.searchParams.get("source");

        if (view === "devices") {
            const { data, error } = await supabase
                .from("offline_devices")
                .select(
                    "device_reference, volunteer_id, vendor_id, label, last_seen_at, last_sync_at, pending_reported, is_compromised, compromised_note"
                )
                .order("last_sync_at", { ascending: true, nullsFirst: true })
                .limit(200);
            if (error) throw new Error(error.message);

            const devices = data ?? [];
            return {
                devices,
                // Devices reporting unsynced work, oldest first — the ones worth
                // chasing.
                holding_unsynced: devices.filter(
                    (d) => ((d as unknown as { pending_reported: number }).pending_reported ?? 0) > 0
                ).length,
                compromised: devices.filter(
                    (d) => (d as unknown as { is_compromised: boolean }).is_compromised
                ).length,
            };
        }

        let query = supabase
            .from("offline_transactions")
            .select(
                "id, token_id, volunteer_id, food_partner_id, emergency_id, captured_at, received_at, " +
                    "token_meal_type, waiver_status, status, device_reference, source, " +
                    "rejection_reason, conflicts_with, redemption_id"
            )
            .in("status", ["pending_offline_validation", "duplicate"]);

        // CD §D-9: post-emergency review runs SEPARATELY BY SOURCE, so the
        // filter is first-class rather than something a reviewer does by eye.
        if (source === "food_partner" || source === "volunteer") {
            query = query.eq("source", source);
        }

        const { data, error } = await query
            .order("captured_at", { ascending: true })
            .limit(300);
        if (error) throw new Error(error.message);

        const rows = data ?? [];
        return {
            transactions: rows,
            total: rows.length,
            duplicates: rows.filter(
                (r) => (r as unknown as { status: string }).status === "duplicate"
            ).length,
        };
    }
);

const patchSchema = z.object({
    offline_txn_id: z.string().uuid(),
    action: z.enum(["approve", "reject"]),
    /** Mandatory on reject — a refusal with no reason is not reviewable. */
    reason: z.string().trim().max(1000).optional(),
});

export const PATCH = defineRoute(
    { feature: "token_redemption", action: "update" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, patchSchema);
        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("offline_transactions")
            .select("id, status, token_id, source, device_reference, emergency_id")
            .eq("id", body.offline_txn_id)
            .maybeSingle();
        if (fetchError || !data) throw new NotFoundError("offline transaction not found");
        const txn = data as {
            id: string;
            status: string;
            token_id: string | null;
            source: string;
            device_reference: string;
            emergency_id: string | null;
        };

        if (txn.status !== "pending_offline_validation" && txn.status !== "duplicate") {
            throw new BadRequestError(
                `this capture is already '${txn.status}' and cannot be decided again`
            );
        }

        if (body.action === "reject" && !body.reason?.trim()) {
            throw new BadRequestError("a reason is required when rejecting an offline capture");
        }

        const nowIso = new Date().toISOString();

        // APPROVING does NOT burn the token here. The capture is marked
        // validated and the redemption is raised through the normal engine, so
        // expiry, geographic scope, Food Partner standing and fraud blocks all
        // run exactly as they would online. Writing a redemption row directly
        // from this screen would be the bypass the whole design exists to
        // prevent — CD §D-6 lists those as things Emergency Mode never
        // overrides, and an admin clicking Approve is not an exception.
        const { error: updateError } = await admin
            .from("offline_transactions")
            .update({
                status: body.action === "approve" ? "validated" : "rejected",
                validated_at: nowIso,
                rejection_reason: body.action === "reject" ? body.reason : null,
            })
            .eq("id", body.offline_txn_id)
            .eq("status", txn.status); // CAS: two admins deciding at once cannot both win
        if (updateError) throw new Error(updateError.message);

        await audit({
            action: `offline.${body.action}`,
            entity_table: "offline_transactions",
            entity_id: body.offline_txn_id,
            summary: `offline capture ${body.action}d (source: ${txn.source})`,
            metadata: {
                token_id: txn.token_id,
                source: txn.source,
                device_reference: txn.device_reference,
                emergency_id: txn.emergency_id,
                from_status: txn.status,
                reason: body.reason ?? null,
                decided_by: user.id,
            },
        });

        return {
            offline_txn_id: body.offline_txn_id,
            status: body.action === "approve" ? "validated" : "rejected",
        };
    }
);
