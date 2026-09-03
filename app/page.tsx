import Link from "next/link";

import { HeroDome, MealStrip } from "@/components/landing/HeroGallery";
import LightRays from "@/components/ui/LightRays/LightRays";
import { C, EYEBROW, H2, SHELL } from "@/components/landing/theme";
import { LandingEffects } from "@/components/ui/LandingEffects";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransparencyStats, type TransparencyStats } from "@/lib/services/transparency";

/**
 * pApAmA landing page — "Pastel v2" design (ported from
 * public/pApAmA Home Pastel v2.dc.html) wired to live data + real routes.
 * Light-only art direction. Animations live in the injected <style> (Tailwind v4
 * drops these keyframes from globals.css) and are driven by <LandingEffects/>.
 * Compact type/spacing pass so sections don't feel oversized.
 */
export const dynamic = "force-dynamic";

const ZERO: TransparencyStats = {
    total_donations_inr: 0,
    meals_sponsored: 0,
    meals_served: 0,
    active_vendors: 0,
    active_beneficiaries: 0,
    cities_covered: 0,
};

const fmt = (n: number) => n.toLocaleString("en-IN");


/**
 * The centred column everything below the hero lives in.
 *
 * The hero is deliberately full-bleed; every section under it is contained and
 * centred, with real margin either side. That contrast is what makes the page
 * read as a landing page rather than as an app shell — edge-to-edge content
 * rows are the thing that made it feel like a dashboard.
 */
/** Accent per statistic — drawn from the food, cycled across the six cells. */
const STAT_TINTS = ["#F0A830", "#0B7A55", "#D4643C", "#3E8E7E", "#E8836F", "#B8873B"] as const;

const TRUST = [
    { label: "Tamper-proof tokens", tint: "#F0A830" },
    { label: "Verified vendors", tint: "#0B7A55" },
    { label: "Public redemption ledger", tint: "#D4643C" },
    { label: "Never cash — food value only", tint: "#3E8E7E" },
] as const;

const STEPS = [
    { n: "01", tint: "#F0A830", t: "You give", d: "Your donation is converted into food tokens pegged to real meal value." },
    { n: "02", tint: "#D4643C", t: "Token issued", d: "Each token is tamper-proof and tracked — food value only, never cash." },
    { n: "03", tint: "#3E8E7E", t: "Vendor redeems", d: "A verified vendor scans the token and prepares a fresh meal against it." },
    { n: "04", tint: "#0B7A55", t: "Meal served", d: "The redemption is logged to the public ledger — closing the loop on your gift." },
] as const;

const PORTALS = [
    { title: "Donor", cta: "Open dashboard", href: "/donor/dashboard", tint: "#F0A830" },
    { title: "Vendor", cta: "Sign in or apply", href: "/login?portal=vendor", tint: "#D4643C" },
    { title: "Volunteer", cta: "Sign in", href: "/login?portal=volunteer", tint: "#3E8E7E" },
    { title: "Admin", cta: "Sign in", href: "/login?portal=admin", tint: "#0B7A55" },
] as const;

// Accent style for eyebrows / labels / captions. Per request, this uses the same
// Poppins face as the header nav across ALL sections (previously a monospace font).
const mono = { fontFamily: "var(--font-sans), sans-serif" } as const;

/**
 * Landing animation CSS, injected as a real <style> tag (Tailwind v4's Lightning
 * CSS drops these `pa-*` keyframes/classes when they live in globals.css, so we
 * ship them inline — the same approach the original mockup used).
 */
const PA_CSS = `
@keyframes pa-grad { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
@keyframes pa-floatA { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(18px,-26px) rotate(8deg)} }
@keyframes pa-floatC { 0%,100%{transform:translate(0,0)} 50%{transform:translate(14px,22px)} }
@keyframes pa-pulse { 0%{box-shadow:0 0 0 0 rgba(76,157,120,0.45)} 70%{box-shadow:0 0 0 14px rgba(76,157,120,0)} 100%{box-shadow:0 0 0 0 rgba(76,157,120,0)} }
@keyframes pa-blink { 0%,100%{opacity:1} 50%{opacity:0.35} }
@keyframes pa-marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
@keyframes pa-rise { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
@keyframes pa-chop {
  0%, 8% { transform: rotate(-30deg) translate(0,0); }
  15% { transform: rotate(-4deg) translate(6px,46px); }
  22% { transform: rotate(-26deg) translate(2px,6px); }
  32%, 58% { transform: rotate(-30deg) translate(0,0); }
  64% { transform: rotate(-22deg) translate(0,-6px); }
  70% { transform: rotate(-36deg) translate(0,0); }
  76% { transform: rotate(-26deg) translate(0,-4px); }
  82%, 100% { transform: rotate(-30deg) translate(0,0); }
}
@keyframes pa-thanks {
  0%, 58% { opacity: 0; transform: scale(0) translateY(10px); }
  64% { opacity: 1; transform: scale(1.15) translateY(0); }
  70% { opacity: 1; transform: scale(1) translateY(0); }
  86% { opacity: 1; transform: scale(1) translateY(-4px); }
  94%, 100% { opacity: 0; transform: scale(0.7) translateY(-14px); }
}
@keyframes pa-slice {
  0%, 15% { opacity: 1; transform: translate(0,0) rotate(0deg); }
  24% { transform: translate(30px,-16px) rotate(12deg); }
  54% { transform: translate(230px,40px) rotate(80deg); }
  60%, 84% { opacity: 1; transform: translate(238px,54px) rotate(90deg); }
  92% { opacity: 0; transform: translate(238px,54px) rotate(90deg); }
  97% { opacity: 0; transform: translate(0,0) rotate(0deg); }
  100% { opacity: 1; transform: translate(0,0) rotate(0deg); }
}
.pa-hero-word { animation: pa-rise .9s cubic-bezier(.22,1,.36,1) both; }
.pa-hero-d1 { animation-delay: .1s; }
.pa-hero-d2 { animation-delay: .22s; }
.pa-hero-d3 { animation-delay: .34s; }
.pa-hero-d4 { animation-delay: .46s; }
.pa-card { transition: transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s ease; }
.pa-card:hover { transform: translateY(-5px); box-shadow: 0 14px 32px rgba(76,140,105,0.16); }
.pa-btn { transition: transform .2s ease, box-shadow .3s ease; }
.pa-btn:hover { transform: translateY(-2px); }
.pa-nav a { position: relative; text-decoration: none; color: inherit; }
.pa-nav a::after { content:''; position:absolute; left:0; bottom:-5px; height:2px; width:0; background:#4c9d78; transition: width .28s ease; }
.pa-nav a:hover::after { width:100%; }
.pa-portal:hover .pa-arrow { transform: translateX(6px); }
.pa-arrow { display:inline-block; transition: transform .28s ease; }
#impact, #how { scroll-margin-top: 76px; }

/* ---- Atmosphere -------------------------------------------------------
   Soft colour fields behind the content. Built from overlapping
   radial-gradients rather than blurred divs on purpose: a blur() filter
   over a full-bleed layer is expensive on mobile GPUs, and this sits behind 175
   composited tiles. Radial gradients cost essentially nothing and look the
   same. Hues are taken from the food — turmeric, chilli, tomato, coriander —
   so the page feels warm without introducing a colour the brand doesn't own. */
.pa-aurora {
  position: absolute; inset: -25%; z-index: 0; pointer-events: none;
  background:
    radial-gradient(36% 40% at 16% 20%, rgba(240,168,48,0.62), transparent 70%),
    radial-gradient(32% 36% at 84% 14%, rgba(212,100,60,0.50), transparent 70%),
    radial-gradient(42% 46% at 74% 84%, rgba(76,157,120,0.52), transparent 72%),
    radial-gradient(28% 32% at 28% 88%, rgba(232,131,111,0.46), transparent 70%);
  animation: pa-aurora 26s ease-in-out infinite alternate;
}

/* The same field, fixed behind the WHOLE page so the lower sections are not
   plain cream either. z-index:-1 puts it under in-flow content but still above
   the root's own background, so no section needs a stacking context. */
.pa-aurora--page {
  position: fixed; inset: 0; z-index: -1;
  background:
    radial-gradient(34% 28% at 8% 10%, rgba(240,168,48,0.55), transparent 70%),
    radial-gradient(30% 24% at 94% 28%, rgba(212,100,60,0.48), transparent 70%),
    radial-gradient(38% 30% at 82% 70%, rgba(76,157,120,0.50), transparent 72%),
    radial-gradient(28% 24% at 12% 90%, rgba(232,131,111,0.44), transparent 70%);
  animation: pa-aurora 34s ease-in-out infinite alternate;
}
@keyframes pa-aurora {
  0%   { transform: translate3d(0,0,0) scale(1); }
  50%  { transform: translate3d(2%,-1.5%,0) scale(1.06); }
  100% { transform: translate3d(-1.5%,2%,0) scale(1.03); }
}

/* Paper grain. Without it a large flat ivory field reads as "unfinished
   #FFF"; a trace of noise makes it read as stock. One tiny tile, one paint. */
.pa-grain::after {
  content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
  opacity: 0.38; mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.16'/%3E%3C/svg%3E");
}

/* A warm pool of light directly under the sphere, so it reads as lit rather
   than pasted on. */
.pa-dome-glow {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(46% 54% at 68% 50%, rgba(255,228,182,0.80), rgba(255,228,182,0) 68%);
}

/* ---- Trust marquee ---------------------------------------------------- */
.pa-marquee {
  overflow: hidden; position: relative;
  border-top: 1px solid #E0D5C0; border-bottom: 1px solid #E0D5C0;
  padding: 16px 0; margin-top: 0;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
}
.pa-marquee-track { display: flex; width: max-content; animation: pa-marquee 34s linear infinite; }
.pa-marquee:hover .pa-marquee-track { animation-play-state: paused; }
.pa-marquee-set { display: flex; align-items: center; }
.pa-marquee-item {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 0 34px; white-space: nowrap;
  font-size: 13.5px; font-weight: 600; color: #5B6B63;
}
.pa-marquee-dot { width: 7px; height: 7px; border-radius: 999px; display: inline-block; }

/* ---- Interaction ------------------------------------------------------ */
.pa-portal { transition: transform .28s cubic-bezier(.22,1,.36,1), box-shadow .28s ease; }
.pa-portal:hover { transform: translateY(-5px); box-shadow: 0 16px 34px rgba(28,43,36,0.13); }
.pa-step-node { transition: transform .28s cubic-bezier(.22,1,.36,1); }
.pa-step:hover .pa-step-node { transform: scale(1.12); }

@media (prefers-reduced-motion: reduce) {
  .pa-aurora { animation: none; }
  .pa-marquee-track { animation: none; }
  .pa-portal:hover { transform: none; }
  .pa-step:hover .pa-step-node { transform: none; }
}
/* Legibility scrim over the photo sphere. Horizontal on desktop, where the copy
   sits in a left column beside it; vertical on mobile, where the copy stacks on
   top of it. pointer-events:none so the sphere stays draggable through it. */
.pa-hero-scrim {
  position: absolute; inset: 0; z-index: 2; pointer-events: none;
  background: linear-gradient(96deg,
    rgba(253,246,233,0.82) 0%,
    rgba(253,246,233,0.72) 22%,
    rgba(253,246,233,0.34) 34%,
    rgba(253,246,233,0.05) 45%,
    rgba(253,246,233,0) 53%);
}
@media (max-width: 860px) {
  .pa-hero-scrim {
    background: linear-gradient(180deg,
      rgba(253,246,233,0.94) 0%,
      rgba(253,246,233,0.86) 26%,
      rgba(253,246,233,0.36) 44%,
      rgba(253,246,233,0.06) 62%,
      rgba(253,246,233,0) 74%);
  }
  /* Copy to the top of the stack, so it lands in the opaque half and the
     sphere is left visible below it rather than behind the words. The
     padding-top clears the absolutely-positioned wordmark, which would
     otherwise sit underneath the first headline. */
  .pa-hero-grid {
    align-content: start !important;
    padding-top: 92px !important;
    min-height: 86svh !important;
  }
  /* Side by side these overflow 414px, and the outline button ends up
     unreadable over photo tiles. Stack and fill instead. */
  .pa-hero-cta { flex-direction: column; align-items: stretch; }
  .pa-hero-cta > a { text-align: center; }
}
@media (max-width: 860px) {
  .pa-hero-grid { grid-template-columns: 1fr !important; }
  .pa-illo { display: none !important; }
  .pa-grid3 { grid-template-columns: repeat(2, 1fr) !important; }
  .pa-grid4 { grid-template-columns: repeat(2, 1fr) !important; }
  .pa-nav-links { display: none !important; }
  .pa-pad { padding-left: 20px !important; padding-right: 20px !important; }
  .pa-footcols { grid-template-columns: 1fr 1fr !important; gap: 24px !important; }
  .pa-trust { gap: 12px !important; }
}
`;

export default async function Home() {
    const stats = await getTransparencyStats(createAdminClient()).catch(() => null);
    const s = stats ?? ZERO;

    const cards: { value: number; prefix?: string; label: string; icon: React.ReactNode }[] = [
        { value: s.total_donations_inr, prefix: "₹", label: "Donated", icon: <IconHeart /> },
        { value: s.meals_sponsored, label: "Meals sponsored", icon: <IconBowl /> },
        { value: s.meals_served, label: "Meals served", icon: <IconTarget /> },
        { value: s.active_beneficiaries, label: "Beneficiaries reached", icon: <IconUser /> },
        { value: s.active_vendors, label: "Active vendors", icon: <IconStore /> },
        { value: s.cities_covered, label: "Cities covered", icon: <IconPin /> },
    ];

    return (
        <div className="pa-grain" style={{ position: "relative", isolation: "isolate", fontFamily: "var(--font-sans), sans-serif", color: C.ink, overflowX: "hidden", background: C.ivory }}>
            <style dangerouslySetInnerHTML={{ __html: PA_CSS }} />
            <div aria-hidden="true" className="pa-aurora--page" />

            {/* HERO */}
            <div className="pa-pad" style={{ position: "relative", margin: 0, overflow: "hidden", background: "linear-gradient(135deg, #FFE6C2 0%, #FFD5A8 20%, #FDF0DC 44%, #D6EBDC 72%, #FFE1BE 100%)", backgroundSize: "300% 300%", animation: "pa-grad 18s ease infinite", maxWidth: "none" }}>
                {/* Full-bleed sphere: fills the hero, edges bled off by the
                    component's own vignette (see overlayBlurColor). */}
                <div aria-hidden="true" className="pa-aurora" />
                <div aria-hidden="true" className="pa-dome-glow" />

                <HeroDome />

                {/* Legibility scrim under the copy column only. pointer-events:none
                    so the sphere is still draggable through it. */}
                <div aria-hidden="true" className="pa-hero-scrim" />

                <Link href="/" style={{ position: "absolute", top: "clamp(20px, 4vw, 34px)", left: "clamp(20px, 4vw, 48px)", zIndex: 4, display: "inline-flex", alignItems: "center", minHeight: 44, fontSize: "clamp(20px, 3vw, 24px)", fontWeight: 800, letterSpacing: "-0.02em", color: C.accent, textDecoration: "none" }}>pApAmA</Link>

                <div className="pa-hero-grid" style={{ position: "relative", zIndex: 3, minHeight: "100svh", maxWidth: 1800, margin: "0 auto", padding: "clamp(28px, 6vw, 56px) clamp(20px, 4vw, 48px)", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.1fr)", gap: 40, alignItems: "center" }}>
                    <div>
                        <h1 className="pa-hero-word pa-hero-d2 pa-hero-h1" style={{ fontSize: "clamp(34px, 7vw, 52px)", lineHeight: 1.03, fontWeight: 800, letterSpacing: "-0.035em", margin: "0 0 4px", color: C.ink }}>Give a meal.</h1>
                        <h1 className="pa-hero-word pa-hero-d3 pa-hero-h1" style={{ fontSize: "clamp(34px, 7vw, 52px)", lineHeight: 1.03, fontWeight: 800, letterSpacing: "-0.035em", margin: "0 0 clamp(24px, 5vw, 34px)", color: C.accent }}>Follow it home.</h1>
                        <div className="pa-hero-word pa-hero-d4 pa-hero-cta" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <Link href="/donate" className="pa-btn" style={{ background: C.accent, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 26px", borderRadius: 999, animation: "pa-pulse 2.6s infinite", textDecoration: "none" }}>Sponsor a meal <span className="pa-arrow">→</span></Link>
                        </div>
                    </div>

                    {/* Right column is a spacer. The sphere is NOT in here — it fills
                        the whole hero behind this grid, which is how the component is
                        meant to be used (upstream's example is 100vw x 100vh). */}
                    <div className="pa-illo" aria-hidden="true" />
                </div>

            </div>

            {/* CREDIBILITY MARQUEE — the four promises, moving. A static row of
                ticks is furniture; a slow marquee is the first sign of life after
                the hero and costs one transform. Duplicated once so the loop is
                seamless at translateX(-50%). */}
            <div className="pa-marquee" aria-label="What pApAmA guarantees">
                <div className="pa-marquee-track">
                    {[0, 1].map((copy) => (
                        <div key={copy} className="pa-marquee-set" aria-hidden={copy === 1}>
                            {TRUST.map((t) => (
                                <span key={t.label} className="pa-marquee-item">
                                    <span className="pa-marquee-dot" style={{ background: t.tint }} />
                                    {t.label}
                                </span>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Flat gallery — renders only where the hero sphere bailed out. */}
            <MealStrip />

            {/* LIVE IMPACT */}
            <section id="impact" style={{ ...SHELL, paddingTop: "clamp(64px, 11vw, 104px)", paddingBottom: 0 }}>
                <div
                    style={{
                        background: `linear-gradient(148deg, #FCEFD6 0%, ${C.sand} 44%, #E4F0E6 100%)`,
                        borderRadius: "clamp(18px, 4vw, 28px)",
                        position: "relative",
                        overflow: "hidden",
                        border: `1px solid ${C.hairline}`,
                        padding: "clamp(34px, 6vw, 68px) clamp(22px, 5vw, 64px) clamp(30px, 5vw, 60px)",
                    }}
                >
                    {/* A warm bloom in the corner so the panel isn't a flat fill. */}
                    <div
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            top: "-30%",
                            right: "-12%",
                            width: "52%",
                            height: "140%",
                            background: "radial-gradient(closest-side, rgba(240,168,48,0.34), transparent 72%)",
                            pointerEvents: "none",
                        }}
                    />

                    <div data-reveal style={{ position: "relative", maxWidth: 640, marginBottom: "clamp(36px, 5vw, 56px)" }}>
                        <div style={EYEBROW}>Our impact, live</div>
                        <h2 style={H2}>Real numbers, updated as it happens.</h2>
                        <p style={{ fontSize: "clamp(14.5px, 2vw, 16px)", lineHeight: 1.65, color: C.inkSoft, margin: "18px 0 0" }}>
                            Every figure is read straight from the ledger. Programme-wide totals only — no personal
                            information is ever shown.
                        </p>
                    </div>

                    <div
                        style={{
                            position: "relative",
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                            gap: "clamp(28px, 5vw, 44px) clamp(20px, 3vw, 32px)",
                        }}
                    >
                        {cards.map((c, i) => {
                            const tint = STAT_TINTS[i % STAT_TINTS.length];
                            return (
                                <div key={c.label} data-reveal data-delay={String(i * 70)}>
                                    <span
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            width: 38,
                                            height: 38,
                                            borderRadius: 12,
                                            background: `${tint}22`,
                                            color: tint,
                                            marginBottom: 16,
                                        }}
                                    >
                                        {c.icon}
                                    </span>
                                    <div
                                        data-count={String(c.value)}
                                        {...(c.prefix ? { "data-prefix": c.prefix } : {})}
                                        style={{ fontSize: "clamp(31px, 6vw, 44px)", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: C.ink }}
                                    >
                                        {c.prefix ?? ""}{fmt(c.value)}
                                    </div>
                                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkFaint, marginTop: 13 }}>
                                        {c.label}
                                    </div>
                                    <div style={{ height: 3, width: 30, borderRadius: 999, background: tint, marginTop: 14, opacity: 0.75 }} />
                                </div>
                            );
                        })}
                    </div>

                    <div data-reveal style={{ position: "relative", marginTop: "clamp(34px, 5vw, 56px)", paddingTop: 30, borderTop: `1px solid ${C.hairline}` }}>
                        <Link href="/transparency" className="pa-btn" style={{ display: "inline-block", background: C.ink, color: "#FDF6E9", fontSize: 14.5, fontWeight: 700, padding: "12px 24px", borderRadius: 999, textDecoration: "none" }}>
                            View full transparency dashboard <span className="pa-arrow">→</span>
                        </Link>
                    </div>
                </div>
            </section>

            {/* HOW IT WORKS */}
            <section id="how" style={{ ...SHELL, paddingTop: "clamp(64px, 11vw, 112px)", paddingBottom: 0, position: "relative" }}>
                <div className="pa-hero-grid" style={{ display: "grid", gridTemplateColumns: "0.85fr 1.15fr", gap: "clamp(36px, 5vw, 72px)", alignItems: "start" }}>
                    <div data-reveal>
                        <div style={EYEBROW}>How it works</div>
                        <h2 style={H2}>How a token becomes a meal</h2>
                        <p style={{ fontSize: "clamp(14.5px, 2vw, 16px)", lineHeight: 1.65, color: C.inkSoft, margin: "20px 0 28px" }}>
                            Four steps, each one written to the ledger. You can follow a single donation from the
                            moment you give to the plate it becomes.
                        </p>
                        <Link href="/donate" className="pa-btn" style={{ display: "inline-block", background: C.accent, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 26px", borderRadius: 999, textDecoration: "none" }}>
                            Sponsor a meal <span className="pa-arrow">→</span>
                        </Link>
                    </div>

                    {/* The rail runs behind the nodes and is drawn in the step tints,
                        so the sequence reads as one continuous thing. */}
                    <div style={{ position: "relative" }}>
                        <div
                            aria-hidden="true"
                            style={{
                                position: "absolute",
                                left: 19,
                                top: 34,
                                bottom: 34,
                                width: 2,
                                borderRadius: 2,
                                background: `linear-gradient(180deg, ${STEPS[0].tint}, ${STEPS[1].tint}, ${STEPS[2].tint}, ${STEPS[3].tint})`,
                                opacity: 0.4,
                            }}
                        />
                        {STEPS.map((step, i) => (
                            <div key={step.n} data-reveal data-delay={String(i * 90)} className="pa-step" style={{ position: "relative", display: "grid", gridTemplateColumns: "auto 1fr", gap: 22, padding: "22px 0" }}>
                                <div
                                    className="pa-step-node"
                                    style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: 999,
                                        background: step.tint,
                                        color: "#fff",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 12.5,
                                        fontWeight: 700,
                                        letterSpacing: "0.04em",
                                        boxShadow: `0 0 0 6px ${C.ivory}`,
                                    }}
                                >
                                    {step.n}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: "clamp(16px, 2.4vw, 18px)", color: C.ink, letterSpacing: "-0.015em", marginBottom: 6 }}>{step.t}</div>
                                    <div style={{ fontSize: "clamp(13.5px, 2vw, 14.5px)", lineHeight: 1.6, color: C.inkSoft }}>{step.d}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* PORTALS */}
            <section style={{ ...SHELL, paddingTop: "clamp(64px, 11vw, 112px)", paddingBottom: 0 }}>
                <div data-reveal style={{ marginBottom: 32 }}>
                    <div style={EYEBROW}>Choose your portal</div>
                    <h2 style={H2}>Sign in to your side of pApAmA.</h2>
                </div>
                <div className="pa-grid4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "clamp(10px, 1.6vw, 16px)" }}>
                    {PORTALS.map((pt, i) => (
                        <Link
                            key={pt.title}
                            href={pt.href}
                            className="pa-portal"
                            data-reveal
                            data-delay={String(i * 80)}
                            style={{
                                position: "relative",
                                overflow: "hidden",
                                background: "linear-gradient(160deg, #FFFDF8 0%, #FBF2E2 100%)",
                                border: `1px solid ${C.hairline}`,
                                borderRadius: "clamp(14px, 2.5vw, 20px)",
                                padding: "clamp(20px, 3.5vw, 26px) clamp(18px, 3vw, 24px)",
                                textDecoration: "none",
                                display: "block",
                            }}
                        >
                            <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 90% at 100% 0%, ${pt.tint}26, transparent 62%)`, pointerEvents: "none" }} />
                            <span style={{ position: "relative", display: "block", width: 30, height: 4, borderRadius: 999, background: pt.tint, marginBottom: 18 }} />
                            <div style={{ position: "relative", fontWeight: 700, fontSize: "clamp(16px, 2.4vw, 18px)", color: C.ink, letterSpacing: "-0.015em" }}>{pt.title}</div>
                            <div style={{ position: "relative", fontSize: 13.5, color: C.inkSoft, marginTop: 8 }}>
                                {pt.cta} <span className="pa-arrow" style={{ color: pt.tint }}>→</span>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* CLOSING CTA — the page previously ran out at the portal grid with no
                final ask, which on a donation site is the one thing it can't do. */}
            <section style={{ ...SHELL, paddingTop: "clamp(64px, 11vw, 112px)", paddingBottom: "clamp(64px, 11vw, 112px)" }}>
                <div
                    data-reveal
                    style={{
                        position: "relative",
                        overflow: "hidden",
                        borderRadius: "clamp(18px, 4vw, 28px)",
                        background: `linear-gradient(135deg, ${C.ink} 0%, #1F3A2E 46%, #0E2B21 100%)`,
                        padding: "clamp(40px, 7vw, 76px) clamp(24px, 5vw, 64px)",
                        textAlign: "center",
                    }}
                >
                    {/* WebGL light rays. One decorative section only — it holds a GL
                        context and runs a per-frame shader, so it never goes near a
                        page people work in. The component self-suspends when the
                        section scrolls out of view and renders nothing at all under
                        prefers-reduced-motion. */}
                    <LightRays
                        raysOrigin="top-center"
                        raysColor="#F0A830"
                        raysSpeed={0.7}
                        lightSpread={0.7}
                        rayLength={1.6}
                        fadeDistance={1.1}
                        saturation={0.9}
                        followMouse
                        mouseInfluence={0.06}
                        noiseAmount={0.08}
                        distortion={0.03}
                    />

                    <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(52% 80% at 22% 12%, rgba(240,168,48,0.34), transparent 68%), radial-gradient(46% 76% at 84% 88%, rgba(76,157,120,0.40), transparent 70%)", pointerEvents: "none" }} />
                    <h2 style={{ position: "relative", fontSize: "clamp(27px, 5.2vw, 42px)", fontWeight: 800, letterSpacing: "-0.032em", margin: 0, color: "#FDF6E9", lineHeight: 1.08 }}>
                        ₹50 is one meal.<br />You can follow it all the way.
                    </h2>
                    <p style={{ position: "relative", fontSize: "clamp(14.5px, 2vw, 16.5px)", lineHeight: 1.65, color: "#B9CFC3", margin: "18px auto 30px", maxWidth: 520 }}>
                        No cash ever reaches a middleman. Your gift becomes a token, the token becomes a plate, and
                        the plate is logged where anyone can check it.
                    </p>
                    <div style={{ position: "relative", display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                        <Link href="/donate" className="pa-btn" style={{ background: "#FDF6E9", color: C.ink, fontSize: 15.5, fontWeight: 700, padding: "14px 30px", borderRadius: 999, textDecoration: "none" }}>
                            Sponsor a meal <span className="pa-arrow">→</span>
                        </Link>
                        <Link href="/transparency" className="pa-btn" style={{ background: "transparent", color: "#FDF6E9", fontSize: 15.5, fontWeight: 600, padding: "14px 30px", borderRadius: 999, border: "1px solid rgba(253,246,233,0.32)", textDecoration: "none" }}>
                            See the ledger
                        </Link>
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer style={{ background: C.footer, color: "#B9C6BF" }}>
                <div className="pa-footcols pa-pad" style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(44px, 8vw, 64px) clamp(20px, 5vw, 32px) 32px", display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: "clamp(28px, 4vw, 40px)" }}>
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>pApAmA</div>
                        <div style={{ fontSize: 13.5, color: "#9dc3b2", marginTop: 10, maxWidth: 320, lineHeight: 1.6 }}>
                            Turn donations into meals — fund, distribute, redeem and settle tamper-proof food tokens, fully traceable from gift to plate.
                        </div>
                    </div>
                    <FooterCol title="Platform" links={[["Impact", "#impact"], ["How it works", "#how"], ["Donate", "/donate"]]} />
                    <FooterCol title="Get involved" links={[["Donor", "/donor/dashboard"], ["Vendors", "/login?portal=vendor"], ["Volunteer", "/login?portal=volunteer"]]} />
                    <FooterCol title="Trust" links={[["Transparency", "/transparency"], ["Portal login", "/login"]]} />
                </div>
                <div className="pa-pad" style={{ maxWidth: 1280, margin: "0 auto", padding: "20px clamp(20px, 5vw, 32px) 44px", borderTop: "1px solid rgba(255,255,255,0.12)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, fontSize: 12.5, color: "#8fb3a3" }}>
                    <span>Tokens represent food value only — never cash, never withdrawable.</span>
                    <span>© 2026 pApAmA</span>
                </div>
            </footer>

            <LandingEffects />
        </div>
    );
}

// --- inline icons (stroke #2f6b51), matching the mockup ----------------------
const iconProps = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#2f6b51",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
};
function IconHeart() {
    return <svg {...iconProps}><path d="M19 14c1.5-1.5 2-3.2 2-4.5A4.5 4.5 0 0 0 12 6.6 4.5 4.5 0 0 0 3 9.5c0 1.3.5 3 2 4.5l7 6.5z" /></svg>;
}
function IconBowl() {
    return <svg {...iconProps}><path d="M4 11h16a8 8 0 0 1-16 0z" /><path d="M9 7c0-1 .5-1.5.5-2.5M13.5 7c0-1 .5-1.5.5-2.5" /></svg>;
}
function IconTarget() {
    return <svg {...iconProps}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg>;
}
function IconUser() {
    return <svg {...iconProps}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></svg>;
}
function IconStore() {
    return <svg {...iconProps}><path d="M4 10v10h16V10" /><path d="M3 6l1.5-3h15L21 6a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-5 0z" /><path d="M9 20v-6h6v6" /></svg>;
}
function IconPin() {
    return <svg {...iconProps}><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}
function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
    return (
        <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7fa998", marginBottom: 12 }}>{title}</div>
            {/* These were 20px tall. Since the landing page no longer has a nav,
                the footer is the ONLY route to Portal login / Vendor / Volunteer,
                and ~98% of traffic is touch — 44px is the minimum comfortable
                target, and 20px is below even the WCAG 2.5.8 floor of 24px. */}
            <div style={{ display: "flex", flexDirection: "column" }}>
                {links.map(([label, href]) => (
                    <Link
                        key={label}
                        href={href}
                        style={{ fontSize: 13.5, color: "#cfe3d8", textDecoration: "none", display: "flex", alignItems: "center", minHeight: 44 }}
                    >
                        {label}
                    </Link>
                ))}
            </div>
        </div>
    );
}
