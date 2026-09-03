"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type { Action, Feature } from "@/lib/permissions";

import { SectionIcon } from "@/components/nav/SectionIcon";
import { CommandPalette } from "./CommandPalette";

/**
 * Mobile-only bottom navigation bar (hidden md+). Four role-gated destinations
 * flank a center FAB that opens the "Jump to…" CommandPalette. The visible four
 * are picked from a fixed priority list: Home is always shown, the rest are
 * gated by useCan so a role only sees sections it can read — the server route
 * still enforces the matrix regardless. Active route is highlighted via
 * usePathname (exact for Home, prefix-match otherwise), matching AdminHeader.
 *
 * The bar recedes (translucent + blur) so the raised slate-900 FAB reads as the
 * single signature action; see docs/design/admin-bottom-nav.md.
 */

interface NavDest {
    href: string;
    label: string;
    /** Permission cell to gate on; omitted for the always-visible Home entry. */
    feature?: Feature;
    action?: Action;
}

// Priority order. Home first (ungated); the first 4 the role can access render.
const DESTINATIONS: NavDest[] = [
    { href: "/admin", label: "Home" },
    { href: "/admin/proofs", label: "Proofs", feature: "proof_of_service", action: "read" },
    { href: "/admin/settlements", label: "Settlements", feature: "vendor_settlement", action: "read" },
    { href: "/admin/tokens", label: "Tokens", feature: "token_generation", action: "read" },
    { href: "/admin/beneficiaries", label: "Beneficiaries", feature: "beneficiary_registration", action: "read" },
    { href: "/admin/vendors", label: "Vendors", feature: "vendor_management", action: "read" },
    { href: "/admin/fraud", label: "Fraud", feature: "fraud_monitoring", action: "read" },
];

export function AdminBottomNav() {
    const pathname = usePathname();
    const [paletteOpen, setPaletteOpen] = useState(false);

    // Call useCan for EVERY candidate, in a stable order, so hook order never
    // changes between renders. Home (no feature) is always allowed.
    const allowed = DESTINATIONS.map((d) =>
        // eslint-disable-next-line react-hooks/rules-of-hooks
        d.feature ? useCan(d.feature, d.action ?? "read") : true
    );

    // First four destinations the role can access become the visible items.
    const visible = DESTINATIONS.filter((_, i) => allowed[i]).slice(0, 4);
    const left = visible.slice(0, 2);
    const right = visible.slice(2, 4);

    return (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_3px_rgba(15,23,42,0.06)] backdrop-blur md:hidden">
            <div className="relative mx-auto flex h-14 max-w-md items-center justify-around px-2">
                {left.map((d) => (
                    <NavItem key={d.href} dest={d} pathname={pathname} />
                ))}

                {/* Reserve a center column so the four items stay evenly spaced
                    around the absolutely-positioned FAB. */}
                <div className="w-12 shrink-0" aria-hidden="true" />

                {right.map((d) => (
                    <NavItem key={d.href} dest={d} pathname={pathname} />
                ))}

                <button
                    type="button"
                    onClick={() => setPaletteOpen(true)}
                    aria-label="Jump to a section"
                    aria-haspopup="dialog"
                    aria-expanded={paletteOpen}
                    className="absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/25 ring-4 ring-white transition hover:bg-slate-700 active:scale-95"
                >
                    <SectionIcon name="search" size={20} />
                </button>
            </div>

            {/* Mounted only while open so each open starts with a fresh, empty
                search (no reset-in-effect) and the slide-up plays every time. */}
            {paletteOpen && (
                <CommandPalette open onClose={() => setPaletteOpen(false)} />
            )}
        </nav>
    );
}

/** A single bottom-nav destination: icon over a tiny label, active-aware. */
function NavItem({ dest, pathname }: { dest: NavDest; pathname: string }) {
    const active =
        dest.href === "/admin"
            ? pathname === "/admin"
            : pathname === dest.href || pathname.startsWith(dest.href + "/");
    return (
        <Link
            href={dest.href}
            aria-current={active ? "page" : undefined}
            className={`group flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition ${
                active ? "font-semibold text-slate-900" : "font-medium text-slate-400"
            }`}
        >
            {/* Active "pill" behind the icon — the clear active-tab indicator.
                Light slate tint so it reads as selected without competing with
                the dark FAB (the bar's single bold element). */}
            <span
                className={`flex h-6 items-center justify-center rounded-full px-4 transition-colors ${
                    active ? "bg-slate-100" : "bg-transparent group-active:bg-slate-100"
                }`}
            >
                <SectionIcon href={dest.href} size={20} />
            </span>
            <span>{dest.label}</span>
        </Link>
    );
}
