import { BadRequestError, NotFoundError, defineRoute, parseBody, parseQuery } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { BeneficiaryStatus } from "@/lib/types/enums";
import {
    beneficiaryActionRequestSchema,
    type BeneficiaryResponse,
} from "@/lib/validation/schemas";
import { z } from "zod";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

const beneficiaryListQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
    offset: z.coerce.number().int().min(0).optional(),
});

/**
 * GET /api/admin/beneficiaries — approved-beneficiary registry (contract §6).
 *
 * Thin read gated by `beneficiary_registration/read`. Privacy-first: the raw
 * `face_hash`/`aadhaar_hash` are NEVER returned — only the boolean presence flags
 * `face_hash_valid` / `aadhaar_linked`. `full_name` IS returned — without it the
 * console list has no identifying column at all and every row reads the same —
 * but it is frequently null, since it is optional by design and most
 * beneficiaries are non-app users. `status` is the record-state enum
 * (active|suspended|blocked) from the `beneficiaries` table; the pending-approval
 * queue lives in `beneficiary_registrations` (separate route).
 */
export const GET = defineRoute(
    { feature: "beneficiary_registration", action: "read" },
    async ({ req }) => {
        const { limit = DEFAULT_LIMIT, offset = 0 } = parseQuery(
            req.nextUrl.searchParams,
            beneficiaryListQuerySchema
        );
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("beneficiaries")
            .select("id, full_name, category, status, eligibility_status, aadhaar_hash, face_hash, created_at")
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw new Error(error.message);

        const beneficiaries: BeneficiaryResponse[] = (data ?? []).map((b) => ({
            beneficiary_id: b.id,
            full_name: b.full_name ?? null,
            category: b.category,
            status: b.status,
            eligibility: b.eligibility_status,
            aadhaar_linked: b.aadhaar_hash != null,
            face_hash_valid: b.face_hash != null,
            registered_at: b.created_at,
        }));

        return { beneficiaries, total: beneficiaries.length, limit, offset };
    }
);

/**
 * PATCH /api/admin/beneficiaries — admin record-state control (owner §4.6).
 *
 * Gated by `beneficiary_registration/update` — admin only (matches the
 * `beneficiaries_update_admin` RLS policy). State machine: suspend (active→
 * suspended), activate (suspended→active), block (active|suspended→blocked,
 * terminal). Illegal transition → 400, missing → 404. Audited; reason → trail.
 */
type BeneficiaryActionRule = {
    to: BeneficiaryStatus;
    from: ReadonlyArray<BeneficiaryStatus>;
    verb: string;
};

const BENEFICIARY_ACTION_RULES: Record<string, BeneficiaryActionRule> = {
    suspend: { to: "suspended", from: ["active"], verb: "beneficiary.suspend" },
    activate: { to: "active", from: ["suspended"], verb: "beneficiary.activate" },
    block: { to: "blocked", from: ["active", "suspended"], verb: "beneficiary.block" },
};

export const PATCH = defineRoute(
    { feature: "beneficiary_registration", action: "update" },
    async ({ req, audit }) => {
        const body = await parseBody(req, beneficiaryActionRequestSchema);
        const rule = BENEFICIARY_ACTION_RULES[body.action];

        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("beneficiaries")
            .select("id, status")
            .eq("id", body.beneficiary_id)
            .single();

        if (fetchError || !data) throw new NotFoundError("beneficiary not found");
        const beneficiary = data as { id: string; status: BeneficiaryStatus };

        if (!rule.from.includes(beneficiary.status)) {
            throw new BadRequestError(
                `cannot '${body.action}' a beneficiary whose status is '${beneficiary.status}'`
            );
        }

        const { error: updateError } = await admin
            .from("beneficiaries")
            .update({ status: rule.to, updated_at: new Date().toISOString() })
            .eq("id", body.beneficiary_id);

        if (updateError) throw new Error(updateError.message);

        await audit({
            action: rule.verb,
            entity_table: "beneficiaries",
            entity_id: body.beneficiary_id,
            summary: `beneficiary: ${beneficiary.status} → ${rule.to}${
                body.reason ? ` (${body.reason})` : ""
            }`,
            metadata: { from: beneficiary.status, to: rule.to, reason: body.reason ?? null },
        });

        return { ok: true, id: body.beneficiary_id, status: rule.to };
    }
);
