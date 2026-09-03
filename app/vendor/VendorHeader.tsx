"use client";

import Link from "next/link";

import { SectionIcon } from "@/components/nav/SectionIcon";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConsoleSidebar, type ConsoleNavItem } from "@/components/nav/ConsoleSidebar";
import { MobileTabBar } from "@/components/ui/MobileTabBar";
import { createClient } from "@/lib/supabase/client";

const NAV: ConsoleNavItem[] = [
  { href: "/vendor", label: "Dashboard", exact: true },
  { href: "/vendor/scan", label: "Scan" },
  { href: "/vendor/redemptions", label: "Redemptions" },
  { href: "/vendor/menu", label: "Menu" },
  { href: "/vendor/availability", label: "Availability" },
  { href: "/vendor/settlements", label: "Settlements" },
  { href: "/vendor/profile", label: "Profile" },
];

/**
 * Vendor chrome.
 *
 * Desktop (md+): a left sidebar, matching admin — both are operational
 * consoles, and three staff tools that each look different is a cost of its
 * own when the whole app gets reviewed side by side.
 *
 * Mobile: unchanged — a slim top bar for the wordmark and sign-out, plus the
 * bottom tab bar with Scan as the centre action. ~98% of traffic is phones, so
 * the phone layout is the one that must not regress; the sidebar is desktop
 * only and never renders here.
 */
export function VendorHeader() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.push("/vendor/login");
    router.refresh();
  }

  return (
    <>
      <ConsoleSidebar panel="vendor" badge="Vendor" home="/vendor" items={NAV} />

      {/* Mobile only — the sidebar carries the brand and sign-out on md+. */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/vendor" className="flex shrink-0 items-baseline gap-3 transition hover:opacity-80">
            <span className="text-xl font-extrabold tracking-tight text-[var(--app-accent)]">pApAmA</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Vendor</span>
          </Link>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 active:scale-[.98] disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      {/* Mobile bottom bar: Scan (the core vendor action) as the center FAB. */}
      <MobileTabBar
        fab={{ href: "/vendor/scan", label: "Scan", icon: <SectionIcon href="/vendor/scan" size={22} /> }}
        tabs={[
          { href: "/vendor/redemptions", label: "Redemptions", icon: <SectionIcon href="/vendor/redemptions" size={22} /> },
          { href: "/vendor/availability", label: "Hours", icon: <SectionIcon href="/vendor/availability" size={22} /> },
          { href: "/vendor/settlements", label: "Settle", icon: <SectionIcon href="/vendor/settlements" size={22} /> },
          { href: "/vendor/profile", label: "Profile", icon: <SectionIcon href="/vendor/profile" size={22} /> },
        ]}
      />
    </>
  );
}
