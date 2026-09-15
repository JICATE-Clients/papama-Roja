import { z } from "zod";

import { defineRoute, parseBody } from "@/lib/api/handler";
import { reissueExpiredToken } from "@/lib/services/tokenReissue";
import { MIN_REISSUE_REASON } from "@/lib/services/tokenReissuePlan";

/**
 * POST /api/admin/tokens/[id]/reissue — approve a controlled reissue of an
 * expired token (A-2 / B-23, CD §D-2A). Body: { reason }.
 *
 * Mints a NEW token (new ID, QR and dates) linked to the original; the original
 * stays permanently expired. Gated on `token_generation/update` — the same cell
 * as minting and the expiry sweep, since this mints.
 *
 * The service writes the audit row itself (it needs the new token's id in it).
 */
const reissueSchema = z.object({
    reason: z
        .string()
        .trim()
        .min(MIN_REISSUE_REASON, `a reason of at least ${MIN_REISSUE_REASON} characters is required`)
        .max(1000),
});

export const POST = defineRoute<{ id: string }>(
    { feature: "token_generation", action: "update" },
    async ({ req, user, params }) => {
        const body = await parseBody(req, reissueSchema);
        const result = await reissueExpiredToken({ tokenId: params.id, reason: body.reason }, user);
        return { ...result };
    }
);
