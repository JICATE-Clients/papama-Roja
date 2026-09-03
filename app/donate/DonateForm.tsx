"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { DonationResponse } from "@/lib/donor/types/contract";
import { C } from "@/components/landing/theme";

/**
 * Guest donation checkout.
 *
 * Presentation only — the submit path, the Zod schema, the five payment
 * methods and the `qr` handoff to /donate/qr are unchanged from the original
 * dark-themed version. What changed is that the page now makes a case for
 * giving before it asks for money, and matches the public palette.
 *
 * `mealValueInr` is `standard_token_value` read from system_config by the
 * server component that renders this. It is nullable ON PURPOSE: when the key
 * is unset we hide the meal arithmetic rather than invent a rate, per the
 * project rule that a NULL config soft-skips its rule and is never guessed.
 */

const PAYMENT_METHODS = [
    // "Scan & Pay (UPI QR)" hands off to the REAL UPI manual-QR flow (/donate/qr);
    // the others are the instant guest-donation seam.
    //
    // `live` marks whether a real provider sits behind the method. Card /
    // netbanking / bank transfer are still a flagged mock pending procurement,
    // so they must NOT claim to be a secure gateway — see the note rendered
    // under the grid. Telling a donor their card is protected by a gateway that
    // does not exist yet is a claim this system cannot back.
    { id: "qr", name: "Scan & Pay", hint: "UPI QR code", icon: "📷", live: true },
    { id: "upi", name: "UPI", hint: "GPay / PhonePe", icon: "⚡", live: true },
    { id: "card", name: "Card", hint: "Credit or debit", icon: "💳", live: false },
    { id: "netbanking", name: "Net Banking", hint: "All major banks", icon: "🏦", live: false },
    { id: "bank_transfer", name: "Bank Transfer", hint: "NEFT / IMPS", icon: "📄", live: false },
] as const;

const guestDonateSchema = z.object({
    amount: z
        .number()
        .int("Amount must be a whole number")
        .min(1, "Donation amount must be greater than ₹0"),
    payment_method: z.enum(["upi", "qr", "card", "netbanking", "bank_transfer"]),
});

type GuestDonateFormValues = z.infer<typeof guestDonateSchema>;

const PRESETS = [50, 100, 250, 500];


export default function DonateForm({ mealValueInr }: { mealValueInr: number | null }) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [receipt, setReceipt] = useState<DonationResponse | null>(null);

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<GuestDonateFormValues>({
        resolver: zodResolver(guestDonateSchema),
        defaultValues: { amount: 100, payment_method: "upi" },
    });

    const selectedAmount = watch("amount");
    const selectedPaymentMethod = watch("payment_method");

    const meals =
        mealValueInr && mealValueInr > 0 && selectedAmount > 0
            ? Math.floor(selectedAmount / mealValueInr)
            : null;

    const onSubmit = async (values: GuestDonateFormValues) => {
        // "Scan & Pay (UPI QR)" is the REAL UPI manual-QR flow: hand off to
        // /donate/qr instead of the instant mock guest donation.
        if (values.payment_method === "qr") {
            router.push(`/donate/qr?amount=${values.amount}`);
            return;
        }

        setIsSubmitting(true);
        setErrorMsg(null);
        try {
            const res = await ApiClient.createGuestDonation(values.amount, values.payment_method);
            if (res.status === "success") {
                setReceipt(res);
            } else {
                setErrorMsg(`Transaction failed: ${res.status}`);
            }
        } catch (error) {
            console.error("Guest donation error:", error);
            setErrorMsg(
                error instanceof Error ? error.message : "Failed to verify transaction. Please try again."
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    /* ---------------------------------------------------------------- receipt */
    if (receipt) {
        return (
            <div style={{ maxWidth: 560, margin: "0 auto" }}>
                <div style={CARD}>
                    <div
                        style={{
                            width: 62,
                            height: 62,
                            borderRadius: 999,
                            background: C.accent,
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 22px",
                        }}
                    >
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                    </div>

                    <h1 style={{ fontSize: "clamp(24px, 5vw, 32px)", fontWeight: 800, letterSpacing: "-0.03em", color: C.ink, margin: 0, textAlign: "center", lineHeight: 1.1 }}>
                        {meals && meals > 0 ? (
                            <>That&rsquo;s {meals} {meals === 1 ? "meal" : "meals"} on the way.</>
                        ) : (
                            <>Thank you for your donation.</>
                        )}
                    </h1>
                    <p style={{ fontSize: 15, lineHeight: 1.6, color: C.inkSoft, textAlign: "center", margin: "14px auto 0", maxWidth: 400 }}>
                        Your ₹{receipt.amount} becomes food tokens — never cash, never withdrawable. A verified
                        vendor cooks against them, and every redemption is written to the public ledger.
                    </p>

                    <div style={{ marginTop: 32, border: `1px solid ${C.hairline}`, borderRadius: 16, overflow: "hidden", background: C.ivory }}>
                        <div style={{ padding: "13px 20px", borderBottom: `1px dashed ${C.hairline}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkFaint }}>
                                Guest receipt
                            </span>
                            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: C.inkFaint }}>
                                {receipt.donation_id.substring(0, 8)}
                            </span>
                        </div>
                        <div style={{ padding: "18px 20px", display: "grid", gap: 13 }}>
                            <ReceiptRow label="Amount" value={`₹${receipt.amount}`} strong />
                            <ReceiptRow label="Method" value={receipt.payment_method.replace(/_/g, " ")} />
                            <ReceiptRow label="Reference" value={receipt.donation_id} mono />
                            <ReceiptRow label="Processed" value={new Date(receipt.created_at).toLocaleString()} />
                        </div>
                    </div>

                    <div style={{ marginTop: 26, display: "grid", gap: 12 }}>
                        <button onClick={() => setReceipt(null)} style={{ ...PRIMARY_BTN, border: "none", cursor: "pointer" }}>
                            Give again
                        </button>
                        <Link href="/donor/signup" style={{ ...GHOST_BTN, textAlign: "center" }}>
                            Create an account to follow your tokens →
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    /* ------------------------------------------------------------------- form */
    return (
        <div className="pa-donate-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "clamp(32px, 5vw, 64px)", alignItems: "center" }}>
            {/* ---- the case for giving ---- */}
            <div className="pa-donate-left" style={{ position: "relative" }}>
                <div className="pa-donate-copy" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: C.accent, textTransform: "uppercase", marginBottom: 16 }}>
                    Guest donation · no account needed
                </div>

                <h1 className="pa-donate-copy" style={{ fontSize: "clamp(28px, 6vw, 48px)", fontWeight: 800, letterSpacing: "-0.035em", color: C.ink, margin: 0, lineHeight: 1.05 }}>
                    {meals && meals > 0 ? (
                        <>
                            ₹{selectedAmount} feeds{" "}
                            <span style={{ color: C.accent }}>
                                {meals} {meals === 1 ? "person" : "people"}
                            </span>{" "}
                            today.
                        </>
                    ) : (
                        <>Give a meal.<br />Follow it home.</>
                    )}
                </h1>

                <p className="pa-donate-aside" style={{ fontSize: "clamp(14px, 1.9vw, 15.5px)", lineHeight: 1.6, color: C.inkSoft, margin: "14px 0 0", maxWidth: 420 }}>
                    Your gift never becomes cash. It becomes a tamper-proof food token, redeemed at a vendor we
                    verified, logged where anyone can check it.
                </p>

                {/* Ripple. One gift spreading outward — the rings restart whenever
                    the amount changes, which is the only interaction on this page
                    worth rewarding. Keyed on the amount so React remounts them. */}
                <div className="pa-ripple-stage" aria-hidden="true">
                    <div key={selectedAmount} className="pa-ripple-rings">
                        <span className="pa-ring" />
                        <span className="pa-ring" />
                        <span className="pa-ring" />
                    </div>
                    <div className="pa-ripple-core">
                        <span style={{ fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 800, letterSpacing: "-0.03em", color: C.ink, lineHeight: 1 }}>
                            ₹{selectedAmount || 0}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.accent, marginTop: 7 }}>
                            {meals && meals > 0 ? `${meals} ${meals === 1 ? "meal" : "meals"}` : "your gift"}
                        </span>
                    </div>
                </div>

                <ul className="pa-donate-aside" style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "grid", gap: 9 }}>
                    {[
                        ["Never cash", "Tokens carry food value only and can't be withdrawn."],
                        ["Verified vendors", "Every kitchen is checked before it can redeem."],
                        ["Public ledger", "Each meal served is recorded and auditable."],
                    ].map(([t, d]) => (
                        <li key={t} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                            <span style={{ width: 6, height: 6, borderRadius: 999, background: C.accent, marginTop: 7, flexShrink: 0 }} />
                            <span style={{ fontSize: 14, lineHeight: 1.5, color: C.inkSoft }}>
                                <strong style={{ color: C.ink, fontWeight: 700 }}>{t}.</strong> {d}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>

            {/* ---- the form ---- */}
            <div style={CARD}>
                {errorMsg && (
                    <div role="alert" style={{ marginBottom: 20, borderRadius: 12, background: "#FCECE8", border: "1px solid #F0C4B8", color: "#8C2F14", padding: "12px 14px", fontSize: 13.5, lineHeight: 1.5 }}>
                        {errorMsg}
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)}>
                    <label htmlFor="amount" style={LABEL}>Amount</label>
                    <div style={{ position: "relative", marginBottom: 12 }}>
                        <span style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", fontSize: 18, fontWeight: 700, color: C.inkFaint }}>₹</span>
                        <input
                            id="amount"
                            type="number"
                            inputMode="numeric"
                            placeholder="Enter an amount"
                            style={{ width: "100%", height: 50, borderRadius: 14, border: `1px solid ${C.hairline}`, background: C.ivory, paddingLeft: 40, paddingRight: 16, fontSize: 20, fontWeight: 700, color: C.ink, outlineColor: C.accent }}
                            {...register("amount", { valueAsNumber: true })}
                        />
                    </div>
                    {errors.amount && <p style={ERR}>{errors.amount.message}</p>}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7, marginBottom: 14 }}>
                        {PRESETS.map((amt) => {
                            const on = selectedAmount === amt;
                            return (
                                <button
                                    key={amt}
                                    type="button"
                                    onClick={() => setValue("amount", amt, { shouldValidate: true })}
                                    aria-pressed={on}
                                    style={{
                                        minHeight: 44,
                                        borderRadius: 999,
                                        cursor: "pointer",
                                        fontSize: 14,
                                        fontWeight: 700,
                                        border: `1px solid ${on ? C.accent : C.hairline}`,
                                        background: on ? C.accent : "transparent",
                                        color: on ? "#fff" : C.ink,
                                        transition: "background .18s ease, color .18s ease, border-color .18s ease",
                                    }}
                                >
                                    ₹{amt}
                                </button>
                            );
                        })}
                    </div>

                    <span style={LABEL}>Pay with</span>
                    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                        {PAYMENT_METHODS.map((m) => {
                            const on = selectedPaymentMethod === m.id;
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setValue("payment_method", m.id, { shouldValidate: true })}
                                    aria-pressed={on}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        textAlign: "left",
                                        minHeight: 46,
                                        padding: "6px 14px",
                                        borderRadius: 12,
                                        cursor: "pointer",
                                        border: `1px solid ${on ? C.accent : C.hairline}`,
                                        background: on ? C.accentSoft : "transparent",
                                        transition: "background .18s ease, border-color .18s ease",
                                    }}
                                >
                                    <span style={{ fontSize: 17, lineHeight: 1 }} aria-hidden="true">{m.icon}</span>
                                    <span style={{ flex: 1 }}>
                                        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: C.ink }}>{m.name}</span>
                                        <span style={{ display: "block", fontSize: 11.5, color: C.inkSoft, marginTop: 1 }}>{m.hint}</span>
                                    </span>
                                    {!m.live && (
                                        <span title="No payment provider connected yet" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#8C6A16", background: "#FBEFD3", border: "1px solid #EBD7A6", borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap" }}>
                                            Coming soon
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <p style={{ fontSize: 12, lineHeight: 1.55, color: C.inkSoft, margin: "10px 0 0" }}>
                        As a guest you won&rsquo;t get a dashboard.{" "}
                        <Link href="/donor/signup" style={{ color: C.accent, fontWeight: 700 }}>Create an account</Link>{" "}
                        to follow your tokens to the plate.
                    </p>

                    <button
                        type="submit"
                        disabled={isSubmitting || !selectedAmount || selectedAmount <= 0}
                        style={{
                            ...PRIMARY_BTN,
                            marginTop: 14,
                            border: "none",
                            cursor: isSubmitting ? "wait" : "pointer",
                            opacity: isSubmitting || !selectedAmount || selectedAmount <= 0 ? 0.55 : 1,
                        }}
                    >
                        {isSubmitting ? "Processing…" : `Give ₹${selectedAmount || 0}`}
                    </button>

                    <p className="pa-donate-trust" style={{ margin: "9px 0 0", textAlign: "center", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.02em", color: C.inkFaint }}>
                        Never cash · Verified vendors · Public ledger
                    </p>

                    <div style={{ textAlign: "center", marginTop: 4 }}>
                        <Link href="/donate/qr" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, padding: "0 12px", fontSize: 13.5, fontWeight: 600, color: C.inkSoft, textDecoration: "underline", textUnderlineOffset: 3 }}>
                            Prefer a static QR code?
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ styles */

const CARD = {
    background: "linear-gradient(160deg, #FFFDF8 0%, #FBF2E2 100%)",
    border: `1px solid ${C.hairline}`,
    borderRadius: "clamp(18px, 4vw, 26px)",
    padding: "clamp(14px, 3vw, 26px)",
    boxShadow: "0 18px 46px rgba(28,43,36,0.09)",
} as const;

const LABEL = {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: C.inkFaint,
    marginBottom: 10,
} as const;

const PRIMARY_BTN = {
    display: "block",
    width: "100%",
    minHeight: 54,
    borderRadius: 999,
    background: C.accent,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    textDecoration: "none",
    lineHeight: "54px",
    textAlign: "center",
} as const;

const GHOST_BTN = {
    display: "block",
    width: "100%",
    minHeight: 48,
    lineHeight: "48px",
    borderRadius: 999,
    border: `1px solid ${C.hairline}`,
    color: C.ink,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
} as const;

const ERR = { fontSize: 13, color: "#B03A1A", margin: "-4px 0 12px" } as const;

function ReceiptRow({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
            <span style={{ fontSize: 13, color: C.inkFaint }}>{label}</span>
            <span
                style={{
                    fontSize: strong ? 16 : 13,
                    fontWeight: strong ? 800 : 600,
                    color: C.ink,
                    fontFamily: mono ? "ui-monospace, monospace" : undefined,
                    wordBreak: mono ? "break-all" : undefined,
                    textAlign: "right",
                    textTransform: mono ? undefined : "capitalize",
                }}
            >
                {value}
            </span>
        </div>
    );
}
