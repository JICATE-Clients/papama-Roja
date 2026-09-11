import { z } from "zod";

import { defineRoute, parseBody } from "@/lib/api/handler";
import { recordAuditSelection } from "@/lib/services/riskAudit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getNumber } from "@/lib/system-config";

/**
 * GET  /api/admin/audit-selections — the permanent record of how each cycle's
 *      sample was drawn.
 * POST /api/admin/audit-selections — draw a new cycle's sample.
 *
 * F-3 (B-25), CD §D-5. "10% random audit is the baseline, not the ceiling."
 *
 * WHY A RECORD AND NOT JUST A QUEUE: a sample you can quietly re-draw after
 * seeing the results is not a sample. The header — cycle, population, rate and
 * timestamp, fixed at draw time — is what makes it defensible. Selections are
 * append-only at the database level (a forbid_delete trigger), so this route
 * offers no way to remove one and neither does anything else.
 *
 * The MINIMUM OF ONE PER CYCLE is applied after the rate, never before: 10% of
 * three settlements rounds to zero, and a pilot auditing nothing while
 * appearing to have a policy is exactly what CD §D-5's minimum exists to stop.
 */

export const GET = defineRoute(
    { feature: "audit_reports", action: "read" },
    async () => {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("settlement_audit_selections")
            .select(
                "id, cycle_ref, cycle_start, cycle_end, population_count, sample_count, " +
                    "rate_applied, selection_method, targeted_reason, selected_at, result, completed_at"
            )
            .order("selected_at", { ascending: false })
            .limit(100);
        if (error) throw new Error(error.message);
        return { selections: data ?? [] };
    }
);

const drawSchema = z.object({
    cycle_ref: z.string().trim().min(1).max(100),
    method: z.enum(["random", "targeted", "enhanced"]).optional(),
    /** Required in spirit for a targeted draw — a targeted sample needs a why. */
    targeted_reason: z.string().trim().max(1000).optional(),
});

export const POST = defineRoute(
    { feature: "audit_reports", action: "create" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, drawSchema);
        const admin = createAdminClient();

        // The eligible population: settlements that have reached a reviewable
        // state. A pending settlement has nothing to audit yet.
        const { data: rows, error } = await admin
            .from("vendor_settlements")
            .select("id")
            .in("status", ["locked", "approved", "reconciled", "paid"]);
        if (error) throw new Error(error.message);
        const populationIds = ((rows ?? []) as { id: string }[]).map((r) => r.id);

        // NULL = feature off rather than a guessed rate. The minimum-of-one still
        // applies, so an unset rate does not silently disable auditing.
        let rate: number | null = null;
        try {
            rate = await getNumber("settlement_random_audit_rate", admin as never);
        } catch {
            rate = null;
        }

        const result = await recordAuditSelection(admin, {
            cycleRef: body.cycle_ref,
            populationIds,
            rate,
            method: body.method ?? "random",
            targetedReason: body.targeted_reason ?? null,
            assignedTo: user.id,
        });

        if (result.error) throw new Error(result.error);

        await audit({
            action: "audit.selection.draw",
            entity_table: "settlement_audit_selections",
            entity_id: result.selectionId ?? body.cycle_ref,
            summary: `drew ${result.selected.length} of ${result.populationCount} for cycle ${body.cycle_ref}`,
            metadata: {
                cycle_ref: body.cycle_ref,
                population_count: result.populationCount,
                sample_count: result.selected.length,
                rate_applied: rate,
                method: body.method ?? "random",
                selected_ids: result.selected,
            },
        });

        return {
            selection_id: result.selectionId,
            population_count: result.populationCount,
            sample_count: result.selected.length,
            rate_applied: rate,
        };
    }
);
