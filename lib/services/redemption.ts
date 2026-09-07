import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getNumber, getBoolean, getString, MissingConfigError } from "@/lib/system-config";
import { qrHashOf } from "@/app/api/_lib/tokenQr";
import { toVectorLiteral } from "@/lib/face/embedding";
import { getGreatCircleDistanceKm } from "@/lib/services/geo";
import { resolveServiceLocation } from "@/lib/services/serviceLocation";
import { checkTokenScope, type TokenGeographicScope } from "@/lib/services/tokenScope";

/**
 * Redemption validation + value engine (owner §4.4, RED-1..7, PROOF-4).
 *
 * `validateRedemption` is the single source of truth for "may this token be
 * redeemed at this vendor for this menu item, and for how much money?". It is
 * pure-ish: it reads tokens / vendor_menus / beneficiaries / cooldown log and
 * the tunable `system_config` rules, runs an ordered list of named checks, and
 * computes the value split (forfeit / pay-difference / co-pay). It performs NO
 * writes — both the dry-run preview and the real redemption route call it; the
 * real route re-runs it and then commits inside its own transaction.
 *
 * Checks are HARD or SOFT:
 *   - HARD: a failure makes the whole redemption invalid (`ok = false`).
 *   - SOFT: informational only; recorded in `checks` but never blocks (e.g. a
 *     volunteer-assisted redemption with no beneficiary identity, or geo not
 *     provided). `ok` = ALL HARD checks pass.
 *
 * Config reads tolerate an unset key: a rule whose threshold is not configured
 * is SKIPPED (recorded as a soft "config unset" note), never invented — same
 * discipline as the mint route's threshold/expiry handling.
 */

/** One named validation check. */
export interface RedemptionCheck {
    name: string;
    pass: boolean;
    /** Whether failing this check invalidates the redemption. */
    hard: boolean;
    detail: string;
}

/** The token row fields the engine needs. */
interface TokenRow {
    id: string;
    qr_hash: string | null;
    status: string;
    value_inr: number;
    token_type: string;
    donor_id: string | null;
    beneficiary_id: string | null;
    expires_at: string | null;
    redeemed_at: string | null;
    // A-2 (B-23): structured geographic scope, checked against the SERVICE
    // location. Distinct from the legacy free-text `area_lock`, which is printed
    // on the token but never enforced.
    geographic_scope: TokenGeographicScope | null;
    scope_city: string | null;
    scope_pincode: string | null;
    scope_state: { name: string | null } | null;
    scope_district: { name: string | null } | null;
}

/** The menu row fields the engine needs. */
interface MenuRow {
    id: string;
    vendor_id: string;
    item_name: string;
    price: number;
    nutrition_category: string | null;
    is_special_care_equivalent: boolean;
    special_care_equivalent_approved: boolean;
    approval_status: string;
}

/** The beneficiary row fields the engine needs (matched by face embedding). */
interface BeneficiaryRow {
    id: string;
    face_hash: string | null;
    category: string;
    eligibility_status: string;
    status: string;
    eligibility_expires_at: string | null;
}

/** A configured meal-serving window (Wave-2 `meal_windows`). */
interface MealWindowRow {
    vendor_id: string | null;
    start_time: string;
    end_time: string;
    is_active: boolean;
}

/** Money split computed for the redemption (owner §4.4). */
export interface RedemptionValue {
    token_value: number;
    menu_value: number;
    /** Beneficiary pays the over-value (menu > token). */
    difference_paid: number;
    /** Optional voluntary co-contribution (clamped to co_contribution_max). */
    co_pay: number;
    /** Unused token value retained by the system (token > menu); never refunded. */
    forfeited: number;
}

/** Input to the engine. Vendor id is resolved server-side, never trusted. */
export interface ValidateRedemptionInput {
    qr_payload: string;
    vendor_id: string;
    menu_item_id: string;
    geo?: { lat: number; lng: number };
    /** On-device face capture. Required at the real redemption; optional in preview. */
    face?: { embedding: number[]; liveness: number };
    co_pay?: number;
}

/** Result of the engine. `ok` = all HARD checks passed. */
export interface RedemptionValidation {
    ok: boolean;
    checks: RedemptionCheck[];
    token: TokenRow | null;
    menuItem: MenuRow | null;
    beneficiary?: BeneficiaryRow | null;
    value: RedemptionValue;
}

/** Token statuses at which a token may be redeemed. */
const REDEEMABLE_STATUSES = new Set(["live", "distributed"]);

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

const ZERO_VALUE: RedemptionValue = {
    token_value: 0,
    menu_value: 0,
    difference_paid: 0,
    co_pay: 0,
    forfeited: 0,
};

interface ResolvedCooldown {
    hours: number;
    source: "emergency" | "category" | "global" | "none";
    /** True when the check must never HARD-block (emergency relief, unset override). */
    relaxed: boolean;
}

/**
 * Multi-level cooldown resolution (spec §3.1 F-9, §7.1 rule 5, addon #21).
 * Resolution order: emergency (when ON) > category > global — most-specific
 * applicable value wins. Each level soft-skips independently when unset;
 * falling through from an unset emergency override to category/global marks
 * the result `relaxed` (never hard-blocks), matching the single-level
 * emergency-relief discipline this replaces.
 */
async function resolveCooldownHours(
    admin: SupabaseClient,
    category: string | null,
    emergencyMode: boolean
): Promise<ResolvedCooldown> {
    if (emergencyMode) {
        try {
            const hours = await getNumber("emergency_meal_cooldown_hours", admin as never);
            return { hours, source: "emergency", relaxed: false };
        } catch {
            /* emergency cooldown unset — fall through to category/global for the
               VALUE, but the result stays relaxed since emergency mode is on. */
        }
    }
    if (category) {
        try {
            const hours = await getNumber(`meal_cooldown_hours_${category}`, admin as never);
            return { hours, source: "category", relaxed: emergencyMode };
        } catch {
            /* no category override — fall through to global */
        }
    }
    try {
        const hours = await getNumber("meal_cooldown_hours", admin as never);
        return { hours, source: "global", relaxed: emergencyMode };
    } catch {
        return { hours: 0, source: "none", relaxed: emergencyMode };
    }
}

/**
 * Run all redemption checks + compute value. Reads only; never writes. Designed
 * so the preview route can call it dry and the create route can re-call it
 * immediately before committing (the DB status guard handles the race window).
 */
export async function validateRedemption(
    input: ValidateRedemptionInput,
    admin: SupabaseClient
): Promise<RedemptionValidation> {
    const checks: RedemptionCheck[] = [];
    const nowMs = Date.now();

    // --- token ---------------------------------------------------------------
    const qrHash = qrHashOf(input.qr_payload);
    const { data: tokenData } = await admin
        .from("tokens")
        .select(
            `id, qr_hash, status, value_inr, token_type, donor_id, beneficiary_id, expires_at, redeemed_at,
             geographic_scope, scope_city, scope_pincode,
             scope_state:states!tokens_scope_state_id_fkey(name),
             scope_district:districts!tokens_scope_district_id_fkey(name)`
        )
        .eq("qr_hash", qrHash)
        .maybeSingle();
    const token = (tokenData as TokenRow | null) ?? null;

    if (!token) {
        checks.push({
            name: "token",
            pass: false,
            hard: true,
            detail: "no token matches this QR",
        });
        return { ok: false, checks, token: null, menuItem: null, value: ZERO_VALUE };
    }

    const expired = token.expires_at != null && Date.parse(token.expires_at) < nowMs;
    const statusOk = REDEEMABLE_STATUSES.has(token.status);
    const tokenPass = statusOk && !expired;
    checks.push({
        name: "token",
        pass: tokenPass,
        hard: true,
        detail: tokenPass
            ? `token ${token.id} is redeemable (${token.status})`
            : expired
              ? "token has expired"
              : `token status '${token.status}' is not redeemable`,
    });

    // --- vendor approval (owner §4.5) ----------------------------------------
    // A pending / suspended / rejected outlet must not be able to redeem a token,
    // burn it, or lock a payment. HARD: this was previously unchecked, letting any
    // user with the `vendor` role redeem before approval.
    const { data: vendorRow } = await admin
        .from("vendors")
        .select("status")
        .eq("id", input.vendor_id)
        .maybeSingle();
    const vendorStatus = (vendorRow as { status: string } | null)?.status ?? null;
    const vendorApproved = vendorStatus === "approved";
    checks.push({
        name: "vendor_status",
        pass: vendorApproved,
        hard: true,
        detail: vendorApproved
            ? "vendor outlet is approved"
            : vendorStatus
              ? `vendor outlet is not approved (${vendorStatus})`
              : "vendor outlet not found",
    });

    // --- vendor availability (owner §4.5) ------------------------------------
    // Open/closed, stock, temporary closure, and daily capacity. The columns
    // (is_open / stock_exhausted / temporary_closure_until / daily_meal_capacity)
    // and the vendor_capacity_usage table are created by a LATER Wave-2 migration,
    // so EVERY read here degrades to a SOFT skip on query error / missing data —
    // never a hard fail and never a throw (matches the config-unset discipline).
    {
        const { data: availData, error: availErr } = await admin
            .from("vendors")
            .select("is_open, stock_exhausted, temporary_closure_until, daily_meal_capacity")
            .eq("id", input.vendor_id)
            .maybeSingle();

        if (availErr || !availData) {
            // columns not present yet (Wave-2) or vendor row absent → cannot evaluate.
            checks.push({
                name: "vendor_availability",
                pass: true,
                hard: false,
                detail: "vendor availability fields unavailable — skipped",
            });
        } else {
            const avail = availData as {
                is_open: boolean | null;
                stock_exhausted: boolean | null;
                temporary_closure_until: string | null;
                daily_meal_capacity: number | null;
            };
            const tempClosedUntil =
                avail.temporary_closure_until != null
                    ? Date.parse(avail.temporary_closure_until)
                    : null;

            if (avail.is_open === false) {
                checks.push({
                    name: "vendor_availability",
                    pass: false,
                    hard: true,
                    detail: "vendor is closed",
                });
            } else if (avail.stock_exhausted === true) {
                checks.push({
                    name: "vendor_availability",
                    pass: false,
                    hard: true,
                    detail: "vendor is out of stock today",
                });
            } else if (tempClosedUntil != null && tempClosedUntil > nowMs) {
                checks.push({
                    name: "vendor_availability",
                    pass: false,
                    hard: true,
                    detail: `vendor temporarily closed until ${avail.temporary_closure_until!.slice(0, 16).replace("T", " ")}`,
                });
            } else {
                // not blocked — evaluate daily capacity when enforced & configured.
                let capacityOn = false;
                try {
                    capacityOn = await getBoolean(
                        "vendor_capacity_enforcement_enabled",
                        admin as never
                    );
                } catch {
                    capacityOn = false; // unset → not enforced (no guessed default)
                }

                if (capacityOn && typeof avail.daily_meal_capacity === "number") {
                    const today = new Date();
                    const usageDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                    const { data: usageRow, error: usageErr } = await admin
                        .from("vendor_capacity_usage")
                        .select("meals_served")
                        .eq("vendor_id", input.vendor_id)
                        .eq("usage_date", usageDate)
                        .maybeSingle();

                    if (usageErr) {
                        // table not present yet (Wave-2) → cannot evaluate capacity.
                        checks.push({
                            name: "vendor_availability",
                            pass: true,
                            hard: false,
                            detail: "vendor capacity usage unavailable — skipped",
                        });
                    } else {
                        const served =
                            (usageRow as { meals_served: number | null } | null)?.meals_served ?? 0;
                        const cap = avail.daily_meal_capacity;
                        const atCapacity = served >= cap;
                        checks.push({
                            name: "vendor_availability",
                            pass: !atCapacity,
                            hard: true,
                            detail: atCapacity
                                ? `vendor daily capacity reached (${served}/${cap})`
                                : `vendor open and within capacity (${served}/${cap})`,
                        });
                    }
                } else {
                    // open, stocked, not temp-closed, capacity not enforced/configured.
                    checks.push({
                        name: "vendor_availability",
                        pass: true,
                        hard: true,
                        detail: "vendor open and within capacity",
                    });
                }
            }
        }
    }

    // --- menu ----------------------------------------------------------------
    const { data: menuData } = await admin
        .from("vendor_menus")
        .select(
            "id, vendor_id, item_name, price, nutrition_category, is_special_care_equivalent, special_care_equivalent_approved, approval_status"
        )
        .eq("id", input.menu_item_id)
        .maybeSingle();
    const menuItem = (menuData as MenuRow | null) ?? null;

    let menuPass = false;
    let menuDetail: string;
    if (!menuItem) {
        menuDetail = "menu item not found";
    } else if (menuItem.vendor_id !== input.vendor_id) {
        menuDetail = "menu item does not belong to this vendor";
    } else if (menuItem.approval_status !== "approved") {
        menuDetail = `menu item is not approved (${menuItem.approval_status})`;
    } else if (
        token.token_type === "special_care" &&
        !(menuItem.is_special_care_equivalent && menuItem.special_care_equivalent_approved)
    ) {
        menuDetail = "menu item is not an approved special-care equivalent";
    } else {
        menuPass = true;
        menuDetail = `'${menuItem.item_name}' (₹${Math.round(menuItem.price)})`;
    }
    checks.push({ name: "menu", pass: menuPass, hard: true, detail: menuDetail });

    // --- geofence ------------------------------------------------------------
    if (input.geo) {
        const { data: vendorGeo, error: vendorGeoErr } = await admin
            .from("vendors")
            .select("geo_lat, geo_lng")
            .eq("id", input.vendor_id)
            .maybeSingle();
        const vLat = vendorGeo?.geo_lat != null ? Number(vendorGeo.geo_lat) : null;
        const vLng = vendorGeo?.geo_lng != null ? Number(vendorGeo.geo_lng) : null;

        if (vendorGeoErr) {
            // FAIL CLOSED: a transient read error must not silently bypass the
            // radius. Block rather than degrade to a soft "no geo on file" skip.
            checks.push({
                name: "geofence",
                pass: false,
                hard: true,
                detail: "could not read vendor location (transient error) — redemption blocked",
            });
        } else if (vLat == null || vLng == null) {
            checks.push({
                name: "geofence",
                pass: true,
                hard: false,
                detail: "vendor has no geo-location on file — skipped",
            });
        } else {
            try {
                const radiusKm = await getNumber("redemption_radius_km", admin as never);
                const dist = getGreatCircleDistanceKm(input.geo.lat, input.geo.lng, vLat, vLng);
                const within = dist <= radiusKm;
                checks.push({
                    name: "geofence",
                    pass: within,
                    hard: true,
                    detail: within
                        ? `within ${radiusKm} km (${dist.toFixed(2)} km)`
                        : `outside the ${radiusKm} km radius (${dist.toFixed(2)} km)`,
                });
            } catch {
                // redemption_radius_km unset — skip the geofence rule (no guessed default).
                checks.push({
                    name: "geofence",
                    pass: true,
                    hard: false,
                    detail: "redemption_radius_km unset — geofence skipped",
                });
            }
        }
    } else {
        // No location supplied. Fail CLOSED: if the geofence is enforceable for
        // this vendor (vendor has geo on file AND redemption_radius_km is
        // configured), a missing location is a HARD block — otherwise a caller
        // could bypass the radius simply by omitting `geo`. The geofence only
        // degrades to a soft skip when it genuinely can't be evaluated (vendor has
        // no geo on file, or the radius config is unset).
        const { data: vendorGeo, error: vendorGeoErr } = await admin
            .from("vendors")
            .select("geo_lat, geo_lng")
            .eq("id", input.vendor_id)
            .maybeSingle();
        const hasVendorGeo =
            vendorGeo?.geo_lat != null && vendorGeo?.geo_lng != null;

        let radiusConfigured = false;
        try {
            await getNumber("redemption_radius_km", admin as never);
            radiusConfigured = true;
        } catch {
            radiusConfigured = false;
        }

        if (vendorGeoErr) {
            // FAIL CLOSED: can't confirm whether the geofence is enforceable, so a
            // transient read error blocks rather than degrading to a soft skip.
            checks.push({
                name: "geofence",
                pass: false,
                hard: true,
                detail: "could not read vendor location (transient error) — redemption blocked",
            });
        } else if (hasVendorGeo && radiusConfigured) {
            checks.push({
                name: "geofence",
                pass: false,
                hard: true,
                detail: "location required — share your location to redeem within the radius",
            });
        } else {
            checks.push({
                name: "geofence",
                pass: true,
                hard: false,
                detail: hasVendorGeo
                    ? "redemption_radius_km unset — geofence skipped"
                    : "vendor has no geo-location on file — skipped",
            });
        }
    }

    // --- city lock (owner §6 admin protection rule, PRD §7 city_lock_enabled) -
    // Independent of the radius geofence. There is NO per-beneficiary or per-token
    // city in the schema, so the authoritative "bound city" is the admin-configured
    // OPERATING CITY (`system_config.operating_city`) — the single city pApAmA is
    // operating in for Phase 1. When city_lock_enabled is true and an operating
    // city is configured and the vendor has a city on file, the vendor's city MUST
    // match the operating city (case-insensitive, trimmed). This is FAIL-CLOSED for
    // the radius bypass reason: the only soft-skips are when the rule genuinely
    // cannot be evaluated — city_lock disabled, operating_city unset, or the vendor
    // has no city recorded. (If a future migration adds a per-token/beneficiary
    // city, swap `operating_city` for that bound value here.)
    {
        let cityLockOn = false;
        try {
            cityLockOn = await getBoolean("city_lock_enabled", admin as never);
        } catch {
            cityLockOn = false; // unset → treat as disabled (no guessed default)
        }

        if (!cityLockOn) {
            checks.push({
                name: "city_lock",
                pass: true,
                hard: false,
                detail: "city lock disabled — skipped",
            });
        } else {
            let operatingCity: string | null = null;
            try {
                operatingCity = (await getString("operating_city", admin as never)).trim();
                if (operatingCity.length === 0) operatingCity = null;
            } catch {
                operatingCity = null; // operating_city unset — cannot evaluate
            }

            const { data: vendorCityRow, error: vendorCityErr } = await admin
                .from("vendors")
                .select("city")
                .eq("id", input.vendor_id)
                .maybeSingle();
            const vendorCity =
                (vendorCityRow as { city: string | null } | null)?.city?.trim() || null;

            if (vendorCityErr) {
                // FAIL CLOSED: city lock is ON and the operating city is set, so a
                // transient read of the vendor's city must block, not soft-skip.
                checks.push({
                    name: "city_lock",
                    pass: false,
                    hard: true,
                    detail: "could not read vendor city (transient error) — redemption blocked",
                });
            } else if (operatingCity == null) {
                checks.push({
                    name: "city_lock",
                    pass: true,
                    hard: false,
                    detail: "operating_city unset — city lock skipped",
                });
            } else if (vendorCity == null) {
                checks.push({
                    name: "city_lock",
                    pass: true,
                    hard: false,
                    detail: "vendor has no city on file — city lock skipped",
                });
            } else {
                const match = vendorCity.toLowerCase() === operatingCity.toLowerCase();
                checks.push({
                    name: "city_lock",
                    pass: match,
                    hard: true,
                    detail: match
                        ? `vendor city '${vendorCity}' is within the operating city`
                        : `vendor city '${vendorCity}' is outside the operating city '${operatingCity}'`,
                });
            }
        }
    }

    // --- token geographic scope (A-2 / B-23, CD §D-2A) -----------------------
    // Distinct from the city lock above. City lock is an ORG-WIDE pilot control
    // ("pApAmA only operates in this city"); this is a PER-TOKEN restriction a
    // donor or admin chose ("this token is for Coimbatore district"). Both can
    // apply, and either can block.
    //
    // Checked against the SERVICE location — the Food Partner's operating
    // address — and NEVER against the beneficiary's location. A beneficiary may
    // travel from anywhere; the restriction governs where the meal is served.
    // Checking the beneficiary would turn a distribution control into a means
    // test on where someone lives.
    {
        const scope = token.geographic_scope ?? "PAN_INDIA";

        if (scope === "PAN_INDIA") {
            // The default and the overwhelmingly common case — skip the lookup.
            checks.push({
                name: "token_scope",
                pass: true,
                hard: false,
                detail: "token is valid anywhere in India",
            });
        } else {
            const serviceLocation = await resolveServiceLocation(admin as never, input.vendor_id);
            const result = checkTokenScope(
                {
                    geographic_scope: scope,
                    scope_state_name: token.scope_state?.name ?? null,
                    scope_district_name: token.scope_district?.name ?? null,
                    scope_city: token.scope_city,
                    scope_pincode: token.scope_pincode,
                },
                serviceLocation
            );

            // HARD: a restricted token redeemed outside its scope is exactly the
            // misuse the restriction exists to prevent. Fails closed when the
            // service location is unknown — otherwise every restriction would be
            // bypassable by a Food Partner with an incomplete address.
            checks.push({
                name: "token_scope",
                pass: result.allowed,
                hard: true,
                detail: result.detail,
            });
        }
    }

    // --- meal window (clock-time serving hours) ------------------------------
    // A pure clock rule, independent of identity: redemptions are only allowed
    // during configured serving windows. Vendor-specific windows OVERRIDE the
    // global (vendor_id null) ones. The `meal_windows` table is created by a
    // LATER Wave-2 migration, so a query error OR zero applicable windows
    // degrades to a SOFT skip — never a hard fail and never a throw.
    {
        let mealWindowOn = false;
        try {
            mealWindowOn = await getBoolean("meal_window_enforcement_enabled", admin as never);
        } catch {
            mealWindowOn = false; // unset → disabled (no guessed default)
        }

        if (!mealWindowOn) {
            checks.push({
                name: "meal_window",
                pass: true,
                hard: false,
                detail: "meal window enforcement disabled — skipped",
            });
        } else {
            const { data: windowRows, error: windowErr } = await admin
                .from("meal_windows")
                .select("vendor_id, start_time, end_time, is_active")
                .eq("is_active", true)
                .or(`vendor_id.eq.${input.vendor_id},vendor_id.is.null`);

            const allWindows = (windowErr ? null : (windowRows as MealWindowRow[] | null)) ?? [];
            // vendor-specific windows override the global ones when any exist.
            const vendorWindows = allWindows.filter((w) => w.vendor_id === input.vendor_id);
            const applicable =
                vendorWindows.length > 0
                    ? vendorWindows
                    : allWindows.filter((w) => w.vendor_id == null);

            if (windowErr || applicable.length === 0) {
                checks.push({
                    name: "meal_window",
                    pass: true,
                    hard: false,
                    detail: "no active meal windows configured — skipped",
                });
            } else {
                const now = new Date(nowMs);
                const nowMin = now.getHours() * 60 + now.getMinutes();
                // parse a Postgres `time` 'HH:MM:SS' into minutes-of-day.
                const toMin = (t: string): number | null => {
                    const m = /^(\d{1,2}):(\d{2})/.exec(t);
                    if (!m) return null;
                    return Number(m[1]) * 60 + Number(m[2]);
                };
                const inWindow = (startMin: number, endMin: number): boolean =>
                    endMin >= startMin
                        ? nowMin >= startMin && nowMin < endMin
                        : nowMin >= startMin || nowMin < endMin; // wraps midnight

                let within = false;
                let bestDelta = Infinity;
                let bestStart: number | null = null;
                for (const w of applicable) {
                    const s = toMin(w.start_time);
                    const e = toMin(w.end_time);
                    if (s == null || e == null) continue;
                    if (inWindow(s, e)) {
                        within = true;
                        break;
                    }
                    const delta = (s - nowMin + 1440) % 1440; // minutes until this start
                    if (delta < bestDelta) {
                        bestDelta = delta;
                        bestStart = s;
                    }
                }

                const fmt = (min: number): string =>
                    `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
                checks.push({
                    name: "meal_window",
                    pass: within,
                    hard: true,
                    detail: within
                        ? "within an active meal window"
                        : bestStart != null
                          ? `outside meal windows — next window opens at ${fmt(bestStart)}`
                          : "outside the configured meal windows",
                });
            }
        }
    }

    // --- face capture: liveness + identity (owner §4.5/§4.6/§5.2, SEC-1..4) ---
    // Identity is resolved by VECTOR DISTANCE, not text equality. A registered
    // beneficiary is identified 1:1 via match_beneficiary_face; fair-usage
    // (cooldown/meal-limit) is keyed on the FACE across vendors via
    // recent_face_matches, so it catches anonymous repeat-redeemers too. The
    // create route REQUIRES a capture — the no-face branch is preview-only.
    let beneficiary: BeneficiaryRow | null = null;
    let faceVector: string | null = null;

    if (!input.face) {
        checks.push({
            name: "face",
            pass: true,
            hard: false,
            detail: "face capture pending (required to redeem)",
        });
    } else {
        faceVector = toVectorLiteral(input.face.embedding);

        // liveness / anti-spoof gate. FAIL-SAFE: a genuinely-unset config soft-skips
        // (no floor set yet), but a TRANSIENT read error blocks — a DB/network hiccup
        // must never silently disable the anti-spoof gate.
        try {
            const minLive = await getNumber("face_liveness_min", admin as never);
            const livePass = input.face.liveness >= minLive;
            checks.push({
                name: "liveness",
                pass: livePass,
                hard: true,
                detail: livePass
                    ? `liveness ${input.face.liveness.toFixed(2)} ≥ ${minLive}`
                    : `liveness ${input.face.liveness.toFixed(2)} < ${minLive} (possible spoof)`,
            });
        } catch (err) {
            if (err instanceof MissingConfigError) {
                checks.push({
                    name: "liveness",
                    pass: true,
                    hard: false,
                    detail: "face_liveness_min unset — liveness skipped",
                });
            } else {
                checks.push({
                    name: "liveness",
                    pass: false,
                    hard: true,
                    detail: "could not read liveness threshold (transient error) — redemption blocked",
                });
            }
        }

        let threshold: number | null = null;
        try {
            threshold = await getNumber("face_match_threshold", admin as never);
        } catch {
            threshold = null;
        }

        // 1:1 identify a REGISTERED beneficiary (nearest within the threshold).
        let identityReadFailed = false;
        if (threshold != null) {
            const { data: matchRows, error: matchErr } = await admin.rpc("match_beneficiary_face", {
                query: faceVector,
                max_distance: threshold,
            });
            if (matchErr) {
                // FAIL CLOSED: on a transient match error we cannot tell an
                // anonymous redeemer from a suspended/expired registered one, so
                // block rather than silently treating them as anonymous.
                identityReadFailed = true;
            } else {
                const matchId =
                    (matchRows as { beneficiary_id: string }[] | null)?.[0]?.beneficiary_id ?? null;
                if (matchId) {
                    const { data: benefData, error: benefErr } = await admin
                        .from("beneficiaries")
                        .select("id, face_hash, category, eligibility_status, status, eligibility_expires_at")
                        .eq("id", matchId)
                        .maybeSingle();
                    if (benefErr) {
                        identityReadFailed = true;
                    } else {
                        beneficiary = (benefData as BeneficiaryRow | null) ?? null;
                    }
                }
            }
        }
        if (identityReadFailed) {
            checks.push({
                name: "identity",
                pass: false,
                hard: true,
                detail: "could not verify beneficiary identity (transient error) — redemption blocked",
            });
        }

        // cooldown + meal-limit (RED-3). Fair-usage is evaluated over the UNION of
        // two independent signals so it cannot be bypassed by a face that fails to
        // re-match a prior capture:
        //   (a) FACE signal — prior captures matching this face by vector distance
        //       (cross-vendor, catches anonymous repeat-redeemers); needs threshold.
        //   (b) BENEFICIARY signal — when a registered beneficiary is identified,
        //       that beneficiary's OWN redemption history keyed on beneficiary_id
        //       (independent of whether the historical face embeddings re-match).
        // Either signal tripping blocks. The previous version ran ONLY (a) inside
        // `if (threshold != null)`, so a non-matching face escaped both checks.
        {
            let maxPerDay = 0;
            let dedupHours = 0;
            try {
                maxPerDay = await getNumber("max_meals_per_day", admin as never);
            } catch {
                /* unset — skip below */
            }
            try {
                dedupHours = await getNumber("face_dedup_window_hours", admin as never);
            } catch {
                /* unset — falls back to cooldown window */
            }

            // --- emergency mode (relief relaxation of fair-usage) ------------
            // When emergency mode is ON, an emergency-specific value OVERRIDES the
            // normal cooldown / daily-limit threshold; if that emergency value is
            // unset, the rule DEGRADES to SOFT (relief applied without inventing a
            // number). Read with the same unset-tolerant discipline; when
            // emergency mode is OFF this whole block is a no-op (today's behaviour).
            let emergencyMode = false;
            try {
                emergencyMode = await getBoolean("emergency_mode_enabled", admin as never);
            } catch {
                emergencyMode = false; // unset → not in emergency
            }

            // --- multi-level cooldown resolution (spec §3.1 F-9, §7.1 rule 5) --
            // Resolution order: emergency > category > global, each independently
            // editable and soft-skip-on-unset. Falling through from an unset
            // emergency override to category/global relaxes the check to SOFT
            // (relief applied without inventing a number) — same discipline the
            // single-level version used.
            const {
                hours: cooldownHours,
                relaxed: cooldownRelax,
                source: cooldownSource,
            } = await resolveCooldownHours(admin, beneficiary?.category ?? null, emergencyMode);

            let mealLimitRelax = false;
            if (emergencyMode) {
                try {
                    maxPerDay = await getNumber("emergency_max_meals_per_day", admin as never);
                } catch {
                    mealLimitRelax = true; // no emergency limit set → relax to soft
                }
            }
            const emTag = emergencyMode ? " (emergency mode)" : "";

            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const lookbackMs = Math.max(cooldownHours, dedupHours) * 3_600_000;
            const since = new Date(
                Math.min(startOfDay.getTime(), nowMs - lookbackMs)
            ).toISOString();

            // collect prior redemption timestamps (ms) from both signals.
            const priorMs: number[] = [];

            // A read error on EITHER signal means we cannot trust a "no priors"
            // conclusion — fail closed below rather than letting a DB/RPC hiccup
            // open the cooldown / meal-limit gate.
            let fairUsageReadFailed = false;

            // (a) face signal — only when a match threshold is configured.
            if (threshold != null) {
                const { data: recentRows, error: recentErr } = await admin.rpc("recent_face_matches", {
                    query: faceVector,
                    max_distance: threshold,
                    since,
                });
                if (recentErr) {
                    fairUsageReadFailed = true;
                } else {
                    for (const r of (recentRows as { redeemed_at: string }[] | null) ?? []) {
                        priorMs.push(Date.parse(r.redeemed_at));
                    }
                }
            }

            // (b) beneficiary signal — independent of face re-match.
            if (beneficiary) {
                const { data: benefRows, error: benefRowsErr } = await admin
                    .from("redemption_cooldown_log")
                    .select("redeemed_at")
                    .eq("beneficiary_id", beneficiary.id)
                    .gte("redeemed_at", since)
                    .order("redeemed_at", { ascending: false });
                if (benefRowsErr) {
                    fairUsageReadFailed = true;
                } else {
                    for (const r of (benefRows as { redeemed_at: string }[] | null) ?? []) {
                        priorMs.push(Date.parse(r.redeemed_at));
                    }
                }
            }

            // de-dupe (the same redemption seeds both face + beneficiary rows) and
            // sort newest-first.
            const recentMs = Array.from(new Set(priorMs)).sort((a, b) => b - a);

            // A fair-usage rule is only enforceable if at least one signal could be
            // gathered (threshold set, or a registered beneficiary matched). With
            // neither, the checks degrade to a SOFT skip rather than a false pass.
            const signalAvailable = threshold != null || beneficiary != null;

            if (cooldownHours > 0) {
                if (fairUsageReadFailed) {
                    checks.push({
                        name: "cooldown",
                        pass: false,
                        hard: true,
                        detail: "could not read redemption history (transient error) — redemption blocked",
                    });
                } else if (!signalAvailable) {
                    checks.push({
                        name: "cooldown",
                        pass: true,
                        hard: false,
                        detail: "face_match_threshold unset and no registered beneficiary — cooldown skipped",
                    });
                } else if (recentMs.length > 0) {
                    const lastMs = recentMs[0]; // newest-first
                    const sinceMs = nowMs - lastMs;
                    const within = sinceMs < cooldownHours * 3_600_000;
                    checks.push({
                        name: "cooldown",
                        pass: !within,
                        hard: !cooldownRelax, // emergency relief → soft (never blocks)
                        detail:
                            (within
                                ? `last meal ${(sinceMs / 3_600_000).toFixed(1)}h ago (< ${cooldownHours}h)`
                                : `last meal ≥ ${cooldownHours}h ago`) +
                            emTag +
                            ` [source: ${cooldownSource}]`,
                    });
                } else {
                    checks.push({
                        name: "cooldown",
                        pass: true,
                        hard: false,
                        detail: "no prior meals for this beneficiary/face",
                    });
                }
            } else {
                checks.push({
                    name: "cooldown",
                    pass: true,
                    hard: false,
                    detail: "meal_cooldown_hours unset — cooldown skipped",
                });
            }

            if (maxPerDay > 0) {
                if (fairUsageReadFailed) {
                    checks.push({
                        name: "meal_limit",
                        pass: false,
                        hard: true,
                        detail: "could not read redemption history (transient error) — redemption blocked",
                    });
                } else if (!signalAvailable) {
                    checks.push({
                        name: "meal_limit",
                        pass: true,
                        hard: false,
                        detail: "face_match_threshold unset and no registered beneficiary — meal limit skipped",
                    });
                } else {
                    const todayCount = recentMs.filter(
                        (ms) => ms >= startOfDay.getTime()
                    ).length;
                    const underLimit = todayCount < maxPerDay;
                    checks.push({
                        name: "meal_limit",
                        pass: underLimit,
                        hard: !mealLimitRelax, // emergency relief → soft (never blocks)
                        detail:
                            (underLimit
                                ? `${todayCount}/${maxPerDay} meals today`
                                : `daily meal limit reached (${todayCount}/${maxPerDay})`) + emTag,
                    });
                }
            } else {
                checks.push({
                    name: "meal_limit",
                    pass: true,
                    hard: false,
                    detail: "max_meals_per_day unset — meal limit skipped",
                });
            }
        }

        // eligibility of the matched registered beneficiary, incl. expiry (owner §2.2.1).
        if (beneficiary) {
            const active = beneficiary.status === "active";
            const expired =
                beneficiary.eligibility_expires_at != null &&
                Date.parse(beneficiary.eligibility_expires_at) < nowMs;
            const pass = active && !expired;
            checks.push({
                name: "eligibility",
                pass,
                hard: true,
                detail: !active
                    ? `beneficiary is ${beneficiary.status}`
                    : expired
                      ? `eligibility expired ${beneficiary.eligibility_expires_at!.slice(0, 10)}`
                      : beneficiary.eligibility_status === "verified"
                        ? "beneficiary active & verified"
                        : `beneficiary active (eligibility ${beneficiary.eligibility_status})`,
            });
        }

        // Special-Care binding: a Special-Care token requires a matched, active,
        // care-eligible beneficiary — eligibility is registration-driven, not just
        // the menu item (owner §2.2.1 / §4.2.1, closes the menu-only gap).
        if (token.token_type === "special_care") {
            const careCategories = new Set(["pregnant_women", "patient"]);
            const careOk =
                beneficiary != null &&
                beneficiary.status === "active" &&
                careCategories.has(beneficiary.category);
            checks.push({
                name: "special_care_eligibility",
                pass: careOk,
                hard: true,
                detail: careOk
                    ? `special-care eligible (${beneficiary!.category})`
                    : beneficiary
                      ? `beneficiary category '${beneficiary.category}' is not special-care eligible`
                      : "special-care token requires a registered, care-eligible beneficiary",
            });
        }
    }

    // --- value (owner §4.4) --------------------------------------------------
    let value: RedemptionValue = ZERO_VALUE;
    if (token && menuItem) {
        const tokenValue = token.value_inr;
        const menuValue = Math.round(menuItem.price);
        const differencePaid = Math.max(0, menuValue - tokenValue);
        const forfeited = Math.max(0, tokenValue - menuValue);

        let coPay = 0;
        const requested = input.co_pay ?? 0;
        try {
            const coMax = await getNumber("co_contribution_max", admin as never);
            coPay = clamp(requested, 0, coMax);
        } catch {
            // co_contribution_max unset — accept only ₹0 (no guessed ceiling).
            coPay = clamp(requested, 0, 0);
        }

        value = {
            token_value: tokenValue,
            menu_value: menuValue,
            difference_paid: differencePaid,
            co_pay: coPay,
            forfeited,
        };
    }

    const ok = checks.every((c) => !c.hard || c.pass);

    return { ok, checks, token, menuItem, beneficiary, value };
}
