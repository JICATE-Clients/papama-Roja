import Link from "next/link";

import DonateForm from "./DonateForm";
import { C, SHELL } from "@/components/landing/theme";
import { getConfig } from "@/lib/system-config";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Guest donation page.
 *
 * A server component purely so the meal rate can be read from system_config:
 * this route is public and ungated, and the only system-config endpoint is
 * admin-only, so the value is fetched here and handed to the client form.
 *
 * `standard_token_value` may legitimately be NULL. When it is, the form hides
 * the meal arithmetic instead of assuming a rate — AGENTS.md forbids inventing
 * a value for an unset config key, and "₹100 = 2 meals" is exactly the kind of
 * number that must never be guessed on a page that takes money.
 */
export const dynamic = "force-dynamic";

const DONATE_CSS = `
@keyframes pa-ripple-out {
  0%   { transform: scale(0.42); opacity: 0; }
  12%  { opacity: 0.85; }
  100% { transform: scale(1.9); opacity: 0; }
}
@keyframes pa-core-pop {
  0%   { transform: scale(0.9); }
  55%  { transform: scale(1.04); }
  100% { transform: scale(1); }
}
.pa-ripple-stage {
  position: relative;
  display: grid;
  place-items: center;
  height: clamp(132px, 17vw, 178px);
  margin: 18px 0 14px;
}
.pa-ripple-rings { position: absolute; inset: 0; display: grid; place-items: center; }
.pa-ring {
  position: absolute;
  width: clamp(104px, 13vw, 132px);
  aspect-ratio: 1;
  border-radius: 999px;
  border: 1.5px solid rgba(11,122,85,0.55);
  animation: pa-ripple-out 3.1s cubic-bezier(.2,.7,.3,1) infinite;
}
.pa-ring:nth-child(2) { animation-delay: 1.03s; border-color: rgba(240,168,48,0.6); }
.pa-ring:nth-child(3) { animation-delay: 2.06s; border-color: rgba(212,100,60,0.5); }
.pa-ripple-core {
  position: relative;
  display: grid;
  place-items: center;
  width: clamp(92px, 11vw, 112px);
  aspect-ratio: 1;
  border-radius: 999px;
  background: linear-gradient(160deg, #FFFDF8, #F6E9D4);
  border: 1px solid #E0D5C0;
  box-shadow: 0 10px 30px rgba(28,43,36,0.10);
  animation: pa-core-pop .45s cubic-bezier(.22,1,.36,1);
}

.pa-more-methods > summary::-webkit-details-marker { display: none; }
.pa-more-methods > summary::after {
  content: '+'; margin-left: 8px; font-weight: 700; opacity: .7;
}
.pa-more-methods[open] > summary::after { content: '−'; }

@media (max-width: 860px) {
  .pa-donate-grid { grid-template-columns: 1fr !important; gap: 12px !important; }

  /* On a phone the ripple stops being a block of its own and becomes the
     backdrop of the headline. Same animation, zero height — which is the only
     way all five payment methods and the copy fit one screen. The core disc is
     dropped because it just repeats what the headline already says. */
  .pa-ripple-stage {
    position: absolute !important;
    inset: 0 !important;
    height: auto !important;
    margin: 0 !important;
    z-index: 0;
    pointer-events: none;
  }
  .pa-ripple-core { display: none !important; }
  .pa-ring { width: 150px !important; }
  .pa-donate-copy { position: relative; z-index: 1; }
  /* The supporting paragraph and the three-point list are what push this past
     one screen on a phone. The headline already carries the claim and the
     trust strip under the button carries the reassurance, so the long-form
     versions are desktop-only. */
  .pa-donate-aside { display: none !important; }
  .pa-ripple-stage { height: 112px !important; margin: 10px 0 4px !important; }
}
/* The one-line trust strip is the mobile stand-in for the list; on desktop the
   list says it better, so hide the strip there. */
@media (min-width: 861px) { .pa-donate-trust { display: none !important; } }
@media (prefers-reduced-motion: reduce) {
  .pa-ring { animation: none; opacity: 0.45; }
  .pa-ripple-core { animation: none; }
}
`;

export default async function DonatePage() {
    // Nullable by design — see the note above.
    const raw = await getConfig("standard_token_value", createAdminClient() as never).catch(() => null);
    const mealValueInr = typeof raw === "number" && raw > 0 ? raw : null;

    return (
        <div style={{ minHeight: "100svh", background: C.ivory, color: C.ink, fontFamily: "var(--font-sans), sans-serif", position: "relative", isolation: "isolate", overflowX: "hidden" }}>
            <style dangerouslySetInnerHTML={{ __html: DONATE_CSS }} />

            {/* Same warm field as the landing page, so the two read as one site. */}
            <div
                aria-hidden="true"
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: -1,
                    background:
                        "radial-gradient(34% 30% at 10% 8%, rgba(240,168,48,0.42), transparent 70%)," +
                        "radial-gradient(30% 26% at 92% 22%, rgba(212,100,60,0.34), transparent 70%)," +
                        "radial-gradient(38% 32% at 82% 82%, rgba(76,157,120,0.38), transparent 72%)",
                }}
            />

            <header style={{ ...SHELL, paddingTop: 14, paddingBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <Link href="/" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: C.accent, textDecoration: "none" }}>
                    pApAmA
                </Link>
                <Link href="/login" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontSize: 13.5, fontWeight: 600, color: C.inkSoft, textDecoration: "none" }}>
                    Portal login →
                </Link>
            </header>

            <main style={{ ...SHELL, paddingTop: "clamp(6px, 1.6vw, 22px)", paddingBottom: "clamp(8px, 3vw, 32px)" }}>
                <DonateForm mealValueInr={mealValueInr} />
            </main>
        </div>
    );
}
