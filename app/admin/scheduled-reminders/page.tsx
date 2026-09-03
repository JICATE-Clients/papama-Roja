"use client";

import { useCallback, useEffect, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import { inr, shortDate } from "@/lib/format";

import {
    AdminPageHeader,
    Dash,
    ListStates,
    Notice,
    RunJobBar,
    StatusBadge,
    TableHead,
    TableShell,
} from "../_ui";

type ScheduleRow = {
    id: string;
    scheduled_for: string;
    location: string | null;
    status: string;
    created_at: string;
    serial_number: string | null;
    value_inr: number | null;
    donor_label: string;
    due_next_sweep: boolean;
};

type Payload = {
    schedules: ScheduleRow[];
    total: number;
    target_date: string;
    due_next_sweep: number;
};

/**
 * Admin scheduled reminders — the occasions donors booked a token for, and what
 * the T-7d reminder sweep is about to do about them.
 *
 * The sweep already existed as a POST with no read side, which meant an admin
 * could fire it but never see what was due or whether it had worked. It also has
 * a pg_cron twin (`20260625000013_schedule_redemption_reminder.sql`) that runs
 * daily at 03:00 UTC and does the same thing — so the button here is a manual
 * re-run, not the only path, and the page says so. A row that flips to
 * `reminded` on its own is the cron working, not a bug.
 */
export default function AdminScheduledRemindersPage() {
    const canRun = useCan("token_distribution", "update");

    const [data, setData] = useState<Payload | null>(null);
    const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    /**
     * Fetching and applying are split so the setState calls live in a promise
     * callback rather than in an effect body — a synchronous setState in an
     * effect is a cascading render (react-hooks/set-state-in-effect), and the
     * sweep bar needs the same reload anyway.
     */
    type Result =
        | { kind: "ok"; payload: Payload }
        | { kind: "forbidden" }
        | { kind: "error"; message: string }
        | { kind: "aborted" };

    const fetchSchedules = useCallback(async (signal?: AbortSignal): Promise<Result> => {
        try {
            const res = await fetch("/api/admin/scheduled-reminders", {
                cache: "no-store",
                credentials: "same-origin",
                signal,
            });
            if (res.status === 403) return { kind: "forbidden" };
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                return { kind: "error", message: body.error ?? `Request failed (${res.status})` };
            }
            return { kind: "ok", payload: body as Payload };
        } catch (e) {
            // An abort is this page unmounting, not a failure worth showing.
            if ((e as Error)?.name === "AbortError") return { kind: "aborted" };
            return { kind: "error", message: "Network error — please try again." };
        }
    }, []);

    const apply = useCallback((r: Result) => {
        if (r.kind === "aborted") return;
        if (r.kind === "forbidden") {
            setState("forbidden");
            return;
        }
        if (r.kind === "error") {
            setErrorMsg(r.message);
            setState("error");
            return;
        }
        setData(r.payload);
        setState("ready");
    }, []);

    const reload = useCallback(
        () => fetchSchedules().then(apply),
        [fetchSchedules, apply]
    );

    useEffect(() => {
        const ac = new AbortController();
        fetchSchedules(ac.signal).then(apply);
        return () => ac.abort();
    }, [fetchSchedules, apply]);

    const schedules = data?.schedules ?? [];

    return (
        <div>
            <AdminPageHeader
                title="Scheduled reminders"
                subtitle="Occasions a donor booked a token for. Each gets one in-app reminder seven days out."
                count={state === "ready" ? schedules.length : undefined}
            />

            <div className="mb-5">
                <Notice tone="info" title="This runs on its own every night">
                    A pg_cron job sweeps at 03:00 UTC daily, so a schedule flipping to
                    <strong> reminded</strong> without anyone pressing anything is the system working.
                    Run it by hand only to catch up after downtime, or to prove the path works.
                </Notice>
            </div>

            {canRun && (
                <RunJobBar
                    label="Reminder sweep:"
                    endpoint="/api/admin/scheduled-reminders/sweep"
                    buttonText="Run reminder sweep"
                    busyText="Sweeping…"
                    successMessage={(d) =>
                        Number(d.reminded) > 0
                            ? `Sent ${d.reminded} reminder(s) for ${d.target_date}.`
                            : `Nothing due on ${d.target_date} — no reminders sent.`
                    }
                    onDone={reload}
                >
                    {data && (
                        <span className="text-xs text-slate-500">
                            Next sweep targets <strong>{shortDate(data.target_date)}</strong> —{" "}
                            {data.due_next_sweep === 0
                                ? "nothing due"
                                : `${data.due_next_sweep} due`}
                        </span>
                    )}
                </RunJobBar>
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={schedules.length === 0}
                resourceLabel="scheduled occasions"
                emptyHint="Nothing is scheduled in the next 30 days. A donor books an occasion from their token page."
                table={
                    <TableShell hideCols={[3, 5, 6]}>
                        <TableHead
                            columns={["Occasion", "Donor", "Token", "Status", "Place", "Booked"]}
                        />
                        <tbody className="divide-y divide-slate-100">
                            {schedules.map((s) => (
                                <tr key={s.id} className="align-top">
                                    <td className="whitespace-nowrap px-2 py-3 md:px-4">
                                        <span className="font-medium text-slate-900">
                                            {shortDate(s.scheduled_for)}
                                        </span>
                                        {/* The one fact that makes this row actionable today. */}
                                        {s.due_next_sweep && (
                                            <span className="mt-0.5 block text-[11px] font-medium text-amber-700">
                                                due next sweep
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-2 py-3 text-slate-700 md:px-4">
                                        {s.donor_label}
                                        <span className="mt-0.5 block text-[11px] text-slate-400 md:hidden">
                                            {s.value_inr != null ? inr(s.value_inr) : "—"}
                                        </span>
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-3 text-slate-600 md:px-4">
                                        <Dash>{s.serial_number}</Dash>
                                        {s.value_inr != null && (
                                            <span className="mt-0.5 block text-[11px] text-slate-400">
                                                {inr(s.value_inr)}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-2 py-3 md:px-4">
                                        <StatusBadge value={s.status} />
                                    </td>
                                    <td className="px-2 py-3 text-slate-600 md:px-4">
                                        <Dash>{s.location}</Dash>
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-3 text-slate-500 md:px-4">
                                        {shortDate(s.created_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}
