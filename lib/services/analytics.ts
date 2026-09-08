import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin analytics aggregation (addon2 A1).
 *
 * All data sources already exist; this rolls them up for the admin analytics
 * dashboard: meals served, donation trends, vendor performance, token
 * utilisation, financial summary, fraud counts, and city / beneficiary-category
 * breakdowns. Aggregation is done in JS over targeted SELECTs (no new tables).
 *
 * SCALING NOTE: selects are capped (see CAP) and reduced in memory. For a
 * multi-city production dataset this should move to a SECURITY-DEFINER SQL
 * function / materialised rollups; that is a deliberate follow-up, not built now.
 * Always invoked with the service-role client after an audit_reports/read check.
 */

const CAP = 5000;

export interface NameCount {
    label: string;
    count: number;
}

export interface TrendPoint {
    /** bucket label — "YYYY-MM-DD" (meals) or "YYYY-MM" (donations) */
    period: string;
    value: number;
}

export interface VendorPerf {
    vendor_id: string;
    name: string;
    redemptions: number;
    rating_avg: number | null;
    quality_score: number | null;
}

export interface AnalyticsSummary {
    meals_served_total: number;
    meals_trend_30d: TrendPoint[];
    donation_total_inr: number;
    donation_count: number;
    donation_trend_6m: TrendPoint[];
    token_utilisation: NameCount[];
    financial: {
        donated_inr: number;
        settlements_paid_inr: number;
        settlements_pending_inr: number;
        /**
         * Unspent token value. F-4 (B-03) reclassified this: it used to be
         * reported as revenue, which recorded donated money as income to
         * pApAmA. It is now pool value awaiting another meal — the field name is
         * kept for compatibility, but it means "returned to pool", not "kept".
         */
        forfeited_inr: number;
        /** Live Meal Pool balance from the ledger (F-4). */
        meal_pool_inr: number;
        /** Live Common Special Care Pool balance from the ledger (A-3). */
        special_care_pool_inr: number;
    };
    fraud_open_by_severity: NameCount[];
    top_vendors: VendorPerf[];
    city_wise: NameCount[];
    category_wise: NameCount[];
}

/** "YYYY-MM-DD" for the last `days` days, oldest first, zero-filled. */
function lastNDays(days: number): string[] {
    // Callers pass a reference "now" via the rows themselves; we build the axis
    // from the max date present to avoid Date.now()-style nondeterminism here is
    // unnecessary — this runs server-side per request, so `new Date()` is fine.
    const out: string[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - i);
        out.push(d.toISOString().substring(0, 10));
    }
    return out;
}

function lastNMonths(months: number): string[] {
    const out: string[] = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        out.push(d.toISOString().substring(0, 7));
    }
    return out;
}

export async function getAnalytics(admin: SupabaseClient): Promise<AnalyticsSummary> {
    // --- token utilisation + meals served (from tokens.status) --------------
    const { data: tokenRows } = await admin
        .from("tokens")
        .select("status")
        .limit(CAP);
    const tokenStatusCounts = new Map<string, number>();
    for (const t of (tokenRows ?? []) as { status: string }[]) {
        tokenStatusCounts.set(t.status, (tokenStatusCounts.get(t.status) ?? 0) + 1);
    }
    const token_utilisation: NameCount[] = [...tokenStatusCounts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

    // --- redemptions: meals trend + city + category + vendor perf -----------
    const { data: redRows } = await admin
        .from("token_redemptions")
        .select("vendor_id, beneficiary_id, redeemed_at, menu_value_inr")
        .order("redeemed_at", { ascending: false })
        .limit(CAP);
    const redemptions = (redRows ?? []) as {
        vendor_id: string | null;
        beneficiary_id: string | null;
        redeemed_at: string;
        menu_value_inr: number | null;
    }[];
    const meals_served_total = redemptions.length;

    const mealsByDay = new Map<string, number>();
    for (const r of redemptions) {
        const day = (r.redeemed_at || "").substring(0, 10);
        if (day) mealsByDay.set(day, (mealsByDay.get(day) ?? 0) + 1);
    }
    const meals_trend_30d: TrendPoint[] = lastNDays(30).map((period) => ({
        period,
        value: mealsByDay.get(period) ?? 0,
    }));

    const perVendorRedemptions = new Map<string, number>();
    for (const r of redemptions) {
        if (r.vendor_id) perVendorRedemptions.set(r.vendor_id, (perVendorRedemptions.get(r.vendor_id) ?? 0) + 1);
    }

    // --- vendors: names, city, ratings (for city-wise + vendor perf) --------
    const { data: vendorRows } = await admin
        .from("vendors")
        .select("id, name, city, rating_avg, quality_score")
        .limit(CAP);
    const vendors = (vendorRows ?? []) as {
        id: string;
        name: string | null;
        city: string | null;
        rating_avg: number | null;
        quality_score: number | null;
    }[];
    const vendorById = new Map(vendors.map((v) => [v.id, v]));

    const cityCounts = new Map<string, number>();
    for (const r of redemptions) {
        const city = (r.vendor_id && vendorById.get(r.vendor_id)?.city) || "Unknown";
        cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
    }
    const city_wise: NameCount[] = [...cityCounts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

    const top_vendors: VendorPerf[] = [...perVendorRedemptions.entries()]
        .map(([vendor_id, redemptionCount]) => {
            const v = vendorById.get(vendor_id);
            return {
                vendor_id,
                name: v?.name ?? "Unknown vendor",
                redemptions: redemptionCount,
                rating_avg: v?.rating_avg ?? null,
                quality_score: v?.quality_score ?? null,
            };
        })
        .sort((a, b) => b.redemptions - a.redemptions)
        .slice(0, 10);

    // --- beneficiaries: category-wise ---------------------------------------
    const benefIds = [...new Set(redemptions.map((r) => r.beneficiary_id).filter(Boolean) as string[])];
    const categoryById = new Map<string, string>();
    if (benefIds.length > 0) {
        const { data: benefRows } = await admin
            .from("beneficiaries")
            .select("id, category")
            .in("id", benefIds);
        for (const b of (benefRows ?? []) as { id: string; category: string }[]) {
            categoryById.set(b.id, b.category);
        }
    }
    const categoryCounts = new Map<string, number>();
    for (const r of redemptions) {
        const cat = (r.beneficiary_id && categoryById.get(r.beneficiary_id)) || "unknown";
        categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    }
    const category_wise: NameCount[] = [...categoryCounts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

    // --- donations: total + 6-month trend -----------------------------------
    const { data: donationRows } = await admin
        .from("donations")
        .select("amount_inr, status, created_at")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(CAP);
    const donations = (donationRows ?? []) as {
        amount_inr: number | null;
        status: string;
        created_at: string;
    }[];
    const donation_total_inr = donations.reduce((s, d) => s + (d.amount_inr ?? 0), 0);
    const donationByMonth = new Map<string, number>();
    for (const d of donations) {
        const m = (d.created_at || "").substring(0, 7);
        if (m) donationByMonth.set(m, (donationByMonth.get(m) ?? 0) + (d.amount_inr ?? 0));
    }
    const donation_trend_6m: TrendPoint[] = lastNMonths(6).map((period) => ({
        period,
        value: donationByMonth.get(period) ?? 0,
    }));

    // --- financial: settlements + forfeited ---------------------------------
    const { data: settlementRows } = await admin
        .from("vendor_settlements")
        .select("amount, status")
        .limit(CAP);
    let settlements_paid_inr = 0;
    let settlements_pending_inr = 0;
    for (const s of (settlementRows ?? []) as { amount: number | null; status: string }[]) {
        const amt = s.amount ?? 0;
        if (s.status === "paid") settlements_paid_inr += amt;
        else settlements_pending_inr += amt;
    }

    const { data: forfeitedRows } = await admin
        .from("forfeited_balances")
        .select("forfeited_inr")
        .limit(CAP);
    const forfeited_inr = ((forfeitedRows ?? []) as { forfeited_inr: number | null }[]).reduce(
        (s, f) => s + (f.forfeited_inr ?? 0),
        0
    );

    // F-4 (B-03) / A-3: the two POOL balances, read from the ledger rather than
    // recomputed, so the dashboard and the ledger can never disagree. Neither is
    // revenue — both are donated value that has not yet bought a meal.
    const { data: poolRows } = await admin
        .from("ledger_entries")
        .select("ledger, amount")
        .in("ledger", ["meal_pool", "special_care_pool"])
        .limit(CAP);

    let meal_pool_inr = 0;
    let special_care_pool_inr = 0;
    for (const row of (poolRows ?? []) as { ledger: string; amount: number | string }[]) {
        // Postgres numeric arrives as a string; `+` would concatenate.
        const amount = Number(row.amount) || 0;
        if (row.ledger === "meal_pool") meal_pool_inr += amount;
        else special_care_pool_inr += amount;
    }

    // --- fraud: open flags by severity --------------------------------------
    const { data: fraudRows } = await admin
        .from("fraud_flags")
        .select("severity, status")
        .eq("status", "open")
        .limit(CAP);
    const fraudBySeverity = new Map<string, number>();
    for (const f of (fraudRows ?? []) as { severity: string; status: string }[]) {
        fraudBySeverity.set(f.severity, (fraudBySeverity.get(f.severity) ?? 0) + 1);
    }
    const fraud_open_by_severity: NameCount[] = ["high", "medium", "low"]
        .map((label) => ({ label, count: fraudBySeverity.get(label) ?? 0 }))
        .filter((x) => x.count > 0);

    return {
        meals_served_total,
        meals_trend_30d,
        donation_total_inr,
        donation_count: donations.length,
        donation_trend_6m,
        token_utilisation,
        financial: {
            donated_inr: donation_total_inr,
            settlements_paid_inr,
            settlements_pending_inr,
            forfeited_inr,
            meal_pool_inr,
            special_care_pool_inr,
        },
        fraud_open_by_severity,
        top_vendors,
        city_wise,
        category_wise,
    };
}
