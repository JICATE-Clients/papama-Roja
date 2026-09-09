import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Emergency Appeal dispatch (E-6 / B-26 b,c, CD §D-6).
 *
 * PHASE SPLIT, confirmed 18 Aug. Phase 1 is in-app now and email when the
 * official account lands (external dependency). Phase 2 is SMS via DLT
 * registration and WhatsApp via Business API.
 *
 * THE REQUIREMENT THAT SHAPES THIS FILE is the client's added condition: Phase 2
 * channels must be integrable "WITHOUT fundamental redesign of the dispatch,
 * template or tracking infrastructure". So this module knows nothing about any
 * specific channel. It resolves an audience, renders a template and hands each
 * message to an ADAPTER looked up by name. Adding WhatsApp is registering an
 * adapter — no change here, and no change to the schema beyond one CHECK value.
 *
 * TWO GATES, both from CD §D-6:
 *   1. An UNAPPROVED template cannot dispatch. Ever.
 *   2. An INSTANT (pre-approved) dispatch always leaves a post-send review
 *      task. A flood does not wait for an approval queue, but speed must not
 *      silently become an absence of oversight.
 */

type Client = SupabaseClient;

export type AppealChannel = "in_app" | "email" | "sms" | "whatsapp";
export type AppealAudience = "all" | "individual" | "csr";

export interface AppealTemplate {
    id: string;
    name: string;
    subject: string;
    body: string;
    status: "draft" | "approved" | "retired";
    is_instant: boolean;
    audience: AppealAudience;
}

export interface DispatchGateResult {
    allowed: boolean;
    reason: string;
    /** True when this send must leave a post-send review task. */
    reviewRequired: boolean;
}

/**
 * May this template be dispatched?
 *
 * A draft cannot go out — that is the approval workflow's entire purpose. A
 * retired one cannot either: retirement exists because someone decided the
 * wording should stop being used, and "still dispatchable" would make it
 * meaningless.
 *
 * An INSTANT template dispatches immediately AND carries reviewRequired, so the
 * two halves of CD §D-6's instant path can never be separated by a caller that
 * forgets the second one.
 */
export function checkDispatchGate(template: AppealTemplate): DispatchGateResult {
    if (template.status === "draft") {
        return {
            allowed: false,
            reason: `template '${template.name}' is a draft — it must be approved before it can be sent`,
            reviewRequired: false,
        };
    }
    if (template.status === "retired") {
        return {
            allowed: false,
            reason: `template '${template.name}' has been retired and cannot be sent`,
            reviewRequired: false,
        };
    }
    return {
        allowed: true,
        reason: template.is_instant
            ? "pre-approved instant template — dispatching now, post-send review required"
            : "template is approved",
        // An instant send is the ONLY path that skipped a fresh approval, so it
        // is the only one that owes a review afterwards.
        reviewRequired: template.is_instant,
    };
}

/**
 * Render {{placeholders}}. Deliberately the same trivial substitution the
 * existing notification templates use — an appeal is not a different rendering
 * problem, and a second templating engine would be a second thing to keep
 * consistent.
 *
 * An unknown placeholder is left AS-IS rather than blanked: a donor receiving
 * "{{emergency_name}}" is a visible bug someone fixes, whereas a donor
 * receiving "Please help with the  appeal" reads as merely clumsy and gets
 * ignored.
 */
export function renderAppeal(text: string, vars: Record<string, unknown>): string {
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => {
        const value = vars[key];
        return value === undefined || value === null ? whole : String(value);
    });
}

export interface AppealRecipient {
    donorId: string;
    isCsr: boolean;
}

/**
 * Filter recipients to the template's audience (CD §D-6 basic segmentation).
 * Finer segmentation is explicitly Phase 2.
 */
export function selectAudience(
    recipients: readonly AppealRecipient[],
    audience: AppealAudience
): AppealRecipient[] {
    if (audience === "all") return [...recipients];
    if (audience === "csr") return recipients.filter((r) => r.isCsr);
    return recipients.filter((r) => !r.isCsr);
}

/**
 * A channel adapter. Adding a Phase 2 channel means writing ONE of these and
 * registering it — nothing in this module changes.
 */
export interface ChannelAdapter {
    channel: AppealChannel;
    /** Returns how many were delivered. Must never throw. */
    send(
        client: Client,
        recipients: readonly AppealRecipient[],
        message: { subject: string; body: string; emergencyId: string }
    ): Promise<{ delivered: number; failed: number }>;
}

export interface DispatchResult {
    dispatched: boolean;
    reason: string;
    dispatchId: string | null;
    recipientCount: number;
    delivered: number;
    failed: number;
    reviewRequired: boolean;
}

/**
 * Send an appeal.
 *
 * The dispatch RECORD is written before delivery is attempted, so a send that
 * half-fails still leaves evidence it happened. A record with delivered=0 is
 * recoverable; a delivery with no record is not investigable at all.
 */
export async function dispatchAppeal(
    client: Client,
    input: {
        template: AppealTemplate;
        emergencyId: string;
        emergencyRef: string;
        recipients: readonly AppealRecipient[];
        adapter: ChannelAdapter;
        dispatchedBy?: string | null;
        vars?: Record<string, unknown>;
    }
): Promise<DispatchResult> {
    const gate = checkDispatchGate(input.template);
    if (!gate.allowed) {
        return {
            dispatched: false,
            reason: gate.reason,
            dispatchId: null,
            recipientCount: 0,
            delivered: 0,
            failed: 0,
            reviewRequired: false,
        };
    }

    const audience = selectAudience(input.recipients, input.template.audience);
    const vars = { emergency_ref: input.emergencyRef, ...(input.vars ?? {}) };
    const subject = renderAppeal(input.template.subject, vars);
    const body = renderAppeal(input.template.body, vars);

    const { data, error } = await client
        .from("emergency_appeal_dispatches")
        .insert({
            emergency_id: input.emergencyId,
            template_id: input.template.id,
            channel: input.adapter.channel,
            audience: input.template.audience,
            recipient_count: audience.length,
            was_instant: input.template.is_instant,
            review_required: gate.reviewRequired,
            dispatched_by: input.dispatchedBy ?? null,
        })
        .select("id")
        .single();

    if (error || !data) {
        return {
            dispatched: false,
            reason: error?.message ?? "failed to record the dispatch",
            dispatchId: null,
            recipientCount: audience.length,
            delivered: 0,
            failed: 0,
            reviewRequired: gate.reviewRequired,
        };
    }
    const dispatchId = (data as { id: string }).id;

    const outcome = await input.adapter.send(client, audience, {
        subject,
        body,
        emergencyId: input.emergencyId,
    });

    await client
        .from("emergency_appeal_dispatches")
        .update({ delivered_count: outcome.delivered, failed_count: outcome.failed })
        .eq("id", dispatchId);

    return {
        dispatched: true,
        reason: gate.reason,
        dispatchId,
        recipientCount: audience.length,
        delivered: outcome.delivered,
        failed: outcome.failed,
        reviewRequired: gate.reviewRequired,
    };
}
