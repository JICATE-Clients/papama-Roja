"use client";

/**
 * Shared icon set for the signed-in navigation surfaces (the admin sidebar, the
 * mobile bottom bar, and the "Jump to…" command palette). Keying icons by
 * section href in one place guarantees every surface renders the same glyph for
 * the same destination.
 *
 * Backed by @phosphor-icons/react at the `duotone` weight — a soft under-shape
 * plus a solid accent, in one hue per destination. This replaced a hand-rolled
 * set: 25 hand-drawn glyphs read as unfinished line art at 18px, because they
 * tried to be literal (a storefront, a gauge) where the size only supports
 * abstraction. A drawn-by-professionals set is worth the one dependency.
 *
 * Icons are imported ONE BY ONE from `/dist/ssr/<Name>`, never from the package
 * root. The root re-exports ~3,000 icons; importing from it pulls the lot into
 * the bundle. The `ssr` build also renders without a client boundary, so server
 * components can use these directly.
 */

import type { Icon } from "@phosphor-icons/react";

import { Bank } from "@phosphor-icons/react/dist/ssr/Bank";
import { BellRinging } from "@phosphor-icons/react/dist/ssr/BellRinging";
import { Briefcase } from "@phosphor-icons/react/dist/ssr/Briefcase";
import { Buildings } from "@phosphor-icons/react/dist/ssr/Buildings";
import { Camera } from "@phosphor-icons/react/dist/ssr/Camera";
import { ChartBar } from "@phosphor-icons/react/dist/ssr/ChartBar";
import { ChartLineUp } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import { ChatCircleDots } from "@phosphor-icons/react/dist/ssr/ChatCircleDots";
import { ClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { Envelope } from "@phosphor-icons/react/dist/ssr/Envelope";
import { FileText } from "@phosphor-icons/react/dist/ssr/FileText";
import { ForkKnife } from "@phosphor-icons/react/dist/ssr/ForkKnife";
import { Gauge } from "@phosphor-icons/react/dist/ssr/Gauge";
import { ArrowUUpLeft } from "@phosphor-icons/react/dist/ssr/ArrowUUpLeft";
import { BookOpenText } from "@phosphor-icons/react/dist/ssr/BookOpenText";
import { Megaphone } from "@phosphor-icons/react/dist/ssr/Megaphone";
import { Gift } from "@phosphor-icons/react/dist/ssr/Gift";
import { GraduationCap } from "@phosphor-icons/react/dist/ssr/GraduationCap";
import { HandHeart } from "@phosphor-icons/react/dist/ssr/HandHeart";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { Pulse } from "@phosphor-icons/react/dist/ssr/Pulse";
import { Scales } from "@phosphor-icons/react/dist/ssr/Scales";
import { ShieldWarning } from "@phosphor-icons/react/dist/ssr/ShieldWarning";
import { SlidersHorizontal } from "@phosphor-icons/react/dist/ssr/SlidersHorizontal";
import { SquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { Star } from "@phosphor-icons/react/dist/ssr/Star";
import { Storefront } from "@phosphor-icons/react/dist/ssr/Storefront";
import { Ticket } from "@phosphor-icons/react/dist/ssr/Ticket";
import { UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";

// --- also used by the donor / vendor / volunteer navs -----------------------
import { CalendarCheck } from "@phosphor-icons/react/dist/ssr/CalendarCheck";
import { ChartDonut } from "@phosphor-icons/react/dist/ssr/ChartDonut";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { HandCoins } from "@phosphor-icons/react/dist/ssr/HandCoins";
import { House } from "@phosphor-icons/react/dist/ssr/House";
import { QrCode } from "@phosphor-icons/react/dist/ssr/QrCode";
import { Receipt } from "@phosphor-icons/react/dist/ssr/Receipt";
import { SignOut } from "@phosphor-icons/react/dist/ssr/SignOut";
import { UserCircle } from "@phosphor-icons/react/dist/ssr/UserCircle";
import { UserPlus } from "@phosphor-icons/react/dist/ssr/UserPlus";
import { Wallet } from "@phosphor-icons/react/dist/ssr/Wallet";

/** Named glyphs, for callers that want a specific icon rather than a section's. */
const GLYPHS: Record<string, Icon> = {
    home: House,
    grid: SquaresFour,
    search: MagnifyingGlass,
    chevron: CaretRight,
    signout: SignOut,
    // vendor
    scan: QrCode,
    redemptions: Receipt,
    menu: ForkKnife,
    availability: CalendarCheck,
    settlements: Bank,
    profile: UserCircle,
    // volunteer
    register: UserPlus,
    // donor
    heart: HandCoins,
    wallet: Wallet,
    ticket: Ticket,
    clock: ClockCounterClockwise,
    impact: ChartDonut,
};

/**
 * Section href → Phosphor icon.
 *
 * Covers all four consoles. Every ADMIN_SECTIONS href must appear here, and the
 * donor / vendor / volunteer destinations sit alongside them so the four navs
 * can never drift into using different glyphs for the same idea — a token is a
 * Ticket whether an admin or a donor is looking at it.
 */
const HREF_ICON: Record<string, Icon> = {
    "/admin": SquaresFour,

    // People
    "/admin/vendors": Storefront,
    "/admin/beneficiaries": UsersThree,
    "/admin/beneficiary-registrations": ClipboardText,
    "/admin/volunteers": HandHeart,
    "/admin/ngo-partners": Buildings,
    "/admin/institutions": GraduationCap,

    // Money
    "/admin/donations": Gift,
    "/admin/refunds": ArrowUUpLeft,
    "/admin/ledgers": BookOpenText,
    "/admin/campaigns": Megaphone,
    "/admin/tokens": Ticket,
    "/admin/settlements": Bank,
    "/admin/settlement-audit": Scales,
    "/admin/csr": Briefcase,

    // Operations
    "/admin/vendor-menus": ForkKnife,
    "/admin/vendor-capacity": Gauge,
    "/admin/meal-windows": Clock,
    "/admin/scheduled-reminders": CalendarCheck,
    "/admin/proofs": Camera,
    "/admin/emergency": BellRinging,
    "/admin/volunteer-activity": Pulse,

    // Oversight
    "/admin/fraud": ShieldWarning,
    "/admin/complaints": ChatCircleDots,
    "/admin/vendor-feedback": Star,
    "/admin/audit-logs": FileText,
    "/admin/reports": ChartBar,
    "/admin/analytics": ChartLineUp,

    // Setup
    "/admin/system-config": SlidersHorizontal,
    "/admin/notification-templates": Envelope,

    // ── Donor ──────────────────────────────────────────────────────────────
    "/donor/dashboard": House,
    "/donor/donate": HandCoins,
    "/donor/credit": Wallet,
    "/donor/tokens": Ticket,
    "/donor/history": ClockCounterClockwise,
    "/donor/impact": ChartDonut,
    "/donor/profile": UserCircle,
    "/donor/notifications": BellRinging,
    "/donor/csr": Briefcase,

    // ── Vendor ─────────────────────────────────────────────────────────────
    "/vendor": House,
    "/vendor/scan": QrCode,
    "/vendor/redemptions": Receipt,
    "/vendor/menu": ForkKnife,
    "/vendor/availability": CalendarCheck,
    "/vendor/settlements": Bank,
    "/vendor/profile": UserCircle,

    // ── Volunteer ──────────────────────────────────────────────────────────
    "/volunteer": House,
    "/volunteer/beneficiaries": UserPlus,
};

/**
 * One hue per destination, so the sidebar reads as a column of distinct marks
 * rather than one shape repeated.
 *
 * Muted rather than neon: 25 saturated icons fight each other and fight the
 * content. Hues run in families that follow the sidebar groups — People greens,
 * Money ambers, Operations teals and blues, Oversight reds and purples, Setup
 * warm neutrals — so the grouping still reads even though every item is
 * individually coloured.
 */
export const SECTION_COLOR: Record<string, string> = {
    "/admin": "#5B6B63",

    "/admin/vendors": "#0B7A55",
    "/admin/beneficiaries": "#2F8F6B",
    "/admin/beneficiary-registrations": "#3E9E86",
    "/admin/volunteers": "#E05C6E",
    "/admin/ngo-partners": "#4A8FA8",
    "/admin/institutions": "#3D7EA6",

    "/admin/donations": "#E0803A",
    "/admin/refunds": "#C06A46",
    "/admin/ledgers": "#8A6E2F",
    "/admin/campaigns": "#B5762A",
    "/admin/tokens": "#C98A15",
    "/admin/settlements": "#B8860B",
    "/admin/settlement-audit": "#A6791F",
    "/admin/csr": "#9C6B3C",

    "/admin/vendor-menus": "#2F7F70",
    "/admin/vendor-capacity": "#3B8C9E",
    "/admin/meal-windows": "#4E8DB5",
    "/admin/scheduled-reminders": "#5C86BC",
    "/admin/proofs": "#5A7FC0",
    "/admin/emergency": "#D4643C",
    "/admin/volunteer-activity": "#6B79C4",

    "/admin/fraud": "#C2412A",
    "/admin/complaints": "#B8455F",
    "/admin/vendor-feedback": "#D19A1E",
    "/admin/audit-logs": "#7A6AA8",
    "/admin/reports": "#9052A8",
    "/admin/analytics": "#A8479A",

    "/admin/system-config": "#7A6A52",
    "/admin/notification-templates": "#8A7355",

    // Donor — turmeric family, matching --app-accent for that console
    "/donor/dashboard": "#5B6B63",
    "/donor/donate": "#C98A15",
    "/donor/credit": "#B8860B",
    "/donor/tokens": "#E0803A",
    "/donor/history": "#9C6B3C",
    "/donor/impact": "#0B7A55",
    "/donor/profile": "#7A6A52",
    "/donor/notifications": "#D4643C",
    "/donor/csr": "#8A7355",

    // Vendor — chilli family
    "/vendor": "#5B6B63",
    "/vendor/scan": "#C2542A",
    "/vendor/redemptions": "#D4643C",
    "/vendor/menu": "#2F7F70",
    "/vendor/availability": "#4E8DB5",
    "/vendor/settlements": "#B8860B",
    "/vendor/profile": "#7A6A52",

    // Volunteer — teal family
    "/volunteer": "#5B6B63",
    "/volunteer/beneficiaries": "#2F7F70",
};

export const NEUTRAL_TINT = "#5B6B63";

/**
 * Renders the duotone glyph for a destination.
 *
 * `color` defaults to the destination's own hue; pass one explicitly (e.g.
 * white on an active row) to override. Unknown hrefs fall back to the grid
 * glyph so a nav item is never empty.
 */
export function SectionIcon({
    href,
    name,
    color,
    size = 20,
    className,
}: {
    href?: string;
    name?: string;
    color?: string;
    size?: number;
    className?: string;
}) {
    const Icon = (name ? GLYPHS[name] : undefined) ?? (href ? HREF_ICON[href] : undefined) ?? SquaresFour;
    const fill = color ?? (href ? SECTION_COLOR[href] : undefined) ?? NEUTRAL_TINT;

    return <Icon size={size} color={fill} weight="duotone" className={className} />;
}
