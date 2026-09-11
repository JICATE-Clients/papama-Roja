import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * GET   /api/admin/appeal-templates — the template library.
 * POST  /api/admin/appeal-templates — draft a new one.
 * PATCH /api/admin/appeal-templates — approve, retire, or mark instant.
 *
 * E-6 (B-26 b,c), CD §D-6.
 *
 * AN UNAPPROVED TEMPLATE CANNOT DISPATCH. That is the approval workflow's whole
 * purpose, and it is enforced in the dispatch service, not merely here — this
 * route is the way a human moves a template through the states.
 *
 * MARKING A TEMPLATE "INSTANT" IS ITSELF AN APPROVAL DECISION. An instant
 * template may go out during an emergency without waiting for a fresh approval,
 * which is why the schema only allows it on an already-approved template, and
 * why every instant dispatch leaves a post-send review task behind it. A flood
 * does not wait for an approval queue — but speed must not quietly become an
 * absence of oversight.
 */

export const GET = defineRoute(
    { feature: "emergency_disaster_mode", action: "read" },
    async () => {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("emergency_appeal_templates")
            .select(
                "id, name, subject, body, audience, status, is_instant, approved_at, created_at"
            )
            .order("created_at", { ascending: false })
            .limit(100);
        if (error) throw new Error(error.message);
        return { templates: data ?? [] };
    }
);

const createSchema = z.object({
    name: z.string().trim().min(1).max(200),
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(5000),
    audience: z.enum(["all", "individual", "csr"]).optional(),
});

export const POST = defineRoute(
    { feature: "emergency_disaster_mode", action: "create" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, createSchema);
        const admin = createAdminClient();

        // Always created as a DRAFT. A template cannot be born approved — the
        // whole point is that a second pair of eyes sees the wording before it
        // reaches donors.
        const { data, error } = await admin
            .from("emergency_appeal_templates")
            .insert({
                name: body.name,
                subject: body.subject,
                body: body.body,
                audience: body.audience ?? "all",
                status: "draft",
                created_by: user.id,
            })
            .select("id, name")
            .single();
        if (error || !data) throw new Error(error?.message ?? "failed to create the template");
        const tpl = data as { id: string; name: string };

        await audit({
            action: "appeal.template.create",
            entity_table: "emergency_appeal_templates",
            entity_id: tpl.id,
            summary: `drafted appeal template '${tpl.name}'`,
            metadata: { name: tpl.name, audience: body.audience ?? "all" },
        });

        return { template_id: tpl.id, status: "draft" };
    }
);

const patchSchema = z.object({
    template_id: z.string().uuid(),
    action: z.enum(["approve", "retire", "mark_instant", "unmark_instant"]),
});

export const PATCH = defineRoute(
    { feature: "emergency_disaster_mode", action: "update" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, patchSchema);
        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("emergency_appeal_templates")
            .select("id, name, status, is_instant")
            .eq("id", body.template_id)
            .maybeSingle();
        if (fetchError || !data) throw new NotFoundError("template not found");
        const tpl = data as { id: string; name: string; status: string; is_instant: boolean };

        const update: Record<string, unknown> = {};
        const nowIso = new Date().toISOString();

        if (body.action === "approve") {
            if (tpl.status === "retired") {
                throw new BadRequestError(
                    "a retired template cannot be re-approved — draft a new one"
                );
            }
            update.status = "approved";
            update.approved_by = user.id;
            update.approved_at = nowIso;
        } else if (body.action === "retire") {
            update.status = "retired";
            // Retiring clears instant: a template nobody should send must not
            // remain the one that sends fastest.
            update.is_instant = false;
        } else if (body.action === "mark_instant") {
            if (tpl.status !== "approved") {
                throw new BadRequestError(
                    "only an approved template can be marked instant — instant means pre-approved"
                );
            }
            update.is_instant = true;
        } else {
            update.is_instant = false;
        }

        const { error: updateError } = await admin
            .from("emergency_appeal_templates")
            .update(update)
            .eq("id", body.template_id);
        if (updateError) throw new Error(updateError.message);

        await audit({
            action: `appeal.template.${body.action}`,
            entity_table: "emergency_appeal_templates",
            entity_id: body.template_id,
            summary: `template '${tpl.name}' ${body.action.replace("_", " ")}`,
            metadata: {
                name: tpl.name,
                from_status: tpl.status,
                was_instant: tpl.is_instant,
                ...update,
            },
        });

        return { template_id: body.template_id, ...update };
    }
);
