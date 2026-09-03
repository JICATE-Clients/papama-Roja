import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
    campaignCreateRequestSchema,
    campaignStatusRequestSchema,
    type CampaignResponse,
    type CampaignStatus,
} from "@/lib/validation/schemas";

/**
 * /api/admin/campaigns — fund-raising campaigns donors contribute to.
 *
 * `campaigns` is a GENERAL donor-facing table, not an emergency-specific one;
 * the whole surface is gated by `emergency_disaster_mode` only because the
 * original POST was added for addon #9's demo step and nothing else claimed the
 * table. That naming is a wart, not an intent — a campaign in the "Disaster
 * Relief" category is the emergency case, and the category CHECK (m14) accepts
 * only School / Orphanage / Disaster Relief / Community Kitchen. An earlier
 * version of this comment told callers to pass `category: "emergency"`, which
 * the constraint rejects outright.
 */

/**
 * GET — every campaign with what it has actually raised.
 *
 * The raised figures are summed from `donations`, NOT read from
 * `campaigns.raised_tokens`: that column survives from the donor module's old
 * `token_types` table and no live code path increments it (its only writer is
 * dead code still targeting the pre-rename table). `attributed_donations` is
 * returned alongside so the UI can say plainly when NOTHING is attributed —
 * today the donate flow never sets `campaign_id`, so every total here is
 * legitimately zero, and a page that just rendered "₹0" would read as "nobody
 * gave" rather than "the link was never wired".
 */
export const GET = defineRoute(
    { feature: "emergency_disaster_mode", action: "read" },
    async () => {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("campaigns")
            .select(
                "id, title, description, organization_name, category, location, target_tokens, token_price_inr, status, created_at"
            )
            .order("created_at", { ascending: false })
            .limit(200);
        if (error) throw new Error(error.message);

        const rows = (data ?? []) as {
            id: string;
            title: string;
            description: string;
            organization_name: string;
            category: string;
            location: string | null;
            target_tokens: number;
            token_price_inr: number;
            status: CampaignStatus;
            created_at: string;
        }[];

        // Only completed donations count toward a total — a pending one has not
        // been paid and a failed one never will be.
        const totals = new Map<string, { inr: number; tokens: number; count: number }>();
        if (rows.length > 0) {
            const { data: donations, error: donationError } = await supabase
                .from("donations")
                .select("campaign_id, amount_inr, token_amount")
                .eq("status", "completed")
                .in(
                    "campaign_id",
                    rows.map((r) => r.id)
                );
            if (donationError) throw new Error(donationError.message);

            for (const d of (donations ?? []) as {
                campaign_id: string | null;
                amount_inr: number;
                token_amount: number;
            }[]) {
                if (!d.campaign_id) continue;
                const acc = totals.get(d.campaign_id) ?? { inr: 0, tokens: 0, count: 0 };
                acc.inr += Number(d.amount_inr);
                acc.tokens += Number(d.token_amount);
                acc.count += 1;
                totals.set(d.campaign_id, acc);
            }
        }

        const campaigns: CampaignResponse[] = rows.map((r) => {
            const t = totals.get(r.id);
            return {
                ...r,
                raised_inr: t?.inr ?? 0,
                raised_tokens: t?.tokens ?? 0,
                donation_count: t?.count ?? 0,
            };
        });

        return {
            campaigns,
            total: campaigns.length,
            attributed_donations: campaigns.reduce((n, c) => n + c.donation_count, 0),
        };
    }
);

export const POST = defineRoute(
    { feature: "emergency_disaster_mode", action: "create" },
    async ({ req, audit }) => {
        const body = await parseBody(req, campaignCreateRequestSchema);
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("campaigns")
            .insert({
                title: body.title,
                description: body.description ?? "",
                organization_name: body.organization_name,
                category: body.category,
                location: body.location ?? null,
                target_tokens: body.target_tokens ?? 0,
                token_price_inr: body.token_price_inr,
            })
            .select("id")
            .single();
        if (error || !data) throw new Error(error?.message ?? "failed to create campaign");

        await audit({
            action: "campaign.create",
            entity_table: "campaigns",
            entity_id: data.id,
            summary: `campaign '${body.title}' created (${body.category})`,
            metadata: { category: body.category, organization_name: body.organization_name },
        });

        return { id: data.id };
    }
);

/**
 * PATCH — move one campaign along its lifecycle (active ⇄ paused → completed).
 *
 * `completed` is terminal: it is the state a finished appeal rests in, and
 * re-opening one silently would make "completed" mean nothing in the donor-facing
 * list. Reopening is a new campaign.
 */
export const PATCH = defineRoute(
    { feature: "emergency_disaster_mode", action: "update" },
    async ({ req, audit }) => {
        const body = await parseBody(req, campaignStatusRequestSchema);
        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("campaigns")
            .select("id, title, status")
            .eq("id", body.campaign_id)
            .maybeSingle();
        if (fetchError) throw new Error(fetchError.message);
        if (!data) throw new NotFoundError("campaign not found");
        const campaign = data as { id: string; title: string; status: CampaignStatus };

        if (campaign.status === body.status) {
            throw new BadRequestError(`campaign is already '${body.status}'`);
        }
        if (campaign.status === "completed") {
            throw new BadRequestError("a completed campaign cannot be reopened — create a new one");
        }

        const { error: updateError } = await admin
            .from("campaigns")
            .update({ status: body.status, updated_at: new Date().toISOString() })
            .eq("id", body.campaign_id);
        if (updateError) throw new Error(updateError.message);

        await audit({
            action: `campaign.${body.status}`,
            entity_table: "campaigns",
            entity_id: body.campaign_id,
            summary: `campaign '${campaign.title}': ${campaign.status} → ${body.status}`,
            metadata: { from: campaign.status, to: body.status },
        });

        return { id: body.campaign_id, status: body.status };
    }
);
