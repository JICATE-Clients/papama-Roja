import Link from "next/link";
import { Bank } from "@phosphor-icons/react/dist/ssr/Bank";
import { HandHeart } from "@phosphor-icons/react/dist/ssr/HandHeart";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { Receipt } from "@phosphor-icons/react/dist/ssr/Receipt";
import { Storefront } from "@phosphor-icons/react/dist/ssr/Storefront";
import { UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
import { Camera } from "@phosphor-icons/react/dist/ssr/Camera";
import { ForkKnife } from "@phosphor-icons/react/dist/ssr/ForkKnife";
import { Gift } from "@phosphor-icons/react/dist/ssr/Gift";
import { ShieldWarning } from "@phosphor-icons/react/dist/ssr/ShieldWarning";
import { Ticket } from "@phosphor-icons/react/dist/ssr/Ticket";
import type { Icon } from "@phosphor-icons/react";

/**
 * The dashboard's colour-coded stat tiles.
 *
 * Server components — nothing needs state and hover is pure CSS, so none of this
 * ships JavaScript.
 *
 * WHY THE FILLS ARE DARK. Each tile is a gradient of its section's hue from
 * `components/nav/SectionIcon.tsx` — the same colour the sidebar uses for that
 * destination — stepped DOWN until white text clears WCAG AA. The light end of
 * every gradient was measured against #FFFFFF: worst is gold at 4.90:1, the rest
 * 5.06–7.67:1. The sidebar's lighter hues would have put ~2.6:1 text on screen.
 * If you retint a tile, re-measure the LIGHT end — that is the failing end.
 */

export interface ColourTile {
    label: string;
    /** Pre-formatted — a tile may hold "₹1,25,000" as readily as "8". */
    value: string;
    /** Optional second line, e.g. what the headline figure is made of. */
    sub?: string;
    href?: string;
    tone: keyof typeof TONES;
    icon: Icon;
    /** Doubles the tile's width and enlarges its figure — for the row's headline. */
    wide?: boolean;
}

/** [dark, light] gradient stops. Light end is the one white text has to clear. */
const TONES = {
    orange: ["#7A3D12", "#A85A1E"],
    gold: ["#6B4A08", "#94690F"],
    teal: ["#17423A", "#28675A"],
    blue: ["#2B3A66", "#3F5288"],
    red: ["#6B2015", "#96301F"],
    bronze: ["#5C4207", "#836009"],
    emerald: ["#0A4D37", "#0F6E4C"],
    rose: ["#6E2233", "#97304A"],
} as const;

export const TILE_ICONS = {
    Gift, Ticket, ForkKnife, Camera, ShieldWarning, Bank,
    HandHeart, Storefront, UsersThree, MapPin, Receipt,
};

export function StatTiles({ tiles }: { tiles: ColourTile[] }) {
    return (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((t) => {
                const [dark, light] = TONES[t.tone];
                const Glyph = t.icon;
                const body = (
                    <>
                        <div
                            aria-hidden
                            className="absolute -bottom-5 -right-4 text-white/[0.13]"
                        >
                            <Glyph weight="fill" size={92} />
                        </div>
                        <span className="absolute right-3.5 top-3.5 rounded-full bg-white/15 p-1.5">
                            <Glyph weight="bold" size={15} className="text-white" />
                        </span>
                        <p
                            className={`relative font-semibold leading-none tracking-tight text-white ${
                                t.wide ? "text-[34px]" : "text-[26px]"
                            }`}
                        >
                            {t.value}
                        </p>
                        <p className="relative mt-1.5 text-[13px] leading-snug text-white/85">
                            {t.label}
                            {t.sub && <span className="text-white/70"> &middot; {t.sub}</span>}
                        </p>
                    </>
                );
                const cls = `relative min-h-[112px] overflow-hidden rounded-2xl px-4 pb-4 pt-11 shadow-sm ${
                    t.wide ? "sm:col-span-3 lg:col-span-2" : ""
                }`;
                const style = { background: `linear-gradient(145deg, ${dark} 0%, ${light} 100%)` };

                return t.href ? (
                    <Link
                        key={t.label}
                        href={t.href}
                        style={style}
                        className={`${cls} block transition hover:brightness-110`}
                    >
                        {body}
                    </Link>
                ) : (
                    <div key={t.label} style={style} className={cls}>
                        {body}
                    </div>
                );
            })}
        </div>
    );
}
