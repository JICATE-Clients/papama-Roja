import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import { deriveQrPayload } from "@/app/api/_lib/tokenQr";
import { buildTokenDisplayPayload, type TokenDisplayInput } from "@/lib/services/tokenDisplay";

/**
 * GET /api/donor/tokens — the signed-in donor's minted tokens (token-flow §2).
 *
 * Gated by `token_generation/read` (scope own). Read through the session client
 * so RLS (`tokens_select_own`) scopes rows to this donor. `qr_payload` maps the
 * stored `qr_hash`; status uses the live `token_status` enum (no mock values).
 * Includes `issued_at`/`redeemed_at` so the donor token UI can render timelines.
 */
export const GET = defineRoute(
    { feature: "token_generation", action: "read", scope: "own" },
    async () => {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("tokens")
            .select(
                "id, serial_number, token_type, status, value_inr, expires_at, minted_at, redeemed_at, special_instructions, area_lock, distribution_mode, geographic_scope, scope_state_id, scope_district_id, scope_city, scope_pincode, activated_at, is_emergency, replacement_for_token_id"
            )
            .order("minted_at", { ascending: false });

        if (error) throw new Error(error.message);

        // A-2 display payload: resolve scope names once for the whole list.
        // states/districts are readable by any signed-in user (A-1 RLS).
        const rows = data ?? [];
        const stateIds = [...new Set(rows.map((t) => t.scope_state_id).filter(Boolean))] as string[];
        const districtIds = [...new Set(rows.map((t) => t.scope_district_id).filter(Boolean))] as string[];
        const stateName = new Map<string, string>();
        const districtName = new Map<string, string>();
        if (stateIds.length > 0) {
            const { data: st } = await supabase.from("states").select("id, name").in("id", stateIds);
            for (const r of (st ?? []) as { id: string; name: string }[]) stateName.set(r.id, r.name);
        }
        if (districtIds.length > 0) {
            const { data: ds } = await supabase.from("districts").select("id, name").in("id", districtIds);
            for (const r of (ds ?? []) as { id: string; name: string }[]) districtName.set(r.id, r.name);
        }
        // Serial of each token's replacement, so an expired token can say what
        // replaced it, and of each reissued token's original.
        const serialById = new Map(rows.map((t) => [t.id as string, t.serial_number as string]));
        const replacedBy = new Map<string, string>();
        for (const t of rows) {
            if (t.replacement_for_token_id) replacedBy.set(t.replacement_for_token_id as string, t.serial_number as string);
        }

        const tokens = rows.map((t) => ({
            token_id: t.id as string,
            serial_number: t.serial_number as string,
            token_type: t.token_type as string,
            status: t.status as string,
            value: t.value_inr as number,
            qr_payload: deriveQrPayload(t.id as string),
            issued_at: t.minted_at as string,
            expires_at: (t.expires_at as string | null) ?? null,
            redeemed_at: (t.redeemed_at as string | null) ?? null,
            is_special_care: (t.token_type as string) === "special_care",
            special_instructions: (t.special_instructions as string | null) ?? undefined,
            area_lock: (t.area_lock as string | null) ?? undefined,
            display: buildTokenDisplayPayload(t as unknown as TokenDisplayInput, {
                stateName: t.scope_state_id ? stateName.get(t.scope_state_id as string) : null,
                districtName: t.scope_district_id ? districtName.get(t.scope_district_id as string) : null,
                reissuedFromSerial: t.replacement_for_token_id
                    ? (serialById.get(t.replacement_for_token_id as string) ?? null)
                    : null,
                replacedBySerial: replacedBy.get(t.id as string) ?? null,
            }),
        }));

        return { tokens, total: tokens.length };
    }
);
