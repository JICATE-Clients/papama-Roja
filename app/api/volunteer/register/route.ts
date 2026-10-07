import { z } from "zod";

import { BadRequestError, parseBody, toErrorResponse } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/audit";
import { assertWithinOperatingCity } from "@/lib/services/operatingCity";

/**
 * POST /api/volunteer/register — self-service volunteer onboarding (PUBLIC, no session).
 *
 * Mirrors the vendor self-register flow (and for the same reason): email
 * confirmation is ON, so a client-side supabase.auth.signUp returns no session and
 * would strand the new account as a plain donor. We do everything server-side on
 * the service-role client, rolling the auth user back if any later step fails:
 *   1. createUser({ email, password, email_confirm: true }) — volunteers are gated
 *      by ADMIN approval, not email confirmation. The handle_new_user trigger
 *      provisions users(role 'donor') + donors + donor_credits.
 *   2. flip users.role → 'volunteer', clear donor_id, tear down the unused donor rows.
 *   3. insert the volunteers row as 'pending' (an admin approves it later).
 *   4. audit volunteer.register (self-registration → no staff actor).
 * The client then signs in with the same (already-confirmed) credentials and lands
 * on /volunteer, where it sees an "awaiting approval" screen until an admin approves.
 */
const schema = z.object({
    email: z.string().trim().email("a valid email is required"),
    password: z.string().min(8, "password must be at least 8 characters"),
    full_name: z.string().trim().min(1, "your name is required"),
    phone: z.string().trim().optional(),
    /** Q-5 (B-15): matched against the operating city while the lock is on. */
    city: z.string().trim().max(120).optional(),
});

export async function POST(req: Request) {
    try {
        const body = await parseBody(req as never, schema);
        const admin = createAdminClient();

        // Q-5 (B-15): a volunteer works where pApAmA operates.
        await assertWithinOperatingCity(body.city, admin as never);

        // 1. Create the auth user (email pre-confirmed). Trigger provisions a donor.
        const { data: created, error: createError } = await admin.auth.admin.createUser({
            email: body.email,
            password: body.password,
            email_confirm: true,
            user_metadata: { full_name: body.full_name, account_type: "volunteer" },
        });

        if (createError || !created?.user) {
            const msg = createError?.message ?? "could not create the account";
            const exists = /already|registered|exists/i.test(msg);
            throw new BadRequestError(
                exists
                    ? "an account with this email already exists — please sign in instead"
                    : msg
            );
        }

        const userId = created.user.id;

        try {
            // 2. Promote donor → volunteer and unlink the donor profile.
            const { error: roleError } = await admin
                .from("users")
                .update({ role: "volunteer", donor_id: null })
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

            // 3. Create the volunteer profile (pending admin approval).
            const { data: volunteer, error: volunteerError } = await admin
                .from("volunteers")
                .insert({
                    user_id: userId,
                    full_name: body.full_name,
                    phone: body.phone ?? null,
                    email: body.email,
                    city: body.city ?? null,
                    status: "pending",
                })
                .select("id, status")
                .single();
            if (volunteerError || !volunteer) {
                throw new Error(volunteerError?.message ?? "failed to create volunteer");
            }

            // 4. Audit the self-registration (no staff actor).
            await writeAuditLog({
                actor: null,
                action: "volunteer.register",
                entity_table: "volunteers",
                entity_id: volunteer.id as string,
                summary: `self-registered volunteer '${body.full_name}' (${body.email})`,
                metadata: { volunteer_id: volunteer.id, user_id: userId, self_registered: true },
            });

            return new Response(
                JSON.stringify({ volunteer_id: volunteer.id, status: volunteer.status }),
                { status: 200, headers: { "content-type": "application/json" } }
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
