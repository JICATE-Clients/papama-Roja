import type { ReactNode } from "react";

import Link from "next/link";
import { redirect } from "next/navigation";

import { AppUserProvider } from "@/components/auth/AppUserProvider";
import { BugReporterWrapper } from "@/components/bug-reporter-wrapper";
import { getAppUser } from "@/lib/auth";
import { isAdminConsoleRole } from "@/lib/permissions";

import { AdminBottomNav } from "./AdminBottomNav";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopBar } from "./AdminHeader";
import { ToastHost } from "./_ui";

/**
 * Shell for every /admin page. Server-side gate (defense beyond middleware,
 * which only checks "signed in?"):
 *   - not signed in        → redirect to /login
 *   - signed in, non-staff → Access Denied (no admin chrome leaked)
 *   - staff                → render the console, seeding AppUserProvider with the
 *     already-resolved user so client pages can gate actions via useCan().
 * Per-feature authorization still runs in each API route and in RLS.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
    const user = await getAppUser();

    if (!user) {
        redirect("/login?redirect=/admin");
    }

    if (!isAdminConsoleRole(user.role)) {
        return <AccessDenied role={user.role} />;
    }

    return (
        <AppUserProvider user={user}>
            <BugReporterWrapper>
                {/* `pa-app` re-points Tailwind's slate/white/green theme
                    variables to the shared console palette (see app/globals.css).
                    Every slate-* utility inside resolves through it, so all four
                    consoles retint from one place. */}
                <div className="pa-app pa-app-root min-h-screen">
                    <AdminSidebar />

                    {/* Cleared by the fixed sidebar on md+; full width below it,
                        where <AdminBottomNav/> takes over instead. */}
                    <div className="pa-admin-main">
                        <AdminTopBar />
                        {/* Mounted once here so every admin page's useToast() works
                            without a per-page <ToastHost> wrapper. */}
                        <ToastHost>
                            {/* Wider than the old max-w-6xl: the console is tables, and
                                a 1152px cap wasted a third of a modern display. */}
                            <main className="mx-auto max-w-[1600px] px-6 py-7 pb-24 md:px-8 md:pb-10">
                                {children}
                            </main>
                        </ToastHost>
                    </div>

                    <AdminBottomNav />
                </div>
            </BugReporterWrapper>
        </AppUserProvider>
    );
}

function AccessDenied({ role }: { role: string }) {
    return (
        <main className="pa-admin flex min-h-screen items-center justify-center bg-slate-50 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <h1 className="text-xl font-semibold text-slate-900">Access denied</h1>
                <p className="mt-2 text-sm text-slate-500">
                    The admin console is restricted to staff accounts. Your role
                    (<span className="font-medium text-slate-700">{role}</span>) does not
                    have access.
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
