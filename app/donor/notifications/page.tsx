"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/donor/Navbar";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { NotificationItem } from "@/lib/donor/types/contract";
import { shortDateTime } from "@/lib/format";

const NOTIF_ICONS = {
  donation_success: { icon: "💳", color: "bg-emerald-50 text-emerald-600 border-emerald-100 " },
  threshold: { icon: "🚀", color: "bg-blue-50 text-blue-600 border-blue-100 " },
  token_generated: { icon: "🎫", color: "bg-teal-50 text-teal-600 border-teal-100 " },
  redemption: { icon: "🍲", color: "bg-amber-50 text-amber-600 border-amber-100 " },
  thank_you: { icon: "✉️", color: "bg-purple-50 text-purple-600 border-purple-100 " },
  meal_photo: { icon: "📷", color: "bg-rose-50 text-rose-600 border-rose-100 " },
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadNotifications() {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.getNotifications();
      setNotifications(res.notifications);
    } catch (err) {
      console.error("Error loading notifications:", err);
      setError(err instanceof Error ? err.message : "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();

    // Listen for custom background events
    window.addEventListener("papama_data_update", loadNotifications);
    return () => {
      window.removeEventListener("papama_data_update", loadNotifications);
    };
  }, []);

  const handleMarkAsRead = async (id: string) => {
    await ApiClient.markNotificationRead(id);
    setNotifications((current) =>
      current.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    window.dispatchEvent(new Event("papama_data_update"));
  };

  const handleMarkAllAsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => ApiClient.markNotificationRead(n.id)));
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));
    window.dispatchEvent(new Event("papama_data_update"));
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 ">
      <Navbar />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-zinc-900 ">
              Notification Center
            </h1>
            <p className="mt-1.5 text-sm text-zinc-500 ">
              Track token generation, credit balance thresholds, and meal redemption receipts in real-time.
            </p>
          </div>

          {notifications.some((n) => !n.read) && (
            <button
              onClick={handleMarkAllAsRead}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition active:scale-[.98] self-start sm:self-center "
            >
              Mark All as Read
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="mt-8 space-y-4">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200/80 ">
              <span className="text-3xl">⚠️</span>
              <h3 className="mt-4 text-sm font-semibold text-zinc-900 ">
                Couldn&apos;t load notifications
              </h3>
              <p className="mt-1 text-xs text-zinc-500">{error}</p>
              <button
                onClick={loadNotifications}
                className="mt-4 rounded-lg bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-[.98]"
              >
                Retry
              </button>
            </div>
          ) : notifications.length > 0 ? (
            <div className="rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-sm divide-y divide-zinc-200/60 ">
              {notifications.map((notif) => {
                const config = NOTIF_ICONS[notif.type] || { icon: "🔔", color: "bg-zinc-50 text-zinc-600" };
                return (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-4 p-5 transition-colors relative ${
                      !notif.read ? "bg-emerald-500/5" : ""
                    }`}
                  >
                    {/* Unread indicator */}
                    {!notif.read && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                    )}

                    {/* Icon block */}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-xl ${config.color}`}>
                      {config.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs font-semibold text-zinc-900 ">
                          {notif.title}
                        </span>
                        <span className="text-[11px] text-zinc-400 font-medium shrink-0">
                          {shortDateTime(notif.created_at)}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-zinc-500 leading-relaxed">
                        {notif.body}
                      </p>

                      {/* Metadata block for Redemptions and verified meal photos */}
                      {(notif.type === "redemption" || notif.type === "meal_photo") && notif.meta && (
                        <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 text-[11px] font-medium text-zinc-600 space-y-1.5">
                          {/* Verified meal photo (addon2 A5) — shown once proof is approved */}
                          {notif.meta.meal_photo_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={notif.meta.meal_photo_url}
                              alt="Photo of the meal you funded"
                              className="mb-2 h-40 w-full rounded-lg object-cover"
                            />
                          )}
                          {notif.meta.meal_info && (
                            <p className="flex justify-between">
                              <span className="text-zinc-400">Meal Redeemed:</span>
                              <strong className="text-zinc-800 ">{notif.meta.meal_info}</strong>
                            </p>
                          )}
                          <p className="flex justify-between gap-2">
                            <span className="text-zinc-400 shrink-0">Scan Location:</span>
                            <span className="text-right break-words">{notif.meta.vendor_name} ({notif.meta.location})</span>
                          </p>
                          {notif.meta.beneficiary_category && (
                            <p className="flex justify-between">
                              <span className="text-zinc-400">Beneficiary Category:</span>
                              <span className="uppercase text-[11px] font-bold text-amber-600">{notif.meta.beneficiary_category.replace("_", " ")}</span>
                            </p>
                          )}
                          {notif.meta.token_reference && (
                            <p className="flex justify-between">
                              <span className="text-zinc-400">Token Reference:</span>
                              <span className="font-mono text-[11px] text-zinc-500">{notif.meta.token_reference}</span>
                            </p>
                          )}
                          <p className="flex justify-between text-[11px]">
                            <span className="text-zinc-400 font-normal">Scan Timestamp:</span>
                            <span className="font-mono text-zinc-500 font-normal">{shortDateTime(notif.meta.time || notif.created_at)}</span>
                          </p>
                        </div>
                      )}

                      {/* Re-donate prompt on redemption + meal-photo notifications */}
                      {(notif.type === "redemption" || notif.type === "meal_photo") && (
                        <Link
                          href="/donor/donate"
                          className="text-[11px] font-semibold text-emerald-600 hover:underline block pt-1"
                        >
                          Donate again
                        </Link>
                      )}

                      {/* Individual Read Action */}
                      {!notif.read && (
                        <button
                          onClick={() => handleMarkAsRead(notif.id)}
                          className="text-[11px] font-semibold text-emerald-600 hover:underline block pt-1"
                        >
                          Mark as Read
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200/80 ">
              <span className="text-3xl">🔔</span>
              <h3 className="mt-4 text-sm font-semibold text-zinc-900 ">
                No Notifications Found
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Your notifications registry is empty.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
