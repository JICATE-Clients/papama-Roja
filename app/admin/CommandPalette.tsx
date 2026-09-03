"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";

import { SectionIcon } from "@/components/nav/SectionIcon";
import { ADMIN_SECTIONS } from "./adminSections";
import { X } from "@phosphor-icons/react/dist/ssr/X";

/**
 * Mobile bottom-sheet "Jump to…" command palette opened from the bottom-nav FAB.
 * Lists a Home entry plus the role-gated ADMIN_SECTIONS; a search box filters by
 * title/navLabel/description. Esc + backdrop click close it and body scroll is
 * locked while open — mirroring the DetailDrawer pattern in _ui.tsx. The slide-up
 * is suppressed under prefers-reduced-motion.
 *
 * useCan is called once per section in a stable order (before the early return)
 * so gating and the empty-state count never violate the Rules of Hooks.
 */

interface Entry {
    href: string;
    title: string;
    description?: string;
    /** Short label matched by search + shown when distinct from title. */
    navLabel?: string;
}

const HOME_ENTRY: Entry = {
    href: "/admin",
    title: "Home",
    description: "Console overview and section directory.",
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
    const pathname = usePathname();
    const [search, setSearch] = useState("");

    // Gate every section in a stable order (hooks must run unconditionally and
    // in the same order each render — hence before the `!open` early return).
    const allowed = ADMIN_SECTIONS.map((s) =>
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useCan(s.feature, s.action)
    );

    // Esc to close + lock body scroll while open (copied from DetailDrawer).
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, onClose]);

    if (!open) return null;

    const term = search.trim().toLowerCase();

    const entries: Entry[] = [
        HOME_ENTRY,
        ...ADMIN_SECTIONS.filter((_, i) => allowed[i]).map((s) => ({
            href: s.href,
            title: s.title,
            description: s.description,
            navLabel: s.navLabel,
        })),
    ];

    const matches = entries.filter((e) => {
        if (!term) return true;
        return `${e.title} ${e.navLabel ?? ""} ${e.description ?? ""}`.toLowerCase().includes(term);
    });

    const isActive = (href: string) =>
        href === "/admin"
            ? pathname === "/admin"
            : pathname === href || pathname.startsWith(href + "/");

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col justify-end md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Jump to a section"
        >
            <style>{`
@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.cp-sheet{animation:sheetUp .22s ease-out}
@media (prefers-reduced-motion:reduce){.cp-sheet{animation:none}}
`}</style>
            {/* Backdrop */}
            <button
                type="button"
                aria-label="Close jump menu"
                onClick={onClose}
                className="absolute inset-0 h-full w-full cursor-default bg-slate-900/30"
            />
            {/* Sheet */}
            <div className="cp-sheet relative flex max-h-[80vh] flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.18)]">
                {/* Grab handle + header */}
                <div className="shrink-0 px-5 pt-3 pb-2">
                    <div className="mx-auto h-1 w-9 rounded-full bg-slate-300" />
                    <div className="mt-3 flex items-center justify-between">
                        <h2 className="text-base font-semibold text-slate-900">Jump to a section</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                            <X size={20} weight="bold" aria-hidden />
                        </button>
                    </div>
                    {/* Search */}
                    <div className="relative mt-3">
                        <SectionIcon
                            name="search"
                            size={17}
                            color="#a4998a"
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                        />
                        <input
                            type="search"
                            autoFocus
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search sections…"
                            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                        />
                    </div>
                </div>

                {/* Section list */}
                <ul className="flex-1 overflow-y-auto px-2 pb-3">
                    {matches.length === 0 ? (
                        <li className="px-5 py-8 text-center text-sm text-slate-500">
                            No sections match “{search.trim()}”.
                        </li>
                    ) : (
                        matches.map((entry) => {
                            const current = isActive(entry.href);
                            return (
                                <li key={entry.href}>
                                    <Link
                                        href={entry.href}
                                        onClick={onClose}
                                        aria-current={current ? "page" : undefined}
                                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition active:bg-slate-100 aria-[current=page]:bg-slate-50"
                                    >
                                        <span
                                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                                current
                                                    ? "bg-slate-900 text-white"
                                                    : "bg-slate-100 text-slate-600"
                                            }`}
                                        >
                                            <SectionIcon href={entry.href} size={20} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-slate-900">
                                                {entry.title}
                                            </span>
                                            {entry.description && (
                                                <span className="mt-0.5 block truncate text-xs text-slate-500">
                                                    {entry.description}
                                                </span>
                                            )}
                                        </span>
                                        <SectionIcon
                                            name="chevron"
                                            size={15}
                                            color="#c3b79f"
                                            className="shrink-0"
                                        />
                                    </Link>
                                </li>
                            );
                        })
                    )}
                </ul>
            </div>
        </div>
    );
}
