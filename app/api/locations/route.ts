import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/locations — the states/districts masters for address dropdowns
 * (A-1 / B-02).
 *
 * `?state=TN` returns that state's districts; without it, only the state list
 * (36 rows). Districts are NOT returned wholesale: all-India is several hundred
 * rows and no form needs them at once.
 *
 * Gated on `vendor_management/read` because the Food Partner registration form
 * is the strict consumer — a form that cannot list districts cannot satisfy the
 * mandatory-district rule. Runs on the session client, so the
 * `states_select_authenticated` / `districts_select_authenticated` policies
 * apply: reference data, readable by any signed-in user, writable by admin only.
 */
export const GET = defineRoute(
    { feature: "vendor_management", action: "read" },
    async ({ req }) => {
        const supabase = await createClient();
        const stateCode = req.nextUrl.searchParams.get("state")?.trim().toUpperCase();

        const { data: stateRows, error: stateError } = await supabase
            .from("states")
            .select("id, code, name, is_union_territory")
            .order("name", { ascending: true });

        if (stateError) throw new Error(stateError.message);
        const states = (stateRows ?? []) as {
            id: string;
            code: string;
            name: string;
            is_union_territory: boolean;
        }[];

        if (!stateCode) return { states, districts: [] };

        const state = states.find((s) => s.code === stateCode);
        // An unknown code is an empty district list, not a 404: the form should
        // show "no districts" rather than break on a stale query string.
        if (!state) return { states, districts: [] };

        const { data: districtRows, error: districtError } = await supabase
            .from("districts")
            .select("id, name")
            .eq("state_id", state.id)
            .order("name", { ascending: true });

        if (districtError) throw new Error(districtError.message);

        return { states, districts: (districtRows ?? []) as { id: string; name: string }[] };
    }
);
