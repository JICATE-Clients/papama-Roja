import { BadRequestError, NotFoundError, defineRoute, parseBody, parseQuery } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FraudStatus } from "@/lib/types/enums";
import { fraudActionRequestSchema, type FraudFlagDetailResponse } from "@/lib/validation/schemas";
import { z } from "zod";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

const fraudListQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
    offset: z.coerce.number().int().min(0).optional(),
});

/**
 * GET /api/admin/fraud — fraud flags for the admin console (contract §9).
 *
 * Gated by `fraud_monitoring/read` (admin, compliance, vendor_manager). Returns
 * the richer detail shape (detection_method + resolution columns) the console
 * needs. `entity` is the polymorphic jsonb target { kind, id }. Newest first.
 *
 * `entity_label` resolves that id to something a human can act on. A flag
 * reading "vendor - 8f3a1c2e-..." forces whoever is triaging to go and look the
 * uuid up somewhere else before they can even tell which stall it is. Only
 * `vendor` and `token` have a natural label (name / serial); `face`,
 * `redemption` and `thank_you` are internal ids with nothing to resolve to, so
 * they stay null and the console falls back to a short id.
 */
export const GET = defineRoute({ feature: "fraud_monitoring", action: "read" }, async ({ req }) => {
    const { limit = DEFAULT_LIMIT, offset = 0 } = parseQuery(
        req.nextUrl.searchParams,
        fraudListQuerySchema
    );
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("fraud_flags")
        .select(
            "id, flag_type, severity, status, detection_method, entity, blocked, resolved_by, resolution_notes, resolved_at, created_at, updated_at"
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);
    const rows = data ?? [];

    // Batch-resolve the two entity kinds that have a human label. The admin
    // client is used because fraud_monitoring/read is open to vendor_manager and
    // compliance, who may not hold read on the target tables themselves; only
    // the display label is taken.
    const idsOfKind = (kind: string) => [
        ...new Set(
            rows
                .map((f) => f.entity as { kind?: string; id?: string } | null)
                .filter((e) => e?.kind === kind && typeof e.id === "string")
                .map((e) => e!.id as string)
        ),
    ];

    const labels = new Map<string, string>();
    const admin = createAdminClient();

    const vendorIds = idsOfKind("vendor");
    if (vendorIds.length > 0) {
        const { data: vs } = await admin.from("vendors").select("id, name").in("id", vendorIds);
        (vs ?? []).forEach((v) => v.name && labels.set(`vendor:${v.id}`, v.name as string));
    }

    const tokenIds = idsOfKind("token");
    if (tokenIds.length > 0) {
        const { data: ts } = await admin.from("tokens").select("id, serial_number").in("id", tokenIds);
        (ts ?? []).forEach(
            (t) => t.serial_number && labels.set(`token:${t.id}`, t.serial_number as string)
        );
    }

    const fraud_flags: FraudFlagDetailResponse[] = rows.map((f) => ({
        id: f.id,
        flag_type: f.flag_type,
        severity: f.severity,
        status: f.status,
        detection_method: f.detection_method,
        entity: f.entity,
        entity_label: labels.get(`${f.entity?.kind}:${f.entity?.id}`) ?? null,
        blocked: f.blocked,
        resolved_by: f.resolved_by,
        resolution_notes: f.resolution_notes,
        resolved_at: f.resolved_at,
        created_at: f.created_at,
        updated_at: f.updated_at,
    }));

    return { fraud_flags, total: fraud_flags.length, limit, offset };
});

/**
 * PATCH /api/admin/fraud — resolve or dismiss an open flag (contract §9).
 *
 * Gated by `fraud_monitoring/update` — admin only (compliance & vendor_manager
 * are read-only in the matrix). Only an `open` flag can be actioned (else 400);
 * a missing flag is 404. Records the resolver + notes and audits the change.
 * `dismiss` (false positive) also clears any block.
 */
export const PATCH = defineRoute(
    { feature: "fraud_monitoring", action: "update" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, fraudActionRequestSchema);

        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("fraud_flags")
            .select("id, status, flag_type, blocked")
            .eq("id", body.flag_id)
            .single();

        if (fetchError || !data) throw new NotFoundError("fraud flag not found");
        const flag = data as {
            id: string;
            status: FraudStatus;
            flag_type: string;
            blocked: boolean;
        };

        const nowIso = new Date().toISOString();

        // UNBLOCK — lift a standing block WITHOUT changing status. This is the only
        // way to release a block left in place by `resolve` (resolve/dismiss are
        // terminal and open-only, so a resolved-but-blocked entity would otherwise
        // stay blocked forever). Works on any currently-blocked flag.
        if (body.action === "unblock") {
            if (!flag.blocked) throw new BadRequestError("flag is not blocked");
            const update: Record<string, unknown> = { blocked: false, updated_at: nowIso };
            if (body.notes) update.resolution_notes = body.notes;
            const { error: unblockError } = await admin
                .from("fraud_flags")
                .update(update)
                .eq("id", body.flag_id);
            if (unblockError) throw new Error(unblockError.message);

            await audit({
                action: "fraud.unblock",
                entity_table: "fraud_flags",
                entity_id: body.flag_id,
                summary: `${flag.flag_type}: block lifted${body.notes ? ` (${body.notes})` : ""}`,
                metadata: { status: flag.status, blocked: false, notes: body.notes ?? null },
            });

            return { ok: true, id: body.flag_id, status: flag.status, blocked: false };
        }

        // RESOLVE / DISMISS — only an open flag can be actioned.
        if (flag.status !== "open") {
            throw new BadRequestError(`flag is already '${flag.status}'`);
        }

        const nextStatus: FraudStatus = body.action === "resolve" ? "resolved" : "dismissed";
        const update: Record<string, unknown> = {
            status: nextStatus,
            resolved_by: user.id,
            resolved_at: nowIso,
            resolution_notes: body.notes ?? null,
            updated_at: nowIso,
        };
        // A dismissed flag is a false positive — lift any block it imposed.
        if (body.action === "dismiss") update.blocked = false;

        const { error: updateError } = await admin
            .from("fraud_flags")
            .update(update)
            .eq("id", body.flag_id);

        if (updateError) throw new Error(updateError.message);

        await audit({
            action: `fraud.${body.action}`,
            entity_table: "fraud_flags",
            entity_id: body.flag_id,
            summary: `${flag.flag_type}: open → ${nextStatus}${body.notes ? ` (${body.notes})` : ""}`,
            metadata: { from: "open", to: nextStatus, notes: body.notes ?? null },
        });

        return { ok: true, id: body.flag_id, status: nextStatus };
    }
);
