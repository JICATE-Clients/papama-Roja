"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { clearDonorCache } from "@/lib/donor/auth";
import { C } from "@/components/landing/theme";
import {
    PublicShell,
    CARD,
    LABEL,
    INPUT,
    PRIMARY_BTN,
    GHOST_BTN,
    ERROR_BOX,
    SuccessMark,
} from "@/components/public/PublicShell";

/**
 * Donor sign-up (Supabase Auth). The M19 trigger provisions the donors +
 * donor_credits rows automatically on auth signup. full_name is passed as user
 * metadata so the trigger can seed donors.name. If the project requires email
 * confirmation, we show a "check your email" state instead of redirecting.
 *
 * Restyled onto the shared public shell; the signup call, the consent gate and
 * the /api/donor/consent best-effort POST are unchanged.
 */
export default function DonorSignupPage() {
    const router = useRouter();
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [consent, setConsent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [confirmSent, setConfirmSent] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        // Data-privacy consent is required before an account is created (addon2 A7).
        if (!consent) {
            setError("Please accept the data privacy policy to continue.");
            return;
        }
        setLoading(true);

        const supabase = createClient();
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            // Stamp the consent intent on auth metadata as a durable record even on the
            // email-confirmation path (the donor row is created on confirm).
            options: { data: { full_name: fullName, consent_data_privacy: true } },
        });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        // If a session is returned, confirmation is off → record consent, then portal.
        if (data.session) {
            // Best-effort: RLS records it against this donor. A failure must not block
            // the signup (the auth-metadata flag above preserves the intent).
            try {
                await fetch("/api/donor/consent", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ consent_type: "data_privacy" }),
                });
            } catch {
                // ignore — consent can be re-recorded from the donor account later
            }
            clearDonorCache();
            router.push("/donor/dashboard");
            router.refresh();
            return;
        }

        // Otherwise the user must confirm via email first.
        setConfirmSent(true);
        setLoading(false);
    }

    if (confirmSent) {
        return (
            <PublicShell rightLink={{ href: "/login", label: "Portal login →" }} maxWidth={520}>
                <div style={{ ...CARD, textAlign: "center" }}>
                    <SuccessMark />
                    <h1 style={H1}>Check your email.</h1>
                    <p style={SUB}>
                        We sent a confirmation link to <strong style={{ color: C.ink }}>{email}</strong>. Confirm it,
                        then sign in and your donor account is ready.
                    </p>
                    <div style={{ marginTop: 24 }}>
                        <Link href="/donor/login" style={PRIMARY_BTN}>Go to sign in</Link>
                    </div>
                </div>
            </PublicShell>
        );
    }

    return (
        <PublicShell rightLink={{ href: "/login", label: "Portal login →" }} maxWidth={520}>
            <div style={CARD}>
                <h1 style={H1}>Become a donor.</h1>
                <p style={SUB}>
                Follow every token you fund — to the meal it buys and the vendor who cooked it.
                </p>

                <form onSubmit={onSubmit} style={{ marginTop: 18 }}>
                    <label htmlFor="fullName" style={LABEL}>Full name</label>
                    <input
                        id="fullName"
                        type="text"
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Your name"
                        style={{ ...INPUT, height: 48, marginBottom: 11 }}
                    />

                    <label htmlFor="email" style={LABEL}>Email</label>
                    <input
                        id="email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        style={{ ...INPUT, height: 48, marginBottom: 11 }}
                    />

                    <label htmlFor="password" style={LABEL}>Password</label>
                    <input
                        id="password"
                        type="password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        style={{ ...INPUT, height: 48, marginBottom: 14 }}
                    />

                    {/* The whole row is the label, so the tap target is the sentence
                        rather than a 16px box — this matters on a phone. */}
                    <label
                        style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 11,
                            padding: "10px 12px",
                            minHeight: 44,
                            border: `1px solid ${consent ? C.accent : C.hairline}`,
                            background: consent ? C.accentSoft : "transparent",
                            borderRadius: 13,
                            cursor: "pointer",
                            transition: "background .18s ease, border-color .18s ease",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={consent}
                            onChange={(e) => setConsent(e.target.checked)}
                            style={{ width: 18, height: 18, marginTop: 1, accentColor: C.accent, flexShrink: 0, cursor: "pointer" }}
                        />
                        <span style={{ fontSize: 13, lineHeight: 1.55, color: C.inkSoft }}>
                            I agree to the pApAmA data privacy policy and consent to my data being processed to run
                            donations and meal transparency.
                        </span>
                    </label>

                    {error && <p role="alert" style={{ ...ERROR_BOX, marginTop: 16 }}>{error}</p>}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{ ...PRIMARY_BTN, marginTop: 14, opacity: loading ? 0.6 : 1, cursor: loading ? "wait" : "pointer" }}
                    >
                        {loading ? "Creating account…" : "Create my account"}
                    </button>

                    <Link href="/donor/login" style={{ ...GHOST_BTN, minHeight: 44, marginTop: 9 }}>
                        Already a donor? Sign in
                    </Link>
                </form>
            </div>
        </PublicShell>
    );
}

const H1 = {
    fontSize: "clamp(22px, 4.6vw, 32px)",
    fontWeight: 800,
    letterSpacing: "-0.03em",
    color: C.ink,
    margin: 0,
    lineHeight: 1.1,
    textAlign: "center",
} as const;

const SUB = {
    fontSize: 14.5,
    lineHeight: 1.6,
    color: C.inkSoft,
    textAlign: "center",
    margin: "10px auto 0",
    maxWidth: 390,
} as const;
