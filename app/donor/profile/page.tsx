"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/donor/Navbar";

interface ProfileData {
  name: string | null;
  pan_number: string | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function ProfileContent() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [pan, setPan] = useState("");

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  async function loadProfile() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/donor/profile");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to load profile.");
      }
      const data: ProfileData = await res.json();
      setFullName(data.name ?? "");
      setPan(data.pan_number ?? "");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetch("/api/donor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim() || undefined,
          pan_number: pan.trim() === "" ? null : pan.trim().toUpperCase(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to save profile.");
      }
      const data: ProfileData = await res.json();
      setFullName(data.name ?? "");
      setPan(data.pan_number ?? "");
      setSaveState("saved");
      // Reset the "saved" badge after a moment.
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "Failed to save profile.");
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-zinc-900 ">
          My Profile
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-500 ">
          Manage your donor details. Your PAN is optional and used only for 80G
          tax-receipt purposes once registration is enabled.
        </p>
        <a
          href="/donor/csr"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 "
        >
          Donating on behalf of a company? Register for Corporate CSR →
        </a>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200/60 bg-rose-50/40 p-6 text-center ">
          <p className="text-sm font-medium text-rose-700 ">
            {loadError}
          </p>
          <button
            type="button"
            onClick={loadProfile}
            className="mt-4 rounded-xl border border-rose-300 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 "
          >
            Retry
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="max-w-xl space-y-6 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm "
        >
          {/* Full name */}
          <div className="space-y-2">
            <label
              htmlFor="full_name"
              className="text-xs font-semibold text-zinc-600 "
            >
              Full name
            </label>
            <input
              id="full_name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-xl border border-zinc-200 p-3 text-sm text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 "
            />
          </div>

          {/* PAN */}
          <div className="space-y-2">
            <label
              htmlFor="pan_number"
              className="text-xs font-semibold text-zinc-600 "
            >
              PAN{" "}
              <span className="font-normal text-zinc-400">(optional, for 80G)</span>
            </label>
            <input
              id="pan_number"
              type="text"
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              placeholder="ABCDE1234F"
              maxLength={10}
              className="w-full rounded-xl border border-zinc-200 p-3 font-mono text-sm uppercase tracking-wider text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 "
            />
            <p className="text-[11px] font-medium leading-normal text-zinc-400 ">
              Leave blank if you don&apos;t want to provide it. Format: 5 letters,
              4 digits, 1 letter.
            </p>
          </div>

          {saveError && (
            <div className="rounded-lg bg-rose-500/10 p-3 text-xs font-medium text-rose-700 ">
              {saveError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saveState === "saving"}
              className="rounded-lg bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 px-6 py-3 text-xs font-semibold text-white shadow-md transition hover:bg-emerald-700 active:scale-[.98] disabled:opacity-50"
            >
              {saveState === "saving" ? (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving...
                </span>
              ) : (
                "Save changes"
              )}
            </button>
            {saveState === "saved" && (
              <span className="text-xs font-semibold text-emerald-600 ">
                Saved
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 ">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <ProfileContent />
      </main>
    </div>
  );
}
