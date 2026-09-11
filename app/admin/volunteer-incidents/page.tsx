"use client";

import { useCan } from "@/components/auth/AppUserProvider";
import { shortDateTime } from "@/lib/format";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    ListStates,
    Notice,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useRowAction,
} from "../_ui";

/**
 * Volunteer incident queue (E-5 / B-31, CD §D-9).
 *
 * The card's acceptance criterion is that a report "appears in admin queue with
 * volunteer/time/location context" — this is that queue. The API existed; until
 * now nothing could reach it.
 *
 * SAFETY LEADS, and the SERVER enforces it: the route orders on `is_safety`
 * before `created_at`, so a safety report cannot end up behind forty "no token"
 * reports however this page renders. CD §D-9 carries explicit volunteer safety
 * provisions, and a safety report waiting its turn is the failure that ordering
 * exists to prevent.
 */

interface IncidentRow {
    id: string;
    category: string;
    note: string | null;
    status: string;
    is_safety: boolean;
    created_at: string;
    city: string | null;
    vendor_id: string | null;
    emergency_id: string | null;
    resolution: string | null;
    volunteer: { full_name: string | null; phone: string | null } | null;
    district: { name: string | null } | null;
}

/** CD §D-9's eleven categories, read as English without losing the machine key. */
const CATEGORY_LABEL: Record<string, string> = {
    no_phone: "No phone",
    no_token: "No token",
    partner_closed: "Partner closed",
    partner_refusing_valid_token: "Partner refusing valid token",
    no_food: "No food",
    connectivity_failure: "Connectivity failure",
    token_problem: "Token problem",
    urgent_need: "Urgent need",
    food_safety_concern: "Food-safety concern",
    safety_concern: "Safety concern",
    other: "Other",
};

export default function AdminVolunteerIncidentsPage() {
    const canManage = useCan("quality_feedback_complaints_inspections", "update");
    const { items, state, errorMsg, reload } = useAdminList<IncidentRow>(
        "/api/admin/volunteer-incidents",
        "incidents",
        "/admin/volunteer-incidents"
    );
    const { run, busyId, actionError } = useRowAction(
        "/api/admin/volunteer-incidents",
        reload
    );

    const safetyOpen = items.filter((i) => i.is_safety && i.status !== "closed").length;

    return (
        <div className="mx-auto max-w-6xl">
            <AdminPageHeader
                title="Volunteer incidents"
                subtitle="Field reports from volunteers. Safety concerns are listed first."
                count={items.length}
            />

            {/* Not decoration: a safety report is someone saying a volunteer or a
                beneficiary may be at risk right now. */}
            {safetyOpen > 0 && (
                <div className="mb-5">
                    <Notice tone="error" title="Safety concerns open">
                        {safetyOpen === 1
                            ? "1 safety concern needs attention."
                            : `${safetyOpen} safety concerns need attention.`}
                    </Notice>
                </div>
            )}

            {actionError && (
                <div className="mb-5">
                    <Notice tone="error" title="Action failed">
                        {actionError}
                    </Notice>
                </div>
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="incidents"
                emptyHint="Nothing reported. Volunteers file these from the field in two taps."
                table={
                    <TableShell hideCols={[2, 4]}>
                        <TableHead
                            columns={[
                                "Category",
                                "Volunteer",
                                "Where",
                                "Reported",
                                "Status",
                                "Action",
                            ]}
                        />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((i) => (
                                <tr
                                    key={i.id}
                                    className={i.is_safety ? "bg-red-50/60" : "hover:bg-slate-50"}
                                >
                                    <td className="px-4 py-3">
                                        <span className="font-medium text-slate-800">
                                            {CATEGORY_LABEL[i.category] ?? i.category}
                                        </span>
                                        {i.is_safety && (
                                            <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                                Safety
                                            </span>
                                        )}
                                        {i.note && (
                                            <span className="mt-1 block text-xs text-slate-500">
                                                {i.note}
                                            </span>
                                        )}
                                        {/* Volunteer and Reported are hidden below md,
                                            so both are reprinted here — a queue that
                                            shows neither who reported it nor when is
                                            not triageable on a phone. */}
                                        <span className="mt-1 block text-[11px] text-slate-500 md:hidden">
                                            <Dash>{i.volunteer?.full_name}</Dash>
                                            {" · "}
                                            {shortDateTime(i.created_at)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                        <Dash>{i.volunteer?.full_name}</Dash>
                                        {i.volunteer?.phone && (
                                            <span className="block text-xs text-slate-500">
                                                {i.volunteer.phone}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{i.district?.name ?? i.city}</Dash>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                                        {shortDateTime(i.created_at)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={i.status} />
                                    </td>
                                    <td className="px-4 py-3">
                                        {canManage && i.status !== "closed" && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {i.status === "open" && (
                                                    <ActionButton
                                                        tone="neutral"
                                                        disabled={busyId === i.id}
                                                        onClick={() =>
                                                            run(i.id, {
                                                                incident_id: i.id,
                                                                action: "acknowledge",
                                                            })
                                                        }
                                                    >
                                                        Acknowledge
                                                    </ActionButton>
                                                )}
                                                {i.status !== "resolved" && (
                                                    <ActionButton
                                                        tone="primary"
                                                        disabled={busyId === i.id}
                                                        onClick={() =>
                                                            run(i.id, {
                                                                incident_id: i.id,
                                                                action: "resolve",
                                                            })
                                                        }
                                                    >
                                                        Resolve
                                                    </ActionButton>
                                                )}
                                                {i.status === "resolved" && (
                                                    <ActionButton
                                                        tone="neutral"
                                                        disabled={busyId === i.id}
                                                        onClick={() =>
                                                            run(i.id, {
                                                                incident_id: i.id,
                                                                action: "close",
                                                            })
                                                        }
                                                    >
                                                        Close
                                                    </ActionButton>
                                                )}
                                            </div>
                                        )}
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
