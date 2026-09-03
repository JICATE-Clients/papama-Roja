import { defineRoute, NotFoundError } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/beneficiaries/[id] — privacy-safe detail for one beneficiary.
 *
 * Powers the admin beneficiary DetailDrawer. Gated by
 * `beneficiary_registration/read`. PRIVACY: the raw `face_hash`/`aadhaar_hash`
 * are NEVER returned — only the boolean presence flags, same contract as the
 * list route. Adds the eligibility window, who registered it, and this
 * beneficiary's redemption history (vendor + meal value + date) so admins can
 * review usage without ever touching identity material.
 */
export const GET = defineRoute<{ id: string }>(
    { feature: "beneficiary_registration", action: "read" },
    async ({ params }) => {
        const admin = createAdminClient();
        const id = params.id;

        const { data: b, error } = await admin
            .from("beneficiaries")
            .select(
                "id, full_name, category, status, eligibility_status, eligibility_expires_at, aadhaar_hash, face_hash, registered_by, created_at, updated_at"
            )
            .eq("id", id)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!b) throw new NotFoundError("beneficiary not found");

        // Resolve who registered them to a readable name + role (raw uuid is meaningless).
        let registeredByName: string | null = null;
        let registeredByRole: string | null = null;
        if (b.registered_by) {
            const { data: u } = await admin
                .from("users")
                .select("full_name, role")
                .eq("id", b.registered_by)
                .maybeSingle();
            registeredByName = (u?.full_name as string) ?? null;
            registeredByRole = (u?.role as string) ?? null;
        }

        // This beneficiary's redemptions (newest first). Identity-free: vendor +
        // values + timestamps only.
        const { data: redemptions, error: redemptionError } = await admin
            .from("token_redemptions")
            .select("id, vendor_id, menu_value_inr, token_value_inr, co_pay_inr, payment_status, redeemed_at")
            .eq("beneficiary_id", id)
            .order("redeemed_at", { ascending: false })
            .limit(50);
        if (redemptionError) throw new Error(redemptionError.message);

        return {
            beneficiary: {
                beneficiary_id: b.id,
                // Optional by design; the drawer renders "Not recorded" when null.
                full_name: b.full_name ?? null,
                category: b.category,
                status: b.status,
                eligibility: b.eligibility_status,
                eligibility_expires_at: b.eligibility_expires_at,
                // Presence flags ONLY — never the raw hash material.
                aadhaar_linked: b.aadhaar_hash != null,
                face_hash_valid: b.face_hash != null,
                registered_by: b.registered_by,
                registered_by_name: registeredByName,
                registered_by_role: registeredByRole,
                registered_at: b.created_at,
                updated_at: b.updated_at,
            },
            redemptions: redemptions ?? [],
        };
    }
);
