"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Forgot password — sends a recovery email. The link points at /auth/confirm
 * (type=recovery), which verifies the token_hash, establishes a session, then
 * forwards to /update-password where the new password is set.
 *
 * The `redirectTo` origin/path must be listed under Dashboard → Authentication →
 * URL Configuration → Redirect URLs, and the "Reset Password" email template must
 * use the token_hash format (see /auth/confirm route docs).
 */
export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const supabase = createClient();
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/confirm?next=/update-password`,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        // Always report success regardless of whether the email exists, to avoid
        // leaking which addresses are registered.
        setSent(true);
        setLoading(false);
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <Link
                  href="/"
                  className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
                >
                  <ArrowLeft size={15} weight="bold" aria-hidden />
                  Back to pApAmA
                </Link>
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                        Reset password
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        We&apos;ll email you a link to set a new password.
                    </p>
                </div>

                {sent ? (
                    <div className="space-y-4 text-center">
                        <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
                            If an account exists for{" "}
                            <span className="font-medium">{email}</span>, a reset link is on its way.
                        </p>
                        <Link
                            href="/login"
                            className="inline-block text-sm font-medium text-slate-900 hover:underline"
                        >
                            Back to sign in
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={onSubmit} className="space-y-4">
                        <div>
                            <label
                                htmlFor="email"
                                className="mb-1 block text-sm font-medium text-slate-700"
                            >
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                required
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                                placeholder="you@example.com"
                            />
                        </div>

                        {error && (
                            <p
                                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                                role="alert"
                            >
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {loading ? "Sending…" : "Send reset link"}
                        </button>

                        <p className="text-center text-sm text-slate-500">
                            Remembered it?{" "}
                            <Link href="/login" className="font-medium text-slate-900 hover:underline">
                                Sign in
                            </Link>
                        </p>
                    </form>
                )}
            </div>
        </main>
    );
}
