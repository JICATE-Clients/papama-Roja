"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { clearDonorCache } from "@/lib/donor/auth";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/components/landing/theme";
import { mealImages } from "@/components/landing/mealImages";

/**
 * Unified pApAmA login — one tabbed screen serving every portal
 * (donor / vendor / volunteer / admin). All portals authenticate with the same
 * Supabase email+password call; the *role* lives in public.users, so the tab is
 * cosmetic (copy + signup link only). On success we honour a same-origin
 * ?redirect, otherwise we hand off to /post-login which resolves the real role
 * server-side and lands the user in the right area.
 *
 * The visual layer matches the public site: ivory canvas, warm aurora, and the
 * food photography carrying the colour. It replaced a mint split-screen with a
 * hand-built coin→seed→plant→token animation — that version is in git history
 * at the commit before this one if it is ever wanted back.
 *
 * Keyframes are inlined as a <style> tag rather than added to globals.css
 * because Tailwind v4's Lightning CSS strips unknown `pa-*` keyframes (same
 * pattern as app/page.tsx).
 */

// Google OAuth is not wired yet (the Supabase Google provider is unconfigured —
// an open item). Flip this to true once the provider is set up to reveal the
// "Continue with Google" button on the donor/volunteer tabs.
const ENABLE_GOOGLE_OAUTH = false;

type Portal = "donor" | "vendor" | "volunteer" | "admin";
const PORTAL_KEYS: Portal[] = ["donor", "vendor", "volunteer", "admin"];

interface PortalDef {
    label: string;
    heading: string;
    subtitle: string;
    idLabel: string;
    idPlaceholder: string;
    cta: string;
    showAlt: boolean; // show the "Continue with Google" alt path
    footNote: string;
    footAction: string;
    footHref: string | null; // null → static text (admin is invite-only)
}

const PORTAL_DEFS: Record<Portal, PortalDef> = {
    donor: {
        label: "Donor",
        heading: "Welcome back, giver.",
        subtitle: "Sign in to sponsor meals and follow every token you have gifted.",
        idLabel: "Email",
        idPlaceholder: "you@example.com",
        cta: "Sign in to donate",
        showAlt: true,
        footNote: "New to pApAmA?",
        footAction: "Create a donor account",
        footHref: "/donor/signup",
    },
    vendor: {
        label: "Vendor",
        // Auth is email-only (vendors register with an email), so the field is an
        // email even though the stall has a vendor ID elsewhere in the app.
        heading: "Vendor sign in",
        subtitle: "Scan and redeem food tokens, track settlements, and manage your stall.",
        idLabel: "Email",
        idPlaceholder: "you@stall.in",
        cta: "Sign in to redeem",
        showAlt: false,
        footNote: "Run a food stall?",
        footAction: "Apply to become a vendor",
        footHref: "/vendor/register",
    },
    volunteer: {
        label: "Volunteer",
        heading: "Hello, helper.",
        subtitle: "Coordinate deliveries and confirm meals reached the right hands.",
        idLabel: "Email",
        idPlaceholder: "you@example.com",
        cta: "Sign in to volunteer",
        showAlt: true,
        footNote: "Want to join the field team?",
        footAction: "Register as a volunteer",
        footHref: "/volunteer/register",
    },
    admin: {
        label: "Admin",
        heading: "Programme console",
        subtitle: "Manage vendors, verify redemptions, and publish the transparency ledger.",
        idLabel: "Admin email",
        idPlaceholder: "admin@papama.org",
        cta: "Sign in securely",
        showAlt: false,
        footNote: "Access is invite-only.",
        footAction: "Contact the programme lead",
        footHref: null,
    },
};

function isPortal(v: string | null): v is Portal {
    return v === "donor" || v === "vendor" || v === "volunteer" || v === "admin";
}

/**
 * The brand panel is a wall of photographs rather than a small mosaic with
 * whitespace around it. 4 columns x 5 rows fills any realistic panel shape, and
 * `grid-auto-rows: 1fr` means it stretches to the panel rather than the panel
 * stretching to it — so the photo wall can never push the page past one screen.
 */
const MOSAIC = mealImages(480).slice(0, 20);

const PA_LOGIN_CSS = `
.pa-login *{ box-sizing:border-box; }
@keyframes pa-aurora-drift {
  0%   { transform: translate3d(0,0,0) scale(1); }
  50%  { transform: translate3d(2%,-1.5%,0) scale(1.06); }
  100% { transform: translate3d(-1.5%,2%,0) scale(1.03); }
}
@keyframes pa-tile-in {
  from { opacity: 0; transform: translateY(14px) scale(.96); }
  to   { opacity: 1; transform: none; }
}
.pa-login-aurora {
  position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background:
    radial-gradient(34% 30% at 10% 8%,  rgba(240,168,48,0.46), transparent 70%),
    radial-gradient(30% 26% at 92% 20%, rgba(212,100,60,0.36), transparent 70%),
    radial-gradient(38% 32% at 84% 84%, rgba(76,157,120,0.40), transparent 72%);
  animation: pa-aurora-drift 30s ease-in-out infinite alternate;
}
.pa-mosaic img { animation: pa-tile-in .6s cubic-bezier(.22,1,.36,1) both; }
.pa-mosaic img:nth-child(4n+2){animation-delay:.06s}
.pa-mosaic img:nth-child(4n+3){animation-delay:.12s}
.pa-mosaic img:nth-child(4n+4){animation-delay:.18s}
.pa-mosaic img:nth-child(n+9){animation-delay:.24s}
.pa-mosaic img:nth-child(n+17){animation-delay:.32s}

.pa-btn { transition: transform .2s ease, box-shadow .3s ease, background .2s ease; cursor:pointer; }
.pa-btn:hover { transform: translateY(-2px); }
.pa-input { transition: border-color .2s ease, box-shadow .2s ease; }
.pa-input:focus { outline:none; border-color:${C.accent} !important; box-shadow:0 0 0 3px rgba(11,122,85,0.16); }

@media (max-width: 900px) {
  .pa-login-grid { grid-template-columns: 1fr !important; }
  /* The brand panel is the first thing to go on a phone: the form is the job,
     and 98% of this traffic is mobile. The wordmark moves into the form column
     so the page still identifies itself. */
  .pa-brand { display: none !important; }
  .pa-login-mobilebrand { display: flex !important; }
}
@media (prefers-reduced-motion: reduce) {
  .pa-login *, .pa-login *::before, .pa-login *::after { animation: none !important; }
}
`;

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Only accept same-origin relative paths — reject `//evil.com` and absolute
    // URLs so ?redirect can't be abused as an open-redirect phishing vector.
    const rawRedirect = searchParams.get("redirect");
    const redirectTo =
        rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
            ? rawRedirect
            : null;

    const initialPortal = useMemo<Portal>(() => {
        const p = searchParams.get("portal");
        return isPortal(p) ? p : "donor";
    }, [searchParams]);

    const [portal, setPortal] = useState<Portal>(initialPortal);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const d = PORTAL_DEFS[portal];

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        clearDonorCache(); // drop any stale donor identity from a previous session
        // Explicit ?redirect wins (deep-link return); otherwise let /post-login
        // resolve the real role and route there.
        router.push(redirectTo ?? "/post-login");
        router.refresh();
    }

    return (
        <div
            className="pa-login"
            style={{ fontFamily: "var(--font-sans), sans-serif", color: C.ink, background: C.ivory, position: "relative", isolation: "isolate", minHeight: "100svh" }}
        >
            <style dangerouslySetInnerHTML={{ __html: PA_LOGIN_CSS }} />
            <div aria-hidden="true" className="pa-login-aurora" />

            <div
                className="pa-login-grid"
                style={{ minHeight: "100svh", display: "grid", gridTemplateColumns: "1fr 1fr" }}
            >
                {/* LEFT: brand panel. The photographs are the colour here, same as
                    the landing page — no abstract shapes. */}
                <div
                    className="pa-brand"
                    style={{
                        position: "relative",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: 24,
                        padding: "clamp(30px, 4vw, 52px)",
                        background: C.sand,
                        borderRight: `1px solid ${C.hairline}`,
                    }}
                >
                    {/* Photo wall, edge to edge. */}
                    <div className="pa-mosaic" aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridAutoRows: "1fr", gap: 4 }}>
                        {MOSAIC.map((m) => (
                            /* eslint-disable-next-line @next/next/no-img-element -- remote Unsplash CDN, intentionally not routed through next/image */
                            <img key={m.src} src={m.src} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", background: C.sand }} />
                        ))}
                    </div>

                    {/* Scrim. Strong where the copy sits, thinning toward the
                        bottom-right so the photographs still read as photographs. */}
                    <div
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: "none",
                            background:
                                /* Even base wash so the whole wall reads as photographs, */
                                "linear-gradient(148deg, rgba(250,242,228,0.66) 0%, rgba(250,242,228,0.60) 55%, rgba(250,242,228,0.52) 100%)," +
                                /* plus a soft lift up the left edge, which is where the copy sits. */
                                " linear-gradient(95deg, rgba(250,242,228,0.66) 0%, rgba(250,242,228,0.30) 46%, rgba(250,242,228,0) 78%)",
                        }}
                    />
                    <Link
                        href="/"
                        style={{ position: "relative", display: "inline-flex", alignSelf: "flex-start", alignItems: "center", minHeight: 44, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: C.accent, textDecoration: "none" }}
                    >
                        pApAmA
                    </Link>

                    <div style={{ position: "relative" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: C.accent, marginBottom: 16 }}>
                            Transparent food giving
                        </div>
                        <h1 style={{ fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 800, letterSpacing: "-0.033em", lineHeight: 1.08, color: C.ink, margin: 0, maxWidth: 480 }}>
                            Every gift traced to the plate it becomes.
                        </h1>
                        <p style={{ fontSize: 15.5, lineHeight: 1.6, color: C.inkSoft, maxWidth: 440, margin: "16px 0 0" }}>
                            Sign in to your portal to donate, redeem tokens, coordinate deliveries, or run the
                            programme.
                        </p>
                    </div>

                    <div style={{ position: "relative", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkSoft }}>
                        Tokens are food-value only · never cash
                    </div>
                </div>

                {/* RIGHT: the form */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(24px, 5vw, 48px)" }}>
                    <div style={{ width: "100%", maxWidth: 452 }}>
                        <Link
                            href="/"
                            className="pa-login-mobilebrand"
                            style={{ display: "none", alignItems: "center", minHeight: 44, marginBottom: 12, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", color: C.accent, textDecoration: "none" }}
                        >
                            pApAmA
                        </Link>

                        <Link
                            href="/"
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                minHeight: 44,
                                marginBottom: 4,
                                fontSize: 13.5,
                                fontWeight: 600,
                                color: C.inkSoft,
                                textDecoration: "none",
                            }}
                        >
                            <ArrowLeft size={15} weight="bold" aria-hidden />
                            Back to pApAmA
                        </Link>

                        {/* portal tabs */}
                        <div role="tablist" aria-label="Choose your portal" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, background: C.sand, border: `1px solid ${C.hairline}`, borderRadius: 999, padding: 4, marginBottom: 28 }}>
                            {PORTAL_KEYS.map((key) => {
                                const active = key === portal;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        onClick={() => {
                                            setPortal(key);
                                            setError(null);
                                        }}
                                        className="pa-btn"
                                        style={{
                                            textAlign: "center",
                                            fontSize: 13.5,
                                            fontFamily: "inherit",
                                            fontWeight: active ? 700 : 500,
                                            /* 44px so it is a comfortable touch target — these were 38px. */
                                            minHeight: 44,
                                            padding: "0 4px",
                                            border: "none",
                                            borderRadius: 999,
                                            background: active ? C.accent : "transparent",
                                            color: active ? "#fff" : C.inkSoft,
                                            cursor: "pointer",
                                        }}
                                    >
                                        {PORTAL_DEFS[key].label}
                                    </button>
                                );
                            })}
                        </div>

                        <h2 style={{ fontSize: "clamp(26px, 4.5vw, 34px)", fontWeight: 800, letterSpacing: "-0.03em", color: C.ink, margin: 0, lineHeight: 1.1 }}>{d.heading}</h2>
                        <p style={{ fontSize: 15, color: C.inkSoft, margin: "10px 0 26px", lineHeight: 1.55 }}>{d.subtitle}</p>

                        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            <div>
                                <label htmlFor="pa-email" style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkFaint, marginBottom: 9 }}>{d.idLabel}</label>
                                <input
                                    id="pa-email"
                                    className="pa-input"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder={d.idPlaceholder}
                                    style={INPUT}
                                />
                            </div>
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
                                    <label htmlFor="pa-password" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkFaint }}>Password</label>
                                    <Link href="/forgot-password" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 2px", fontSize: 13, fontWeight: 600, color: C.accent, textDecoration: "none" }}>Forgot?</Link>
                                </div>
                                <input
                                    id="pa-password"
                                    className="pa-input"
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    style={INPUT}
                                />
                            </div>

                            {error && (
                                <p role="alert" style={{ margin: 0, fontSize: 14, color: "#8C2F14", background: "#FCECE8", border: "1px solid #F0C4B8", borderRadius: 12, padding: "12px 15px", lineHeight: 1.5 }}>
                                    {error}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="pa-btn"
                                style={{ background: C.accent, color: "#fff", fontSize: 16, fontWeight: 700, fontFamily: "inherit", minHeight: 54, border: "none", borderRadius: 999, textAlign: "center", marginTop: 6, opacity: loading ? 0.6 : 1, cursor: loading ? "wait" : "pointer" }}
                            >
                                {loading ? "Signing in…" : d.cta}
                            </button>
                        </form>

                        {ENABLE_GOOGLE_OAUTH && d.showAlt && (
                            <>
                                <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "22px 0" }}>
                                    <div style={{ flex: 1, height: 1, background: C.hairline }} />
                                    <span style={{ fontSize: 12.5, color: C.inkFaint }}>or</span>
                                    <div style={{ flex: 1, height: 1, background: C.hairline }} />
                                </div>
                                <button type="button" className="pa-btn" style={{ width: "100%", border: `1px solid ${C.hairline}`, background: "#FFFDF8", color: C.ink, fontSize: 15, fontWeight: 600, fontFamily: "inherit", minHeight: 50, borderRadius: 999, textAlign: "center" }}>
                                    Continue with Google
                                </button>
                            </>
                        )}

                        <p style={{ fontSize: 14, color: C.inkSoft, textAlign: "center", marginTop: 24 }}>
                            {d.footNote}{" "}
                            {d.footHref ? (
                                <Link href={d.footHref} style={{ color: C.accent, fontWeight: 700, textDecoration: "none" }}>{d.footAction}</Link>
                            ) : (
                                <span style={{ color: C.accent, fontWeight: 700 }}>{d.footAction}</span>
                            )}
                        </p>

                        {portal === "admin" && (
                            <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.inkFaint }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="4" y="10" width="16" height="10" rx="2" />
                                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                                </svg>
                                Restricted · all actions are audit-logged
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

const INPUT: React.CSSProperties = {
    width: "100%",
    fontFamily: "var(--font-sans), sans-serif",
    fontSize: 15.5,
    height: 52,
    padding: "0 18px",
    border: `1px solid ${C.hairline}`,
    borderRadius: 14,
    background: "#FFFDF8",
    color: C.ink,
};

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm />
        </Suspense>
    );
}
