import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { C, SHELL } from "@/components/landing/theme";

/**
 * Chrome and form primitives shared by the public, unauthenticated pages —
 * /donate, /donate/qr, /donor/signup.
 *
 * These pages were each built with their own palette (zinc/emerald here,
 * mint there), which is how the site ended up with four visual languages. The
 * shell and the style constants below exist so a new public page inherits the
 * look instead of inventing one.
 *
 * All interactive constants are sized for touch: ~98% of this traffic is
 * mobile, so 44px is the floor for anything tappable.
 */

export function PublicShell({
    children,
    rightLink,
    maxWidth,
}: {
    children: ReactNode;
    /** Optional top-right action, e.g. a way back to the main donate flow. */
    rightLink?: { href: string; label: string };
    /** Content width; defaults to the site shell. */
    maxWidth?: number;
}) {
    return (
        <div
            style={{
                minHeight: "100svh",
                background: C.ivory,
                color: C.ink,
                fontFamily: "var(--font-sans), sans-serif",
                position: "relative",
                // Without this the z-index:-1 aurora escapes to the root stacking
                // context and hides behind body{background:#fff} in globals.css.
                isolation: "isolate",
                overflowX: "hidden",
                display: "flex",
                flexDirection: "column",
            }}
        >
            <div aria-hidden="true" style={AURORA} />

            <header
                style={{
                    ...SHELL,
                    width: "100%",
                    paddingTop: 14,
                    paddingBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                }}
            >
                <Link href="/" style={WORDMARK}>
                    pApAmA
                </Link>
                {rightLink && (
                    <Link href={rightLink.href} style={TOP_LINK}>
                        {rightLink.label}
                    </Link>
                )}
            </header>

            <main
                style={{
                    ...SHELL,
                    ...(maxWidth ? { maxWidth } : null),
                    // Without this the auto side-margins suppress the flex
                    // stretch and <main> sizes to its text, so maxWidth never
                    // takes effect — /transparency's 6-card grid was laying out
                    // at 586px inside a 1040px allowance.
                    width: "100%",
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    paddingTop: "clamp(10px, 2vw, 26px)",
                    paddingBottom: "clamp(16px, 3vw, 34px)",
                }}
            >
                {children}
            </main>
        </div>
    );
}

const AURORA: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: -1,
    pointerEvents: "none",
    background:
        "radial-gradient(34% 30% at 10% 8%, rgba(240,168,48,0.42), transparent 70%)," +
        "radial-gradient(30% 26% at 92% 22%, rgba(212,100,60,0.34), transparent 70%)," +
        "radial-gradient(38% 32% at 82% 82%, rgba(76,157,120,0.38), transparent 72%)",
};

const WORDMARK: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 44,
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: C.accent,
    textDecoration: "none",
};

const TOP_LINK: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 44,
    fontSize: 13.5,
    fontWeight: 600,
    color: C.inkSoft,
    textDecoration: "none",
};

export const CARD: CSSProperties = {
    background: "linear-gradient(160deg, #FFFDF8 0%, #FBF2E2 100%)",
    border: `1px solid ${C.hairline}`,
    borderRadius: "clamp(16px, 3vw, 24px)",
    padding: "clamp(18px, 4vw, 30px)",
    boxShadow: "0 18px 46px rgba(28,43,36,0.09)",
};

export const LABEL: CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: C.inkFaint,
    marginBottom: 9,
};

export const INPUT: CSSProperties = {
    width: "100%",
    fontFamily: "var(--font-sans), sans-serif",
    fontSize: 15.5,
    height: 50,
    padding: "0 16px",
    border: `1px solid ${C.hairline}`,
    borderRadius: 13,
    background: "#FFFDF8",
    color: C.ink,
};

export const PRIMARY_BTN: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: 52,
    borderRadius: 999,
    border: "none",
    background: C.accent,
    color: "#fff",
    fontSize: 15.5,
    fontWeight: 700,
    fontFamily: "inherit",
    textDecoration: "none",
    cursor: "pointer",
};

export const GHOST_BTN: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: 46,
    borderRadius: 999,
    border: `1px solid ${C.hairline}`,
    background: "transparent",
    color: C.ink,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "inherit",
    textDecoration: "none",
    cursor: "pointer",
};

export const ERROR_BOX: CSSProperties = {
    borderRadius: 12,
    background: "#FCECE8",
    border: "1px solid #F0C4B8",
    color: "#8C2F14",
    padding: "12px 14px",
    fontSize: 13.5,
    lineHeight: 1.5,
    margin: 0,
};

/** Amount preset pill. */
export function presetStyle(active: boolean): CSSProperties {
    return {
        minHeight: 44,
        borderRadius: 999,
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 700,
        fontFamily: "inherit",
        border: `1px solid ${active ? C.accent : C.hairline}`,
        background: active ? C.accent : "transparent",
        color: active ? "#fff" : C.ink,
        transition: "background .18s ease, color .18s ease, border-color .18s ease",
    };
}

/** Label + value row used by both receipts. */
export function ReceiptRow({
    label,
    value,
    mono,
    strong,
}: {
    label: string;
    value: string;
    mono?: boolean;
    strong?: boolean;
}) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
            <span style={{ fontSize: 13, color: C.inkFaint, flexShrink: 0 }}>{label}</span>
            <span
                style={{
                    fontSize: strong ? 16 : 13,
                    fontWeight: strong ? 800 : 600,
                    color: C.ink,
                    fontFamily: mono ? "ui-monospace, monospace" : undefined,
                    wordBreak: mono ? "break-all" : undefined,
                    textAlign: "right",
                }}
            >
                {value}
            </span>
        </div>
    );
}

/** The green tick shown at the top of a completed receipt. */
export function SuccessMark() {
    return (
        <div
            style={{
                width: 58,
                height: 58,
                borderRadius: 999,
                background: C.accent,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
            }}
        >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 12.75l6 6 9-13.5" />
            </svg>
        </div>
    );
}
