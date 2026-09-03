/**
 * Public-site palette — "neutral canvas, photo-led".
 *
 * Shared by the landing page and the donate flow so the two can't drift apart.
 * The site carries a lot of food photography; a saturated background competes
 * with it, so surfaces stay ivory/sand and the brand green is spent ONLY on
 * things you can click. Before adding a colour, ask whether a photograph could
 * carry it instead.
 *
 * The warm hues at the bottom are lifted from the food itself — turmeric,
 * chilli, tomato — and are used as low-opacity atmosphere, never as UI colour.
 */
export const C = {
    ivory: "#F8F2E7",
    sand: "#F1E8D7",
    sandDeep: "#EADFC9",
    ink: "#1C2B24",
    inkSoft: "#5B6B63",
    inkFaint: "#8C9A93",
    hairline: "#E0D5C0",
    accent: "#0B7A55",
    accentSoft: "#EAF3EE",
    footer: "#14211C",
    saffron: "#F0A830",
    chilli: "#D4643C",
    rose: "#E8836F",
} as const;

/** Section eyebrow — small, spaced, accent-coloured. */
export const EYEBROW = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.18em",
    color: C.accent,
    textTransform: "uppercase",
    marginBottom: 14,
} as const;

/** Section heading. Fluid so it never needs a breakpoint. */
export const H2 = {
    fontSize: "clamp(27px, 5.2vw, 40px)",
    fontWeight: 800,
    letterSpacing: "-0.032em",
    margin: 0,
    color: C.ink,
    lineHeight: 1.08,
} as const;

/**
 * The centred column public pages live in. Fluid gutter, because these are set
 * inline and so never receive a `.pa-pad`-style mobile override.
 */
export const SHELL = {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "0 clamp(20px, 5vw, 32px)",
} as const;
