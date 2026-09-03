"use client";

import { useState } from "react";

/** One labelled text input in the create-vendor grid. */
function VField({
    label,
    value,
    onChange,
    disabled,
    placeholder,
    required,
    full,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
    placeholder?: string;
    required?: boolean;
    full?: boolean;
}) {
    return (
        <label className={`text-xs text-slate-600 ${full ? "sm:col-span-2 lg:col-span-3" : ""}`}>
            {label}
            {required && <span className="text-red-600"> *</span>}
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                placeholder={placeholder}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            />
        </label>
    );
}

/**
 * Pre-register an outlet an admin has verified in person. Mirrors
 * `vendorCreateRequestSchema`: business facts only — no credentials (the vendor
 * claims the row by self-registering) and no bank details (collected from them).
 * Blank fields are omitted rather than sent as empty strings, so the optional
 * columns stay null instead of storing "".
 */
export function NewVendorForm({ onDone }: { onDone: () => void }) {
    const [f, setF] = useState({
        name: "",
        legal_name: "",
        address: "",
        city: "",
        pincode: "",
        phone: "",
        email: "",
        emergency_contact: "",
        fssai_license: "",
        gst_number: "",
        geo_lat: "",
        geo_lng: "",
    });
    const set = (k: keyof typeof f) => (val: string) => setF((prev) => ({ ...prev, [k]: val }));
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);

    async function submit() {
        setErr(null);
        setMsg(null);
        if (!f.name.trim()) {
            setErr("Business name is required.");
            return;
        }
        const hasLat = f.geo_lat.trim() !== "";
        const hasLng = f.geo_lng.trim() !== "";
        if (hasLat !== hasLng) {
            setErr("Give both latitude and longitude, or neither.");
            return;
        }
        const lat = hasLat ? Number(f.geo_lat) : null;
        const lng = hasLng ? Number(f.geo_lng) : null;
        if ((lat != null && Number.isNaN(lat)) || (lng != null && Number.isNaN(lng))) {
            setErr("Latitude and longitude must be numbers.");
            return;
        }

        const payload: Record<string, unknown> = { name: f.name.trim() };
        for (const k of [
            "legal_name",
            "address",
            "city",
            "pincode",
            "phone",
            "email",
            "emergency_contact",
            "fssai_license",
            "gst_number",
        ] as const) {
            const val = f[k].trim();
            if (val) payload[k] = val;
        }
        if (lat != null && lng != null) {
            payload.geo_lat = lat;
            payload.geo_lng = lng;
        }

        setBusy(true);
        try {
            const res = await fetch("/api/admin/vendors", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            setMsg(`Added '${data.name}' — pending review.`);
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not add the vendor.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-1 text-sm font-medium text-slate-700">Add a vendor</p>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
                Creates an <strong>unclaimed outlet</strong>{" "}
                — pending review, pending KYC, with no
                login. The vendor links their own account by registering with this outlet&rsquo;s
                details. Bank information is collected from the vendor, not entered here.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <VField label="Business name" value={f.name} onChange={set("name")} disabled={busy} required />
                <VField label="Legal name" value={f.legal_name} onChange={set("legal_name")} disabled={busy} />
                <VField label="Phone" value={f.phone} onChange={set("phone")} disabled={busy} />
                <VField label="Email" value={f.email} onChange={set("email")} disabled={busy} />
                <VField label="City" value={f.city} onChange={set("city")} disabled={busy} />
                <VField label="Pincode" value={f.pincode} onChange={set("pincode")} disabled={busy} />
                <VField label="Address" value={f.address} onChange={set("address")} disabled={busy} full />
                <VField
                    label="Emergency contact"
                    value={f.emergency_contact}
                    onChange={set("emergency_contact")}
                    disabled={busy}
                />
                <VField
                    label="FSSAI licence"
                    value={f.fssai_license}
                    onChange={set("fssai_license")}
                    disabled={busy}
                />
                <VField label="GST number" value={f.gst_number} onChange={set("gst_number")} disabled={busy} />
                <VField
                    label="Latitude"
                    value={f.geo_lat}
                    onChange={set("geo_lat")}
                    disabled={busy}
                    placeholder="13.08268"
                />
                <VField
                    label="Longitude"
                    value={f.geo_lng}
                    onChange={set("geo_lng")}
                    disabled={busy}
                    placeholder="80.27072"
                />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={submit}
                    disabled={busy}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                    {busy ? "Adding…" : "Add vendor"}
                </button>
                {msg && <span className="text-xs font-medium text-green-700">{msg}</span>}
                {err && <span className="text-xs font-medium text-red-700">{err}</span>}
            </div>
        </div>
    );
}
