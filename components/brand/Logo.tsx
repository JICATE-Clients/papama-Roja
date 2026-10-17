import Image from "next/image";

/**
 * The pApAmA Foundation logo, in the two forms the brand sheet supplies.
 *
 * `mark` is the emblem alone — sun, triangle and figure — squared with
 * transparent padding so it never distorts in a circular crop (favicon, avatar,
 * app icon). `full` adds the PAPAMA FOUNDATION wordmark beneath it.
 *
 * Both are the PRIMARY (light-background) artwork with the white knocked out,
 * so they sit correctly on the ivory and slate surfaces the app actually uses.
 * The secondary artwork — white wordmark on the brand green — lives at
 * `/brand/logo-secondary.png` for dark panels; it is a different image rather
 * than a CSS filter because the figure inverts to white, which no filter does.
 *
 * Sized by HEIGHT. The intrinsic dimensions below are the real pixel sizes of
 * the files, which is what lets next/image reserve the right box and avoid a
 * layout shift; `height` then scales it. Width follows the aspect ratio.
 */

const ART = {
    mark: { src: "/brand/logo-mark.png", w: 1024, h: 1024 },
    full: { src: "/brand/logo-primary.png", w: 1400, h: 1475 },
    dark: { src: "/brand/logo-secondary.png", w: 1400, h: 1466 },
} as const;

export interface LogoProps {
    /** `mark` = emblem only, `full` = emblem + wordmark, `dark` = for green panels. */
    variant?: keyof typeof ART;
    /** Rendered height in px. Width follows the artwork's aspect ratio. */
    height?: number;
    className?: string;
    /** Above-the-fold marks (header, login) should not lazy-load. */
    priority?: boolean;
}

export function Logo({ variant = "mark", height = 32, className, priority }: LogoProps) {
    const art = ART[variant];
    return (
        <Image
            src={art.src}
            alt="pApAmA Foundation"
            width={art.w}
            height={art.h}
            priority={priority}
            className={className}
            style={{ height, width: "auto" }}
        />
    );
}

/**
 * Emblem + "pApAmA" wordmark on one line — the lockup the app chrome uses.
 *
 * The text is kept as live text rather than baked into the image: it stays
 * selectable, it scales with the user's font settings, and a screen reader
 * announces it once rather than twice (the mark is marked decorative here
 * because the adjacent text already names the brand).
 */
export function LogoLockup({
    height = 30,
    className = "",
    textClassName = "text-xl font-extrabold tracking-tight text-[#1C4122]",
    priority,
}: {
    height?: number;
    className?: string;
    textClassName?: string;
    priority?: boolean;
}) {
    return (
        <span className={`inline-flex items-center gap-2 ${className}`}>
            <Image
                src={ART.mark.src}
                alt=""
                aria-hidden="true"
                width={ART.mark.w}
                height={ART.mark.h}
                priority={priority}
                style={{ height, width: "auto" }}
            />
            <span className={textClassName}>pApAmA</span>
        </span>
    );
}
