"use client";

import Link from "next/link";

import { SectionIcon } from "@/components/nav/SectionIcon";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConsoleSidebar, type ConsoleNavItem } from "@/components/nav/ConsoleSidebar";
import { MobileTabBar } from "@/components/ui/MobileTabBar";
import { createClient } from "@/lib/supabase/client";

const NAV: ConsoleNavItem[] = [
  { href: "/volunteer", label: "Dashboard", exact: true },
  { href: "/volunteer/beneficiaries", label: "Register beneficiary" },
];

/**
 * Volunteer chrome.
 *
 * Desktop (md+): the same left sidebar as vendor and admin. Three links is
 * sparse for a 236px column, but a volunteer moving between consoles should
 * not have to relearn where navigation lives.
 *
 * Mobile: unchanged — slim top bar plus the bottom tab bar, with "Register
 * beneficiary" as the centre action.
 */
export function VolunteerHeader() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.push("/volunteer/login");
    router.refresh();
  }

  return (
    <>
      <ConsoleSidebar panel="volunteer" badge="Volunteer" home="/volunteer" items={NAV} />

      {/* Mobile only — the sidebar carries the brand and sign-out on md+. */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/volunteer" className="flex shrink-0 items-baseline gap-3 transition hover:opacity-80">
            <span className="text-xl font-extrabold tracking-tight text-[var(--app-accent)]">pApAmA</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Volunteer</span>
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

      {/* Mobile bottom bar: Register beneficiary (the core volunteer action) as
          the center FAB, with Home and Sign out flanking it. */}
      <MobileTabBar
        fab={{
          href: "/volunteer/beneficiaries",
          label: "Register beneficiary",
          icon: <SectionIcon href="/volunteer/beneficiaries" size={22} />,
        }}
        tabs={[
          { href: "/volunteer", label: "Home", icon: <SectionIcon href="/volunteer" size={22} /> },
          { label: "Sign out", icon: <SectionIcon name="signout" size={22} color="#7c7367" />, onClick: signOut },
        ]}
      />
    </>
  );
}
