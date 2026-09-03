import { defineRoute } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/tokens — token registry for the admin console (token-flow §6/§7).
 *
 * Gated by `token_generation/read` (admin, compliance, vendor_manager, volunteer
 * per the matrix; RLS scopes non-admins). Returns the lifecycle view — status
 * (which encodes custody: live=donor, in_admin_pool=pool, assigned_to_volunteer,
 * distributed, redeemed, expired), type, value and key timestamps. Newest mint
 * first. Capped to the most recent 500 to keep the payload bounded.
 *
 * Two things this deliberately resolves rather than leaving as raw ids:
 *
 *   - `serial_number` is the identifier printed on the QR and the one a vendor
 *     or volunteer will read out. The console used to show a truncated uuid,
 *     which matches nothing anybody can hold in their hand.
 *   - `donor_name` answers "who funded this?", which the status cannot. Custody
 *     is already carried by `status`, so a second status-derived column added
 *     nothing.
 *
 * The beneficiary is intentionally NOT named here. `token_generation/read` is
 * open to vendor_manager and volunteer, and a token list is not the place to
 * broadcast who received food; the beneficiary registry is separately gated on
 * `beneficiary_registration/read`.
 */
export const GET = defineRoute({ feature: "token_generation", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("tokens")
        .select(
            "id, serial_number, status, token_type, value_inr, donor_id, beneficiary_id, minted_at, expires_at, redeemed_at"
        )
        .order("minted_at", { ascending: false })
        .limit(500);

    if (error) throw new Error(error.message);
    const rows = data ?? [];

    // Resolve donor ids to names in one batch rather than per row. Uses the
    // admin client because `donors` is not readable under every role that can
    // read tokens — the name is the only field taken.
    const donorIds = [...new Set(rows.map((t) => t.donor_id).filter((v): v is string => v != null))];
    const donorNames = new Map<string, string>();
    if (donorIds.length > 0) {
        const { data: donors } = await createAdminClient()
            .from("donors")
            .select("id, name")
            .in("id", donorIds);
        (donors ?? []).forEach((d) => {
            if (d.name) donorNames.set(d.id as string, d.name as string);
        });
    }

    const tokens = rows.map((t) => ({
        id: t.id,
        serial_number: t.serial_number,
        status: t.status,
        token_type: t.token_type,
        value_inr: t.value_inr,
        has_donor: t.donor_id != null,
        has_beneficiary: t.beneficiary_id != null,
        donor_name: t.donor_id ? (donorNames.get(t.donor_id) ?? null) : null,
        minted_at: t.minted_at,
        expires_at: t.expires_at,
        redeemed_at: t.redeemed_at,
    }));

    return { tokens, total: tokens.length };
});
