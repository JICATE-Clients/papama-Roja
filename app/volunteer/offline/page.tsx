"use client";

import { useState } from "react";

import OfflineCapturePanel from "@/components/offline/OfflineCapturePanel";
import QrScanner from "@/components/vendor/QrScanner";

import { Notice, PageHeader } from "../_ui";

/**
 * Volunteer offline capture — CD §D-9's SECONDARY route (E-4 / B-30).
 *
 * The Food Partner till is the primary route and stays so. This exists for the
 * field situation the client described: no connected Food Partner, no signal,
 * and a person in front of you.
 *
 * The page is deliberately plain. Everything that decides whether capture is
 * allowed lives on the server — an active emergency, `offline_capture_enabled`,
 * and the `offline_capture` capability on the volunteer role — and the panel
 * below renders NOTHING until the server has authorised this device. A
 * volunteer opening this page out of an emergency sees only an explanation.
 *
 * The capture's source is stamped from the session at sync, never from the
 * device, so this screen cannot claim to be a Food Partner till.
 */
export default function VolunteerOfflineCapturePage() {
    const [qrPayload, setQrPayload] = useState("");

    return (
        <div className="space-y-5">
            <PageHeader
                title="Record a meal offline"
                subtitle="For an emergency with no signal. The record syncs later and an admin validates it — it is not a redemption."
            />

            <Notice tone="info" title="This is not a redemption">
                Recording here does not serve the token or pay the Food Partner. It queues a claim
                that an administrator checks once it syncs. If you have signal, use the normal flow
                instead.
            </Notice>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">1 · Scan the token</h2>
                <p className="mt-1 text-xs text-slate-500">
                    Point the camera at the token QR, or paste the code if the camera will not open.
                </p>
                <div className="mt-3">
                    <QrScanner onDecode={(value) => setQrPayload(value)} />
                </div>
                <label className="mt-3 block text-xs font-medium text-slate-600">
                    Token code
                    <input
                        value={qrPayload}
                        onChange={(e) => setQrPayload(e.target.value)}
                        placeholder="Paste the token code"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        inputMode="text"
                        autoComplete="off"
                    />
                </label>
            </section>

            {/* Renders nothing unless the server has authorised this device for an
                active emergency, or records are still waiting to sync. */}
            <OfflineCapturePanel qrPayload={qrPayload} />
        </div>
    );
}
