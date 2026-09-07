import { defineRoute } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNumber } from "@/lib/system-config";

/**
 * GET /api/vendor/redemptions/limits — the till-side numeric limits the vendor
 * scan screen must respect (Work Order Q-2 / B-20).
 *
 * The scan screen used to hardcode `CO_PAY_MAX = 5` while the redemption engine
 * clamped to `system_config.co_contribution_max`. Those two numbers had no way
 * of staying in step: raising the config to 10 left the till refusing ₹10, and
 * the vendor had no way to tell why. This route makes the config the single
 * source for both sides.
 *
 * Gated by `token_redemption/read` (own) — the same cell the scan flow already
 * needs — so no new permission surface is opened. The read runs on the service
 * client because `system_config` is not vendor-readable under RLS, and only the
 * single co-pay ceiling is returned: this is not a general config endpoint, and
 * it must not become one.
 *
 * `co_contribution_max: null` means the key is unset. That is NOT "no limit" —
 * the engine accepts only ₹0 when it is unset (see redemption.ts), so the client
 * must disable the field. Returning null rather than a guessed number keeps the
 * "never invent a config value" rule intact.
 */
export const GET = defineRoute(
    { feature: "token_redemption", action: "read", scope: "own" },
    async () => {
        const admin = createAdminClient();

        let coContributionMax: number | null;
        try {
            coContributionMax = await getNumber("co_contribution_max", admin as never);
        } catch {
            coContributionMax = null;
        }

        return { co_contribution_max: coContributionMax };
    }
);
