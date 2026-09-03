"use client";

import Link from "next/link";

import { SECTION_COLOR, SectionIcon } from "@/components/nav/SectionIcon";
import { ConsoleSidebar, type ConsoleNavItem } from "@/components/nav/ConsoleSidebar";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { NotificationItem } from "@/lib/donor/types/contract";
import { signOutDonor } from "@/lib/donor/auth";
import { createClient } from "@/lib/supabase/client";
import { inr, shortDateTime } from "@/lib/format";
import { Bell } from "@phosphor-icons/react/dist/ssr/Bell";
import { HandCoins } from "@phosphor-icons/react/dist/ssr/HandCoins";
import { SignOut } from "@phosphor-icons/react/dist/ssr/SignOut";
import { Wallet } from "@phosphor-icons/react/dist/ssr/Wallet";

// Initials from the signed-in email (e.g. "roja.sundharam@x" → "RS").
function initialsFromEmail(email: string | null): string {
  if (!email) return "D";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = (parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2)) || "D";
  return letters.toUpperCase();
}


/**
 * Sidebar destinations. Notifications and Profile are here because on desktop
 * the bell dropdown and the avatar are gone with the top bar; both already have
 * real pages behind them.
 */
const SIDE_NAV: ConsoleNavItem[] = [
  { href: "/donor/dashboard", label: "Dashboard" },
  { href: "/donor/donate", label: "Donate" },
  { href: "/donor/credit", label: "Credit" },
  { href: "/donor/tokens", label: "Tokens" },
  { href: "/donor/history", label: "History" },
  { href: "/donor/impact", label: "Impact" },
  { href: "/donor/notifications", label: "Notifications" },
  { href: "/donor/profile", label: "Profile" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [credits, setCredits] = useState<{ credit_balance: number } | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  async function loadNavbarData() {
    try {
      const [creditsRes, notificationsRes] = await Promise.all([
        ApiClient.getCredits(),
        ApiClient.getNotifications(),
      ]);
      setCredits(creditsRes);
      setNotifications(notificationsRes.notifications);
    } catch (error) {
      console.warn("Error loading navbar details:", error);
    }
  }

  useEffect(() => {
    loadNavbarData();

    // Resolve the signed-in donor's email for the initials avatar.
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => setEmail(null));

    // Set up custom event listener for real-time visual updates
    window.addEventListener("papama_data_update", loadNavbarData);
    return () => {
      window.removeEventListener("papama_data_update", loadNavbarData);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleSignOut = async () => {
    await signOutDonor();
    router.push("/donor/login");
    router.refresh();
  };

  const handleNotificationClick = async (id: string) => {
    await ApiClient.markNotificationRead(id);
    setNotifications((current) =>
      current.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    // Dispatch event to update other components that might show notification count or details
    window.dispatchEvent(new Event("papama_data_update"));
  };

  const navItems = [
    { name: "Dashboard", href: "/donor/dashboard", icon: "home" as const },
    { name: "Donate", href: "/donor/donate", icon: "heart" as const },
    { name: "Credit", href: "/donor/credit", icon: "wallet" as const },
    { name: "Tokens", href: "/donor/tokens", icon: "ticket" as const },
    { name: "History", href: "/donor/history", icon: "clock" as const },
    { name: "Impact", href: "/donor/impact", icon: "impact" as const },
  ];

  // Mobile bottom-bar tabs that flank the raised Donate FAB. Credit is omitted
  // here because it's already reachable from the header balance chip; Donate is
  // promoted to the center FAB as the primary donor action.
  const mobileTabs = [
    { name: "Dashboard", href: "/donor/dashboard", icon: "home" as const },
    { name: "Tokens", href: "/donor/tokens", icon: "ticket" as const },
    { name: "History", href: "/donor/history", icon: "clock" as const },
    { name: "Impact", href: "/donor/impact", icon: "impact" as const },
  ];

  const renderMobileTab = (item: (typeof mobileTabs)[number]) => {
    const isActive = pathname === item.href;
    return (
      <Link
        key={item.name}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className="flex flex-1 flex-col items-center gap-1"
      >
        <span
          className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200 ${
            isActive
              ? "bg-emerald-100 text-emerald-700 "
              : "text-zinc-500 "
          }`}
        >
          <SectionIcon href={item.href} size={20} color={isActive ? "#0B7A55" : SECTION_COLOR[item.href]} />
        </span>
        <span
          className={`text-[11px] font-medium leading-none transition-colors duration-200 ${
            isActive
              ? "text-emerald-700 "
              : "text-zinc-500 "
          }`}
        >
          {item.name}
        </span>
      </Link>
    );
  };

  return (
    <>
    <ConsoleSidebar
      panel="donor"
      badge="Donor"
      home="/donor/dashboard"
      items={SIDE_NAV}
      email={email}
      footer={
        credits ? (
          <Link
            href="/donor/credit"
            className="mb-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider">Balance</span>
            <span className="font-semibold">{inr(credits.credit_balance)}</span>
          </Link>
        ) : null
      }
    />

    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/60 bg-white/80 backdrop-blur-md md:hidden">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Link href="/donor/dashboard" className="flex items-center gap-1.5">
            <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-xl font-semibold tracking-tight text-transparent ">
              pApAmA
            </span>
            <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-700 sm:inline-block">
              Donor Portal
            </span>
          </Link>
        </div>


        {/* Right Side: Credits & Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {credits !== null && (
            <Link
              href="/donor/credit"
              className="flex items-center gap-1.5 rounded-full border border-emerald-200/60 bg-emerald-50/50 px-3 py-1 text-sm font-medium text-emerald-700 hover:bg-emerald-50 "
            >
              <Wallet size={16} weight="duotone" aria-hidden />
              <span>
                <span className="hidden sm:inline">Balance: </span>{inr(credits.credit_balance)}
              </span>
            </Link>
          )}

          {/* Notifications Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsNotificationsOpen((open) => !open)}
              aria-label="Donor notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 active:scale-[.98] "
            >
              <Bell size={20} weight="duotone" aria-hidden />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-semibold leading-none text-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl ">
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 ">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 ">
                      Donor Notifications
                    </p>
                    <p className="text-[11px] font-medium text-zinc-400">
                      Credit alerts and token activity
                    </p>
                  </div>
                  <Link
                    href="/donor/notifications"
                    onClick={() => setIsNotificationsOpen(false)}
                    className="text-[11px] font-semibold text-emerald-600 hover:underline"
                  >
                    View All
                  </Link>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 ">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`px-4 py-3 transition hover:bg-zinc-50 ${
                          !notification.read
                            ? "bg-emerald-50/20 "
                            : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            handleNotificationClick(notification.id);
                            setIsNotificationsOpen(false);
                          }}
                          className="flex w-full gap-3 text-left"
                        >
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                              !notification.read
                                ? "bg-emerald-500"
                                : "bg-zinc-300 "
                            }`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold text-zinc-900 ">
                              {notification.title}
                            </span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500 ">
                              {notification.body}
                            </span>
                            {notification.type === "redemption" && notification.meta && (
                              <span className="mt-1 block rounded bg-zinc-50 px-2 py-1 text-[11px] text-zinc-500 ">
                                Served {notification.meta.meal_info} at {notification.meta.vendor_name} ({notification.meta.location})
                              </span>
                            )}
                            <span className="mt-1 block text-[11px] font-medium text-zinc-400">
                              {shortDateTime(notification.created_at)}
                            </span>
                          </span>
                        </button>
                        {notification.type === "redemption" && (
                          <Link
                            href="/donor/donate"
                            onClick={() => setIsNotificationsOpen(false)}
                            className="mt-1.5 ml-5 inline-block text-[11px] font-semibold text-emerald-600 hover:underline"
                          >
                            Donate again
                          </Link>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="px-4 py-8 text-center text-xs text-zinc-400">
                      No notifications yet.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile + sign out */}
          <div className="flex items-center gap-2 pl-1">
            <Link
              href="/donor/profile"
              aria-label="Your profile"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white ring-2 ring-emerald-500/20 "
            >
              {initialsFromEmail(email)}
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 p-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 active:scale-[.98] sm:px-3 sm:py-1"
            >
              <SignOut size={16} weight="duotone" className="sm:hidden" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </div>
    </header>

      {/* Mobile bottom tab bar — fixed to the bottom for a native, thumb-reachable feel.
          Donate is promoted to a raised center FAB (the primary donor action);
          four sections flank it. Rendered OUTSIDE <header> so the header's
          backdrop-blur doesn't become its containing block (which would pin it to
          the header instead of the viewport). Safe-area padding keeps it clear of
          the iPhone home indicator. */}
      <nav
        aria-label="Donor sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="relative mx-auto flex h-14 max-w-md items-center justify-around px-1">
          {mobileTabs.slice(0, 2).map(renderMobileTab)}

          {/* Reserve the center column so the four tabs stay evenly spaced around
              the raised Donate FAB. */}
          <div className="w-12 shrink-0" aria-hidden="true" />

          {mobileTabs.slice(2).map(renderMobileTab)}

          {/* Center FAB — Donate (the primary donor action). */}
          <Link
            href="/donor/donate"
            aria-label="Donate"
            aria-current={pathname === "/donor/donate" ? "page" : undefined}
            className="absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-4 ring-white transition hover:bg-emerald-700 active:scale-95 "
          >
            {/* Solid, balanced heart — reads cleanly centered on the filled FAB
                (the stroked nav heart looked squeezed/clipped at this size). */}
            <HandCoins size={24} weight="fill" aria-hidden />
          </Link>
        </div>
      </nav>
    </>
  );
}
