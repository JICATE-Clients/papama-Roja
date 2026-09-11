import { defineRoute } from "@/lib/api/handler";
import { getContributionReport } from "@/lib/services/contribution";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/contribution-report — CD §D-1's seven-line contribution report.
 *
 * F-1 (B-01). The service already computed this; nothing could reach it.
 *
 * `?from=` and `?to=` scope it to a period. Without them it is all-time, which
 * is the right default for a pilot but will need a date filter once there is
 * real volume.
 *
 * The report deliberately keeps `expected` and `collected` SEPARATE. The gap
 * between them is the shortfall — money the policy said was due that nobody
 * handed over — and collapsing them into one figure would hide exactly the
 * number this report exists to surface.
 */
export const GET = defineRoute(
    { feature: "financial_ledgers_reconciliation", action: "read" },
    async ({ req }) => {
        const admin = createAdminClient();
        const from = req.nextUrl.searchParams.get("from");
        const to = req.nextUrl.searchParams.get("to");

        const report = await getContributionReport(admin as never, { from, to });
        return { report };
    }
);
