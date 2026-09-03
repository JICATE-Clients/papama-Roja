"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Vendor registration (public, single atomic flow).
 *
 * The form collects the login credentials AND all business fields, then POSTs them
 * to /api/vendor/register, which creates the account + pending vendor SERVER-SIDE
 * (email pre-confirmed). On success we sign the new vendor in and drop them on
 * /vendor. This deliberately does NOT use a client supabase.auth.signUp: with email
 * confirmation enabled that returns no session, and the old flow then lost the whole
 * application (the new vendor was stranded as a plain donor).
 */

/* ---- Business fields -------------------------------------------------------- */

interface BusinessFields {
  name: string;
  legal_name: string;
  address: string;
  city: string;
  pincode: string;
  phone: string;
  email: string;
  emergency_contact: string;
  fssai_license: string;
  gst_number: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  geo_lat: number | null;
  geo_lng: number | null;
}

const EMPTY_BUSINESS: BusinessFields = {
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
  bank_account_name: "",
  bank_account_number: "",
  bank_ifsc: "",
  geo_lat: null,
  geo_lng: null,
};

/** Builds the request body: login creds + only the business fields actually filled. */
function buildPayload(email: string, password: string, b: BusinessFields): Record<string, unknown> {
  const out: Record<string, unknown> = {
    email: email.trim(),
    password,
    name: b.name.trim(),
  };
  const optional: (keyof BusinessFields)[] = [
    "legal_name",
    "address",
    "city",
    "pincode",
    "phone",
    "emergency_contact",
    "fssai_license",
    "gst_number",
    "bank_account_name",
    "bank_account_number",
    "bank_ifsc",
  ];
  for (const k of optional) {
    const v = b[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  // Business contact email is distinct from the login email (avoid the key clash).
  if (b.email.trim()) out.contact_email = b.email.trim();
  if (b.geo_lat != null && b.geo_lng != null) {
    out.geo_lat = b.geo_lat;
    out.geo_lng = b.geo_lng;
  }
  return out;
}

export default function VendorRegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [business, setBusiness] = useState<BusinessFields>(EMPTY_BUSINESS);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  function setField<K extends keyof BusinessFields>(key: K, value: BusinessFields[K]) {
    setBusiness((b) => ({ ...b, [key]: value }));
  }

  function useMyLocation() {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation isn’t available in this browser.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusiness((b) => ({ ...b, geo_lat: pos.coords.latitude, geo_lng: pos.coords.longitude }));
        setGeoBusy(false);
      },
      (err) => {
        setGeoError(err.message || "Couldn’t get your location.");
        setGeoBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!business.name.trim()) {
      setError("Business name is required.");
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError("Enter an email and a password (at least 6 characters).");
      return;
    }

    setLoading(true);

    // Create account + pending vendor server-side (one atomic call).
    let res: Response;
    try {
      res = await fetch("/api/vendor/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(email, password, business)),
      });
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("[vendor/register] failed:", res.status, body);
      const m = typeof body.error === "string" && body.error.trim() ? body.error : null;
      setError(m ?? `Registration failed (${res.status}).`);
      setLoading(false);
      return;
    }

    // Account exists and is confirmed — sign in and enter the vendor app.
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      // The account was created fine; only the auto sign-in hiccupped.
      router.push("/vendor/login?registered=1");
      return;
    }
    router.push("/vendor");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <Link
          href="/"
          className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft size={15} weight="bold" aria-hidden />
          Back to pApAmA
        </Link>
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Become a pApAmA vendor
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create an account and tell us about your business. We’ll review and approve it before
            you go live.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          {/* Account credentials */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Account
            </legend>
            <Field
              id="email"
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
            />
            <Field
              id="password"
              label="Password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              placeholder="At least 6 characters"
            />
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Business
            </legend>

            <Field
              id="name"
              label="Business name"
              required
              value={business.name}
              onChange={(v) => setField("name", v)}
              placeholder="e.g. Amma’s Kitchen"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="legal_name"
                label="Legal name"
                value={business.legal_name}
                onChange={(v) => setField("legal_name", v)}
              />
              <Field
                id="phone"
                label="Phone"
                type="tel"
                autoComplete="tel"
                value={business.phone}
                onChange={(v) => setField("phone", v)}
              />
            </div>

            <Field
              id="address"
              label="Address"
              value={business.address}
              onChange={(v) => setField("address", v)}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="city" label="City" value={business.city} onChange={(v) => setField("city", v)} />
              <Field
                id="pincode"
                label="Pincode"
                value={business.pincode}
                onChange={(v) => setField("pincode", v)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="vendor_email"
                label="Contact email"
                type="email"
                value={business.email}
                onChange={(v) => setField("email", v)}
                placeholder="Where we reach your business"
              />
              <Field
                id="emergency_contact"
                label="Emergency contact"
                value={business.emergency_contact}
                onChange={(v) => setField("emergency_contact", v)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="fssai_license"
                label="FSSAI license #"
                value={business.fssai_license}
                onChange={(v) => setField("fssai_license", v)}
              />
              <Field
                id="gst_number"
                label="GST number"
                value={business.gst_number}
                onChange={(v) => setField("gst_number", v)}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Bank account
            </legend>
            <Field
              id="bank_account_name"
              label="Account holder name"
              value={business.bank_account_name}
              onChange={(v) => setField("bank_account_name", v)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="bank_account_number"
                label="Account number"
                value={business.bank_account_number}
                onChange={(v) => setField("bank_account_number", v)}
              />
              <Field
                id="bank_ifsc"
                label="IFSC"
                value={business.bank_ifsc}
                onChange={(v) => setField("bank_ifsc", v)}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Location
            </legend>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={useMyLocation}
                disabled={geoBusy}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {geoBusy
                  ? "Locating…"
                  : business.geo_lat != null
                    ? "Update my location"
                    : "Use my location"}
              </button>
              <span className="text-xs text-slate-400">or enter coordinates manually</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="geo_lat" className="mb-1 block text-sm font-medium text-slate-700">
                  Latitude
                </label>
                <input
                  id="geo_lat"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={business.geo_lat ?? ""}
                  onChange={(e) =>
                    setField("geo_lat", e.target.value === "" ? null : Number(e.target.value))
                  }
                  placeholder="e.g. 13.0827"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                />
              </div>
              <div>
                <label htmlFor="geo_lng" className="mb-1 block text-sm font-medium text-slate-700">
                  Longitude
                </label>
                <input
                  id="geo_lng"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={business.geo_lng ?? ""}
                  onChange={(e) =>
                    setField("geo_lng", e.target.value === "" ? null : Number(e.target.value))
                  }
                  placeholder="e.g. 80.2707"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                />
              </div>
            </div>
            {geoError && (
              <p className="text-xs text-red-600">
                {geoError} — type the coordinates above instead, or open the app on{" "}
                <span className="font-mono">localhost</span> (the browser only shares location on a
                secure origin, not over a plain-http network IP).
              </p>
            )}
          </fieldset>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Submitting…" : "Create account & apply"}
          </button>

          <p className="text-center text-sm text-slate-500">
            Already have a vendor account?{" "}
            <Link href="/vendor/login" className="font-medium text-slate-900 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}

/* ---- Reusable labelled input ----------------------------------------------- */

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  minLength,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
      />
    </div>
  );
}
