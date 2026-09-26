"use client";

import { useState } from "react";

import {
    Dash,
    ListStates,
    Notice,
    PageHeader,
    SectionHeading,
    StatusBadge,
    TableHead,
    TableShell,
    useVolunteerFetch,
    useVolunteerPost,
} from "../_ui";
import { shortDateTime } from "@/lib/format";

/**
 * Volunteer incident reporting (E-5 / B-31, CD §D-9).
 *
 * TWO TAPS, which is the card's acceptance criterion and not a design
 * preference: tap a category, tap Send. The note is optional and sits below the
 * send button, because a volunteer standing in a queue in front of someone
 * hungry will not type — and the reports that never get filed are the ones that
 * matter most.
 *
 * Big targets, one column on a phone. CD §D-9's principle is that a volunteer
 * facing a closed partner or a token that will not scan must have something to
 * do OTHER than improvise. That only holds if filing is faster than improvising.
 *
 * `urgent_need`, `food_safety_concern` and `safety_concern` are flagged as
 * safety on the server, which sorts them to the top of the admin queue.
 */

/** CD §D-9's eleven categories. Wording matches the admin queue exactly. */
const CATEGORIES: { key: string; label: string; hint: string; safety?: boolean }[] = [
    { key: "partner_closed", label: "Partner closed", hint: "Shutters down, nobody there" },
    { key: "no_food", label: "No food", hint: "Open, but nothing to serve" },
    {
        key: "partner_refusing_valid_token",
        label: "Partner refusing valid token",
        hint: "Token scans fine, partner says no",
    },
    { key: "token_problem", label: "Token problem", hint: "Will not scan, or already used" },
    { key: "no_token", label: "No token", hint: "Person has no token at all" },
    { key: "no_phone", label: "No phone", hint: "Cannot receive or show anything" },
    { key: "connectivity_failure", label: "Connectivity failure", hint: "No network to redeem" },
    { key: "urgent_need", label: "Urgent need", hint: "Needs help now", safety: true },
    { key: "food_safety_concern", label: "Food-safety concern", hint: "Food looks or smells wrong", safety: true },
    { key: "safety_concern", label: "Safety concern", hint: "Someone is unsafe", safety: true },
    { key: "other", label: "Other", hint: "Anything else worth recording" },
];

interface MyIncident {
    id: string;
    category: string;
    note: string | null;
    status: string;
    is_safety: boolean;
    created_at: string;
    resolution: string | null;
    resolved_at: string | null;
}

const LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

export default function VolunteerIncidentsPage() {
    const { data, state, errorMsg, reload } = useVolunteerFetch<MyIncident[]>(
        "/api/volunteer/incidents",
        "incidents",
        "/volunteer/login?redirect=/volunteer/incidents"
    );
    const items = data ?? [];
    const { post } = useVolunteerPost();

    const [selected, setSelected] = useState<string | null>(null);
    const [note, setNote] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState<string | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);

    const chosen = CATEGORIES.find((c) => c.key === selected) ?? null;

    async function send() {
        if (!selected) return;
        setSending(true);
        setSendError(null);
        try {
            // Location rides along when the device offers it, so the admin queue
            // has context. Never blocks the report — a refused or slow
            // permission prompt must not cost a filing.
            const geo = await currentGeo();
            await post("/api/volunteer/incidents", {
                category: selected,
                ...(note.trim() ? { note: note.trim() } : {}),
                ...(geo ? { geo } : {}),
            });
            setSent(LABEL[selected] ?? selected);
            setSelected(null);
            setNote("");
            reload();
        } catch (e) {
            setSendError(e instanceof Error ? e.message : "Could not file the report.");
        } finally {
            setSending(false);
        }
    }

    return (
        <div>
            <PageHeader
                title="Report a problem"
                subtitle="Tap what happened, then send. A note is optional."
            />

            {sent && (
                <div className="mb-4">
                    <Notice tone="info" title="Report filed">
                        {sent} has been sent to the pApAmA team. You do not need to do anything else.
                    </Notice>
                </div>
            )}
            {sendError && (
                <div className="mb-4">
                    <Notice tone="error" title="Could not send">
                        {sendError}
                    </Notice>
                </div>
            )}

            {/* Tap one — the category. */}
            <div className="grid gap-2 sm:grid-cols-2">
                {CATEGORIES.map((c) => {
                    const active = selected === c.key;
                    return (
                        <button
                            key={c.key}
                            type="button"
                            onClick={() => {
                                setSelected(active ? null : c.key);
                                setSent(null);
                                setSendError(null);
                            }}
                            aria-pressed={active}
                            className={`rounded-xl border px-4 py-3 text-left transition active:scale-[.99] ${
                                active
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : c.safety
                                      ? "border-red-200 bg-red-50 text-red-900 hover:bg-red-100"
                                      : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                            }`}
                        >
                            <span className="block text-base font-semibold">{c.label}</span>
                            <span
                                className={`mt-0.5 block text-xs ${
                                    active ? "text-slate-300" : c.safety ? "text-red-700" : "text-slate-500"
                                }`}
                            >
                                {c.hint}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Tap two — send. Sticky on a phone so it is always in reach. */}
            {chosen && (
                <div className="sticky bottom-20 z-10 mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg md:bottom-4">
                    <p className="text-sm text-slate-600">
                        Sending <strong className="text-slate-900">{chosen.label}</strong>
                        {chosen.safety ? " — this is treated as a safety report." : ""}
                    </p>
                    <button
                        type="button"
                        onClick={send}
                        disabled={sending}
                        className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                        {sending ? "Sending…" : "Send report"}
                    </button>
                    {/* Below the button, deliberately: optional stays optional. */}
                    <label htmlFor="note" className="mt-3 block text-xs font-medium text-slate-500">
                        Add a note (optional)
                    </label>
                    <textarea
                        id="note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="Anything the team should know"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                    />
                </div>
            )}

            <div className="mt-8">
                <SectionHeading title="Your reports" subtitle="What you have filed, and what came of it." />
                <ListStates
                    state={state}
                    errorMsg={errorMsg}
                    isEmpty={items.length === 0}
                    resourceLabel="reports"
                    emptyHint="Nothing filed yet. Use the buttons above if something goes wrong in the field."
                >
                    <TableShell>
                            <TableHead columns={["Filed", "What", "Status", "Outcome"]} />
                            <tbody>
                                {items.map((i) => (
                                    <tr key={i.id} className="border-t border-slate-100">
                                        <td className="px-4 py-3 text-slate-500">{shortDateTime(i.created_at)}</td>
                                        <td className="px-4 py-3">
                                            <span className="font-medium text-slate-900">
                                                {LABEL[i.category] ?? i.category}
                                            </span>
                                            {i.is_safety && (
                                                <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                                    Safety
                                                </span>
                                            )}
                                            {i.note && <p className="mt-0.5 text-xs text-slate-500">{i.note}</p>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge value={i.status} />
                                        </td>
                                        <td className="px-4 py-3 text-slate-500">
                                            <Dash>{i.resolution}</Dash>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                    </TableShell>
                </ListStates>
            </div>
        </div>
    );
}

/** Best-effort location. Resolves to null rather than waiting or throwing. */
function currentGeo(): Promise<{ lat: number; lng: number } | null> {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return Promise.resolve(null);
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(null),
            { timeout: 4000, maximumAge: 300_000 }
        );
    });
}
