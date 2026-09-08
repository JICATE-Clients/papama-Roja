/**
 * Test helpers for system_config mocking.
 *
 * Every tunable rule lives in the system_config table. This module provides
 * factories to build config rows for tests, so services that call getConfig()
 * or requireConfig() get predictable values.
 */

interface ConfigRow {
    key: string;
    value: string | null;
    value_type: "number" | "boolean" | "string";
}

/**
 * Default config values aligned with papama-phase1-spec-rev2.md §7.
 *
 * Every value below must match the spec default. Where the spec says
 * "admin-configurable", the default here is the spec's stated launch value.
 */
const DEFAULTS: Record<string, ConfigRow> = {
    // --- Token & credit (spec §7) ---
    standard_token_value: { key: "standard_token_value", value: "50", value_type: "number" },
    special_care_multiplier: { key: "special_care_multiplier", value: "2", value_type: "number" },
    special_care_post_delivery_months: { key: "special_care_post_delivery_months", value: "6", value_type: "number" },
    token_expiry_days: { key: "token_expiry_days", value: "90", value_type: "number" },              // spec §7: 90 (was 30)
    token_revalidation_allowed: { key: "token_revalidation_allowed", value: "true", value_type: "boolean" }, // spec §7

    // --- Meal entitlement (spec §3.1 F-9, §7) ---
    meal_cooldown_hours: { key: "meal_cooldown_hours", value: "6", value_type: "number" },
    max_meals_per_day: { key: "max_meals_per_day", value: "1", value_type: "number" },                // spec §7: launch at 1, ceiling 3 (was 3)
    meal_window_breakfast: { key: "meal_window_breakfast", value: "06:00-10:00", value_type: "string" }, // spec §7
    meal_window_lunch: { key: "meal_window_lunch", value: "11:00-15:00", value_type: "string" },       // spec §7
    meal_window_dinner: { key: "meal_window_dinner", value: "18:00-22:00", value_type: "string" },     // spec §7
    multi_vendor_same_day: { key: "multi_vendor_same_day", value: "true", value_type: "boolean" },     // spec §7

    // --- Geofence & city (spec §7) ---
    redemption_radius_km: { key: "redemption_radius_km", value: "20", value_type: "number" },         // spec §7: 20 (was 5)
    city_lock_enabled: { key: "city_lock_enabled", value: "true", value_type: "boolean" },            // spec §7: true
    operating_city: { key: "operating_city", value: "Coimbatore", value_type: "string" },             // spec §3.1 F-11: Coimbatore (was Komarapalayam)

    // --- Co-contribution (spec §3.2, §7) ---
    co_contribution_max: { key: "co_contribution_max", value: "10", value_type: "number" },           // spec §7: ₹10 (was 0)
    courier_batch_min_value: { key: "courier_batch_min_value", value: "5000", value_type: "number" },

    // --- Vendor quality (spec §7) ---
    vendor_min_rating: { key: "vendor_min_rating", value: "3.5", value_type: "number" },              // spec §7: 3.5 (was 3)
    vendor_max_complaint_rate: { key: "vendor_max_complaint_rate", value: "0.05", value_type: "number" }, // spec §7: 5% (was 10%)
    vendor_auto_suspend_enabled: { key: "vendor_auto_suspend_enabled", value: "false", value_type: "boolean" },
    vendor_min_feedback_count: { key: "vendor_min_feedback_count", value: "5", value_type: "number" },

    // --- Settlement & audit (spec §7) ---
    /**
     * KEY-NAME DRIFT (found while building F-3, corrected here).
     *
     * `settlement_audit_sample_pct` is labelled below as a rename of
     * `settlement_random_audit_rate`. That rename never happened in production:
     * lib/services/settlement.ts and the DB seed both still read
     * `settlement_random_audit_rate`, so the fixture key matches nothing, and
     * its 5% contradicts the client's confirmed 10% baseline (CD §D-5).
     *
     * To be precise about what this does and does not fix: the drift is NOT
     * why random-audit sampling is untested. `settlement.test.ts` mocks
     * `getConfig` directly and deliberately rejects it ("audit sampling off"),
     * and no test calls `queueRandomAudits` at all. Adding the real key here
     * makes the fixture honest; it does not by itself add coverage. That
     * coverage gap is real and still open.
     */
    settlement_random_audit_rate: { key: "settlement_random_audit_rate", value: "0.10", value_type: "number" }, // the key production reads; CD §D-5 baseline
    settlement_audit_sample_pct: { key: "settlement_audit_sample_pct", value: "0.05", value_type: "number" }, // LEGACY — matches no production key
    proof_phash_dup_distance: { key: "proof_phash_dup_distance", value: "10", value_type: "number" },

    // --- Emergency (spec §7, §3.3) ---
    emergency_mode_enabled: { key: "emergency_mode_enabled", value: "false", value_type: "boolean" },
    emergency_mode_max_duration_days: { key: "emergency_mode_max_duration_days", value: "30", value_type: "number" }, // spec §7
    emergency_max_meals_per_day: { key: "emergency_max_meals_per_day", value: "6", value_type: "number" },
    emergency_meal_cooldown_hours: { key: "emergency_meal_cooldown_hours", value: "2", value_type: "number" },

    // --- Volunteer ---
    max_tokens_per_volunteer: { key: "max_tokens_per_volunteer", value: null, value_type: "number" },
    volunteer_zones_enabled: { key: "volunteer_zones_enabled", value: "false", value_type: "boolean" },

    // --- Beneficiary ---
    patient_eligibility_months: { key: "patient_eligibility_months", value: "12", value_type: "number" },

    // --- Feature flags ---
    meal_window_enforcement_enabled: { key: "meal_window_enforcement_enabled", value: "true", value_type: "boolean" }, // spec §3.1 F-9: meal windows are first-class (was false)
    vendor_capacity_enforcement_enabled: { key: "vendor_capacity_enforcement_enabled", value: "false", value_type: "boolean" },
    csr_80g_certificates_enabled: { key: "csr_80g_certificates_enabled", value: "false", value_type: "boolean" },     // spec: 80G deferred
    transparency_dashboard_enabled: { key: "transparency_dashboard_enabled", value: "true", value_type: "boolean" },
    institution_bulk_allocation_max: { key: "institution_bulk_allocation_max", value: "100", value_type: "number" },

    // --- Compliance (spec §7, M2-14) ---
    audit_log_retention_days: { key: "audit_log_retention_days", value: "2920", value_type: "number" }, // spec §7: 8 years (was 365)
};

/**
 * Get all default config rows as an array (for mocking a full table read).
 */
export function allConfigRows(): ConfigRow[] {
    return Object.values(DEFAULTS);
}

/**
 * Get a single config row by key. Optionally override the value.
 */
export function configRow(key: string, value?: string | null): ConfigRow {
    const base = DEFAULTS[key];
    if (!base) {
        return { key, value: value ?? null, value_type: "string" };
    }
    if (value !== undefined) {
        return { ...base, value };
    }
    return { ...base };
}

/**
 * Build a set of config rows with custom overrides.
 *
 * @example
 *   const rows = buildConfig({
 *     standard_token_value: "100",
 *     emergency_mode_enabled: "true",
 *     token_expiry_days: null,  // unset
 *   });
 */
export function buildConfig(overrides: Record<string, string | null> = {}): ConfigRow[] {
    const rows = allConfigRows().map((row) => {
        if (row.key in overrides) {
            return { ...row, value: overrides[row.key] };
        }
        return row;
    });

    // Add any override keys not in defaults
    for (const [key, value] of Object.entries(overrides)) {
        if (!DEFAULTS[key]) {
            rows.push({ key, value, value_type: "string" });
        }
    }

    return rows;
}
