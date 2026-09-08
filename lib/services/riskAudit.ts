import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Risk-based audit framework (F-3 / B-25, CD §D-5).
 *
 * The client's key principle: **"10% random audit is the baseline, not the
 * ceiling."** Random sampling is supplemented by risk-based and exception-based
 * audits, and a minimum of one settlement per cycle applies regardless of rate.
 *
 * That minimum is the part most easily lost. At a 10% rate a cycle of three
 * settlements rounds to zero, so a small pilot would run cycle after cycle
 * auditing nothing at all while appearing to have an audit policy. CD §D-5 says
 * "subject to a minimum of one settlement per audit cycle" precisely to stop
 * that, so the floor is applied AFTER the rate, never before.
 */

// Plain SupabaseClient (as lib/services/token.ts does): the <never,never,never>
// form used by the read-only services rejects .insert() row literals.
type Client = SupabaseClient;

export type VendorRiskStatus = "low" | "normal" | "medium" | "high";

/** CD §D-5's three tiers, driven by the Food Partner's risk status. */
export type AuditTier = "normal" | "enhanced" | "full";

export interface SampleSizeInput {
    populationCount: number;
    /** Baseline fraction 0..1 from `settlement_random_audit_rate`. */
    rate: number | null;
    /** Highest risk tier present in the population. */
    tier?: AuditTier;
}

/**
 * How many settlements to draw for this cycle.
 *
 * Order matters and is deliberate:
 *   1. an empty population draws nothing — a floor of 1 cannot conjure a
 *      settlement that does not exist;
 *   2. a `full` tier takes everything (CD §D-5's 100% review);
 *   3. otherwise apply the rate, round UP, then apply the minimum of one.
 *
 * Rounding UP rather than to nearest: 10% of 15 is 1.5, and auditing one of
 * fifteen when policy says 10% quietly under-delivers on the commitment.
 *
 * An unset or zero rate still yields the minimum of one. The floor is a policy
 * commitment in its own right, not a by-product of the percentage — a missing
 * config must not silently switch auditing off.
 */
export function resolveSampleSize(input: SampleSizeInput): number {
    const { populationCount, rate, tier = "normal" } = input;

    if (populationCount <= 0) return 0;
    if (tier === "full") return populationCount;

    const effectiveRate = tier === "enhanced" ? Math.max(rate ?? 0, 0.5) : (rate ?? 0);
    const byRate = Math.ceil(populationCount * Math.max(0, effectiveRate));

    return Math.min(populationCount, Math.max(1, byRate));
}

/** Which audit tier a Food Partner's risk status puts them in (CD §D-5). */
export function tierForRiskStatus(status: VendorRiskStatus): AuditTier {
    switch (status) {
        case "high":
            return "full";
        case "medium":
            return "enhanced";
        default:
            return "normal";
    }
}

/**
 * Draw `sampleSize` items without replacement.
 *
 * Fisher–Yates on a copy. `Math.random` is fine here: this defends against
 * predictable *bias*, not against an adversary who can already run code on the
 * server. What makes the sample trustworthy is the permanent selection record,
 * not the entropy source.
 */
export function drawSample<T>(population: readonly T[], sampleSize: number): T[] {
    const pool = [...population];
    const n = Math.min(Math.max(0, sampleSize), pool.length);
    for (let i = 0; i < n; i++) {
        const j = i + Math.floor(Math.random() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
}

export type ExceptionType =
    | "manual_adjustment"
    | "token_reissue"
    | "reversal"
    | "refund"
    | "manual_entry"
    | "bank_account_change"
    | "unusual_waiver"
    | "fraud_linked"
    | "emergency_pattern"
    | "offline_duplicate";

export interface FlagExceptionInput {
    exceptionType: ExceptionType;
    entityTable: string;
    entityId: string;
    vendorId?: string | null;
    severity?: "critical" | "major" | "minor" | null;
    detail?: string | null;
    emergencyId?: string | null;
}

/**
 * Put an inherently risky transaction into the shared exception queue.
 *
 * NEVER THROWS. This is called from the middle of business flows — a token
 * reissue, a bank-account change — and failing to queue an exception must not
 * roll back the operation itself. A missed queue entry is a gap in review; a
 * thrown error here would break a reissue that was otherwise valid. Returns
 * whether it queued so the caller can record a warning.
 *
 * A duplicate (same entity, same type) is a no-op thanks to the table's UNIQUE
 * constraint — a retried write must not inflate the queue or the exception
 * statistics drawn from it.
 */
export async function flagException(
    client: Client,
    input: FlagExceptionInput
): Promise<{ queued: boolean; reason?: string }> {
    try {
        const { error } = await client.from("exception_queue").insert({
            exception_type: input.exceptionType,
            entity_table: input.entityTable,
            entity_id: input.entityId,
            vendor_id: input.vendorId ?? null,
            severity: input.severity ?? null,
            detail: input.detail ?? null,
            emergency_id: input.emergencyId ?? null,
        });

        if (error) {
            // 23505 = the UNIQUE guard: already queued, which is success.
            if (error.code === "23505") return { queued: false, reason: "already queued" };
            return { queued: false, reason: error.message };
        }
        return { queued: true };
    } catch (e) {
        return { queued: false, reason: e instanceof Error ? e.message : "unknown error" };
    }
}

export interface RecordSelectionInput {
    cycleRef: string;
    cycleStart?: string | null;
    cycleEnd?: string | null;
    populationIds: readonly string[];
    rate: number | null;
    tier?: AuditTier;
    method?: "random" | "targeted" | "enhanced" | "exception";
    targetedReason?: string | null;
    assignedTo?: string | null;
}

export interface RecordSelectionResult {
    selectionId: string | null;
    selected: string[];
    populationCount: number;
    error?: string;
}

/**
 * Draw a cycle's sample and write the permanent selection record.
 *
 * The record is written BEFORE the queue entries, so a partial failure leaves
 * evidence that a selection happened rather than silently auditing nothing. The
 * header is what makes the sample defensible: population, rate and timestamp
 * recorded at draw time mean the sample cannot be re-drawn later once someone
 * has seen the results.
 */
export async function recordAuditSelection(
    client: Client,
    input: RecordSelectionInput
): Promise<RecordSelectionResult> {
    const population = [...input.populationIds];
    const sampleSize = resolveSampleSize({
        populationCount: population.length,
        rate: input.rate,
        tier: input.tier,
    });
    const selected = drawSample(population, sampleSize);

    const { data, error } = await client
        .from("settlement_audit_selections")
        .insert({
            cycle_ref: input.cycleRef,
            cycle_start: input.cycleStart ?? null,
            cycle_end: input.cycleEnd ?? null,
            population_count: population.length,
            sample_count: selected.length,
            rate_applied: input.rate,
            selection_method: input.method ?? "random",
            targeted_reason: input.targetedReason ?? null,
            assigned_to: input.assignedTo ?? null,
        })
        .select("id")
        .single();

    if (error || !data) {
        return {
            selectionId: null,
            selected: [],
            populationCount: population.length,
            error: error?.message ?? "failed to record audit selection",
        };
    }

    const selectionId = (data as { id: string }).id;

    if (selected.length > 0) {
        const { error: itemError } = await client
            .from("settlement_audit_selection_items")
            .insert(
                selected.map((settlementId) => ({
                    selection_id: selectionId,
                    settlement_id: settlementId,
                }))
            );
        if (itemError) {
            return {
                selectionId,
                selected: [],
                populationCount: population.length,
                error: itemError.message,
            };
        }
    }

    return { selectionId, selected, populationCount: population.length };
}
