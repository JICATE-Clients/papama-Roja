import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { computeEmergencyClosure } from "@/lib/services/emergencyEvent";
import { runPostEmergencyReview } from "@/lib/services/postEmergencyReview";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * GET   /api/admin/emergencies — the emergency register.
 * POST  /api/admin/emergencies — declare one.
 * PATCH /api/admin/emergencies — extend or close one.
 *
 * E-1 (B-26 a,d,e), CD §D-6.
 *
 * THIS IS NOT A ROUTINE FORM. Declaring an emergency switches on relaxed
 * verification and the automatic ₹10 waiver for everyone inside its geographic
 * scope. CD §D-6 restricts activation to authorised administrators, and both
 * relaxations default OFF so declaring an emergency does not silently decide
 * policy on the administrator's behalf.
 *
 * NO INDEFINITE EMERGENCY MODE (CD §D-6): `ends_at` is required, extension is an
 * explicit action carrying a MANDATORY reason, and every extension is kept as
 * history rather than overwriting the date.
 */

export const GET = defineRoute(
    { feature: "emergency_disaster_mode", action: "read" },
    async () => {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("emergencies")
            .select(
                "id, emergency_ref, title, reason, status, activated_at, ends_at, extended_count, " +
                    "scope_city, beneficiary_scope, estimated_beneficiaries, estimated_meals, " +
                    "estimated_funds_inr, contribution_waiver_enabled, verification_relaxation_enabled, " +
                    "closed_at, scope_district:districts(name), scope_state:states(name)"
            )
            .order("activated_at", { ascending: false })
            .limit(100);
        if (error) throw new Error(error.message);
        return { emergencies: data ?? [] };
    }
);

const createSchema = z.object({
    // e.g. TN-FLOOD-2026-001 — the identifier quoted in reports and donor
    // communications, so it is supplied rather than generated.
    emergency_ref: z
        .string()
        .trim()
        .regex(/^[A-Z0-9][A-Z0-9-]{4,49}$/, "use capitals, digits and hyphens, e.g. TN-FLOOD-2026-001"),
    title: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(2000),
    ends_at: z.string().datetime(),
    scope_state_id: z.string().uuid().optional(),
    scope_district_id: z.string().uuid().optional(),
    scope_city: z.string().trim().max(120).optional(),
    beneficiary_scope: z.string().trim().max(200).optional(),
    estimated_beneficiaries: z.number().int().nonnegative().optional(),
    estimated_meals: z.number().int().nonnegative().optional(),
    estimated_funds_inr: z.number().nonnegative().optional(),
    /** Both default FALSE — see the header. An emergency does not assume them. */
    contribution_waiver_enabled: z.boolean().optional(),
    verification_relaxation_enabled: z.boolean().optional(),
});

export const POST = defineRoute(
    { feature: "emergency_disaster_mode", action: "create" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, createSchema);
        const admin = createAdminClient();

        if (Date.parse(body.ends_at) <= Date.now()) {
            throw new BadRequestError("the end date must be in the future");
        }

        const { data, error } = await admin
            .from("emergencies")
            .insert({
                emergency_ref: body.emergency_ref,
                title: body.title,
                reason: body.reason,
                ends_at: body.ends_at,
                scope_state_id: body.scope_state_id ?? null,
                scope_district_id: body.scope_district_id ?? null,
                scope_city: body.scope_city ?? null,
                beneficiary_scope: body.beneficiary_scope ?? null,
                estimated_beneficiaries: body.estimated_beneficiaries ?? null,
                estimated_meals: body.estimated_meals ?? null,
                estimated_funds_inr: body.estimated_funds_inr ?? null,
                contribution_waiver_enabled: body.contribution_waiver_enabled ?? false,
                verification_relaxation_enabled: body.verification_relaxation_enabled ?? false,
                activated_by: user.id,
            })
            .select("id, emergency_ref")
            .single();

        if (error) {
            if (error.code === "23505") {
                throw new BadRequestError(`Emergency ID '${body.emergency_ref}' already exists`);
            }
            throw new Error(error.message);
        }
        const em = data as { id: string; emergency_ref: string };

        await audit({
            action: "emergency.declare",
            entity_table: "emergencies",
            entity_id: em.id,
            summary: `declared emergency ${em.emergency_ref}: ${body.title}`,
            metadata: {
                emergency_ref: em.emergency_ref,
                ends_at: body.ends_at,
                // Recorded explicitly: these two flags change what happens at
                // every till inside the scope.
                contribution_waiver_enabled: body.contribution_waiver_enabled ?? false,
                verification_relaxation_enabled: body.verification_relaxation_enabled ?? false,
                reason: body.reason,
            },
        });

        return { emergency_id: em.id, emergency_ref: em.emergency_ref };
    }
);

const patchSchema = z
    .object({
        emergency_id: z.string().uuid(),
        action: z.enum(["extend", "close", "cancel"]),
        /** MANDATORY on extend (CD §D-6). */
        reason: z.string().trim().max(2000).optional(),
        new_ends_at: z.string().datetime().optional(),
        surplus_utilisation: z
            .enum(["same_emergency", "continuing_need_same_area", "emergency_response_fund"])
            .optional(),
        surplus_utilisation_note: z.string().trim().max(2000).optional(),
    })
    .refine((v) => v.action !== "extend" || (v.reason?.trim() && v.new_ends_at), {
        message: "extending an emergency requires a reason and a revised end date",
        path: ["reason"],
    });

export const PATCH = defineRoute(
    { feature: "emergency_disaster_mode", action: "update" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, patchSchema);
        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("emergencies")
            .select("id, emergency_ref, status, ends_at, extended_count")
            .eq("id", body.emergency_id)
            .maybeSingle();
        if (fetchError || !data) throw new NotFoundError("emergency not found");
        const em = data as {
            id: string;
            emergency_ref: string;
            status: string;
            ends_at: string;
            extended_count: number;
        };

        if (em.status !== "active") {
            throw new BadRequestError(`emergency ${em.emergency_ref} is already ${em.status}`);
        }

        const nowIso = new Date().toISOString();

        // --- EXTEND -----------------------------------------------------------
        if (body.action === "extend") {
            if (Date.parse(body.new_ends_at!) <= Date.parse(em.ends_at)) {
                throw new BadRequestError("the revised end date must be later than the current one");
            }

            // History, not an overwritten date. How long an emergency ran and on
            // whose repeated authority is exactly what a reviewer asks about.
            const { error: extError } = await admin.from("emergency_extensions").insert({
                emergency_id: em.id,
                previous_ends_at: em.ends_at,
                new_ends_at: body.new_ends_at,
                reason: body.reason,
                extended_by: user.id,
            });
            if (extError) throw new Error(extError.message);

            const { error: upError } = await admin
                .from("emergencies")
                .update({
                    ends_at: body.new_ends_at,
                    extended_count: em.extended_count + 1,
                })
                .eq("id", em.id)
                .eq("status", "active");
            if (upError) throw new Error(upError.message);

            await audit({
                action: "emergency.extend",
                entity_table: "emergencies",
                entity_id: em.id,
                summary: `extended ${em.emergency_ref} to ${body.new_ends_at}`,
                metadata: {
                    from: em.ends_at,
                    to: body.new_ends_at,
                    reason: body.reason,
                    extension_number: em.extended_count + 1,
                },
            });

            return { emergency_id: em.id, ends_at: body.new_ends_at };
        }

        // --- CLOSE / CANCEL ---------------------------------------------------
        const status = body.action === "close" ? "closed" : "cancelled";

        const { error: upError } = await admin
            .from("emergencies")
            .update({ status, closed_at: nowIso, closed_by: user.id })
            .eq("id", em.id)
            .eq("status", "active");
        if (upError) throw new Error(upError.message);

        let closureId: string | null = null;
        let reviewFlagged = 0;

        if (body.action === "close") {
            // Figures are DERIVED from the tagged records, never typed. A closure
            // whose numbers someone entered is not a reconciliation.
            const figures = await computeEmergencyClosure(admin, em.id);

            const { data: closure } = await admin
                .from("emergency_closures")
                .insert({
                    emergency_id: em.id,
                    ...figures,
                    surplus_utilisation: body.surplus_utilisation ?? null,
                    surplus_utilisation_note: body.surplus_utilisation_note ?? null,
                    approved_by: user.id,
                })
                .select("id")
                .single();
            closureId = (closure as { id: string } | null)?.id ?? null;

            // E-3: closing populates the review queue with pattern-flagged
            // transactions only. Best-effort — a sweep is a review aid, and
            // failing it must not block an accounting act.
            try {
                const sweep = await runPostEmergencyReview(admin, em.id);
                reviewFlagged = sweep.flagged;
            } catch {
                reviewFlagged = 0;
            }
        }

        await audit({
            action: `emergency.${body.action}`,
            entity_table: "emergencies",
            entity_id: em.id,
            summary: `${status} emergency ${em.emergency_ref}`,
            metadata: {
                emergency_ref: em.emergency_ref,
                closure_id: closureId,
                review_flagged: reviewFlagged,
                surplus_utilisation: body.surplus_utilisation ?? null,
                reason: body.reason ?? null,
            },
        });

        return {
            emergency_id: em.id,
            status,
            closure_id: closureId,
            review_flagged: reviewFlagged,
        };
    }
);
