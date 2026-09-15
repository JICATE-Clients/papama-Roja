/**
 * Token display payload (A-2 / B-23, CD §D-2A) — ONE shape for the digital
 * token view and the printed token: type, value, scope, activation, expiry.
 *
 * Pure. Callers resolve state/district names first; this only formats, so the
 * screen and the print can never disagree about what a token says.
 *
 * Carries nothing about the beneficiary (P-2): a printed token is handed around.
 */

export interface TokenDisplayInput {
    serial_number: string;
    token_type: string;
    value_inr: number;
    status: string;
    distribution_mode: "PAPAMA_DISTRIBUTED" | "DONOR_CONTROLLED";
    geographic_scope: string;
    scope_city: string | null;
    scope_pincode: string | null;
    activated_at: string | null;
    expires_at: string | null;
    is_emergency?: boolean;
}

export interface TokenDisplayPayload {
    serial_number: string;
    token_type: string;
    token_type_label: string;
    value_inr: number;
    value_label: string;
    distribution_mode: TokenDisplayInput["distribution_mode"];
    distribution_mode_label: string;
    geographic_scope: string;
    scope_label: string;
    activated_at: string | null;
    expires_at: string | null;
    validity_label: string;
    status_label: string;
    reissued_from_serial: string | null;
    replaced_by_serial: string | null;
}

function typeLabel(t: string, emergency: boolean): string {
    if (t === "special_care") return "SPECIAL CARE";
    if (emergency || t === "emergency") return "EMERGENCY";
    return t.replace(/_/g, " ").toUpperCase();
}

export function scopeLabel(
    scope: string,
    names: { state?: string | null; district?: string | null; city?: string | null; pincode?: string | null }
): string {
    switch (scope) {
        case "PAN_INDIA":
            return "Valid across India";
        case "STATE":
            return names.state ? `Valid in ${names.state}` : "Valid in one state";
        case "DISTRICT":
            return names.district
                ? `Valid in ${names.district} district${names.state ? `, ${names.state}` : ""}`
                : "Valid in one district";
        case "CITY":
            return names.city ? `Valid in ${names.city}` : "Valid in one city";
        case "PIN":
            return names.pincode ? `Valid at PIN ${names.pincode}` : "Valid at one PIN code";
        default:
            return scope;
    }
}

function day(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    });
}

export function buildTokenDisplayPayload(
    token: TokenDisplayInput,
    ctx: {
        stateName?: string | null;
        districtName?: string | null;
        reissuedFromSerial?: string | null;
        replacedBySerial?: string | null;
    } = {}
): TokenDisplayPayload {
    const from = day(token.activated_at);
    const to = day(token.expires_at);
    const validity =
        from && to
            ? `${from} – ${to}`
            : to
              ? `Until ${to}`
              : token.distribution_mode === "PAPAMA_DISTRIBUTED"
                ? "60 days from when it is given out"
                : "No expiry set";

    // "Expired – Not Redeemed" is the donor-facing wording A-4 asks for.
    const status =
        token.status === "expired"
            ? ctx.replacedBySerial
                ? `Expired – Reissued as ${ctx.replacedBySerial}`
                : "Expired – Not Redeemed"
            : token.status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

    return {
        serial_number: token.serial_number,
        token_type: token.token_type,
        token_type_label: typeLabel(token.token_type, token.is_emergency === true),
        value_inr: token.value_inr,
        value_label: `₹${token.value_inr}`,
        distribution_mode: token.distribution_mode,
        distribution_mode_label:
            token.distribution_mode === "DONOR_CONTROLLED" ? "Donor controlled" : "Distributed by pApAmA",
        geographic_scope: token.geographic_scope,
        scope_label: scopeLabel(token.geographic_scope, {
            state: ctx.stateName,
            district: ctx.districtName,
            city: token.scope_city,
            pincode: token.scope_pincode,
        }),
        activated_at: token.activated_at,
        expires_at: token.expires_at,
        validity_label: validity,
        status_label: status,
        reissued_from_serial: ctx.reissuedFromSerial ?? null,
        replaced_by_serial: ctx.replacedBySerial ?? null,
    };
}
