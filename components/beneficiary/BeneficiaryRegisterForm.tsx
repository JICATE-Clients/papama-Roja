"use client";

import { useState } from "react";

import FaceCapture from "@/components/face/FaceCapture";
import type { FaceCapture as FaceCaptureValue } from "@/lib/validation/schemas";

/**
 * Shared beneficiary-registration form (BEN-1, owner §2.2.1). Used by the admin
 * console, the volunteer assist flow, AND public self-registration — submitting a
 * registration is the `create` action, which the permission matrix grants to admin,
 * volunteer (assist), and guest (self_register). Approval (`update`) stays admin-only
 * and lives on the admin page, not here.
 *
 * Each caller passes the `endpoint` it is authorised for (admin / volunteer / public
 * self-register). Access is governed by the matrix + the route, not the URL prefix.
 * Captures the enrolment face on-device via <FaceCapture> (only the vector is sent).
 */

const CATEGORIES = [
    { value: "pregnant_women", label: "Pregnant women" },
    { value: "patient", label: "Patient" },
    { value: "disability", label: "Disability" },
    { value: "disaster_affected", label: "Disaster-affected" },
] as const;

export default function BeneficiaryRegisterForm({
    onDone,
    heading = "Register a beneficiary",
    endpoint = "/api/admin/beneficiary-registrations",
    credentials = "same-origin",
}: {
    onDone?: () => void;
    heading?: string;
    /** Which create route to POST to (admin / volunteer-assist / public self-register). */
    endpoint?: string;
    /** "same-origin" for authenticated routes; "omit" for the public self-register route. */
    credentials?: RequestCredentials;
}) {
    const [category, setCategory] = useState<string>("pregnant_women");
    const [fullName, setFullName] = useState("");
    const [contact, setContact] = useState("");
    const [city, setCity] = useState("");
    const [locationHint, setLocationHint] = useState("");
    const [face, setFace] = useState<FaceCaptureValue | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function submit() {
        setBusy(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials,
                body: JSON.stringify({
                    category,
                    full_name: fullName.trim() || undefined,
                    contact: contact.trim() || undefined,
                    city: city.trim() || undefined,
                    location_hint: locationHint.trim() || undefined,
                    face_capture: face ?? undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            setMsg("Registration submitted (pending review).");
            setFullName("");
            setContact("");
            setLocationHint("");
            setFace(null);
            onDone?.();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to submit.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">{heading}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs text-slate-600">
                    Category
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        disabled={busy}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    >
                        {CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </label>
                <Field label="Full name (optional)" value={fullName} onChange={setFullName} disabled={busy} />
                <Field label="Contact (optional)" value={contact} onChange={setContact} disabled={busy} />
                <Field label="City" value={city} onChange={setCity} disabled={busy} />
                <Field label="Location hint (optional)" value={locationHint} onChange={setLocationHint} disabled={busy} />
            </div>

            <div className="mt-4">
                <p className="mb-1 text-xs font-medium text-slate-600">
                    Face enrolment (captured on-device — only a non-reversible vector is stored)
                </p>
                <FaceCapture onCapture={setFace} disabled={busy} label="Beneficiary face" />
                {face && (
                    <p className="mt-1 text-xs text-green-700">
                        Face captured (liveness {Math.round(face.liveness * 100)}%). Ready to submit.
                    </p>
                )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={submit}
                    disabled={busy}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                    {busy ? "Submitting…" : "Submit registration"}
                </button>
                {msg && <span className="text-xs font-medium text-green-700">{msg}</span>}
                {err && <span className="text-xs font-medium text-red-700">{err}</span>}
            </div>
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    disabled,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
}) {
    return (
        <label className="text-xs text-slate-600">
            {label}
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            />
        </label>
    );
}
