import "server-only";

import type { ServiceLocationSnapshot } from "@/lib/services/serviceLocation";

/**
 * Token geographic scope and per-mode validity (A-2 / B-23, CD §D-2A).
 *
 * Two rules the client decided, both easy to get subtly wrong:
 *
 * 1. SCOPE is checked against the SERVICE location — where the Food Partner
 *    serves the meal — and never against the beneficiary's own location. A
 *    beneficiary may be from anywhere; the restriction is on where the meal is
 *    served. Checking the beneficiary instead would turn a distribution control
 *    into a means test.
 *
 * 2. VALIDITY is 60 days for both modes but counted from different events:
 *    donor-controlled from creation, pApAmA-distributed from DISTRIBUTION. A
 *    pool token must not burn its validity sitting in the pool.
 */

export type TokenGeographicScope = "PAN_INDIA" | "STATE" | "DISTRICT" | "CITY" | "PIN";
export type TokenDistributionMode = "PAPAMA_DISTRIBUTED" | "DONOR_CONTROLLED";

/** The scope-bearing fields of a token. */
export interface TokenScope {
    geographic_scope: TokenGeographicScope;
    scope_state_name: string | null;
    scope_district_name: string | null;
    scope_city: string | null;
    scope_pincode: string | null;
}

export interface ScopeCheckResult {
    allowed: boolean;
    /** Shown to the vendor at the till. Says where the token IS valid. */
    detail: string;
}

/** Case- and whitespace-insensitive compare for hand-entered place names. */
function samePlace(a: string | null, b: string | null): boolean {
    if (!a || !b) return false;
    return a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * May this token be redeemed at this service location?
 *
 * FAILS CLOSED. A restricted token whose service location cannot be determined
 * is refused, because the alternative — allowing it — makes every restriction
 * bypassable by a Food Partner with an incomplete address. PAN_INDIA is the only
 * scope that needs no location at all.
 */
export function checkTokenScope(
    token: TokenScope,
    location: ServiceLocationSnapshot
): ScopeCheckResult {
    switch (token.geographic_scope) {
        case "PAN_INDIA":
            return { allowed: true, detail: "valid anywhere in India" };

        case "STATE": {
            if (!token.scope_state_name) {
                return { allowed: false, detail: "token is state-restricted but names no state" };
            }
            const ok = samePlace(location.service_state, token.scope_state_name);
            return {
                allowed: ok,
                detail: ok
                    ? `valid in ${token.scope_state_name}`
                    : `this token is valid only in ${token.scope_state_name}`,
            };
        }

        case "DISTRICT": {
            if (!token.scope_district_name) {
                return { allowed: false, detail: "token is district-restricted but names no district" };
            }
            const ok = samePlace(location.service_district, token.scope_district_name);
            return {
                allowed: ok,
                detail: ok
                    ? `valid in ${token.scope_district_name} district`
                    : `this token is valid only in ${token.scope_district_name} district`,
            };
        }

        case "CITY": {
            if (!token.scope_city) {
                return { allowed: false, detail: "token is city-restricted but names no city" };
            }
            const ok = samePlace(location.service_city, token.scope_city);
            return {
                allowed: ok,
                detail: ok
                    ? `valid in ${token.scope_city}`
                    : `this token is valid only in ${token.scope_city}`,
            };
        }

        case "PIN": {
            if (!token.scope_pincode) {
                return { allowed: false, detail: "token is PIN-restricted but names no PIN code" };
            }
            // PINs are exact — no normalisation beyond trimming.
            const ok =
                location.service_pincode != null &&
                location.service_pincode.trim() === token.scope_pincode.trim();
            return {
                allowed: ok,
                detail: ok
                    ? `valid in PIN ${token.scope_pincode}`
                    : `this token is valid only in PIN code ${token.scope_pincode}`,
            };
        }

        default: {
            // An unknown scope is a schema/code mismatch. Refuse rather than
            // fall through to "allowed" — an unrecognised restriction is still
            // a restriction.
            return { allowed: false, detail: "token has an unrecognised geographic restriction" };
        }
    }
}

/**
 * When does this token's 60-day validity start? (CD §D-2A, confirmed 18 Aug.)
 *
 * Returns null for a pApAmA-distributed token that has not been distributed —
 * its clock has not started, which is the whole point of the split. Null is
 * therefore a correct, expected state, not an error.
 */
export function resolveActivationDate(input: {
    distribution_mode: TokenDistributionMode;
    minted_at: string | null;
    created_at: string | null;
    distributed_at: string | null;
}): string | null {
    if (input.distribution_mode === "DONOR_CONTROLLED") {
        return input.minted_at ?? input.created_at ?? null;
    }
    return input.distributed_at ?? null;
}

/**
 * Expiry = activation + `token_expiry_days`.
 *
 * `expiryDays` is passed in rather than read here so the caller supplies the
 * configured value and this stays pure and testable. Null activation → null
 * expiry: an un-activated pool token has no expiry date yet.
 */
export function resolveExpiryDate(
    activatedAt: string | null,
    expiryDays: number
): string | null {
    if (!activatedAt) return null;
    const start = new Date(activatedAt);
    if (Number.isNaN(start.getTime())) return null;
    return new Date(start.getTime() + expiryDays * 86_400_000).toISOString();
}

/**
 * Has this token expired? Expiry is PERMANENT — revalidation was retired
 * (CD confirmed 18 Aug), so there is no path back except a controlled reissue.
 *
 * A null expiry is NOT expired: it means the clock has not started.
 */
export function isExpired(expiresAt: string | null, now: Date = new Date()): boolean {
    if (!expiresAt) return false;
    const end = new Date(expiresAt);
    if (Number.isNaN(end.getTime())) return false;
    return end.getTime() <= now.getTime();
}
