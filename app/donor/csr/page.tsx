"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/donor/Navbar";
import type { CorporateCsrProfileResponse } from "@/lib/validation/schemas";

type SaveState = "idle" | "saving" | "saved" | "error";

function CsrContent() {
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [existing, setExisting] = useState<CorporateCsrProfileResponse | null>(null);

    const [company, setCompany] = useState("");
    const [cin, setCin] = useState("");
    const [regNo, setRegNo] = useState("");
    const [focus, setFocus] = useState("");

    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [saveError, setSaveError] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch("/api/donor/csr");
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error || "Failed to load CSR profile.");
            }
            const data = await res.json();
            const p = data.profile as CorporateCsrProfileResponse | null;
            setExisting(p);
            setCompany(p?.company_name ?? "");
            setCin(p?.cin ?? "");
            setRegNo(p?.registration_number ?? "");
            setFocus(p?.csr_focus_area ?? "");
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Failed to load CSR profile.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!company.trim()) {
            setSaveState("error");
            setSaveError("Company name is required.");
            return;
        }
        setSaveState("saving");
        setSaveError(null);
        try {
            const res = await fetch("/api/donor/csr", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    company_name: company.trim(),
                    cin: cin.trim() || undefined,
                    registration_number: regNo.trim() || undefined,
                    csr_focus_area: focus.trim() || undefined,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error || "Failed to save CSR profile.");
            }
            const data = await res.json();
            setExisting(data.profile as CorporateCsrProfileResponse);
            setSaveState("saved");
            setTimeout(() => setSaveState("idle"), 2500);
        } catch (err) {
            setSaveState("error");
            setSaveError(err instanceof Error ? err.message : "Failed to save CSR profile.");
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-zinc-900 ">
                    Corporate CSR
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-500 ">
                    Register your organisation as a corporate CSR donor. Your existing donations and
                    campaigns roll up into aggregated CSR reports. 80G utilisation certificates are not
                    yet available.
                </p>
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                </div>
            ) : loadError ? (
                <div className="rounded-2xl border border-rose-200/60 bg-rose-50/40 p-6 text-center ">
                    <p className="text-sm font-medium text-rose-700 ">{loadError}</p>
                    <button
                        type="button"
                        onClick={load}
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
                    {existing && (
                        <div className="rounded-lg bg-emerald-500/10 p-3 text-xs font-medium text-emerald-700 ">
                            You are registered as a corporate CSR donor. You can update the details below.
                        </div>
                    )}

                    <CsrField label="Company name" required value={company} onChange={setCompany} placeholder="Acme Pvt Ltd" />
                    <CsrField label="CIN (optional)" value={cin} onChange={setCin} placeholder="U12345TZ2020PTC000000" mono />
                    <CsrField label="Registration number (optional)" value={regNo} onChange={setRegNo} />
                    <CsrField label="CSR focus area (optional)" value={focus} onChange={setFocus} placeholder="Child nutrition" />

                    {saveError && (
                        <div className="rounded-lg bg-rose-500/10 p-3 text-xs font-medium text-rose-700 ">
                            {saveError}
                        </div>
                    )}

                    <div className="flex items-center gap-3">
                        <button
                            type="submit"
                            disabled={saveState === "saving"}
                            className="rounded-lg bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 px-6 py-3 text-xs font-semibold text-white shadow-md transition hover:bg-emerald-700 active:scale-[.98] disabled:opacity-50"
                        >
                            {saveState === "saving" ? "Saving..." : existing ? "Update profile" : "Register as CSR donor"}
                        </button>
                        {saveState === "saved" && (
                            <span className="text-xs font-semibold text-emerald-600 ">Saved</span>
                        )}
                    </div>

                    {/* 80G utilisation certificate — BLOCKED (needs 80G registration + email/PDF provider). */}
                    <div className="mt-2 rounded-lg border border-dashed border-zinc-300 p-3 ">
                        <button
                            type="button"
                            disabled
                            title="Coming soon — pending 80G registration and certificate delivery setup."
                            className="cursor-not-allowed rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-400 "
                        >
                            Download 80G certificate
                        </button>
                        <p className="mt-1.5 text-[11px] font-medium text-zinc-400">
                            80G utilisation certificates are not available yet.
                        </p>
                    </div>
                </form>
            )}
        </div>
    );
}

function CsrField({
    label,
    value,
    onChange,
    placeholder,
    required,
    mono,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    required?: boolean;
    mono?: boolean;
}) {
    return (
        <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-600 ">
                {label} {required && <span className="text-rose-500">*</span>}
            </label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`w-full rounded-xl border border-zinc-200 p-3 text-sm text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 ${
                    mono ? "font-mono tracking-wider" : ""
                }`}
            />
        </div>
    );
}

export default function CsrPage() {
    return (
        <div className="flex min-h-screen flex-col bg-zinc-50 ">
            <Navbar />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
                <CsrContent />
            </main>
        </div>
    );
}
