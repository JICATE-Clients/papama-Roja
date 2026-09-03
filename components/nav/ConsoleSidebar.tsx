"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { SECTION_COLOR, SectionIcon } from "@/components/nav/SectionIcon";
import { createClient } from "@/lib/supabase/client";

/**
 * Desktop sidebar for the donor, vendor and volunteer consoles (md+).
 *
 * Admin got a sidebar because 26 sections cannot fit in a horizontal strip.
 * These two have 6 and 3, so the strip worked — the reason to switch is that
 * all three are operational consoles and looking like three different products
 * is its own cost, especially when the whole app gets reviewed side by side.
 *
 * Donor uses it too. That was a later call — the argument against was that a
 * sidebar reads as back-office furniture to a member of the public, and the
 * argument for was that four consoles looking like four products costs more.
 * Donor passes a `footer` so the running credit balance keeps a home.
 *
 * Mobile is untouched — every console keeps its bottom tab bar, which is what
 * ~98% of this product's traffic actually sees.
 *
 * Width lives in globals.css as --console-sidebar, read by both
 * `.pa-console-sidebar` here and `.pa-console-main` on the content column, so
 * the two cannot drift apart.
 */

export interface ConsoleNavItem {
    href: string;
    label: string;
    /** Match this href only exactly — for a console's index route. */
    exact?: boolean;
}

export function ConsoleSidebar({
    panel,
    badge,
    home,
    items,
    email,
    footer,
}: {
    panel: "donor" | "vendor" | "volunteer";
    /** Short word beside the wordmark, e.g. "Vendor". */
    badge: string;
    home: string;
    items: ConsoleNavItem[];
    email?: string | null;
    /** Optional block above sign-out — donor puts its credit balance here. */
    footer?: ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const [signingOut, setSigningOut] = useState(false);

    async function signOut() {
        setSigningOut(true);
        await createClient().auth.signOut();
        router.push("/login");
        router.refresh();
    }

    return (
        <aside className="pa-console-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200 bg-slate-50 md:flex">
            <div className="flex items-baseline gap-2 px-5 py-5">
                <Link
                    href={home}
                    className="text-xl font-extrabold tracking-tight text-[var(--app-accent)] transition hover:opacity-80"
                >
                    pApAmA
                </Link>
                <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    {badge}
                </span>
            </div>

            <nav className="pa-console-nav flex-1 overflow-y-auto px-3 pb-4">
                {items.map((item) => (
                    <SideLink key={item.href} item={item} pathname={pathname} />
                ))}
            </nav>

            <div className="border-t border-slate-200 p-3">
                {footer}
                {email && (
                    <p className="truncate px-3 pb-2 text-[11px] text-slate-400" title={email}>
                        {email}
                    </p>
                )}
                <button
                    onClick={signOut}
                    disabled={signingOut}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-200/60 disabled:opacity-60"
                >
                    <SectionIcon name="signout" size={18} color="#7c7367" />
                    {signingOut ? "Signing out…" : "Sign out"}
                </button>
            </div>
            {/* panel is read by callers for the accent; kept in the signature so
                a future per-panel tweak has somewhere to live */}
            <span hidden data-panel={panel} />
        </aside>
    );
}

function SideLink({ item, pathname }: { item: ConsoleNavItem; pathname: string }) {
    const active = item.exact
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(item.href + "/");
    return (
        <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] transition ${
                active
                    ? "bg-[var(--app-accent)] font-semibold text-white"
                    : "font-medium text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
            }`}
        >
            {/* Own hue normally; white on the active row so it stays legible
                against the solid highlight. */}
            <SectionIcon
                href={item.href}
                color={active ? "#ffffff" : SECTION_COLOR[item.href]}
                size={19}
            />
            {item.label}
        </Link>
    );
}
