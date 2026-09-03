"use client";

import { useEffect, useMemo, useState } from "react";
import DomeGallery from "@/components/ui/DomeGallery/DomeGallery";
import { mealImages, MEAL_IMAGES } from "./mealImages";

/**
 * The landing hero's photo layer.
 *
 *   <HeroDome/>   the 3D sphere, filling the hero behind the copy. Runs on
 *                 phones as well as desktop — ~98% of this audience is mobile,
 *                 so a desktop-only centrepiece would be invisible to almost
 *                 everyone. It is tuned down there rather than switched off.
 *   <MealStrip/>  a flat grid of the same photos, shown ONLY when the sphere is
 *                 suppressed, i.e. for prefers-reduced-motion.
 *
 * Neither renders on the server or on the first client pass — they decide after
 * mount, so both passes emit identical markup and there is no hydration
 * mismatch.
 */

/** Enough to fill the strip without stretching the page. */
const GRID_COUNT = 12;

/** At or below this the sphere gets the phone treatment. */
const COMPACT_MAX = 767;

/**
 * CDN width per viewport tier. The pool is 45 photos repeated across 175 tiles,
 * so it is 45 downloads either way — but on a phone each tile paints at roughly
 * 34px, and 640px files there are the bulk of the cost of running the dome at
 * all. Unsplash resizes server-side from the query string.
 */
function cdnWidthFor(vw: number): number {
    if (vw <= COMPACT_MAX) return 320;
    if (vw <= 1280) return 480;
    return 640;
}

interface DomeEnv {
    /** false until mounted, so SSR and first paint agree. */
    ready: boolean;
    /** false when the visitor has asked for reduced motion. */
    motionOk: boolean;
    compact: boolean;
    cdnWidth: number;
}

function useDomeEnv(): DomeEnv {
    const [env, setEnv] = useState<DomeEnv>({
        ready: false,
        motionOk: false,
        compact: false,
        cdnWidth: 640,
    });

    useEffect(() => {
        const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

        const sync = () => {
            const vw = window.innerWidth;
            setEnv({
                ready: true,
                motionOk: !calm.matches,
                compact: vw <= COMPACT_MAX,
                cdnWidth: cdnWidthFor(vw),
            });
        };
        sync();

        calm.addEventListener("change", sync);
        window.addEventListener("resize", sync);
        return () => {
            calm.removeEventListener("change", sync);
            window.removeEventListener("resize", sync);
        };
    }, []);

    return env;
}

/**
 * Fills its positioned parent. `aria-hidden` because it is decoration behind
 * the headline; the same photographs are described in <MealStrip/>, and
 * announcing 175 tiles would bury the actual hero copy.
 */
export function HeroDome() {
    const { ready, motionOk, compact, cdnWidth } = useDomeEnv();
    const images = useMemo(() => mealImages(cdnWidth), [cdnWidth]);

    if (!ready || !motionOk) return null;

    return (
        <div
            aria-hidden="true"
            style={{
                position: "absolute",
                /* Offset right rather than inset:0. left+right cancel out, so the
                   box stays exactly as WIDE as the hero — which matters, because
                   the component derives its radius from container width and any
                   narrowing would shrink every tile. A phone has no room to
                   offset into, so there it sits centred. */
                left: compact ? 0 : "18%",
                right: compact ? 0 : "-18%",
                top: 0,
                bottom: 0,
                zIndex: 1,
                /* Consumed by .item__image. The upstream demo sits on near-black,
                   where flat tiles read fine; on this ivory hero they need a
                   shadow. Kept cheap on phones — a soft shadow across 175
                   composited layers is a real cost there. */
                ["--tile-shadow" as string]: compact
                    ? "0 2px 5px rgba(20,52,42,0.14)"
                    : "0 4px 14px rgba(20,52,42,0.18), 0 1px 2px rgba(20,52,42,0.12)",
                /* Feather the sphere into the page. The component's own vignette
                   only tints toward overlayBlurColor; this actually dissolves the
                   outer tiles, which is what stops it reading as a cut-out pasted
                   on the hero. Applied to the wrapper, not to .sphere-root, so it
                   never touches the perspective/preserve-3d chain inside. */
                WebkitMaskImage:
                    "radial-gradient(62% 68% at 50% 50%, #000 42%, rgba(0,0,0,0.55) 72%, transparent 96%)",
                maskImage:
                    "radial-gradient(62% 68% at 50% 50%, #000 42%, rgba(0,0,0,0.55) 72%, transparent 96%)",
                opacity: 0.93,
            }}
        >
            <DomeGallery
                images={images}
                grayscale={false}
                /* The light-page equivalent of upstream's #120F17. This drives the
                   radial vignette and the top/bottom edge fades — the thing that
                   bleeds the sphere off its container instead of boxing it in. It
                   has to match the hero background, not be transparent. */
                overlayBlurColor="#F6E9D4"
                imageBorderRadius={compact ? "12px" : "18px"}
                openedImageBorderRadius="22px"
                openedImageWidth={compact ? "78vw" : "340px"}
                openedImageHeight={compact ? "78vw" : "440px"}
                dragSensitivity={compact ? 16 : 22}
                /* Idle orbit. ~72s for a full turn — slow enough to read as
                   ambient rather than as a carousel, fast enough that the
                   sphere is obviously live and grabbable. Yields instantly to a
                   drag and picks back up once inertia has died. */
                autoRotateDegPerSec={compact ? 4 : 5}
                fit={0.42}
                /* Everything else stays at upstream defaults (fit 0.5, minRadius
                   600, segments 35). Overriding them is what produced dots and
                   boxed-in globes: tile size is radius * 3.14 / 35, so the radius
                   must stay large and the CONTAINER must be big enough for it. */
            />
        </div>
    );
}

/** The flat gallery. Rendered only when the sphere is suppressed. */
export function MealStrip() {
    const { ready, motionOk } = useDomeEnv();
    if (!ready || motionOk) return null;

    return (
        <section
            id="meals"
            style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(36px, 8vw, 56px) clamp(20px, 5vw, 32px) 0" }}
        >
            <h2
                style={{
                    fontSize: "clamp(22px, 5vw, 28px)",
                    fontWeight: 800,
                    letterSpacing: "-0.025em",
                    margin: "0 0 18px",
                    color: "#1C2B24",
                }}
            >
                What your token becomes
            </h2>
            <ul
                style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(clamp(104px, 28vw, 150px), 1fr))",
                    gap: 10,
                }}
            >
                {MEAL_IMAGES.slice(0, GRID_COUNT).map((image) => (
                    <li key={image.src}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- remote Unsplash CDN, intentionally not routed through next/image */}
                        <img
                            src={image.src}
                            alt={image.alt}
                            loading="lazy"
                            decoding="async"
                            style={{
                                width: "100%",
                                aspectRatio: "1",
                                objectFit: "cover",
                                borderRadius: 14,
                                display: "block",
                                background: "#F4F1EA",
                            }}
                        />
                    </li>
                ))}
            </ul>
        </section>
    );
}
