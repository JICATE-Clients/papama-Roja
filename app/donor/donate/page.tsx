"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/donor/Navbar";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { getCurrentDonorId } from "@/lib/donor/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { inr } from "@/lib/format";

const PAYMENT_METHODS = [
  // "Scan QR Code" hands off to the REAL UPI manual-QR flow (/donate/qr); the
  // others are the instant credit-purchase seam (card/netbanking provider is an
  // open item — recorded as a flagged mock until a gateway is procured).
  { id: "qr", name: "Scan & Pay (UPI QR)", icon: "📷" },
  { id: "upi", name: "UPI (GPay / PhonePe)", icon: "⚡" },
  { id: "card", name: "Credit / Debit Card", icon: "💳" },
  { id: "netbanking", name: "Net Banking", icon: "🏦" },
  { id: "bank_transfer", name: "Bank Transfer", icon: "📄" },
] as const;

const donateSchema = z.object({
  amount: z
    .number()
    .int("Amount must be a whole number")
    .min(1, "Donation amount must be greater than ₹0"),
  payment_method: z.enum(["upi", "qr", "card", "netbanking", "bank_transfer"]),
  is_anonymous: z.boolean(),
});

type DonateFormValues = z.infer<typeof donateSchema>;

export default function DonatePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DonateFormValues>({
    resolver: zodResolver(donateSchema),
    defaultValues: {
      amount: 250,
      payment_method: "upi",
      is_anonymous: false,
    },
  });

  const selectedAmount = watch("amount");
  const selectedPaymentMethod = watch("payment_method");

  const onSubmit = async (values: DonateFormValues) => {
    // "Scan & Pay (UPI QR)" is the REAL UPI manual-QR flow: hand off to
    // /donate/qr (which renders a live UPI QR and confirms the UTR) instead of
    // the instant mock create that fake-succeeds. Carry the chosen amount.
    if (values.payment_method === "qr") {
      router.push(`/donate/qr?amount=${values.amount}`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      // Anonymous → ungated guest donation (no session/credit); otherwise the
      // signed-in donor's credit purchase via the auth-gated route.
      const res = values.is_anonymous
        ? await ApiClient.createGuestDonation(values.amount, values.payment_method)
        : await ApiClient.createDonation(
            values.amount,
            values.payment_method,
            await getCurrentDonorId()
          );

      if (res.status === "success") {
        router.push(
          `/donor/payment-success?id=${res.donation_id}&amount=${res.amount}&method=${res.payment_method}&added=${res.credit_added}&balance=${res.credit_balance}&reached=${res.threshold_reached}&at=${res.created_at}`
        );
      } else {
        router.push(`/donor/payment-failed?error=API returned status: ${res.status}`);
      }
    } catch (error) {
      console.error("Donation creation error:", error);
      router.push(
        `/donor/payment-failed?error=${encodeURIComponent(
          error instanceof Error ? error.message : "Network error"
        )}`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const presetAmounts = [100, 250, 500, 1000];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 ">
      <Navbar />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xl md:p-10">
          {/* Header */}
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 ">
              Contribute Funds
            </span>
            <h1 className="mt-1 text-2xl sm:text-3xl font-medium tracking-tight text-zinc-900 ">
              Donate to Account
            </h1>
            <p className="mt-2 text-sm text-zinc-500 ">
              Add non-withdrawable credits to your account and convert them to food vouchers (tokens) for canteens.
            </p>
          </div>

          {errorMsg && (
            <div className="mt-6 rounded-xl bg-red-500/10 p-3.5 text-xs text-red-800 ">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
            {/* Amount Entry */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 ">
                Donation Amount (INR ₹)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-4 flex items-center text-xl font-semibold text-zinc-400">
                  ₹
                </span>
                <input
                  type="number"
                  placeholder="Enter custom amount"
                  className="h-14 w-full rounded-xl border border-zinc-200 pl-10 pr-4 text-lg font-semibold text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 "
                  {...register("amount", { valueAsNumber: true })}
                />
              </div>
              {errors.amount && (
                <p className="text-xs font-medium text-rose-500 mt-1">{errors.amount.message}</p>
              )}

              {/* Preset Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1.5 sm:grid-cols-4">
                {presetAmounts.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setValue("amount", amt, { shouldValidate: true })}
                    className={`rounded-xl py-2.5 text-xs font-semibold border transition ${
                      selectedAmount === amt
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700 "
                        : "border-zinc-200 bg-white hover:bg-zinc-50 "
                    }`}
                  >
                    {inr(amt)}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Methods */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 ">
                Select Payment Method
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {PAYMENT_METHODS.map((method) => {
                  const isSelected = selectedPaymentMethod === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setValue("payment_method", method.id, { shouldValidate: true })}
                      className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                        isSelected
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900 "
                          : "border-zinc-200 bg-white hover:bg-zinc-50 "
                      }`}
                    >
                      <span className="text-2xl">{method.icon}</span>
                      <div>
                        <p className="text-xs font-semibold">{method.name}</p>
                        <p className="text-[11px] text-zinc-400 font-medium">Secured Payment</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {errors.payment_method && (
                <p className="text-xs font-medium text-rose-500 mt-1">{errors.payment_method.message}</p>
              )}
            </div>

            {/* Anonymous Toggle (Guest Flow support) */}
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200/60 p-4 bg-zinc-50/30 ">
              <input
                type="checkbox"
                id="is_anonymous"
                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 "
                {...register("is_anonymous")}
              />
              <label htmlFor="is_anonymous" className="text-xs font-semibold text-zinc-700 cursor-pointer select-none">
                Donate anonymously (Guest flow)
              </label>
            </div>

            {/* Business Rule Disclaimers */}
            <div className="rounded-xl border border-zinc-200/60 bg-zinc-50/50 p-4 text-xs text-zinc-500 space-y-2">
              <div className="flex gap-2">
                <span className="text-emerald-500">✔</span>
                <p>
                  <strong>Threshold Rule:</strong> Every ₹50 of credits can be converted into 1 Food Token voucher.
                </p>
              </div>
              <div className="flex gap-2">
                <span className="text-rose-500">❌</span>
                <p>
                  <strong>Non-Withdrawable Credit Display:</strong> All donated funds are credited as non-withdrawable balance. You cannot withdraw deposited credits back to your bank account.
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || selectedAmount <= 0}
              className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 py-4 text-sm font-semibold text-white transition hover:from-emerald-700 hover:to-teal-600 shadow-lg shadow-emerald-600/20 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Initiating Payment Gateway...
                </span>
              ) : (
                `Donate ${inr(selectedAmount)} Now`
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
