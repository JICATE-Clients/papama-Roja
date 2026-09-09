import { defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { volunteerIncidentCreateSchema } from "@/lib/validation/schemas";

/**
 * POST /api/volunteer/incidents — file a field incident report (E-5 / B-31,
 * CD §D-9).
 * GET  /api/volunteer/incidents — the volunteer's own reports.
 *
 * CD §D-9's governing principle: "The volunteer's role is to facilitate access
 * to PAPAMA assistance, not to create or alter entitlement." This route is the
 * safe outlet that principle requires. A volunteer facing a closed Food Partner
 * or a token that will not scan must have something to do other than improvise —
 * which CD §D-9 explicitly forbids.
 *
 * TWO TAPS. `category` is the only required field: tap a category, tap send.
 * Everything else is optional. Requiring a note would mean typing while standing
 * in a queue in front of someone hungry, and the report would not get filed —
 * and the reports that never get written are the ones that matter most.
 *
 * Assistance requests are folded in per the card: `urgent_need` and
 * `safety_concern` ARE assistance requests on this form. A separate mechanism
 * would mean a volunteer choosing which system to use under pressure.
 *
 * Gated on `quality_feedback_complaints_inspections` scope own — the same cell
 * a beneficiary complaint uses, since an incident report is the same shape.
 */
export const POST = defineRoute(
    { feature: "quality_feedback_complaints_inspections", action: "create", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, volunteerIncidentCreateSchema);

        const admin = createAdminClient();

        // Resolve the volunteer record and their recorded zone. Best-effort: a
        // report from a volunteer whose profile cannot be read is still worth
        // having, so this never blocks the filing.
        let volunteerId: string | null = null;
        let districtId: string | null = null;
        let city: string | null = null;
        try {
            const { data } = await admin
                .from("volunteers")
                .select("id, district_id, city")
                .eq("user_id", user.id)
                .maybeSingle();
            const v = data as { id: string; district_id: string | null; city: string | null } | null;
            volunteerId = v?.id ?? null;
            districtId = v?.district_id ?? null;
            city = v?.city ?? null;
        } catch {
            // Location context is a nice-to-have; the incident is not.
        }

        // Tag to a running emergency when one covers the volunteer's zone, so
        // post-emergency review (E-3) can see what volunteers were hitting in
        // the field. Never blocks the report.
        let emergencyId: string | null = null;
        try {
            const { data } = await admin
                .from("emergencies")
                .select("id")
                .eq("status", "active")
                .gt("ends_at", new Date().toISOString())
                .limit(1)
                .maybeSingle();
            emergencyId = (data as { id: string } | null)?.id ?? null;
        } catch {
            emergencyId = null;
        }

        const { data: created, error } = await admin
            .from("volunteer_incidents")
            .insert({
                category: body.category,
                note: body.note ?? null,
                vendor_id: body.vendor_id ?? null,
                volunteer_id: volunteerId,
                reported_by: user.id,
                geo_lat: body.geo?.lat ?? null,
                geo_lng: body.geo?.lng ?? null,
                district_id: districtId,
                city,
                emergency_id: emergencyId,
                // is_safety is set by trigger, not here — a client that forgot
                // it would silently drop a safety report to the bottom of the
                // queue.
            })
            .select("id, category, status, is_safety, created_at")
            .single();

        if (error || !created) {
            throw new Error(error?.message ?? "failed to file incident report");
        }
        const incident = created as {
            id: string;
            category: string;
            status: string;
            is_safety: boolean;
            created_at: string;
        };

        await audit({
            action: "volunteer.incident.report",
            entity_table: "volunteer_incidents",
            entity_id: incident.id,
            summary: `volunteer reported '${incident.category}'${incident.is_safety ? " (SAFETY)" : ""}`,
            metadata: {
                category: incident.category,
                is_safety: incident.is_safety,
                volunteer_id: volunteerId,
                vendor_id: body.vendor_id ?? null,
                emergency_id: emergencyId,
                has_note: Boolean(body.note),
            },
        });

        return {
            incident_id: incident.id,
            category: incident.category,
            status: incident.status,
            is_safety: incident.is_safety,
            created_at: incident.created_at,
        };
    }
);

export const GET = defineRoute(
    { feature: "quality_feedback_complaints_inspections", action: "read", scope: "own" },
    async () => {
        // Session client: the volunteer_incidents_select_own policy scopes this
        // to the caller's own reports.
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("volunteer_incidents")
            .select("id, category, note, status, is_safety, created_at, resolution, resolved_at")
            .order("created_at", { ascending: false })
            .limit(100);

        if (error) throw new Error(error.message);
        return { incidents: data ?? [] };
    }
);
