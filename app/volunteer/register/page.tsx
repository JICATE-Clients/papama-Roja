"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Volunteer self-registration. Creates the account server-side
 * (POST /api/volunteer/register → pending volunteer), then signs in with the same
 * credentials and lands on /volunteer, where the layout shows an "awaiting
 * approval" screen until an admin approves the volunteer.
 */
export default function VolunteerRegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/volunteer/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone: phone.trim() || undefined,
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Registration failed (${res.status}).`);

      // Account is created + email pre-confirmed; sign in and enter the app.
      const { error: signInError } = await createClient().auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        // Account exists but auto sign-in failed — send them to login.
        router.push("/volunteer/login");
        return;
      }
      router.push("/volunteer");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Link
          href="/"
          className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft size={15} weight="bold" aria-hidden />
          Back to pApAmA
        </Link>
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Become a volunteer
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Register to hold &amp; distribute tokens. An admin reviews every application.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field id="full_name" label="Full name" value={fullName} onChange={setFullName}
            type="text" autoComplete="name" placeholder="Your name" required />
          <Field id="email" label="Email" value={email} onChange={setEmail}
            type="email" autoComplete="email" placeholder="you@example.com" required />
          <Field id="phone" label="Phone (optional)" value={phone} onChange={setPhone}
            type="tel" autoComplete="tel" placeholder="9876543210" />
          <Field id="password" label="Password" value={password} onChange={setPassword}
            type="password" autoComplete="new-password" placeholder="At least 6 characters" required />

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
            {loading ? "Registering…" : "Register"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          Already a volunteer?{" "}
          <Link href="/volunteer/login" className="font-medium text-slate-900 underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  id, label, value, onChange, type, autoComplete, placeholder, required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  autoComplete: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
      />
    </div>
  );
}
