import type { ReactNode } from "react";

import Link from "next/link";

import { BugReporterWrapper } from "@/components/bug-reporter-wrapper";
import { getAppUser } from "@/lib/auth";

import { VendorHeader } from "./VendorHeader";

/**
 * Shell for every /vendor page.
 *   - not signed in       → render the page bare (this layout wraps the auth
 *     pages /vendor/login + /vendor/register too; the proxy already redirects
 *     unauthenticated hits to the GATED /vendor pages to login, so a null user
 *     here means we are ON an auth page — redirecting would loop it onto itself)
 *   - signed in, not vendor → "not a vendor account" notice (no vendor chrome)
 *   - vendor              → render the app with the header
 * Per-feature authorization still runs in each API route and in RLS.
 */
export default async function VendorLayout({ children }: { children: ReactNode }) {
  const user = await getAppUser();

  if (!user) {
    return <>{children}</>;
  }

  if (user.role !== "vendor") {
    return <NotVendor role={user.role} />;
  }

  return (
    <BugReporterWrapper>
      <div className="pa-app pa-app-vendor pa-app-root min-h-screen">
        <VendorHeader />
        {/* pb-24 on mobile clears the fixed bottom bar; removed on md+. */}
        <div className="pa-console-main">
          <main className="mx-auto max-w-7xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8 md:pb-8">{children}</main>
        </div>
      </div>
    </BugReporterWrapper>
  );
}

function NotVendor({ role }: { role: string }) {
  return (
    <main className="pa-app pa-app-vendor flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Not a vendor account yet</h1>
        <p className="mt-2 text-sm text-slate-500">
          You’re signed in as <span className="font-medium text-slate-700">{role}</span>, which isn’t a
          vendor account. If you run a kitchen and want to serve meals, apply to become a vendor.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/vendor/register"
            className="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Apply here
          </Link>
          <Link
            href="/"
            className="inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
