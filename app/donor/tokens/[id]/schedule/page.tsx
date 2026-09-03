"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/donor/Navbar";
import { shortDate } from "@/lib/format";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";

interface ScheduleItem {
  id: string;
  token_id: string;
  scheduled_for: string;
  location: string | null;
  status: string;
  created_at: string;
}

/**
 * Donor scheduling sub-route (DIST-6). Lets the donor pick a future occasion date
 * (and optional location) for a token; a reminder is dispatched 7 days before.
 * Talks to the new same-origin governed route /api/donor/tokens/[id]/schedule
 * (GET / POST / DELETE). New file — does not touch the token detail page, which
 * is owned elsewhere.
 */
export default function ScheduleTokenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [schedule, setSchedule] = useState<ScheduleItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");

  // Min selectable date = today (the route also rejects past dates server-side).
  const today = new Date().toISOString().slice(0, 10);

  async function load() {
    setError(null);
    try {
      const res = await fetch(`/api/donor/tokens/${id}/schedule`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to load (${res.status})`);
      }
      const data = await res.json();
      const s = (data.schedule as ScheduleItem | null) ?? null;
      setSchedule(s);
      if (s) {
        setDate(s.scheduled_for);
        setLocation(s.location ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedMsg(null);
    if (!date) {
      setError("Please pick a date.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/donor/tokens/${id}/schedule`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled_for: date,
          location: location.trim() ? location.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to save (${res.status})`);
      }
      const data = await res.json();
      setSchedule((data.schedule as ScheduleItem) ?? null);
      setSavedMsg("Occasion scheduled. We'll remind you 7 days before.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function onClear() {
    setError(null);
    setSavedMsg(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/donor/tokens/${id}/schedule`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to clear (${res.status})`);
      }
      setSchedule(null);
      setDate("");
      setLocation("");
      setSavedMsg("Schedule cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear schedule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 ">
      <Navbar />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href={`/donor/tokens/${id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:underline"
          >
            <ArrowLeft size={14} weight="bold" aria-hidden />
            Back to Token
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm md:p-8">
          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-zinc-900 ">
            Schedule for an Occasion
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 leading-relaxed">
            Set a future date for this token to be redeemed (e.g. a birthday or festival).
            We&apos;ll send you a reminder 7 days before.
          </p>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            </div>
          ) : (
            <>
              {schedule && (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 text-sm ">
                  <p className="font-semibold text-emerald-800 ">
                    Currently scheduled for {shortDate(schedule.scheduled_for)}
                  </p>
                  {schedule.location && (
                    <p className="mt-0.5 text-xs text-emerald-700 ">
                      Location: {schedule.location}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-xs font-medium text-red-700 ">
                  {error}
                </div>
              )}
              {savedMsg && (
                <div className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-xs font-medium text-emerald-700 ">
                  {savedMsg}
                </div>
              )}

              <form onSubmit={onSave} className="mt-6 space-y-5">
                <div className="space-y-2">
                  <label htmlFor="schedule-date" className="text-xs font-semibold text-zinc-600 ">
                    Occasion date
                  </label>
                  <input
                    id="schedule-date"
                    type="date"
                    min={today}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 "
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="schedule-location" className="text-xs font-semibold text-zinc-600 ">
                    Location (optional)
                  </label>
                  <input
                    id="schedule-location"
                    type="text"
                    placeholder="e.g. Anna Canteen, T. Nagar"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 "
                  />
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 px-5 py-3 text-xs font-semibold text-white transition hover:bg-emerald-700 shadow-md active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Saving..." : schedule ? "Update schedule" : "Schedule occasion"}
                  </button>
                  {schedule && (
                    <button
                      type="button"
                      onClick={onClear}
                      disabled={saving}
                      className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
                    >
                      Clear schedule
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
