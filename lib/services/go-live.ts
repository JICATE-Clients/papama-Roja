import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Go-live readiness — which mandatory config keys are still unset
 * (Work Order Q-4 / B-06).
 *
 * Every numeric rule in this platform soft-skips when its config row is NULL:
 * no cooldown row means no cooldown, no volunteer cap means unbounded exposure,
 * no radius means redemption anywhere. That behaviour is deliberate — the
 * alternative is inventing a limit nobody approved — but it is silent, so a
 * platform can go live enforcing almost nothing and look perfectly healthy.
 * This module makes that silence visible on the admin dashboard.
 *
 * The list is the "Mandatory" classification from the Technical Administration
 * Guide's Go-Live Checklist (docs/user-guide.md §Go-Live Checklist). Keys the
 * guide marks Recommended or Review are deliberately NOT here: a banner that
 * cries about optional settings gets ignored, and then it cannot do its job.
 */

type Client = SupabaseClient<never, never, never>;

/** One mandatory key, with the consequence of leaving it unset. */
export interface MandatoryConfigKey {
    key: string;
    /** What an administrator sets it to — plain language, not the column name. */
    label: string;
    /** What actually happens while it is NULL. This is the part that matters. */
    consequence: string;
}

export const GO_LIVE_MANDATORY_KEYS: readonly MandatoryConfigKey[] = [
    {
        key: "standard_token_value",
        label: "Standard meal token value",
        consequence: "Tokens cannot be minted at all.",
    },
    {
        key: "meal_cooldown_hours",
        label: "Minimum hours between meals",
        consequence: "No cooldown is enforced — a beneficiary can redeem repeatedly.",
    },
    {
        key: "max_meals_per_day",
        label: "Daily meal limit per beneficiary",
        consequence: "No daily limit is enforced.",
    },
    {
        key: "token_redemption_radius_km",
        label: "Redemption radius (km)",
        consequence: "Distance between Food Partner and beneficiary is not checked.",
    },
    {
        key: "max_tokens_per_volunteer",
        label: "Volunteer holding limit",
        consequence: "No limit is enforced — volunteer exposure is unbounded.",
    },
    {
        key: "token_expiry_days",
        label: "Token validity (days)",
        consequence: "Tokens are minted without an expiry date.",
    },
    {
        key: "co_contribution_max",
        label: "Beneficiary contribution ceiling (₹)",
        consequence: "The till accepts only ₹0 — no contribution can be collected.",
    },
    {
        key: "settlement_random_audit_rate",
        label: "Settlement random audit rate",
        consequence: "No baseline sampling rate for settlement audits.",
    },
] as const;

/**
 * Read the mandatory keys and return those that are unset.
 *
 * "Unset" means the row is missing or its value is NULL or blank. A row holding
 * `0` is SET — zero is a legitimate value for several of these (a 0-hour
 * cooldown is a real policy choice), so it must never be treated as absent.
 *
 * Returns an empty array on a read failure rather than throwing: the dashboard
 * showing no banner is a better failure than the dashboard not rendering.
 */
export async function findUnsetMandatoryConfig(
    client: Client
): Promise<MandatoryConfigKey[]> {
    const keys = GO_LIVE_MANDATORY_KEYS.map((k) => k.key);

    const { data, error } = await client
        .from("system_config")
        .select("key, value")
        .in("key", keys);

    if (error) return [];

    const setKeys = new Set(
        ((data ?? []) as { key: string; value: string | null }[])
            .filter((r) => r.value !== null && String(r.value).trim() !== "")
            .map((r) => r.key)
    );

    return GO_LIVE_MANDATORY_KEYS.filter((k) => !setKeys.has(k.key));
}
