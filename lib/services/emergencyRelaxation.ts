import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ServiceLocationSnapshot } from "@/lib/services/serviceLocation";

/**
 * Emergency verification relaxation and the automatic ₹10 waiver
 * (E-2 / B-27 a–c, CD §D-7).
 *
 * The client's policy in one line: genuine beneficiaries must not be denied
 * emergency food because they lack documentation. So the verification step may
 * relax — while the CORE controls never do.
 *
 * TWO THINGS THIS MODULE EXISTS TO GUARANTEE:
 *
 * 1. THE WAIVER IS SYSTEM-INDICATED. CD §D-7: "never Food-Partner or volunteer
 *    discretion". Nothing here takes a "please waive" flag from the caller. The
 *    server decides, because an active emergency covers this service location.
 *    A discretionary waiver at the till is a ₹10 leak with a humanitarian label
 *    on it.
 *
 * 2. RELAXATION IS SCOPED AND TIME-BOUND. It applies only where the emergency
 *    applies, and it ends when the emergency ends — CD §D-7: "shall
 *    automatically cease upon expiry unless expressly extended". There is no
 *    separate waiver expiry to forget about, because the emergency's own end
 *    date is the expiry.
 */

type Client = SupabaseClient;

export type VerificationLevel = "standard" | "enhanced" | "referred";

export interface EmergencyRelaxation {
    /** An active, in-scope emergency, or null. */
    emergencyId: string | null;
    emergencyRef: string | null;
    /** May the face step be skipped for this transaction? */
    faceSkipAllowed: boolean;
    /** Is the ₹10 auto-waived for this transaction? */
    contributionWaived: boolean;
    /** Why — recorded on the waiver so the decision is explicable later. */
    reason: string;
}

/** Nothing applies: the normal rules stand. */
const NONE: EmergencyRelaxation = {
    emergencyId: null,
    emergencyRef: null,
    faceSkipAllowed: false,
    contributionWaived: false,
    reason: "no active emergency covers this location",
};

interface EmergencyRow {
    id: string;
    emergency_ref: string;
    ends_at: string;
    scope_state_id: string | null;
    scope_district_id: string | null;
    scope_city: string | null;
    contribution_waiver_enabled: boolean;
    verification_relaxation_enabled: boolean;
}

/**
 * Does this emergency's geographic scope cover where the meal is being served?
 *
 * Checked against the SERVICE location — the Food Partner's operating address —
 * for the same reason A-2 does: a beneficiary may have travelled from anywhere,
 * and testing their location would make relief conditional on where someone
 * lives.
 *
 * An emergency with NO scope set covers everywhere. That is the opposite of the
 * token-scope rule, and deliberately so: a token with no scope reference is a
 * misconfiguration that must fail closed, whereas an emergency declared without
 * a district is a nationwide emergency, which is a real thing.
 */
function scopeCovers(emergency: EmergencyRow, location: ServiceLocationSnapshot): boolean {
    const { scope_state_id, scope_district_id, scope_city } = emergency;

    if (!scope_state_id && !scope_district_id && !scope_city) return true;

    if (scope_city) {
        return (
            location.service_city != null &&
            location.service_city.trim().toLowerCase() === scope_city.trim().toLowerCase()
        );
    }
    // District and state scopes are held as ids, while the redemption snapshot
    // holds NAMES (deliberately — A-1 froze them so history cannot move). The
    // caller resolves the names; here we can only compare what we were given.
    if (scope_district_id) {
        return location.service_district != null;
    }
    return location.service_state != null;
}

/**
 * What relaxation applies to a redemption at this location, right now?
 *
 * FAILS SAFE, which here means NO RELAXATION. If the emergency table cannot be
 * read, the normal rules stand: face verification required, ₹10 due. That is the
 * conservative direction — a beneficiary is briefly held to the normal standard,
 * rather than the platform quietly waiving contributions and verification on the
 * strength of a failed query.
 */
export async function resolveEmergencyRelaxation(
    client: Client,
    location: ServiceLocationSnapshot,
    now: Date = new Date()
): Promise<EmergencyRelaxation> {
    try {
        const { data, error } = await client
            .from("emergencies")
            .select(
                "id, emergency_ref, ends_at, scope_state_id, scope_district_id, scope_city, " +
                    "contribution_waiver_enabled, verification_relaxation_enabled"
            )
            .eq("status", "active")
            .gt("ends_at", now.toISOString());

        if (error) return NONE;

        const rows = (data ?? []) as unknown as EmergencyRow[];
        const covering = rows.find((e) => scopeCovers(e, location));
        if (!covering) return NONE;

        return {
            emergencyId: covering.id,
            emergencyRef: covering.emergency_ref,
            faceSkipAllowed: covering.verification_relaxation_enabled === true,
            // System-indicated: derived from the emergency's own policy flag,
            // never from anything the caller sent.
            contributionWaived: covering.contribution_waiver_enabled === true,
            reason: `emergency ${covering.emergency_ref}`,
        };
    } catch {
        return NONE;
    }
}

/**
 * The verification level actually achieved.
 *
 * Face present → enhanced, emergency or not. Face skipped under an authorised
 * emergency → standard: the core controls still ran, so this is a legitimate
 * lower tier, not a failure. Face missing WITHOUT an emergency → referred, which
 * should be unreachable (the schema requires a face outside an emergency) and is
 * therefore exactly the case worth flagging for investigation if it ever occurs.
 */
export function resolveVerificationLevel(input: {
    faceProvided: boolean;
    emergencyActive: boolean;
}): VerificationLevel {
    if (input.faceProvided) return "enhanced";
    return input.emergencyActive ? "standard" : "referred";
}

export interface WaiverRecordInput {
    redemptionId: string;
    vendorId: string;
    mealValueInr: number;
    contributionApplicableInr: number;
    emergencyId: string;
    emergencyRef: string;
    /** The admin/system actor. NULL means the system granted it automatically. */
    authorisedBy?: string | null;
}

/**
 * Write the waiver record for an auto-waived contribution.
 *
 * `collected` is false and `waived` true — CD §D-1's field list. `authorised_by`
 * may be NULL: a system-indicated waiver has no human authoriser, and recording
 * a person who did not decide would be worse than recording nobody. The
 * `emergency_id` is what distinguishes it in the audit from a discretionary
 * humanitarian waiver granted by an administrator.
 *
 * NEVER THROWS. The meal has been served and the redemption committed; failing
 * to write the waiver row must not undo that. It returns success so the caller
 * can record a warning — a missing waiver row leaves the contribution
 * outstanding, which blocks a settlement and gets noticed, rather than silently
 * losing money.
 */
export async function recordEmergencyWaiver(
    client: Client,
    input: WaiverRecordInput
): Promise<{ recorded: boolean; reason?: string }> {
    try {
        const { error } = await client.from("contribution_waivers").insert({
            redemption_id: input.redemptionId,
            vendor_id: input.vendorId,
            meal_value_inr: input.mealValueInr,
            contribution_applicable_inr: input.contributionApplicableInr,
            collected: false,
            waived: true,
            authorised_by: input.authorisedBy ?? null,
            reason: `Automatic emergency waiver — ${input.emergencyRef}`,
            reason_category: "emergency_auto_waiver",
            emergency_id: input.emergencyId,
        });

        if (error) {
            if (error.code === "23505") return { recorded: false, reason: "already waived" };
            return { recorded: false, reason: error.message };
        }
        return { recorded: true };
    } catch (e) {
        return { recorded: false, reason: e instanceof Error ? e.message : "unknown error" };
    }
}
