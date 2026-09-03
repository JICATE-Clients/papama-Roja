import { z } from "zod";

import { BadRequestError, defineRoute, parseQuery } from "@/lib/api/handler";
import {
    getLedgerBalance,
    getLedgerEntriesForReference,
    listLedgerEntries,
    type LedgerName,
} from "@/lib/services/ledger";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/ledgers — triple-ledger trail (spec §3.1 F-10, addon #18).
 *
 * Gated by `financial_ledgers_reconciliation/read` at scope "all", which in
 * practice means admin + compliance: the matrix gives a vendor `read: "own"`,
 * and an "own"-scoped role fails an "all" assertion, so a vendor is refused here
 * before RLS is ever consulted. The `ledger_entries_select_vendor_own` policy is
 * therefore unreachable through THIS route — a vendor-facing payable view would
 * be a route under /api/vendor. (The comment here used to claim a vendor's query
 * was "naturally scoped"; it never reaches the query.)
 *
 * Still runs on the SESSION (RLS) client, NOT the service-role client, so the
 * policies remain the enforcement point and this handler never hand-rolls an
 * ownership check that could drift from them.
 *
 * Two modes:
 *   - `?reference_type=&reference_id=` — trace one transaction end-to-end.
 *   - `?ledger=donation|vendor_payable|revenue` — that ledger's running balance.
 */
const querySchema = z
    .object({
        ledger: z.enum(["donation", "vendor_payable", "revenue"]).optional(),
        reference_type: z.string().min(1).optional(),
        reference_id: z.string().min(1).optional(),
    })
    .refine((q) => q.ledger || (q.reference_type && q.reference_id), {
        message: "pass either 'ledger' or both 'reference_type' and 'reference_id'",
    });

export const GET = defineRoute(
    { feature: "financial_ledgers_reconciliation", action: "read" },
    async ({ req }) => {
        const url = new URL(req.url);
        const q = parseQuery(url.searchParams, querySchema);
        const supabase = await createClient();

        if (q.reference_type && q.reference_id) {
            const entries = await getLedgerEntriesForReference(supabase, q.reference_type, q.reference_id);
            return { entries };
        }

        if (!q.ledger) throw new BadRequestError("pass either 'ledger' or a reference pair");
        const ledger = q.ledger as LedgerName;
        // Balance and entries together: a running total with no rows behind it
        // cannot be checked, and every caller that wants one wants the other.
        const [balance, entries] = await Promise.all([
            getLedgerBalance(supabase, ledger),
            listLedgerEntries(supabase, ledger),
        ]);
        return { ledger, balance, entries };
    }
);
