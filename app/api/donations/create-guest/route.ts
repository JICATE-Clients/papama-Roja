import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { recordDonation } from "@/app/api/_lib/recordDonation";
import { ensureGuestPoolDonor } from "@/lib/donations/guest-pool";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/donations/create-guest — UNGATED guest / no-account donation.
 *
 * The public donate flow (/donate, /donate/qr) and the donor "Donate
 * anonymously" toggle have no session, so they cannot use the auth-gated
 * /api/donations/create (which 401s and ignores any body donor_id). This route
 * runs on the SERVICE-ROLE client and attributes the gift to the system Guest
 * Pool donor (`ensureGuestPoolDonor`, below), which DOES accrue a credit balance
 * — that is the whole point: an admin later mints it into `in_admin_pool` tokens
 * via /api/admin/pool/mint.
 *
 * (This comment previously claimed the row was written donor-less with no credit
 * balance. That stopped being true when the Guest Pool was introduced. The
 * difference matters: donations written before that change have `donor_id` NULL
 * and no credit behind them, so that money is recorded but can never be minted.)
 *
 * Because it is unauthenticated, it is NOT a `defineRoute` (no matrix/audit
 * actor). It validates with Zod and applies a tiny in-memory per-IP rate limit
 * to blunt trivial abuse. The card/netbanking provider is still a MOCK seam
 * (ASSUMPTIONS.md open item); the UPI manual-QR flow (/api/payment/upi-qr/**)
 * is the real-money path and the QR confirm route credits via this same helper.
 */

const guestDonationSchema = z.object({
    amount_inr: z.number().int().positive().max(1_000_000),
    payment_method: z.string().trim().min(1).max(40).optional(),
});

// Best-effort, process-local rate limit (resets on redeploy; not a hard control).
// A real deployment should front this with an edge/WAF limiter. 10 req / 10 min / IP.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length > RATE_MAX;
}

function clientIp(req: NextRequest): string {
    const fwd = req.headers.get("x-forwarded-for");
    return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
    try {
        if (rateLimited(clientIp(req))) {
            return NextResponse.json(
                { error: "too many donation attempts, please wait a few minutes" },
                { status: 429 }
            );
        }

        let raw: unknown;
        try {
            raw = await req.json();
        } catch {
            return NextResponse.json({ error: "request body is not valid JSON" }, { status: 400 });
        }

        const parsed = guestDonationSchema.safeParse(raw);
        if (!parsed.success) {
            const msg = parsed.error.issues.map((i) => i.message).join("; ") || "invalid request";
            return NextResponse.json({ error: msg }, { status: 400 });
        }

        const method = parsed.data.payment_method ?? "guest";
        // MOCK payment seam for guest card/netbanking/UPI-app; flagged ref.
        const paymentRef = `mock:guest:${method}:${new Date().toISOString()}`;

        const admin = createAdminClient();
        // Anonymous gifts accumulate on the system Guest Pool donor so the money is
        // usable (an admin mints its credit into in_admin_pool tokens — Path B),
        // instead of orphaning as a donor-less donation row. Notifications are
        // skipped (the pool donor has no user).
        const poolDonorId = await ensureGuestPoolDonor(admin);
        const result = await recordDonation({
            admin,
            amountInr: parsed.data.amount_inr,
            donorId: poolDonorId,
            method,
            paymentRef,
            notify: false,
        });

        return NextResponse.json({
            donation_id: result.donationId,
            status: "completed",
            credit_added: result.creditAdded,
            credit_balance: result.creditBalance,
            threshold_reached: result.thresholdReached,
        });
    } catch (err) {
        console.error("[create-guest] error:", err);
        return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
}
