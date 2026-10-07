import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { flagException } from "@/lib/services/riskAudit";

/**
 * Post-emergency review queue (E-3 / B-27d, CD §D-7).
 *
 * THE DEFINING CONSTRAINT, and the easy thing to get wrong: this queue is
 * RISK-BASED, not exhaustive. CD §D-7 says "pattern-flagged transactions only;
 * normal transactions covered by the regular random audit". Sweeping every
 * emergency transaction into review would be simpler to write and would defeat
 * the purpose — a queue of ten thousand rows is a queue nobody reads, and the
 * genuinely suspicious handful drown in it.
 *
 * So a transaction reaches this queue only if a named pattern fires. Everything
 * else stays under F-3's 10% random sample like any other transaction.
 *
 * No migration: F-3 built the exception queue once, deliberately shared. This
 * card supplies the emergency rules and the sweep, nothing structural.
 */

type Client = SupabaseClient;

/** The redemption fields the rules read. */
export interface EmergencyRedemption {
    id: string;
    beneficiary_id: string | null;
    vendor_id: string;
    redeemed_at: string | null;
    contribution_waived: boolean;
    face_verification_skipped: boolean;
    service_district: string | null;
    token_value_inr: number | null;
}

export interface PatternFlag {
    redemptionId: string;
    vendorId: string;
    pattern: string;
    severity: "critical" | "major" | "minor";
    detail: string;
}

export interface PatternThresholds {
    /** Minutes within which two redemptions by the same identifier is "rapid". */
    rapidRepeatMinutes: number;
    /** Redemptions by one identifier during the emergency before it is a reuse flag. */
    identifierReuseCount: number;
    /** A vendor's share of the emergency's redemptions that counts as a volume anomaly. */
    vendorVolumeShare: number;
    /** A vendor's waiver rate that counts as a waiver-pattern flag. */
    waiverRateThreshold: number;
    /** Minimum redemptions before a RATE is meaningful at all. */
    minimumSampleForRate: number;
}

/**
 * Deliberately conservative defaults. A false positive costs a reviewer two
 * minutes; a false negative means a pattern of abuse during a disaster goes
 * unexamined. But over-flagging has its own failure mode — see the module note —
 * so `minimumSampleForRate` stops a vendor with 2 redemptions and 1 waiver being
 * reported as a 50% waiver rate.
 */
export const DEFAULT_THRESHOLDS: PatternThresholds = {
    rapidRepeatMinutes: 60,
    identifierReuseCount: 4,
    vendorVolumeShare: 0.4,
    waiverRateThreshold: 0.9,
    minimumSampleForRate: 10,
};

/**
 * Apply CD §D-7's emergency-pattern rules to one emergency's redemptions.
 *
 * Pure: takes rows, returns flags. The sweep below does the writing. Keeping the
 * rules pure is what makes them testable without a database, which matters
 * because these thresholds WILL be tuned after the first real emergency.
 */
export function detectEmergencyPatterns(
    redemptions: readonly EmergencyRedemption[],
    scopeDistrict: string | null,
    thresholds: PatternThresholds = DEFAULT_THRESHOLDS
): PatternFlag[] {
    const flags: PatternFlag[] = [];
    const seen = new Set<string>();

    const push = (flag: PatternFlag) => {
        // One flag per redemption per pattern — a transaction that trips the
        // same rule twice is still one thing to look at.
        const key = `${flag.redemptionId}:${flag.pattern}`;
        if (seen.has(key)) return;
        seen.add(key);
        flags.push(flag);
    };

    // --- rapid repeats + same-identifier reuse --------------------------------
    const byBeneficiary = new Map<string, EmergencyRedemption[]>();
    for (const r of redemptions) {
        if (!r.beneficiary_id) continue;
        const list = byBeneficiary.get(r.beneficiary_id) ?? [];
        list.push(r);
        byBeneficiary.set(r.beneficiary_id, list);
    }

    for (const [beneficiaryId, rows] of byBeneficiary) {
        const ordered = [...rows]
            .filter((r) => r.redeemed_at)
            .sort((a, b) => Date.parse(a.redeemed_at!) - Date.parse(b.redeemed_at!));

        for (let i = 1; i < ordered.length; i++) {
            const gapMs = Date.parse(ordered[i].redeemed_at!) - Date.parse(ordered[i - 1].redeemed_at!);
            if (gapMs <= thresholds.rapidRepeatMinutes * 60_000) {
                // Flag the LATER of the pair — that is the transaction under
                // suspicion; the earlier one may be entirely legitimate.
                push({
                    redemptionId: ordered[i].id,
                    vendorId: ordered[i].vendor_id,
                    pattern: "rapid_repeat",
                    severity: "major",
                    detail: `same beneficiary redeemed again ${Math.round(gapMs / 60_000)} minutes later`,
                });
            }
        }

        if (rows.length >= thresholds.identifierReuseCount) {
            // Flag only the most recent: the reviewer needs one entry point into
            // the pattern, not N copies of the same finding.
            const latest = ordered[ordered.length - 1] ?? rows[rows.length - 1];
            push({
                redemptionId: latest.id,
                vendorId: latest.vendor_id,
                pattern: "identifier_reuse",
                severity: "major",
                detail: `beneficiary ${beneficiaryId} redeemed ${rows.length} times during this emergency`,
            });
        }
    }

    // --- vendor volume anomaly ------------------------------------------------
    if (redemptions.length >= thresholds.minimumSampleForRate) {
        const byVendor = new Map<string, EmergencyRedemption[]>();
        for (const r of redemptions) {
            const list = byVendor.get(r.vendor_id) ?? [];
            list.push(r);
            byVendor.set(r.vendor_id, list);
        }

        for (const [vendorId, rows] of byVendor) {
            const share = rows.length / redemptions.length;
            if (share >= thresholds.vendorVolumeShare && byVendor.size > 1) {
                push({
                    redemptionId: rows[0].id,
                    vendorId,
                    pattern: "vendor_volume_anomaly",
                    severity: "major",
                    detail: `this Food Partner served ${Math.round(share * 100)}% of the emergency's redemptions (${rows.length} of ${redemptions.length})`,
                });
            }

            // --- waiver pattern ---
            if (rows.length >= thresholds.minimumSampleForRate) {
                const waived = rows.filter((r) => r.contribution_waived).length;
                const rate = waived / rows.length;
                if (rate >= thresholds.waiverRateThreshold) {
                    push({
                        redemptionId: rows[0].id,
                        vendorId,
                        pattern: "waiver_pattern",
                        severity: "minor",
                        detail: `${Math.round(rate * 100)}% of this Food Partner's emergency redemptions were contribution-waived (${waived} of ${rows.length})`,
                    });
                }
            }
        }
    }

    // --- geographic anomaly ---------------------------------------------------
    // A redemption served outside the emergency's declared district. Not
    // necessarily wrong — a Food Partner may sit just over a boundary — but it
    // is exactly what a reviewer should look at, so it is MINOR rather than
    // major: worth a glance, not an accusation.
    if (scopeDistrict) {
        for (const r of redemptions) {
            if (
                r.service_district &&
                r.service_district.trim().toLowerCase() !== scopeDistrict.trim().toLowerCase()
            ) {
                push({
                    redemptionId: r.id,
                    vendorId: r.vendor_id,
                    pattern: "geographic_anomaly",
                    severity: "minor",
                    detail: `served in ${r.service_district}, outside the emergency's declared district ${scopeDistrict}`,
                });
            }
        }
    }

    return flags;
}

export interface SweepResult {
    scanned: number;
    flagged: number;
    queued: number;
    failures: number;
}

/**
 * Run the review sweep for a closed emergency and queue the flagged
 * transactions.
 *
 * Idempotent by construction: `flagException` relies on the queue's UNIQUE
 * (entity, type) guard, so re-running a sweep after a late redemption arrives
 * adds only what is new. A closure that had to be re-run must not double the
 * queue.
 *
 * Never throws. A sweep is a review aid; failing it must not block closing an
 * emergency, which is an accounting act with its own record.
 */
export async function runPostEmergencyReview(
    client: Client,
    emergencyId: string,
    thresholds: PatternThresholds = DEFAULT_THRESHOLDS
): Promise<SweepResult> {
    const result: SweepResult = { scanned: 0, flagged: 0, queued: 0, failures: 0 };

    let scopeDistrict: string | null = null;
    try {
        const { data } = await client
            .from("emergencies")
            .select("scope_district:districts!emergencies_scope_district_id_fkey(name)")
            .eq("id", emergencyId)
            .maybeSingle();
        scopeDistrict =
            (data as { scope_district: { name: string | null } | null } | null)?.scope_district
                ?.name ?? null;
    } catch {
        // No scope resolved — the geographic rule simply does not fire. Every
        // other rule is unaffected, so a partial sweep still beats none.
        scopeDistrict = null;
    }

    let rows: EmergencyRedemption[] = [];
    try {
        const { data, error } = await client
            .from("token_redemptions")
            .select(
                "id, beneficiary_id, vendor_id, redeemed_at, contribution_waived, " +
                    "face_verification_skipped, service_district, token_value_inr"
            )
            .eq("emergency_id", emergencyId);
        if (error) return result;
        rows = (data ?? []) as unknown as EmergencyRedemption[];
    } catch {
        return result;
    }

    result.scanned = rows.length;

    const flags = detectEmergencyPatterns(rows, scopeDistrict, thresholds);
    result.flagged = flags.length;

    for (const flag of flags) {
        const queued = await flagException(client, {
            exceptionType: "emergency_pattern",
            entityTable: "token_redemptions",
            entityId: flag.redemptionId,
            vendorId: flag.vendorId,
            severity: flag.severity,
            detail: `${flag.pattern}: ${flag.detail}`,
            emergencyId,
        });
        if (queued.queued) result.queued += 1;
        else if (queued.reason !== "already queued") result.failures += 1;
    }

    return result;
}

/* -------------------------------------------------------------------------
 * Offline captures, reviewed SEPARATELY BY SOURCE
 *
 * CD §D-9 (confirmed 18 Aug) and the offline design §2: every offline
 * transaction records its source, and post-emergency review runs separately by
 * source, because "a Food Partner recording at their own till and a volunteer
 * recording in a field are different risk profiles and must not be pooled".
 *
 * Pooling them is not a cosmetic shortcut, it is the failure the requirement
 * names. A till that records thirty captures in an evening is ordinary; a
 * volunteer device that records thirty is not. Mixed into one population, the
 * volunteer hides inside the Food Partner's volume and the Food Partner is
 * dragged over the line by the volunteer's rarity. Each cohort is therefore
 * measured against its own peers, and every flag says which cohort it came
 * from so a reviewer never has to guess.
 * ---------------------------------------------------------------------- */

/** The two routes an offline capture can arrive by (`offline_txn_source`). */
export type CaptureSource = "food_partner" | "volunteer";

export const CAPTURE_SOURCES: readonly CaptureSource[] = ["food_partner", "volunteer"] as const;

/** The capture fields the offline rules read. */
export interface EmergencyCapture {
    id: string;
    source: CaptureSource;
    device_reference: string;
    food_partner_id: string | null;
    volunteer_id: string | null;
    beneficiary_identifier: string | null;
    captured_at: string;
    received_at: string | null;
    waiver_status: boolean;
    status: string;
}

export interface CaptureFlag {
    captureId: string;
    source: CaptureSource;
    vendorId: string | null;
    pattern: string;
    severity: "critical" | "major" | "minor";
    detail: string;
}

export interface CaptureThresholds {
    /** A device's share of ITS OWN source's captures that counts as a volume anomaly. */
    deviceVolumeShare: number;
    /** A device's rejection rate that is worth a look. */
    rejectionRateThreshold: number;
    /** A device's waiver rate that is worth a look. */
    waiverRateThreshold: number;
    /** Minimum captures from a device before any RATE about it means anything. */
    minimumSampleForRate: number;
    /** Hours between capture and sync beyond which the delay itself is a flag. */
    lateSyncHours: number;
}

/**
 * As conservative as the redemption thresholds, and for the same reason: a
 * false positive costs a reviewer two minutes, a missed pattern costs the
 * Trust its credibility. These are starting points for the pilot, not findings.
 */
export const DEFAULT_CAPTURE_THRESHOLDS: CaptureThresholds = {
    deviceVolumeShare: 0.5,
    rejectionRateThreshold: 0.3,
    waiverRateThreshold: 0.9,
    minimumSampleForRate: 5,
    lateSyncHours: 48,
};

/**
 * Detect patterns within ONE source's captures.
 *
 * The caller passes a single cohort. Handing this function a mixed list is the
 * bug the requirement exists to prevent, so it refuses one: every rate below is
 * a share of the population it was given.
 */
export function detectCapturePatterns(
    captures: readonly EmergencyCapture[],
    source: CaptureSource,
    thresholds: CaptureThresholds = DEFAULT_CAPTURE_THRESHOLDS
): CaptureFlag[] {
    const foreign = captures.find((c) => c.source !== source);
    if (foreign) {
        throw new Error(
            `detectCapturePatterns received a ${foreign.source} capture while reviewing ${source} — ` +
                "the two sources must be reviewed separately (CD §D-9)"
        );
    }

    const flags: CaptureFlag[] = [];
    const seen = new Set<string>();
    const push = (f: CaptureFlag) => {
        const key = `${f.captureId}:${f.pattern}`;
        if (seen.has(key)) return;
        seen.add(key);
        flags.push(f);
    };

    if (captures.length === 0) return flags;

    // --- by device, within this source only --------------------------------
    const byDevice = new Map<string, EmergencyCapture[]>();
    for (const c of captures) {
        const list = byDevice.get(c.device_reference) ?? [];
        list.push(c);
        byDevice.set(c.device_reference, list);
    }

    for (const [device, list] of byDevice) {
        const share = list.length / captures.length;
        // One device carrying most of a cohort is worth a look. With two devices
        // in the cohort a half-share is unremarkable, so require a real spread.
        if (byDevice.size >= 3 && share >= thresholds.deviceVolumeShare) {
            for (const c of list) {
                push({
                    captureId: c.id,
                    source,
                    vendorId: c.food_partner_id,
                    pattern: "device_volume_anomaly",
                    severity: "minor",
                    detail:
                        `device ${device} recorded ${list.length} of ${captures.length} ` +
                        `${source} captures (${Math.round(share * 100)}%)`,
                });
            }
        }

        if (list.length < thresholds.minimumSampleForRate) continue;

        const rejected = list.filter((c) => c.status === "rejected").length;
        const rejectionRate = rejected / list.length;
        if (rejectionRate >= thresholds.rejectionRateThreshold) {
            for (const c of list.filter((x) => x.status === "rejected")) {
                push({
                    captureId: c.id,
                    source,
                    vendorId: c.food_partner_id,
                    pattern: "device_rejection_rate",
                    severity: "major",
                    detail:
                        `device ${device} had ${rejected} of ${list.length} ${source} captures ` +
                        `refused (${Math.round(rejectionRate * 100)}%)`,
                });
            }
        }

        const waived = list.filter((c) => c.waiver_status).length;
        const waiverRate = waived / list.length;
        if (waiverRate >= thresholds.waiverRateThreshold) {
            for (const c of list.filter((x) => x.waiver_status)) {
                push({
                    captureId: c.id,
                    source,
                    vendorId: c.food_partner_id,
                    pattern: "device_waiver_rate",
                    severity: "minor",
                    detail:
                        `device ${device} waived the contribution on ${waived} of ${list.length} ` +
                        `${source} captures (${Math.round(waiverRate * 100)}%)`,
                });
            }
        }
    }

    // --- the same beneficiary identifier, more than once -------------------
    const byIdentifier = new Map<string, EmergencyCapture[]>();
    for (const c of captures) {
        const id = c.beneficiary_identifier?.trim();
        if (!id) continue;
        const list = byIdentifier.get(id) ?? [];
        list.push(c);
        byIdentifier.set(id, list);
    }
    for (const [identifier, list] of byIdentifier) {
        if (list.length < 2) continue;
        for (const c of list) {
            push({
                captureId: c.id,
                source,
                vendorId: c.food_partner_id,
                pattern: "identifier_reuse_offline",
                severity: "major",
                detail: `identifier ${identifier} appears on ${list.length} ${source} captures`,
            });
        }
    }

    // --- synced far later than it was captured -----------------------------
    // A long gap is not proof of anything — a device can genuinely sit without a
    // signal for days — but it is the window in which a record can be edited on
    // a device, so it earns a glance.
    for (const c of captures) {
        if (!c.received_at) continue;
        const capturedAt = Date.parse(c.captured_at);
        const receivedAt = Date.parse(c.received_at);
        if (Number.isNaN(capturedAt) || Number.isNaN(receivedAt)) continue;
        const hours = (receivedAt - capturedAt) / 3_600_000;
        if (hours >= thresholds.lateSyncHours) {
            push({
                captureId: c.id,
                source,
                vendorId: c.food_partner_id,
                pattern: "late_sync",
                severity: "minor",
                detail:
                    `captured ${Math.round(hours)} hours before it synced, from ${source} ` +
                    `device ${c.device_reference}`,
            });
        }
    }

    return flags;
}

export interface SourceSweepResult {
    scanned: number;
    flagged: number;
    queued: number;
    failures: number;
}

/** One result per source — never a single pooled number. */
export type CaptureSweepResult = Record<CaptureSource, SourceSweepResult>;

const emptySourceResult = (): SourceSweepResult => ({
    scanned: 0,
    flagged: 0,
    queued: 0,
    failures: 0,
});

/**
 * Review an emergency's offline captures, one source at a time.
 *
 * Returns a result per source rather than a total, because a total is exactly
 * the pooling the requirement forbids: a reviewer asked to look at "eleven
 * flags" learns nothing about which route produced them.
 *
 * Never throws, for the same reason the redemption sweep does not: closing an
 * emergency is an accounting act and must not fail because a review aid did.
 */
export async function runOfflineCaptureReview(
    client: Client,
    emergencyId: string,
    thresholds: CaptureThresholds = DEFAULT_CAPTURE_THRESHOLDS
): Promise<CaptureSweepResult> {
    const result: CaptureSweepResult = {
        food_partner: emptySourceResult(),
        volunteer: emptySourceResult(),
    };

    let rows: EmergencyCapture[] = [];
    try {
        const { data, error } = await client
            .from("offline_transactions")
            .select(
                "id, source, device_reference, food_partner_id, volunteer_id, " +
                    "beneficiary_identifier, captured_at, received_at, waiver_status, status"
            )
            .eq("emergency_id", emergencyId);
        if (error) return result;
        rows = (data ?? []) as unknown as EmergencyCapture[];
    } catch {
        return result;
    }

    for (const source of CAPTURE_SOURCES) {
        const cohort = rows.filter((r) => r.source === source);
        const bucket = result[source];
        bucket.scanned = cohort.length;
        if (cohort.length === 0) continue;

        let flags: CaptureFlag[] = [];
        try {
            flags = detectCapturePatterns(cohort, source, thresholds);
        } catch {
            // A cohort that cannot be analysed must not take the other one with it.
            bucket.failures += 1;
            continue;
        }
        bucket.flagged = flags.length;

        for (const flag of flags) {
            const queued = await flagException(client, {
                exceptionType: "emergency_pattern",
                entityTable: "offline_transactions",
                entityId: flag.captureId,
                vendorId: flag.vendorId,
                severity: flag.severity,
                // The source leads the detail line: a reviewer reading the queue
                // sees which route produced the flag before they read anything else.
                detail: `[${source}] ${flag.pattern}: ${flag.detail}`,
                emergencyId,
            });
            if (queued.queued) bucket.queued += 1;
            else if (queued.reason !== "already queued") bucket.failures += 1;
        }
    }

    return result;
}
