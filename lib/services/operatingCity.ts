import { BadRequestError } from "@/lib/api/handler";
import { getBoolean, getString } from "@/lib/system-config";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Work Order Q-5 (B-15) — city lock at REGISTRATION.
 *
 * The redemption engine already refuses a meal at a Food Partner outside the
 * operating city (lib/services/redemption.ts). That check comes too late to be
 * kind: someone registers, waits, travels to a counter, and only there learns
 * that pApAmA does not serve their city yet. This applies the same rule at the
 * point of sign-up.
 *
 * The client chose a hard block over a warn-and-confirm (7 Oct 2026). With a
 * block, an optional city would be no block at all — leaving the field empty
 * would walk straight past it — so the city is REQUIRED while the lock is on
 * and ignored entirely while it is off.
 *
 * Deliberately NOT fail-closed on a missing configuration: an unset
 * `operating_city` means nobody has decided which city pApAmA serves, and
 * refusing every registration in the country is a worse answer to that than
 * letting sign-ups through. The same soft-skip the redemption check makes.
 */

export interface OperatingCityRule {
    /** Whether a city must be supplied and matched. */
    enforced: boolean;
    /** The configured city, when one is set. */
    operatingCity: string | null;
}

type Client = SupabaseClient;

/** Read the lock once, so a route can decide what to require before validating. */
export async function readOperatingCityRule(client?: Client): Promise<OperatingCityRule> {
    let enabled = false;
    try {
        enabled = await getBoolean("city_lock_enabled", client as never);
    } catch {
        // Unset → treat as disabled. Never guess a default for a gating control.
        return { enforced: false, operatingCity: null };
    }
    if (!enabled) return { enforced: false, operatingCity: null };

    let operatingCity: string | null = null;
    try {
        operatingCity = (await getString("operating_city", client as never)).trim() || null;
    } catch {
        operatingCity = null;
    }

    // Lock on but no city chosen: nothing to compare against, so nothing to enforce.
    return { enforced: operatingCity !== null, operatingCity };
}

/**
 * Refuse a registration from outside the operating city.
 *
 * `city` is what the applicant typed. Matching is case-insensitive and trimmed,
 * the same comparison the redemption check makes, so "coimbatore " and
 * "Coimbatore" are the same place.
 */
export async function assertWithinOperatingCity(
    city: string | null | undefined,
    client?: Client
): Promise<void> {
    const rule = await readOperatingCityRule(client);
    if (!rule.enforced || rule.operatingCity === null) return;

    const supplied = (city ?? "").trim();
    if (supplied.length === 0) {
        throw new BadRequestError(
            `city is required — pApAmA currently serves ${rule.operatingCity} only`
        );
    }
    if (supplied.toLowerCase() !== rule.operatingCity.toLowerCase()) {
        throw new BadRequestError(
            `pApAmA currently serves ${rule.operatingCity} only, so registration from ${supplied} is not open yet`
        );
    }
}
