"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { C } from "@/components/landing/theme";
import {
    PublicShell,
    CARD,
    LABEL,
    INPUT,
    PRIMARY_BTN,
    GHOST_BTN,
    ERROR_BOX,
    presetStyle,
    ReceiptRow,
    SuccessMark,
} from "@/components/public/PublicShell";

/**
 * Public UPI QR donation — REAL manual-confirm flow (no fake confirm).
 *
 * Step 1: pick an amount → backend generates a UPI deep-link QR (15-min expiry)
 *         and a PENDING upi_qr_payments row.
 * Step 2: donor scans + pays with any UPI app, then enters the UTR.
 * Step 3: backend validates the pending row, enforces expiry, flips it to PAID,
 *         and credits a donor-less donation whose payment_ref is the real UTR.
 *
 * Restyled onto the shared public shell; the three-step flow, both Zod schemas
 * and the two ApiClient calls are unchanged.
 */

const amountSchema = z.object({
    amount: z.number().int("Amount must be a whole number").min(1, "Amount must be greater than ₹0"),
});
type AmountValues = z.infer<typeof amountSchema>;

const utrSchema = z.object({
    refNumber: z
        .string()
        .trim()
        .min(6, "Enter the UTR / reference number from your UPI app (min 6 characters)"),
});
type UtrValues = z.infer<typeof utrSchema>;

interface QrSession {
    qrCode: string;
    upiString: string;
    transactionRef: string;
    expiresAt: string;
    amount: number;
    merchantName: string;
    upiId: string;
    usingPlaceholder: boolean;
}

interface PaidReceipt {
    donation_id: string;
    amount: number;
    utr: string;
    at: string;
}

function useCountdown(expiresAt: string | null): number {
    const [secondsLeft, setSecondsLeft] = useState(0);
    useEffect(() => {
        if (!expiresAt) return;
        const tick = () => {
            const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
            setSecondsLeft(left);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [expiresAt]);
    return secondsLeft;
}

const PRESETS = [50, 100, 250, 500];

export default function GuestQRDonatePage() {
    const [session, setSession] = useState<QrSession | null>(null);
    const [receipt, setReceipt] = useState<PaidReceipt | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const secondsLeft = useCountdown(session?.expiresAt ?? null);
    const isExpired = session != null && !receipt && secondsLeft <= 0;

    const amountForm = useForm<AmountValues>({
        resolver: zodResolver(amountSchema),
        defaultValues: { amount: 100 },
    });
    const utrForm = useForm<UtrValues>({
        resolver: zodResolver(utrSchema),
        defaultValues: { refNumber: "" },
    });

    const watchAmount = amountForm.watch("amount");

    const onGenerate = async (values: AmountValues) => {
        setIsGenerating(true);
        setErrorMsg(null);
        try {
            const s = await ApiClient.generateUpiQr(values.amount);
            setSession(s);
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : "Could not generate the payment QR.");
        } finally {
            setIsGenerating(false);
        }
    };

    const onConfirm = async (values: UtrValues) => {
        if (!session) return;
        setIsConfirming(true);
        setErrorMsg(null);
        try {
            const res = await ApiClient.confirmUpiQr(session.transactionRef, values.refNumber.trim());
            setReceipt({
                donation_id: res.donation_id,
                amount: res.amount,
                utr: values.refNumber.trim(),
                at: new Date().toISOString(),
            });
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : "Could not verify the payment reference.");
        } finally {
            setIsConfirming(false);
        }
    };

    const resetAll = useCallback(() => {
        setSession(null);
        setReceipt(null);
        setErrorMsg(null);
        utrForm.reset({ refNumber: "" });
        amountForm.reset({ amount: 100 });
    }, [amountForm, utrForm]);

    const mmss = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(
        secondsLeft % 60
    ).padStart(2, "0")}`;

    return (
        <PublicShell rightLink={{ href: "/donate", label: "← Other ways to give" }} maxWidth={520}>
            {/* ------------------------------------------------------- receipt */}
            {receipt ? (
                <div style={CARD}>
                    <SuccessMark />
                    <h1 style={H1}>Payment confirmed.</h1>
                    <p style={SUB}>
                        Your ₹{receipt.amount} is recorded against UTR {receipt.utr}. It becomes food tokens —
                        never cash — redeemable only at a verified vendor.
                    </p>

                    <div style={RECEIPT_BOX}>
                        <div style={RECEIPT_HEAD}>
                            <span style={RECEIPT_HEAD_LABEL}>UPI receipt</span>
                            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: C.inkFaint }}>
                                {receipt.donation_id.substring(0, 8)}
                            </span>
                        </div>
                        <div style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
                            <ReceiptRow label="Amount" value={`₹${receipt.amount}`} strong />
                            <ReceiptRow label="UTR" value={receipt.utr} mono />
                            <ReceiptRow label="Status" value="Paid" />
                            <ReceiptRow label="Processed" value={new Date(receipt.at).toLocaleString()} />
                        </div>
                    </div>

                    <div style={{ marginTop: 22, display: "grid", gap: 10 }}>
                        <button onClick={resetAll} style={PRIMARY_BTN}>Give again</button>
                        <Link href="/donor/signup" style={GHOST_BTN}>
                            Create an account to follow your tokens →
                        </Link>
                    </div>
                </div>
            ) : !session ? (
                /* ------------------------------------------- step 1: amount */
                <div style={CARD}>
                    <h1 style={H1}>Pay by UPI QR</h1>
                    <p style={SUB}>
                        Pick an amount and we&rsquo;ll generate a QR you can scan with GPay, PhonePe, Paytm or BHIM.
                    </p>

                    {errorMsg && <p role="alert" style={{ ...ERROR_BOX, marginTop: 18 }}>{errorMsg}</p>}

                    <form onSubmit={amountForm.handleSubmit(onGenerate)} style={{ marginTop: 22 }}>
                        <label htmlFor="qr-amount" style={LABEL}>Amount</label>
                        <div style={{ position: "relative", marginBottom: 12 }}>
                            <span style={RUPEE}>₹</span>
                            <input
                                id="qr-amount"
                                type="number"
                                inputMode="numeric"
                                placeholder="Enter an amount"
                                style={{ ...INPUT, paddingLeft: 38, fontSize: 19, fontWeight: 700 }}
                                {...amountForm.register("amount", { valueAsNumber: true })}
                            />
                        </div>
                        {amountForm.formState.errors.amount && (
                            <p style={ERR}>{amountForm.formState.errors.amount.message}</p>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7, marginBottom: 20 }}>
                            {PRESETS.map((amt) => (
                                <button
                                    key={amt}
                                    type="button"
                                    aria-pressed={watchAmount === amt}
                                    onClick={() => amountForm.setValue("amount", amt, { shouldValidate: true })}
                                    style={presetStyle(watchAmount === amt)}
                                >
                                    ₹{amt}
                                </button>
                            ))}
                        </div>

                        <button
                            type="submit"
                            disabled={isGenerating || !watchAmount || watchAmount <= 0}
                            style={{ ...PRIMARY_BTN, opacity: isGenerating || !watchAmount || watchAmount <= 0 ? 0.55 : 1, cursor: isGenerating ? "wait" : "pointer" }}
                        >
                            {isGenerating ? "Generating QR…" : "Generate UPI QR"}
                        </button>
                    </form>
                </div>
            ) : (
                /* --------------------------------- step 2: scan and confirm */
                <div style={CARD}>
                    <h1 style={H1}>Scan &amp; pay ₹{session.amount}</h1>
                    <p style={SUB}>Pay with any UPI app, then enter the UTR from its success screen.</p>

                    <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div
                            style={{
                                background: "#fff",
                                padding: 12,
                                borderRadius: 18,
                                border: `1px solid ${C.hairline}`,
                                opacity: isExpired ? 0.28 : 1,
                                transition: "opacity .3s ease",
                            }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element -- data: URI QR from the API */}
                            <img src={session.qrCode} alt="UPI donation QR code" style={{ width: 176, height: 176, display: "block" }} />
                        </div>

                        <p style={{ margin: "12px 0 0", fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>{session.upiId}</p>

                        <p style={{ margin: "6px 0 0", fontSize: 13, fontWeight: 600, color: isExpired ? "#B03A1A" : C.inkSoft }}>
                            {isExpired ? (
                                "QR expired"
                            ) : (
                                <>
                                    Expires in{" "}
                                    <span style={{ fontFamily: "ui-monospace, monospace", color: C.accent, fontWeight: 700 }}>{mmss}</span>
                                </>
                            )}
                        </p>

                        {session.usingPlaceholder && (
                            <p style={WARN}>
                                Demo VPA — a real merchant VPA (<code>NEXT_PUBLIC_UPI_VPA</code>) must be configured
                                before this can take live payments.
                            </p>
                        )}
                    </div>

                    {errorMsg && <p role="alert" style={{ ...ERROR_BOX, marginTop: 18 }}>{errorMsg}</p>}

                    {isExpired ? (
                        <button onClick={resetAll} style={{ ...PRIMARY_BTN, marginTop: 18 }}>Start a new payment</button>
                    ) : (
                        <form onSubmit={utrForm.handleSubmit(onConfirm)} style={{ marginTop: 20 }}>
                            <label htmlFor="qr-utr" style={LABEL}>UTR / reference number</label>
                            <input
                                id="qr-utr"
                                type="text"
                                inputMode="numeric"
                                placeholder="e.g. 614089025112"
                                style={{ ...INPUT, fontFamily: "ui-monospace, monospace", fontSize: 14.5 }}
                                {...utrForm.register("refNumber")}
                            />
                            {utrForm.formState.errors.refNumber && (
                                <p style={ERR}>{utrForm.formState.errors.refNumber.message}</p>
                            )}
                            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: C.inkSoft, margin: "9px 0 16px" }}>
                                The UTR is the 12-digit reference on your UPI app&rsquo;s success screen.
                            </p>

                            <button
                                type="submit"
                                disabled={isConfirming}
                                style={{ ...PRIMARY_BTN, opacity: isConfirming ? 0.55 : 1, cursor: isConfirming ? "wait" : "pointer" }}
                            >
                                {isConfirming ? "Confirming…" : "I've paid — confirm donation"}
                            </button>

                            <button type="button" onClick={resetAll} style={{ ...GHOST_BTN, marginTop: 10 }}>
                                Cancel / change amount
                            </button>
                        </form>
                    )}
                </div>
            )}
        </PublicShell>
    );
}

/* ------------------------------------------------------------------ styles */

const H1 = {
    fontSize: "clamp(23px, 5vw, 30px)",
    fontWeight: 800,
    letterSpacing: "-0.03em",
    color: C.ink,
    margin: 0,
    lineHeight: 1.12,
    textAlign: "center",
} as const;

const SUB = {
    fontSize: 14.5,
    lineHeight: 1.6,
    color: C.inkSoft,
    textAlign: "center",
    margin: "12px auto 0",
    maxWidth: 380,
} as const;

const RUPEE = {
    position: "absolute",
    left: 16,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: 17,
    fontWeight: 700,
    color: C.inkFaint,
} as const;

const ERR = { fontSize: 13, color: "#B03A1A", margin: "-4px 0 12px" } as const;

const RECEIPT_BOX = {
    marginTop: 24,
    border: `1px solid ${C.hairline}`,
    borderRadius: 15,
    overflow: "hidden",
    background: C.ivory,
} as const;

const RECEIPT_HEAD = {
    padding: "12px 18px",
    borderBottom: `1px dashed ${C.hairline}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
} as const;

const RECEIPT_HEAD_LABEL = {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: C.inkFaint,
} as const;

const WARN = {
    margin: "14px 0 0",
    maxWidth: 340,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 1.55,
    fontWeight: 600,
    color: "#8C6A16",
    background: "#FBEFD3",
    border: "1px solid #EBD7A6",
    borderRadius: 10,
    padding: "9px 12px",
} as const;
