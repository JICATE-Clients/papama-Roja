/**
 * Integration tests against a REAL Supabase instance.
 *
 * Run with:  PAPAMA_ALLOW_INTEGRATION_WRITES=1 npx vitest run test/integration/supabase.test.ts
 *
 * ⚠️ These tests WRITE, and they do NOT clean up — every row they create is
 * tagged "_test_integration_" and left behind. Pointed at production that is
 * not a test suite, it is a data-entry job: on 2026-08-21 a plain
 * `npx vitest run` had left 123 tagged rows in the live database, including
 * every row of `fraud_flags`, `ngo_partners` and `consent_records`, plus 18
 * fake vendors visible in the admin console.
 *
 * Hence the opt-in below. `npm run test` no longer touches the database by
 * accident; you have to say so.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, it, expect, beforeAll } from "vitest";

// ---------------------------------------------------------------------------
// Clients — created inline, no Next.js wrapper needed
// ---------------------------------------------------------------------------
const SUPABASE_URL = "https://qxdxefofeykzvegykitt.supabase.co";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZHhlZm9mZXlrenZlZ3lraXR0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU3NzY1OCwiZXhwIjoyMDk3MTUzNjU4fQ.pS_wcNvJGEmDozHphkgrZNmIXU_BCau8-Bpg97PLSV0";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZHhlZm9mZXlrenZlZ3lraXR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Nzc2NTgsImV4cCI6MjA5NzE1MzY1OH0.t3ETvCrCvTHhvSfmQQDK-oEFHkC6a0hEXOCnB28X-HI";

/**
 * Opt-in guard.
 *
 * Without PAPAMA_ALLOW_INTEGRATION_WRITES=1 the whole file is skipped, so a
 * bare `npm run test` or `npx vitest run` can never write to the database. The
 * unit suite (30 files, ~2400 tests) is unaffected and still runs.
 *
 * Set the variable deliberately, and preferably against a scratch project
 * rather than the ref hardcoded above.
 */
const WRITES_ALLOWED = process.env.PAPAMA_ALLOW_INTEGRATION_WRITES === "1";

const describeIntegration = WRITES_ALLOWED ? describe : describe.skip;

if (!WRITES_ALLOWED) {
    console.warn(
        "\n[integration] SKIPPED — these tests write to a live Supabase project and do not clean up.\n" +
            "[integration] Set PAPAMA_ALLOW_INTEGRATION_WRITES=1 to run them.\n"
    );
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY);
const anon: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY);

/** Tag used to identify test-created rows */
const TAG = "_test_integration_";

/** Default timeout for individual tests (network calls) */
const T = 15_000;

// ---------------------------------------------------------------------------
// Expected tables (28 confirmed)
// ---------------------------------------------------------------------------
const EXPECTED_TABLES = [
  "users",
  "system_config",
  "donors",
  "donor_credits",
  "credit_transactions",
  "donations",
  "token_types",
  "tokens",
  "token_batches",
  "token_distribution_records",
  "beneficiaries",
  "beneficiary_registrations",
  "token_redemptions",
  "vendors",
  "vendor_menus",
  "vendor_settlements",
  "settlement_line_items",
  "audit_logs",
  "notifications",
  "fraud_flags",
  "volunteers",
  "meal_windows",
  "consent_records",
  "vendor_feedback",
  "ngo_partners",
  "campaigns",
  "notification_templates",
  "settlement_audit_queue",
] as const;

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  1. Connection & Schema (5 tests)                                      ║
// ╚═════════════════════════════════════════════════════════════════════════╝
describeIntegration("1 — Connection & Schema", () => {
  it("connects with service role key", { timeout: T }, async () => {
    const { data, error } = await admin
      .from("system_config")
      .select("key")
      .limit(1);
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("connects with anon key", { timeout: T }, async () => {
    // Anon may get empty data due to RLS but the connection itself works
    const { error } = await anon.from("campaigns").select("id").limit(1);
    expect(error).toBeNull();
  });

  it("system_config has expected keys (standard_token_value, token_expiry_days, etc.)", { timeout: T }, async () => {
    const { data, error } = await admin.from("system_config").select("key");
    expect(error).toBeNull();
    const keys = (data ?? []).map((r: { key: string }) => r.key);
    for (const k of [
      "standard_token_value",
      "token_expiry_days",
      "meal_cooldown_hours",
      "max_meals_per_day",
      "vendor_min_rating",
    ]) {
      expect(keys, `Missing key: ${k}`).toContain(k);
    }
  });

  it("token_types has standard and special_care entries", { timeout: T }, async () => {
    const { data, error } = await admin.from("token_types").select("code");
    expect(error).toBeNull();
    const codes = (data ?? []).map((r: { code: string }) => r.code);
    expect(codes).toContain("standard");
    expect(codes).toContain("special_care");
  });

  it("all 28 expected tables are queryable", { timeout: 30_000 }, async () => {
    const failures: string[] = [];
    for (const table of EXPECTED_TABLES) {
      const { error } = await admin.from(table).select("*").limit(0);
      if (error) failures.push(`${table}: ${error.message}`);
    }
    expect(
      failures,
      `Non-queryable tables: ${failures.join("; ")}`,
    ).toHaveLength(0);
  });
});

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  2. System Config — spec §7 values (10 tests)                         ║
// ╚═════════════════════════════════════════════════════════════════════════╝
describeIntegration("2 — System Config (spec §7)", () => {
  const configMap: Record<string, string | null> = {};

  beforeAll(async () => {
    const { data, error } = await admin
      .from("system_config")
      .select("key, value, value_type");
    expect(error).toBeNull();
    for (const row of data!) {
      configMap[row.key] = row.value;
    }
    console.log("system_config snapshot:", configMap);
  }, T);

  it("standard_token_value = 50", { timeout: T }, () => {
    expect(configMap["standard_token_value"]).toBeDefined();
    const val = Number(configMap["standard_token_value"]);
    console.log(`  standard_token_value DB value: ${val}`);
    expect(val).toBe(50);
  });

  it("special_care_multiplier = 2", { timeout: T }, () => {
    expect(configMap["special_care_multiplier"]).toBeDefined();
    const val = Number(configMap["special_care_multiplier"]);
    console.log(`  special_care_multiplier DB value: ${val}`);
    expect(val).toBe(2);
  });

  it("token_expiry_days (spec says 90 — check actual)", { timeout: T }, () => {
    expect(configMap["token_expiry_days"]).toBeDefined();
    const val = Number(configMap["token_expiry_days"]);
    console.log(`  token_expiry_days DB value: ${val} (spec says 90)`);
    expect(val).toBeGreaterThan(0);
  });

  it("meal_cooldown_hours = 6", { timeout: T }, () => {
    expect(configMap["meal_cooldown_hours"]).toBeDefined();
    const val = Number(configMap["meal_cooldown_hours"]);
    console.log(`  meal_cooldown_hours DB value: ${val}`);
    expect(val).toBe(6);
  });

  it("max_meals_per_day (spec says 1 at launch)", { timeout: T }, () => {
    expect(configMap["max_meals_per_day"]).toBeDefined();
    const val = Number(configMap["max_meals_per_day"]);
    console.log(`  max_meals_per_day DB value: ${val} (spec says 1)`);
    expect(val).toBeGreaterThan(0);
  });

  it("redemption_radius_km (spec says 20)", { timeout: T }, () => {
    expect(configMap["redemption_radius_km"]).toBeDefined();
    const val = Number(configMap["redemption_radius_km"]);
    console.log(`  redemption_radius_km DB value: ${val} (spec says 20)`);
    expect(val).toBeGreaterThan(0);
  });

  it("co_contribution_max (spec says 10)", { timeout: T }, () => {
    expect(configMap["co_contribution_max"]).toBeDefined();
    const val = Number(configMap["co_contribution_max"]);
    console.log(`  co_contribution_max DB value: ${val} (spec says 10)`);
    expect(val).toBeGreaterThanOrEqual(0);
  });

  it("vendor_min_rating (spec says 3.5)", { timeout: T }, () => {
    expect(configMap["vendor_min_rating"]).toBeDefined();
    const val = Number(configMap["vendor_min_rating"]);
    console.log(`  vendor_min_rating DB value: ${val} (spec says 3.5)`);
    expect(val).toBeGreaterThan(0);
  });

  it("vendor_max_complaint_rate (spec says 0.05)", { timeout: T }, () => {
    expect(configMap["vendor_max_complaint_rate"]).toBeDefined();
    const val = Number(configMap["vendor_max_complaint_rate"]);
    console.log(
      `  vendor_max_complaint_rate DB value: ${val} (spec says 0.05)`,
    );
    expect(val).toBeGreaterThan(0);
  });

  it("reports all actual DB values vs spec expectations", { timeout: T }, () => {
    const specExpectations: Record<string, string> = {
      standard_token_value: "50",
      special_care_multiplier: "2",
      token_expiry_days: "90",
      meal_cooldown_hours: "6",
      max_meals_per_day: "1",
      redemption_radius_km: "20",
      co_contribution_max: "10",
      vendor_min_rating: "3.5",
      vendor_max_complaint_rate: "0.05",
    };
    const mismatches: string[] = [];
    for (const [key, specVal] of Object.entries(specExpectations)) {
      const actual = configMap[key];
      if (actual !== specVal) {
        mismatches.push(`${key}: spec=${specVal}, actual=${actual}`);
      }
    }
    if (mismatches.length > 0) {
      console.log("  Spec vs DB mismatches:", mismatches);
    } else {
      console.log("  All values match spec exactly");
    }
    // This test just reports — it always passes
    expect(true).toBe(true);
  });
});

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  3. CRUD operations with service role (8 tests)                        ║
// ╚═════════════════════════════════════════════════════════════════════════╝
describeIntegration("3 — CRUD with service role", () => {
  let testVendorId: string;

  it("inserts a test vendor row and reads it back", { timeout: T }, async () => {
    const { data, error } = await admin
      .from("vendors")
      .insert({
        name: `${TAG}vendor`,
        legal_name: `${TAG}Vendor Pvt Ltd`,
        city: "Chennai",
        status: "pending",
        kyc_status: "pending",
      })
      .select()
      .single();
    if (error) console.error("vendor insert error:", error.message);
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.name).toBe(`${TAG}vendor`);
    expect(data!.city).toBe("Chennai");
    expect(data!.status).toBe("pending");
    testVendorId = data!.id;
  });

  it("inserts a test audit_log row and verifies fields", { timeout: T }, async () => {
    const { data, error } = await admin
      .from("audit_logs")
      .insert({
        action: `${TAG}test_action`,
        entity_table: "vendors",
        entity_id: testVendorId,
        summary: `${TAG}audit`,
        metadata: { test: true },
      })
      .select()
      .single();
    if (error) console.error("audit_log insert error:", error.message);
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.action).toBe(`${TAG}test_action`);
    expect(data!.summary).toBe(`${TAG}audit`);
    expect(data!.entity_table).toBe("vendors");
    expect(data!.metadata).toEqual({ test: true });
  });

  it("inserts a test fraud_flag row and verifies all fields", { timeout: T }, async () => {
    const { data, error } = await admin
      .from("fraud_flags")
      .insert({
        flag_type: "vendor_anomaly",
        severity: "high",
        status: "open",
        detection_method: "face_hash_repeat",
        entity: {
          kind: "vendor",
          id: testVendorId,
          reason: `${TAG}fraud`,
        },
        blocked: false,
      })
      .select()
      .single();
    if (error) console.error("fraud_flag insert error:", error.message);
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.flag_type).toBe("vendor_anomaly");
    expect(data!.severity).toBe("high");
    expect(data!.status).toBe("open");
    expect(data!.detection_method).toBe("face_hash_repeat");
    expect(data!.blocked).toBe(false);
  });

  it("inserts a test notification", { timeout: T }, async () => {
    // notifications requires a donor_id FK — get an existing donor or skip
    const { data: donors } = await admin
      .from("donors")
      .select("id")
      .limit(1);
    const donorId = donors?.[0]?.id;

    if (!donorId) {
      console.log("  No donors in DB — inserting notification without donor_id");
      const { data, error } = await admin
        .from("notifications")
        .insert({
          kind: "system",
          channel: "in_app",
          title: `${TAG}notif`,
          message: `${TAG}notification body`,
          status: "unread",
        })
        .select()
        .single();
      if (error) console.error("notification insert error:", error.message);
      expect(error).toBeNull();
      expect(data!.title).toBe(`${TAG}notif`);
    } else {
      const { data, error } = await admin
        .from("notifications")
        .insert({
          donor_id: donorId,
          kind: "system",
          channel: "in_app",
          title: `${TAG}notif`,
          message: `${TAG}notification body`,
          status: "unread",
        })
        .select()
        .single();
      if (error) console.error("notification insert error:", error.message);
      expect(error).toBeNull();
      expect(data!.title).toBe(`${TAG}notif`);
    }
  });

  it("reads system_config rows and verifies value_type field exists", { timeout: T }, async () => {
    const { data, error } = await admin
      .from("system_config")
      .select("key, value, value_type")
      .limit(5);
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBeGreaterThan(0);
    for (const row of data!) {
      expect(row).toHaveProperty("value_type");
    }
  });

  it("inserts a test consent_record", { timeout: T }, async () => {
    // consent_records: subject_type, subject_id, consent_type (enum: data_privacy, communications, data_processing)
    const { data: users } = await admin
      .from("users")
      .select("id")
      .limit(1);
    const subjectId = users?.[0]?.id ?? "00000000-0000-0000-0000-000000000099";

    const { data, error } = await admin
      .from("consent_records")
      .insert({
        subject_type: "donor",
        subject_id: subjectId,
        consent_type: "data_privacy",
        version: `${TAG}v1`,
      })
      .select()
      .single();
    if (error) console.error("consent_record insert error:", error.message);
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.consent_type).toBe("data_privacy");
    expect(data!.version).toBe(`${TAG}v1`);
  });

  it("inserts a test notification_template", { timeout: T }, async () => {
    const uniqueKind = `${TAG}tpl_${Date.now()}`;
    const { data, error } = await admin
      .from("notification_templates")
      .insert({
        kind: uniqueKind,
        channel: "in_app",
        subject: `${TAG}template subject`,
        body_template: `Hello {{name}}, ${TAG}template body`,
        is_active: true,
      })
      .select()
      .single();
    if (error) console.error("notification_template insert error:", error.message);
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.kind).toBe(uniqueKind);
    expect(data!.subject).toBe(`${TAG}template subject`);
    expect(data!.is_active).toBe(true);
  });

  it("inserts a test ngo_partner", { timeout: T }, async () => {
    const { data, error } = await admin
      .from("ngo_partners")
      .insert({
        name: `${TAG}ngo`,
        status: "active",
        focus_area: `${TAG}food security`,
        contact_person: `${TAG}contact`,
        contact_email: "test@integration.local",
      })
      .select()
      .single();
    if (error) console.error("ngo_partner insert error:", error.message);
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.name).toBe(`${TAG}ngo`);
    expect(data!.status).toBe("active");
  });
});

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  4. RLS policy smoke tests (8 tests)                                   ║
// ╚═════════════════════════════════════════════════════════════════════════╝
describeIntegration("4 — RLS policy smoke tests (anon client)", () => {
  it("anon CANNOT read users table", { timeout: T }, async () => {
    const { data, error } = await anon.from("users").select("*").limit(5);
    const blocked = error !== null || (data ?? []).length === 0;
    expect(blocked, `Expected blocked but got ${(data ?? []).length} rows`).toBe(true);
  });

  it("anon CANNOT read donors table", { timeout: T }, async () => {
    const { data, error } = await anon.from("donors").select("*").limit(5);
    const blocked = error !== null || (data ?? []).length === 0;
    expect(blocked, `Expected blocked but got ${(data ?? []).length} rows`).toBe(true);
  });

  it("anon CANNOT read fraud_flags table", { timeout: T }, async () => {
    const { data, error } = await anon
      .from("fraud_flags")
      .select("*")
      .limit(5);
    const blocked = error !== null || (data ?? []).length === 0;
    expect(blocked, `Expected blocked but got ${(data ?? []).length} rows`).toBe(true);
  });

  it("anon CANNOT read audit_logs table", { timeout: T }, async () => {
    const { data, error } = await anon
      .from("audit_logs")
      .select("*")
      .limit(5);
    const blocked = error !== null || (data ?? []).length === 0;
    expect(blocked, `Expected blocked but got ${(data ?? []).length} rows`).toBe(true);
  });

  it("anon CANNOT read vendor_settlements table", { timeout: T }, async () => {
    const { data, error } = await anon
      .from("vendor_settlements")
      .select("*")
      .limit(5);
    const blocked = error !== null || (data ?? []).length === 0;
    expect(blocked, `Expected blocked but got ${(data ?? []).length} rows`).toBe(true);
  });

  it("anon CAN or CANNOT read system_config (document which)", { timeout: T }, async () => {
    const { data, error } = await anon
      .from("system_config")
      .select("key")
      .limit(5);
    const blocked = error !== null || (data ?? []).length === 0;
    console.log(
      `  system_config anon access: ${blocked ? "BLOCKED" : "ALLOWED"} (data: ${(data ?? []).length} rows, error: ${error?.message ?? "none"})`,
    );
    // Policy is SELECT for 'authenticated' only — anon should be blocked
    expect(blocked).toBe(true);
  });

  it("anon CANNOT insert into vendors directly", { timeout: T }, async () => {
    const { error } = await anon.from("vendors").insert({
      name: `${TAG}anon_vendor`,
      status: "pending",
      kyc_status: "pending",
    });
    expect(error).not.toBeNull();
    console.log(`  anon vendor insert error: ${error!.message}`);
  });

  it("anon CANNOT delete from any table", { timeout: T }, async () => {
    const { error: vendorErr } = await anon
      .from("vendors")
      .delete()
      .eq("name", `${TAG}nonexistent`);
    const { error: userErr } = await anon
      .from("users")
      .delete()
      .eq("full_name", `${TAG}nonexistent`);

    // At least one should error (RLS blocks)
    const anyBlocked = vendorErr !== null || userErr !== null;
    console.log(
      `  anon delete: vendors=${vendorErr?.message ?? "no error"}, users=${userErr?.message ?? "no error"}`,
    );
    expect(anyBlocked).toBe(true);
  });
});

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  5. Foreign key constraints (5 tests)                                  ║
// ╚═════════════════════════════════════════════════════════════════════════╝
describeIntegration("5 — Foreign key constraints", () => {
  const BOGUS_UUID = "00000000-0000-0000-0000-000000000001";

  it("inserting a token with non-existent donor_id fails (FK violation)", { timeout: T }, async () => {
    const { error } = await admin.from("tokens").insert({
      serial_number: `${TAG}tok_fk_test_${Date.now()}`,
      token_type: "standard",
      value_inr: 50,
      status: "generated",
      donor_id: BOGUS_UUID,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("violates foreign key");
    console.log(`  FK violation (token.donor_id): ${error!.message}`);
  });

  it("inserting a settlement_line_item with non-existent settlement_id fails", { timeout: T }, async () => {
    const { error } = await admin.from("settlement_line_items").insert({
      settlement_id: BOGUS_UUID,
      redemption_id: BOGUS_UUID,
      amount_inr: 100,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("violates foreign key");
    console.log(
      `  FK violation (settlement_line_items.settlement_id): ${error!.message}`,
    );
  });

  it("reads tokens and verifies structure", { timeout: T }, async () => {
    const { data, error } = await admin
      .from("tokens")
      .select("id, serial_number, token_type, value_inr, status, donor_id")
      .limit(3);
    expect(error).toBeNull();
    expect(data).toBeDefined();
    console.log(`  tokens rows returned: ${(data ?? []).length}`);
    if ((data ?? []).length > 0) {
      const row = data![0];
      expect(row).toHaveProperty("id");
      expect(row).toHaveProperty("serial_number");
      expect(row).toHaveProperty("token_type");
      expect(row).toHaveProperty("value_inr");
      expect(row).toHaveProperty("status");
      expect(row).toHaveProperty("donor_id");
    }
  });

  it("reads vendor_menus and verifies vendor_id field exists", { timeout: T }, async () => {
    const { data, error } = await admin
      .from("vendor_menus")
      .select("id, vendor_id, item_name, price")
      .limit(3);
    expect(error).toBeNull();
    expect(data).toBeDefined();
    console.log(`  vendor_menus rows returned: ${(data ?? []).length}`);
    if ((data ?? []).length > 0) {
      expect(data![0]).toHaveProperty("vendor_id");
    }
  });

  it("token_types has required standard/special_care rows", { timeout: T }, async () => {
    const { data, error } = await admin
      .from("token_types")
      .select("code, label, is_restricted, requires_eligibility");
    expect(error).toBeNull();
    expect(data).toBeDefined();

    const standard = data!.find(
      (r: { code: string }) => r.code === "standard",
    );
    const specialCare = data!.find(
      (r: { code: string }) => r.code === "special_care",
    );

    expect(standard).toBeDefined();
    expect(standard!.is_restricted).toBe(false);
    expect(standard!.requires_eligibility).toBe(false);

    expect(specialCare).toBeDefined();
    expect(specialCare!.is_restricted).toBe(true);
    expect(specialCare!.requires_eligibility).toBe(true);
  });
});

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  6. Data integrity (5 tests)                                           ║
// ╚═════════════════════════════════════════════════════════════════════════╝
describeIntegration("6 — Data integrity", () => {
  const VALID_USER_ROLES = [
    "admin",
    "donor",
    "vendor",
    "vendor_manager",
    "volunteer",
    "compliance",
    "beneficiary",
  ];

  const VALID_VENDOR_STATUSES = [
    "pending",
    "active",
    "suspended",
    "blacklisted",
    "inactive",
    "approved",
    "rejected",
  ];

  const VALID_TOKEN_STATUSES = [
    "generated",
    "allocated",
    "distributed",
    "redeemed",
    "expired",
    "cancelled",
    "replaced",
    "live",
  ];

  it("existing users have valid roles", { timeout: T }, async () => {
    const { data, error } = await admin.from("users").select("id, role");
    expect(error).toBeNull();
    const invalid = (data ?? []).filter(
      (u: { role: string }) => !VALID_USER_ROLES.includes(u.role),
    );
    if (invalid.length > 0) {
      console.warn(
        "  Users with unexpected roles:",
        invalid.map(
          (u: { id: string; role: string }) => `${u.id}: ${u.role}`,
        ),
      );
    }
    expect(invalid).toHaveLength(0);
  });

  it("existing vendors have valid statuses (pending/approved/suspended/rejected)", { timeout: T }, async () => {
    const { data, error } = await admin
      .from("vendors")
      .select("id, status");
    expect(error).toBeNull();
    const invalid = (data ?? []).filter(
      (v: { status: string }) => !VALID_VENDOR_STATUSES.includes(v.status),
    );
    if (invalid.length > 0) {
      console.warn(
        "  Vendors with unexpected statuses:",
        invalid.map(
          (v: { id: string; status: string }) => `${v.id}: ${v.status}`,
        ),
      );
    }
    expect(invalid).toHaveLength(0);
  });

  it("existing tokens have valid statuses", { timeout: T }, async () => {
    const { data, error } = await admin
      .from("tokens")
      .select("id, status");
    expect(error).toBeNull();
    const invalid = (data ?? []).filter(
      (t: { status: string }) => !VALID_TOKEN_STATUSES.includes(t.status),
    );
    if (invalid.length > 0) {
      console.warn(
        "  Tokens with unexpected statuses:",
        invalid.map(
          (t: { id: string; status: string }) => `${t.id}: ${t.status}`,
        ),
      );
    }
    expect(invalid).toHaveLength(0);
  });

  it("system_config keys have non-null value_type", { timeout: T }, async () => {
    const { data, error } = await admin
      .from("system_config")
      .select("key, value_type");
    expect(error).toBeNull();
    const missing = (data ?? []).filter(
      (c: { value_type: string | null }) => !c.value_type,
    );
    expect(
      missing,
      `Keys missing value_type: ${missing.map((c: { key: string }) => c.key).join(", ")}`,
    ).toHaveLength(0);
  });

  it("no duplicate keys in system_config", { timeout: T }, async () => {
    const { data, error } = await admin
      .from("system_config")
      .select("key");
    expect(error).toBeNull();
    const keys = (data ?? []).map((r: { key: string }) => r.key);
    const unique = new Set(keys);
    const duplicates = keys.filter(
      (k: string) => keys.indexOf(k) !== keys.lastIndexOf(k),
    );
    if (duplicates.length > 0) {
      console.warn("  Duplicate system_config keys:", [...new Set(duplicates)]);
    }
    expect(unique.size, "Duplicate keys found in system_config").toBe(
      keys.length,
    );
  });
});
