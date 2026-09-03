import { z } from "zod";

import { defineRoute, parseQuery } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/scheduled-reminders — the occasions donors have scheduled a
 * token for, and where each one sits in the reminder cycle (DIST-6).
 *
 * There was no read side at all: only the sweep POST existed, so an admin could
 * fire reminders but never see what was due, what had already been reminded, or
 * whether the pg_cron twin
 * (`20260625000013_schedule_redemption_reminder.sql`) was doing its job. Running
 * a job you cannot observe is indistinguishable from not running it.
 *
 * Gated by `token_distribution/read` at scope "all" — admin, compliance and
 * vendor_manager. Donors and volunteers hold `read: "own"` and are refused here;
 * a donor sees their own schedule on their token page.
 */
const querySchema = z.object({
    /** How far ahead to look. The reminder fires at T-7d, so 30 covers it amply. */
    days: z.coerce.number().int().min(1).max(365).optional(),
});

export const GET = defineRoute(
    { feature: "token_distribution", action: "read" },
    async ({ req }) => {
        const { days = 30 } = parseQuery(req.nextUrl.searchParams, querySchema);
        const supabase = await createClient();
        const admin = createAdminClient();

        const today = new Date();
        const until = new Date(today);
        until.setUTCDate(until.getUTCDate() + days);
        const fromDate = today.toISOString().slice(0, 10);
        const untilDate = until.toISOString().slice(0, 10);

        // Only what is still ahead: a passed occasion is history, and the point
        // of this view is what the sweep is about to act on.
        const { data, error } = await supabase
            .from("scheduled_redemption_dates")
            .select("id, token_id, scheduled_for, location, status, created_at")
            .gte("scheduled_for", fromDate)
            .lte("scheduled_for", untilDate)
            .order("scheduled_for", { ascending: true })
            .limit(500);
        if (error) throw new Error(error.message);

        const rows = (data ?? []) as {
            id: string;
            token_id: string | null;
            scheduled_for: string;
            location: string | null;
            status: string;
            created_at: string;
        }[];

        // Resolve the token's serial and its donor's name. A row identified only
        // by two UUIDs tells an admin nothing about whose occasion it is.
        const tokenIds = [...new Set(rows.map((r) => r.token_id).filter(Boolean) as string[])];
        const tokenById = new Map<string, { serial: string | null; donorId: string | null; value: number | null }>();
        if (tokenIds.length > 0) {
            const { data: tokens } = await admin
                .from("tokens")
                .select("id, serial_number, donor_id, value_inr")
                .in("id", tokenIds);
            for (const t of (tokens ?? []) as {
                id: string;
                serial_number: string | null;
                donor_id: string | null;
                value_inr: number | null;
            }[]) {
                tokenById.set(t.id, { serial: t.serial_number, donorId: t.donor_id, value: t.value_inr });
            }
        }

        const donorIds = [...new Set([...tokenById.values()].map((t) => t.donorId).filter(Boolean) as string[])];
        const donorNameById = new Map<string, string | null>();
        if (donorIds.length > 0) {
            const { data: donors } = await admin.from("donors").select("id, name").in("id", donorIds);
            for (const d of (donors ?? []) as { id: string; name: string | null }[]) {
                donorNameById.set(d.id, d.name);
            }
        }

        // The date the T-7d sweep will act on next time it runs.
        const target = new Date(today);
        target.setUTCDate(target.getUTCDate() + 7);
        const targetDate = target.toISOString().slice(0, 10);

        const schedules = rows.map((r) => {
            const token = r.token_id ? tokenById.get(r.token_id) : null;
            return {
                id: r.id,
                scheduled_for: r.scheduled_for,
                location: r.location,
                status: r.status,
                created_at: r.created_at,
                serial_number: token?.serial ?? null,
                value_inr: token?.value ?? null,
                donor_label: token?.donorId
                    ? (donorNameById.get(token.donorId) ?? "Unattributed")
                    : "Unattributed",
                /** True when the next sweep would remind this one. */
                due_next_sweep: r.status === "scheduled" && r.scheduled_for === targetDate,
            };
        });

        return {
            schedules,
            total: schedules.length,
            target_date: targetDate,
            due_next_sweep: schedules.filter((s) => s.due_next_sweep).length,
        };
    }
);
