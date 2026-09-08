import { defineRoute } from "@/lib/api/handler";
import { postLedgerEntry } from "@/lib/services/ledger";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/tokens/expire-sweep — auto-invalidate expired tokens (TOK-6).
 *
 * Flips any still-active token whose `expires_at` has passed to `expired`. Gated
 * by `token_generation/update` (admin). Idempotent and cron-callable (a scheduled
 * job can hit this; for now it's admin-triggered). One audit row per sweep.
 */
const ACTIVE_STATUSES = [
    "generated",
    "live",
    "in_admin_pool",
    "assigned_to_volunteer",
    "distributed",
];

export const POST = defineRoute(
    { feature: "token_generation", action: "update" },
    async ({ audit }) => {
        const admin = createAdminClient();
        const nowIso = new Date().toISOString();

        const { data, error } = await admin
            .from("tokens")
            .update({ status: "expired", expired_at: nowIso })
            .not("expires_at", "is", null)
            .lt("expires_at", nowIso)
            .in("status", ACTIVE_STATUSES)
            .select("id, value_inr, value_returned_to_pool_at");
        if (error) throw new Error(error.message);

        const expiredTokens = (data ?? []) as {
            id: string;
            value_inr: number;
            value_returned_to_pool_at: string | null;
        }[];
        const ids = expiredTokens.map((t) => t.id);

        // F-4 (B-03): an expired token's VALUE is still donated money. Before
        // this, expiry wrote nothing at all — the status flipped and the money
        // silently ceased to be accounted for anywhere. It now returns to the
        // Meal Pool, pending reissue.
        //
        // Skips any token already marked returned, so a re-run cannot credit the
        // same value twice. Per-token rather than one aggregate entry, so each
        // pool credit traces back to the token it came from.
        let returnedCount = 0;
        let returnedValue = 0;
        const returnFailures: string[] = [];

        for (const token of expiredTokens) {
            if (token.value_returned_to_pool_at) continue;
            if (!token.value_inr || token.value_inr <= 0) continue;

            try {
                const entry = await postLedgerEntry({
                    admin,
                    ledger: "meal_pool",
                    amountInr: token.value_inr,
                    referenceType: "token",
                    referenceId: token.id,
                    description: `expired token value returned to Meal Pool (${token.id})`,
                });
                await admin
                    .from("tokens")
                    .update({
                        value_returned_to_pool_at: nowIso,
                        value_returned_ledger_id: entry.id,
                    })
                    .eq("id", token.id);
                returnedCount += 1;
                returnedValue += token.value_inr;
            } catch (e) {
                // The token IS expired regardless — that flip already committed.
                // Record the failure rather than throwing, so one bad ledger
                // write does not abort the whole sweep and leave the rest of the
                // batch unprocessed.
                console.error("[expire-sweep] meal-pool return failed", token.id, e);
                returnFailures.push(token.id);
            }
        }

        if (ids.length > 0) {
            await audit({
                action: "token.expire_sweep",
                entity_table: "tokens",
                entity_id: ids[0],
                summary:
                    `auto-invalidated ${ids.length} expired token(s); ` +
                    `₹${returnedValue} returned to Meal Pool`,
                metadata: {
                    count: ids.length,
                    token_ids: ids.slice(0, 50),
                    pool_returned_count: returnedCount,
                    pool_returned_value_inr: returnedValue,
                    pool_return_failures: returnFailures.slice(0, 50),
                },
            });
        }

        return {
            expired: ids.length,
            returned_to_pool: returnedCount,
            returned_value_inr: returnedValue,
            return_failures: returnFailures.length,
        };
    }
);
