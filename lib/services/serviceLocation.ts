import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-location snapshot for a redemption (A-1 / B-02, CD §D-2).
 *
 * A redemption records WHERE THE MEAL WAS SERVED, resolved from the Food
 * Partner's operating address at the moment of redemption and then frozen.
 *
 * Why frozen, and why plain text rather than foreign keys: a Food Partner may
 * move premises, correct a typo, or be re-districted. If the redemption pointed
 * at the vendor row (or at a district row by FK), every historical redemption
 * would silently relocate with them — last year's settlement reports would
 * change, and an emergency's closure reconciliation would no longer add up. The
 * card's acceptance criterion says it plainly: changing a Food Partner's address
 * later must not alter historical snapshots.
 *
 * This is also the only location detail P-1 permits in a notification
 * ("City, State"), so it is read far more often than it is written.
 */

type Client = SupabaseClient<never, never, never>;

export interface ServiceLocationSnapshot {
    service_city: string | null;
    service_district: string | null;
    service_state: string | null;
    service_pincode: string | null;
}

/** All-null — used when the vendor row or its address cannot be read. */
const EMPTY: ServiceLocationSnapshot = {
    service_city: null,
    service_district: null,
    service_state: null,
    service_pincode: null,
};

interface VendorLocationRow {
    city: string | null;
    pincode: string | null;
    operating_city: string | null;
    operating_pincode: string | null;
    registered_district: { name: string | null; state: { name: string | null } | null } | null;
    operating_district: { name: string | null; state: { name: string | null } | null } | null;
}

/**
 * Resolve the snapshot for one Food Partner.
 *
 * Operating address wins where present, registered is the fallback — the rule
 * the whole card uses, since NULL operating fields mean "same as registered".
 * Resolution is PER FIELD rather than picking one address wholesale, which is
 * why the create schema refuses a half-filled operating address: without that
 * guard, a vendor with only `operating_city` set would snapshot a city from one
 * address and a district from another.
 *
 * Never throws. A redemption must not fail because a district lookup did — the
 * meal has been served; an incomplete snapshot is recoverable, a 500 at the till
 * is not.
 */
export async function resolveServiceLocation(
    client: Client,
    vendorId: string
): Promise<ServiceLocationSnapshot> {
    try {
        const { data, error } = await client
            .from("vendors")
            .select(
                `city, pincode, operating_city, operating_pincode,
                 registered_district:districts!vendors_registered_district_id_fkey(name, state:states(name)),
                 operating_district:districts!vendors_operating_district_id_fkey(name, state:states(name))`
            )
            .eq("id", vendorId)
            .maybeSingle();

        if (error || !data) return EMPTY;
        const v = data as unknown as VendorLocationRow;

        const district = v.operating_district ?? v.registered_district;

        return {
            service_city: v.operating_city ?? v.city ?? null,
            service_district: district?.name ?? null,
            service_state: district?.state?.name ?? null,
            service_pincode: v.operating_pincode ?? v.pincode ?? null,
        };
    } catch {
        return EMPTY;
    }
}
