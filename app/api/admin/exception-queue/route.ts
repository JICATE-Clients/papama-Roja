import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * GET   /api/admin/exception-queue — inherently risky transactions to review.
 * PATCH /api/admin/exception-queue — clear or escalate one.
 *
 * F-3 (B-25, CD §D-5) built this queue once and shared it, per the Work Order's
 * cross-cutting note: E-3 files emergency patterns into it, E-4 files offline
 * duplicates, F-2 files bank changes and reissues. This is the one screen that
 * reads all of them.
 *
 * Filterable by `?type=` and `?emergency=` because CD §D-5 and §D-7 ask for
 * different cuts of the same queue — a post-emergency review looks at one
 * Emergency ID, a routine audit looks at reissues and bank changes.
 */
export const GET = defineRoute(
    { feature: "audit_reports", action: "read" },
    async ({ req }) => {
        const supabase = await createClient();
        const type = req.nextUrl.searchParams.get("type");
        const emergency = req.nextUrl.searchParams.get("emergency");
        const status = req.nextUrl.searchParams.get("status");

        let query = supabase
            .from("exception_queue")
            .select(
                "id, exception_type, entity_table, entity_id, vendor_id, severity, detail, " +
                    "emergency_id, status, reviewed_at, resolution, created_at"
            );

        // Default to what still needs a decision. An explicit ?status= lets a
        // reviewer look back at what was cleared.
        if (status) query = query.eq("status", status);
        else query = query.in("status", ["open", "in_review"]);

        if (type) query = query.eq("exception_type", type);
        if (emergency) query = query.eq("emergency_id", emergency);

        const { data, error } = await query
            .order("created_at", { ascending: false })
            .limit(300);
        if (error) throw new Error(error.message);

        const rows = data ?? [];
        return {
            exceptions: rows,
            total: rows.length,
            critical: rows.filter(
                (r) => (r as unknown as { severity: string | null }).severity === "critical"
            ).length,
        };
    }
);

const patchSchema = z.object({
    exception_id: z.string().uuid(),
    action: z.enum(["start", "clear", "escalate"]),
    /**
     * Mandatory on clear. Clearing an exception says "I looked and this is
     * fine" — without a note there is no record of who decided that or why,
     * which defeats the point of flagging it.
     */
    resolution: z.string().trim().max(2000).optional(),
});

const TRANSITIONS: Record<string, { to: string; from: string[] }> = {
    start: { to: "in_review", from: ["open"] },
    clear: { to: "cleared", from: ["open", "in_review"] },
    escalate: { to: "escalated", from: ["open", "in_review"] },
};

export const PATCH = defineRoute(
    { feature: "audit_reports", action: "update" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, patchSchema);
        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("exception_queue")
            .select("id, status, exception_type, entity_table, entity_id, severity")
            .eq("id", body.exception_id)
            .maybeSingle();
        if (fetchError || !data) throw new NotFoundError("exception not found");
        const ex = data as {
            id: string;
            status: string;
            exception_type: string;
            entity_table: string;
            entity_id: string;
            severity: string | null;
        };

        const rule = TRANSITIONS[body.action];
        if (!rule.from.includes(ex.status)) {
            throw new BadRequestError(
                `cannot '${body.action}' an exception whose status is '${ex.status}'`
            );
        }
        if (body.action === "clear" && !body.resolution?.trim()) {
            throw new BadRequestError(
                "a resolution note is required when clearing an exception — an unexplained clear is not a review"
            );
        }

        const nowIso = new Date().toISOString();
        const { error: updateError } = await admin
            .from("exception_queue")
            .update({
                status: rule.to,
                reviewed_by: user.id,
                reviewed_at: nowIso,
                resolution: body.resolution ?? null,
            })
            .eq("id", body.exception_id)
            .eq("status", ex.status); // CAS: two reviewers cannot both win
        if (updateError) throw new Error(updateError.message);

        await audit({
            action: `exception.${body.action}`,
            entity_table: "exception_queue",
            entity_id: body.exception_id,
            summary: `exception '${ex.exception_type}' ${rule.to}`,
            metadata: {
                exception_type: ex.exception_type,
                target_table: ex.entity_table,
                target_id: ex.entity_id,
                severity: ex.severity,
                from: ex.status,
                to: rule.to,
                resolution: body.resolution ?? null,
            },
        });

        return { exception_id: body.exception_id, status: rule.to };
    }
);
