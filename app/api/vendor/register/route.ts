import { z } from "zod";

import { BadRequestError, parseBody, toErrorResponse } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/audit";
import { assertWithinOperatingCity } from "@/lib/services/operatingCity";

/**
 * POST /api/vendor/register — self-service vendor onboarding (PUBLIC, no session).
 *
 * Why the account is created SERVER-SIDE here (not via a client supabase.auth.signUp):
 *   The project has email confirmation ON, so a client signUp returns NO session.
 *   The old flow only created the vendor record when a session came back, so with
 *   confirmation on the conversion never ran and the typed-in business details were
 *   silently dropped — the new vendor was stranded as a plain donor (the bug that
 *   left rojasundaram2000@gmail.com as role 'donor' with no vendor row).
 *
 * We now do everything in one atomic shot on the service-role client, rolling the
 * auth user back if any later step fails:
 *   1. admin.auth.admin.createUser({ email, password, email_confirm: true }) —
 *      vendors are gated by ADMIN approval, not email confirmation, so pre-confirming
 *      is correct. The handle_new_user trigger provisions users(role 'donor') +
 *      donors + donor_credits.
 *   2. flip users.role → 'vendor', clear donor_id, tear down the unused donor rows
 *      (credits first: FK order).
 *   3. insert the pending vendors row (status/kyc 'pending').
 *   4. audit vendor.register (self-registration → no staff actor).
 * The client then signs in with the same credentials (already confirmed) and lands
 * on /vendor. NOTE: this is an unauthenticated endpoint; it only ever creates a
 * PENDING vendor that an admin must approve before it can do anything.
 */
const schema = z.object({
    email: z.string().trim().email("a valid email is required"),
    password: z.string().min(8, "password must be at least 8 characters"),
    name: z.string().trim().min(1, "business name is required"),
    legal_name: z.string().trim().optional(),
    address: z.string().trim().optional(),
    /** Q-5 (B-15): matched against the operating city while the lock is on. */
    city: z.string().trim().optional(),
    pincode: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    contact_email: z.string().trim().email().optional(),
    emergency_contact: z.string().trim().optional(),
    fssai_license: z.string().trim().optional(),
    gst_number: z.string().trim().optional(),
    bank_account_name: z.string().trim().optional(),
    bank_account_number: z.string().trim().optional(),
    bank_ifsc: z.string().trim().optional(),
    geo_lat: z.number().nullable().optional(),
    geo_lng: z.number().nullable().optional(),
});

export async function POST(req: Request) {
    try {
        const body = await parseBody(req as never, schema);
        const admin = createAdminClient();

        // Q-5 (B-15): a Food Partner outside the operating city cannot serve a
        // token there anyway (redemption refuses it), so refuse at sign-up.
        await assertWithinOperatingCity(body.city, admin as never);

        // 1. Create the auth user (email pre-confirmed). The handle_new_user trigger
        //    provisions users(role 'donor') + donors + donor_credits.
        const { data: created, error: createError } = await admin.auth.admin.createUser({
            email: body.email,
            password: body.password,
            email_confirm: true,
            user_metadata: { full_name: body.name, account_type: "vendor" },
        });

        if (createError || !created?.user) {
            const msg = createError?.message ?? "could not create the account";
            const exists = /already|registered|exists/i.test(msg);
            throw new BadRequestError(
                exists
                    ? "an account with this email already exists — please sign in instead"
                    : msg,
            );
        }

        const userId = created.user.id;

        try {
            // 2. Promote donor → vendor and unlink the donor profile.
            const { error: roleError } = await admin
                .from("users")
                .update({ role: "vendor", donor_id: null })
                .eq("id", userId);
            if (roleError) throw new Error(roleError.message);

            // Tear down the now-unused donor rows (credits first: FK order).
            const { data: donorRow } = await admin
                .from("donors")
                .select("id")
                .eq("user_id", userId)
                .maybeSingle();
            if (donorRow) {
                const { error: credErr } = await admin
                    .from("donor_credits")
                    .delete()
                    .eq("donor_id", donorRow.id);
                if (credErr) throw new Error(credErr.message);
                const { error: donorErr } = await admin
                    .from("donors")
                    .delete()
                    .eq("id", donorRow.id);
                if (donorErr) throw new Error(donorErr.message);
            }

            // 3. Create the vendor outlet (pending review + pending KYC).
            const { data: vendor, error: vendorError } = await admin
                .from("vendors")
                .insert({
                    owner_id: userId,
                    name: body.name,
                    legal_name: body.legal_name ?? null,
                    address: body.address ?? null,
                    city: body.city ?? null,
                    pincode: body.pincode ?? null,
                    phone: body.phone ?? null,
                    email: body.contact_email ?? body.email,
                    emergency_contact: body.emergency_contact ?? null,
                    fssai_license: body.fssai_license ?? null,
                    gst_number: body.gst_number ?? null,
                    bank_account_name: body.bank_account_name ?? null,
                    bank_account_number: body.bank_account_number ?? null,
                    bank_ifsc: body.bank_ifsc ?? null,
                    geo_lat: body.geo_lat ?? null,
                    geo_lng: body.geo_lng ?? null,
                    status: "pending",
                    kyc_status: "pending",
                })
                .select("id, status")
                .single();
            if (vendorError || !vendor) {
                throw new Error(vendorError?.message ?? "failed to create vendor");
            }

            // 4. Audit the self-registration (no staff actor).
            await writeAuditLog({
                actor: null,
                action: "vendor.register",
                entity_table: "vendors",
                entity_id: vendor.id as string,
                summary: `self-registered vendor '${body.name}' (${body.email})`,
                metadata: { vendor_id: vendor.id, owner_id: userId, self_registered: true },
            });

            return new Response(
                JSON.stringify({ vendor_id: vendor.id, status: vendor.status }),
                { status: 200, headers: { "content-type": "application/json" } },
            );
        } catch (innerErr) {
            // Roll back the half-created auth user so the email can be retried cleanly.
            await admin.auth.admin.deleteUser(userId).catch(() => {});
            throw innerErr;
        }
    } catch (err) {
        return toErrorResponse(err);
    }
}
