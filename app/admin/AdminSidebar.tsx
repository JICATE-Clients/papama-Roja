"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useAppUser } from "@/components/auth/AppUserProvider";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";

import { ADMIN_GROUPS, ADMIN_SECTIONS, type AdminGroup } from "./adminSections";
import { SECTION_COLOR, SectionIcon } from "@/components/nav/SectionIcon";

/**
 * Desktop sidebar navigation (md+).
 *
 * Replaces the horizontal nav strip, which held all 25 sections in one
 * scrolling row — the scrollbar under the header was the most dated thing in
 * the console, and it made any section past ~14 effectively undiscoverable.
 *
 * Permissions are resolved from the context user with the pure `can()` rather
 * than a `useCan()` per link: 25 hook calls inside a map would break the rules
 * of hooks, and it also lets a group check its own visibility before rendering
 * so a vendor_manager never sees an empty "Money" heading. The server route
 * still enforces the matrix regardless — this gating is cosmetic.
 *
 * Mobile keeps <AdminBottomNav/> and its command palette; a 25-item sidebar is
 * the wrong shape for a phone.
 */

/*
 * The sidebar width lives in app/globals.css as --console-sidebar, read by
 * .pa-admin-sidebar (this element) and .pa-admin-main (the content column) —
 * and by the vendor/volunteer equivalents, which now use the same column.
 * Keeping it in CSS is what stops them from drifting apart.
 */

export function AdminSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useAppUser();
    const [signingOut, setSigningOut] = useState(false);

    async function signOut() {
        setSigningOut(true);
        await createClient().auth.signOut();
        router.push("/login");
        router.refresh();
    }

    const allowed = (group: AdminGroup) =>
        ADMIN_SECTIONS.filter(
            (s) => s.group === group && user && can(user.role, s.feature, s.action)
        );

    return (
        <aside
            className="pa-admin-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200 bg-slate-50 md:flex"
        >
            <div className="flex items-baseline gap-2 px-5 py-5">
                <Link
                    href="/admin"
                    className="text-xl font-extrabold tracking-tight text-[#0B7A55] transition hover:opacity-80"
                >
                    pApAmA
                </Link>
                <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Admin
                </span>
            </div>

            <nav className="pa-admin-nav flex-1 overflow-y-auto px-3 pb-4">
                <SideLink href="/admin" label="Dashboard" pathname={pathname} exact />

                {ADMIN_GROUPS.map((group) => {
                    const sections = allowed(group);
                    if (sections.length === 0) return null;
                    return (
                        <div key={group} className="mt-5">
                            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                {group}
                            </p>
                            {sections.map((s) => (
                                <SideLink
                                    key={s.href}
                                    href={s.href}
                                    label={s.navLabel ?? s.title}
                                    pathname={pathname}
                                />
                            ))}
                        </div>
                    );
                })}
            </nav>

            <div className="border-t border-slate-200 p-3">
                {user && (
                    <p className="truncate px-3 pb-2 text-[11px] text-slate-400" title={user.email ?? undefined}>
                        {user.email}
                    </p>
                )}
                <button
                    onClick={signOut}
                    disabled={signingOut}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-200/60 disabled:opacity-60"
                >
                    {signingOut ? "Signing out…" : "Sign out"}
                </button>
            </div>
        </aside>
    );
}

function SideLink({
    href,
    label,
    pathname,
    exact = false,
}: {
    href: string;
    label: string;
    pathname: string;
    exact?: boolean;
}) {
    const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
    return (
        <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[13.5px] transition ${
                active
                    ? "bg-[#0B7A55] font-semibold text-white"
                    : "font-medium text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
            }`}
        >
            {/* Own hue normally; white on the active row so it stays legible
                against the solid highlight. */}
            <SectionIcon href={href} color={active ? "#ffffff" : SECTION_COLOR[href]} size={19} />
            {label}
        </Link>
    );
}
