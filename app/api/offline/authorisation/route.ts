import { defineRoute } from "@/lib/api/handler";
import { resolveEmergencyRelaxation } from "@/lib/services/emergencyRelaxation";
import {
    resolveServiceLocation,
    type ServiceLocationSnapshot,
} from "@/lib/services/serviceLocation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBoolean } from "@/lib/system-config";
import { resolveVendorId } from "@/lib/vendor/server-identity";

/**
 * GET /api/offline/authorisation — what a device may do if it loses connectivity
 * (E-4 / B-30, design §5).
 *
 * THE CONSTRAINT THIS EXISTS FOR: a device cannot ask whether an emergency is
 * active once it is offline — being unable to ask IS the scenario. So while the
 * device is still online it fetches this, caches it, and the cached copy
 * SELF-EXPIRES at the emergency's end. A device that never connected during the
 * emergency therefore cannot capture offline, which is correct: the alternative
 * is a device that authorises itself.
 *
 * Returns `authorised: false` rather than an error whenever offline capture is
 * not permitted, so the client simply clears any stale cached authorisation.
 *
 * The cache is only a convenience for the device. Nothing here is trusted at
 * sync: the server re-checks the emergency period, the device, the token and the
 * window against its own records (lib/services/offlineSync.ts).
 */
export const GET = defineRoute(
    { feature: "token_redemption", action: "read", scope: "own" },
    async ({ user }) => {
        const admin = createAdminClient();

        let enabled = false;
        try {
            enabled = await getBoolean("offline_capture_enabled", admin as never);
        } catch {
            enabled = false;
        }
        if (!enabled) {
            return { authorised: false, reason: "offline capture is switched off" };
        }

        // Food Partner route (primary): the emergency must cover where this
        // partner serves. Volunteer route (secondary): no premises, so only an
        // emergency with no geographic limit covers them.
        const vendorId = await resolveVendorId(user, admin);
        const location: ServiceLocationSnapshot = vendorId
            ? await resolveServiceLocation(admin as never, vendorId)
            : { service_city: null, service_district: null, service_state: null, service_pincode: null };

        const relaxation = await resolveEmergencyRelaxation(admin as never, location);
        if (!relaxation.emergencyId) {
            return { authorised: false, reason: "no active emergency covers this location" };
        }

        const { data } = await admin
            .from("emergencies")
            .select("ends_at")
            .eq("id", relaxation.emergencyId)
            .maybeSingle();
        const endsAt = (data as { ends_at: string } | null)?.ends_at ?? null;
        if (!endsAt) {
            return { authorised: false, reason: "emergency end date could not be read" };
        }

        return {
            authorised: true,
            emergency_id: relaxation.emergencyId,
            emergency_ref: relaxation.emergencyRef,
            // The device must stop capturing at this moment BY ITS OWN CLOCK,
            // even though it cannot confirm it. The server rejects anything
            // captured outside the true period regardless.
            expires_at: endsAt,
            waiver_enabled: relaxation.contributionWaived,
            source: vendorId ? "food_partner" : "volunteer",
            food_partner_id: vendorId,
            issued_at: new Date().toISOString(),
        };
    }
);
