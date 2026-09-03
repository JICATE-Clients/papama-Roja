"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { BugReporterWrapper } from "@/components/bug-reporter-wrapper";

/**
 * Reserves space at the bottom on mobile so page content is never hidden behind
 * the fixed bottom tab bar (see components/donor/Navbar.tsx). On md+ the bar is
 * hidden, so the padding is removed.
 *
 * BugReporterWrapper self-gates on auth, so the widget shows only for signed-in
 * donors (not on /donor/login or /donor/signup).
 *
 * The padding and the sidebar offset are skipped on the two pre-auth routes. Every donor page renders
 * <Navbar/> itself EXCEPT login and signup — the visitor has no session yet, so
 * there is no bar to clear. Applying it there reserved 64px of dead space and
 * pushed both pages past one screen on a phone.
 */
const NO_CHROME = new Set(["/donor/login", "/donor/signup"]);

export default function DonorLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    // The same two routes render no <Navbar/>, so they get neither the bottom
    // tab bar nor the desktop sidebar — and must not reserve space for either.
    const hasChrome = !NO_CHROME.has(pathname);

    return (
        <BugReporterWrapper>
            <div
                className={`pa-app pa-app-donor pa-app-root min-h-screen ${
                    hasChrome ? "pa-console-main pb-16 md:pb-0" : ""
                }`}
            >
                {children}
            </div>
        </BugReporterWrapper>
    );
}
