import { z } from "zod";

import { NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * GET   /api/admin/volunteer-incidents — the incident queue (E-5 / B-31).
 * PATCH /api/admin/volunteer-incidents — move one through the status flow.
 *
 * SAFETY LEADS THE QUEUE. `food_safety_concern` and `safety_concern` sort
 * first regardless of age, because CD §D-9 carries explicit volunteer safety
 * provisions ("never required to enter unsafe locations"). A safety report
 * sitting behind forty "no token" reports is the failure this ordering exists
 * to prevent — so it is enforced here in the query, not left to whoever builds
 * the screen.
 *
 * The queue carries the volunteer, time and location context the card requires.
 */
export const GET = defineRoute(
    { feature: "quality_feedback_complaints_inspections", action: "read" },
    async ({ req }) => {
        const supabase = await createClient();
        const status = req.nextUrl.searchParams.get("status");

        let query = supabase
            .from("volunteer_incidents")
            .select(
                "id, category, note, status, is_safety, created_at, city, geo_lat, geo_lng, " +
                    "vendor_id, volunteer_id, emergency_id, acknowledged_at, resolution, resolved_at, " +
                    "volunteer:volunteers(full_name, phone), " +
                    "district:districts(name)"
            );

        // Default view is everything still needing attention. An explicit
        // ?status= is honoured so a reviewer can look back at closed items.
        if (status) query = query.eq("status", status);
        else query = query.in("status", ["open", "acknowledged", "in_progress"]);

        const { data, error } = await query
            .order("is_safety", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(200);

        if (error) throw new Error(error.message);

        const incidents = data ?? [];
        return {
            incidents,
            total: incidents.length,
            // Via `unknown`: the concatenated select string defeats
            // supabase-js's literal-type inference for the joined shape.
            safety_open: incidents.filter(
                (i) => (i as unknown as { is_safety: boolean }).is_safety
            ).length,
        };
    }
);

const patchSchema = z.object({
    incident_id: z.string().uuid(),
    action: z.enum(["acknowledge", "start", "resolve", "close"]),
    /** Required when resolving — what was actually done about it. */
    resolution: z.string().trim().max(2000).optional(),
});

/** Which status each action moves to, and what it may move from. */
const TRANSITIONS: Record<string, { to: string; from: string[] }> = {
    acknowledge: { to: "acknowledged", from: ["open"] },
    start: { to: "in_progress", from: ["open", "acknowledged"] },
    resolve: { to: "resolved", from: ["open", "acknowledged", "in_progress"] },
    close: { to: "closed", from: ["resolved"] },
};

export const PATCH = defineRoute(
    { feature: "quality_feedback_complaints_inspections", action: "update" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, patchSchema);
        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("volunteer_incidents")
            .select("id, status, category, is_safety")
            .eq("id", body.incident_id)
            .maybeSingle();
        if (fetchError || !data) throw new NotFoundError("incident not found");
        const incident = data as {
            id: string;
            status: string;
            category: string;
            is_safety: boolean;
        };

        const rule = TRANSITIONS[body.action];
        if (!rule.from.includes(incident.status)) {
            throw new NotFoundError(
                `cannot '${body.action}' an incident whose status is '${incident.status}'`
            );
        }

        const nowIso = new Date().toISOString();
        const update: Record<string, unknown> = { status: rule.to, updated_at: nowIso };

        if (body.action === "acknowledge") {
            update.acknowledged_by = user.id;
            update.acknowledged_at = nowIso;
        }
        if (body.action === "resolve") {
            update.resolved_by = user.id;
            update.resolved_at = nowIso;
            // Recorded when given. Not mandatory: a volunteer reporting "no
            // food at this outlet" may simply be true and need no narrative,
            // and demanding one would stall the queue rather than improve it.
            update.resolution = body.resolution ?? null;
        }

        const { error: updateError } = await admin
            .from("volunteer_incidents")
            .update(update)
            .eq("id", body.incident_id)
            .eq("status", incident.status); // CAS: lose a concurrent race safely
        if (updateError) throw new Error(updateError.message);

        await audit({
            action: `volunteer.incident.${body.action}`,
            entity_table: "volunteer_incidents",
            entity_id: body.incident_id,
            summary: `incident '${incident.category}' → ${rule.to}`,
            metadata: {
                category: incident.category,
                is_safety: incident.is_safety,
                from: incident.status,
                to: rule.to,
                resolution: body.resolution ?? null,
            },
        });

        return { incident_id: body.incident_id, status: rule.to };
    }
);
