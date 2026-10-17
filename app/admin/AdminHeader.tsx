"use client";

import Link from "next/link";

import { LogoLockup } from "@/components/brand/Logo";

/**
 * Mobile-only brand row (`md:hidden`).
 *
 * The brand, the 25-link nav strip and sign-out all moved into <AdminSidebar/>,
 * which is itself `hidden md:flex`. Below that breakpoint there is no sidebar —
 * navigation is <AdminBottomNav/> — so without this the console had nothing
 * identifying it at the top of the page.
 */
export function AdminTopBar() {
    return (
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/85 backdrop-blur-md md:hidden">
            <div className="flex items-center justify-between px-5 py-3">
                <Link href="/admin" className="flex items-baseline gap-2">
                    <LogoLockup height={24} textClassName="text-lg font-extrabold tracking-tight text-[#1C4122]" priority />
                    <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        Admin
                    </span>
                </Link>
            </div>
        </header>
    );
}
