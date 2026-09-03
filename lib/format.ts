/**
 * Shared display formatters.
 *
 * Money in this system is stored and transported in RUPEES — the API columns
 * are `amount_inr` / `value_inr` / `balance_inr`. (The `TokenItem.value`
 * comment in `lib/donor/types/contract.ts` used to claim paise; it was stale.
 * The live route at `app/api/donor/tokens/route.ts` passes `value_inr`
 * straight through.) Nothing here divides by 100.
 */

/**
 * A rupee amount, grouped the Indian way: ₹1,25,000 rather than ₹125,000.
 *
 * The donor console showed raw numbers — "₹125000" — which is hard to read at
 * a glance and reads as careless on a product whose whole job is convincing
 * someone to part with money.
 */
export function inr(amount: number | null | undefined): string {
    if (amount == null || !Number.isFinite(amount)) return "₹0";
    return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount);
}

/** The same grouping without the symbol, for places that print their own. */
export function inrPlain(amount: number | null | undefined): string {
    if (amount == null || !Number.isFinite(amount)) return "0";
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount);
}

/**
 * A compact, unambiguous date: "14 Aug 2026".
 *
 * `toLocaleString()` with no arguments produced "8/14/2026, 2:50:00 PM" — long
 * enough to push the donations table past the edge of a phone card, and
 * ambiguous between day/month orders for an Indian audience.
 */
export function shortDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Date plus time, compact: "14 Aug 2026, 2:50 pm".
 *
 * For the places that genuinely need the clock — notification and redemption
 * timestamps — where a bare date would lose meaning.
 */
export function shortDateTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
    });
}
