import { NextResponse } from "next/server";

import { BadRequestError, NotFoundError, defineRoute } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/reports/export?id=<reportId> — download a generated report as CSV
 * (contract §10, DoD "CSR report exports"). Gated by `audit_reports/read`. Renders
 * the report metadata + its summary metrics on the fly (no storage bucket needed)
 * and streams it as a `text/csv` attachment.
 */
function csv(v: unknown): string {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET = defineRoute(
    { feature: "audit_reports", action: "read" },
    async ({ req, audit }) => {
        const id = req.nextUrl.searchParams.get("id");
        if (!id) throw new BadRequestError("id query param is required");

        const admin = createAdminClient();
        const { data, error } = await admin
            .from("compliance_reports")
            .select("id, report_type, title, summary, period_start, period_end, created_at")
            .eq("id", id)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new NotFoundError("report not found");

        const r = data as {
            id: string;
            report_type: string;
            title: string | null;
            summary: Record<string, unknown> | null;
            period_start: string | null;
            period_end: string | null;
            created_at: string;
        };

        const rows: string[] = [];
        rows.push(["Field", "Value"].map(csv).join(","));
        rows.push(["Report ID", r.id].map(csv).join(","));
        rows.push(["Type", r.report_type].map(csv).join(","));
        rows.push(["Title", r.title ?? ""].map(csv).join(","));
        rows.push(["Period start", r.period_start ?? "all time"].map(csv).join(","));
        rows.push(["Period end", r.period_end ?? "all time"].map(csv).join(","));
        rows.push(["Generated", r.created_at].map(csv).join(","));
        rows.push("");
        rows.push(["Metric", "Value"].map(csv).join(","));
        for (const [k, v] of Object.entries(r.summary ?? {})) {
            rows.push([k.replace(/_/g, " "), v].map(csv).join(","));
        }

        // P-3 (B-29c, Phase 1 slice, CD §D-10): every export writes an audit
        // row — who, what report, when, and the filters in force.
        //
        // An export is the moment data LEAVES the platform's controls. Once a
        // CSV is on someone's laptop, every access rule in this codebase stops
        // applying to it. The route guard already logs the READ; this records
        // the EXTRACTION, which is a different event.
        //
        // Awaited BEFORE the file is returned. Logging afterwards would let a
        // download succeed with no record if the insert failed — exactly the
        // case the log exists to cover. So an audit failure fails the export,
        // which is the right direction: an unlogged export of
        // beneficiary-derived data is worse than a failed one.
        await audit({
            action: "report.export",
            entity_table: "compliance_reports",
            entity_id: r.id,
            summary: `exported ${r.report_type} report as CSV`,
            metadata: {
                report_id: r.id,
                report_type: r.report_type,
                title: r.title,
                format: "csv",
                // The filters that shaped what left the building.
                period_start: r.period_start,
                period_end: r.period_end,
                metric_count: Object.keys(r.summary ?? {}).length,
                row_count: rows.length,
            },
        });

        return new NextResponse(rows.join("\n"), {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="papama-${r.report_type}-report-${r.id.slice(0, 8)}.csv"`,
            },
        });
    }
);
