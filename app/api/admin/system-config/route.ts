import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
    systemConfigUpdateRequestSchema,
    type SystemConfigRow,
} from "@/lib/validation/schemas";

/**
 * GET /api/admin/system-config — all tunable config rows (contract §1).
 *
 * `system_config` has no dedicated matrix feature, so the read is gated under
 * `audit_reports/read` (admin + compliance). Values are returned as raw text +
 * `value_type` (the contract shape); callers coerce via lib/system-config. An
 * unset row keeps a null `value` — never substitute a guessed default.
 */
export const GET = defineRoute({ feature: "audit_reports", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("system_config")
        .select("key, value, value_type, description, updated_at")
        .order("key", { ascending: true });

    if (error) throw new Error(error.message);

    const config: SystemConfigRow[] = (data ?? []).map((r) => ({
        key: r.key,
        value: r.value,
        value_type: r.value_type as SystemConfigRow["value_type"],
        description: r.description ?? undefined,
        updated_at: r.updated_at,
    }));

    return { config };
});

/**
 * PATCH /api/admin/system-config — update one existing config row's value.
 *
 * Gated by `audit_reports/update` — admin only (compliance is read-only). The
 * value is coerced/validated against the row's `value_type` and stored as text;
 * `null` unsets the row. Unknown key → 404, bad value for the type → 400. Records
 * `updated_by` and audits the change. Does NOT create new keys.
 */
/**
 * Per-key hard ceilings for numeric config (Work Order Q-1 / B-10).
 *
 * The type check below only proves a number is non-negative, which is not enough
 * for a key that carries a policy limit. The client's decision (CD §D-1) fixes
 * the beneficiary contribution at ₹10 — that is a promise made to beneficiaries,
 * not a tunable. Storing 50 here would let a single config edit quietly raise
 * what every beneficiary is asked to pay at the counter, with nothing downstream
 * to catch it: the redemption engine clamps to whatever this row says.
 *
 * Keys absent from this map keep the non-negative check only.
 */
const NUMERIC_MAX: Readonly<Record<string, number>> = {
    co_contribution_max: 10,
};

function toStoredValue(
    key: string,
    valueType: string,
    value: string | number | boolean | null
): string | null {
    if (value === null) return null;
    switch (valueType) {
        case "number": {
            const n = typeof value === "number" ? value : Number(String(value).trim());
            if (!Number.isFinite(n)) {
                throw new BadRequestError("value for a 'number' config must be numeric");
            }
            // Every numeric config key (token value, radius, cooldown, meals,
            // co-pay, rating, …) is inherently non-negative. A negative value
            // would silently disable a rule (e.g. radius < 0 blocks all
            // redemptions) — reject it rather than store a foot-gun.
            if (n < 0) {
                throw new BadRequestError("value for a 'number' config must be zero or positive");
            }
            const max = NUMERIC_MAX[key];
            if (max !== undefined && n > max) {
                throw new BadRequestError(`${key} cannot exceed ${max}`);
            }
            return String(n);
        }
        case "boolean": {
            if (typeof value === "boolean") return value ? "true" : "false";
            const s = String(value).trim().toLowerCase();
            if (s === "true" || s === "false") return s;
            throw new BadRequestError("value for a 'boolean' config must be true or false");
        }
        default:
            return String(value);
    }
}

export const PATCH = defineRoute(
    { feature: "audit_reports", action: "update" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, systemConfigUpdateRequestSchema);

        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("system_config")
            .select("key, value, value_type")
            .eq("key", body.key)
            .single();

        if (fetchError || !data) throw new NotFoundError("config key not found");
        const row = data as { key: string; value: string | null; value_type: string };

        const stored = toStoredValue(row.key, row.value_type, body.value);

        const { error: updateError } = await admin
            .from("system_config")
            .update({
                value: stored,
                updated_by: user.id,
                updated_at: new Date().toISOString(),
            })
            .eq("key", body.key);

        if (updateError) throw new Error(updateError.message);

        await audit({
            action: "system_config.update",
            entity_table: "system_config",
            entity_id: body.key,
            summary: `${body.key}: ${row.value ?? "unset"} → ${stored ?? "unset"}`,
            // `reason` is omitted rather than stored as null when absent, so a
            // metadata query for reasons returns only changes that actually
            // carried one.
            metadata: {
                from: row.value,
                to: stored,
                ...(body.reason ? { reason: body.reason } : {}),
            },
        });

        return { ok: true, key: body.key, value: stored };
    }
);
