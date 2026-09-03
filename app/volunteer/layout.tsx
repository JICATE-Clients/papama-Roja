import type { ReactNode } from "react";

import Link from "next/link";

import { BugReporterWrapper } from "@/components/bug-reporter-wrapper";
import { getAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { VolunteerHeader } from "./VolunteerHeader";

/**
 * Shell for every /volunteer page.
 *   - not signed in           → render the page bare (this layout also wraps
 *     /volunteer/login; the proxy already redirects unauthenticated hits to the
 *     GATED pages, so a null user here means we are on the login page —
 *     redirecting would loop it onto itself)
 *   - signed in, not volunteer → "not a volunteer account" notice (no chrome)
 *   - volunteer               → render the app with the header
 * Per-feature authorization still runs in each API route and in RLS.
 */
export default async function VolunteerLayout({ children }: { children: ReactNode }) {
  const user = await getAppUser();

  if (!user) {
    return <>{children}</>;
  }

  if (user.role !== "volunteer") {
    return <NotVolunteer role={user.role} />;
  }

  // A volunteer must be APPROVED before using the app. Self-registered accounts
  // start 'pending'; an admin approves (→active) or rejects (→rejected) them.
  const admin = createAdminClient();
  const { data: vol } = await admin
    .from("volunteers")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  const status = (vol?.status as string | undefined) ?? "pending";
  if (status !== "active") {
    return <AwaitingApproval status={status} />;
  }

  return (
    <BugReporterWrapper>
      <div className="pa-app pa-app-volunteer pa-app-root min-h-screen">
        <VolunteerHeader />
        {/* pb-24 on mobile clears the fixed bottom bar; removed on md+. */}
        <div className="pa-console-main">
          <main className="mx-auto max-w-7xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8 md:pb-8">{children}</main>
        </div>
      </div>
    </BugReporterWrapper>
  );
}

function AwaitingApproval({ status }: { status: string }) {
  const rejected = status === "rejected";
  return (
    <main className="pa-app pa-app-volunteer flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          {rejected ? "Application not approved" : "Application received"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {rejected ? (
            <>
              Your volunteer application was not approved. If you think this is a
              mistake, please contact the pApAmA team.
            </>
          ) : (
            <>
              Thanks for registering! An admin needs to approve your volunteer
              account before you can hold and distribute tokens. You&apos;ll be able
              to request tokens here as soon as you&apos;re approved.
            </>
          )}
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}

function NotVolunteer({ role }: { role: string }) {
  return (
    <main className="pa-app pa-app-volunteer flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Not a volunteer account</h1>
        <p className="mt-2 text-sm text-slate-500">
          The volunteer app is restricted to volunteer accounts. Your role
          (<span className="font-medium text-slate-700">{role}</span>) does not have access.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
