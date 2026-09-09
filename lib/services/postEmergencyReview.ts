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
