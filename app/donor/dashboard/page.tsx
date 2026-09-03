"use client";

import Navbar from "@/components/donor/Navbar";
import DashboardOverview from "@/components/donor/DashboardOverview";
import { useDashboard } from "@/lib/donor/hooks/useDashboard";

export default function DashboardPage() {
  const { dashboard, tokens, loading, error, refetch } = useDashboard();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 ">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-zinc-600 mb-4">
              Failed to load dashboard: {error.message}
            </p>
            <button
              onClick={refetch}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : dashboard ? (
          <DashboardOverview dashboard={dashboard} tokens={tokens} />
        ) : (
          <div className="text-center py-12 text-zinc-500">
            No dashboard data available.
          </div>
        )}
      </main>
    </div>
  );
}
