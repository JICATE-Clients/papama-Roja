import { describe, expect, it } from "vitest";

import { buildTokenDisplayPayload, scopeLabel } from "@/lib/services/tokenDisplay";
import { planReissue, type ReissueSource } from "@/lib/services/tokenReissuePlan";

/**
 * Work Order A-2 (B-23) — controlled reissue and the token display payload.
 *
 * Card: "reissue flow — admin review → approve with reason → new token (new
 * ID/QR/dates) linked via replacement_for_token_id → original permanently
 * expired"; "reissued token carries original's value with link"; "token display
 * payload (type, value, scope, activation, expiry) for digital view and print".
 */

const NOW = "2026-09-15T06:00:00.000Z";
const DAY = 86_400_000;

function expired(over: Partial<ReissueSource> = {}): ReissueSource {
    return {
        id: "orig-1",
        serial_number: "PPM-0001",
        status: "expired",
        token_type: "standard",
        value_inr: 60,
        donor_id: "donor-1",
        donation_id: "don-1",
        campaign_id: null,
        beneficiary_id: null,
        is_emergency: false,
        emergency_id: null,
        distribution_mode: "PAPAMA_DISTRIBUTED",
        geographic_scope: "DISTRICT",
        scope_state_id: "tn",
        scope_district_id: "cbe",
        scope_city: null,
        scope_pincode: null,
        area_lock: null,
        special_care_category_id: null,
        redeemed_at: null,
        value_returned_to_pool_at: "2026-09-10T00:00:00.000Z",
        ...over,
    };
}

const REASON = "Pool token lapsed before distribution; reissuing for relief drive";

function plan(over: Partial<Parameters<typeof planReissue>[0]> = {}) {
    return planReissue({
        original: expired(),
        existingReplacementSerial: null,
        reason: REASON,
        expiryDays: 60,
        now: NOW,
        ...over,
    });
}

describe("A-2 reissue — who is eligible", () => {
    it("REFUSES a token that is not expired", () => {
        for (const status of ["live", "distributed", "in_admin_pool", "blocked", "redeemed"]) {
            const p = plan({ original: expired({ status }) });
            expect(p.ok).toBe(false);
        }
    });

    it("REFUSES a token that was redeemed", () => {
        expect(plan({ original: expired({ redeemed_at: NOW }) }).ok).toBe(false);
    });

    it("REFUSES a second reissue of the same token", () => {
        const p = plan({ existingReplacementSerial: "PPM-RIS-X" });
        expect(p.ok).toBe(false);
        if (!p.ok) expect(p.error).toMatch(/already been reissued as PPM-RIS-X/);
    });

    it("REFUSES without a real reason — approval must carry one", () => {
        expect(plan({ reason: "" }).ok).toBe(false);
        expect(plan({ reason: "   ok   " }).ok).toBe(false);
    });

    it("REFUSES a token with no value", () => {
        expect(plan({ original: expired({ value_inr: 0 }) }).ok).toBe(false);
    });
});

describe("A-2 reissue — the new token", () => {
    it("carries the original's value, type and scope, with a permanent link", () => {
        const p = plan();
        if (!p.ok) throw new Error(p.error);
        expect(p.newToken.value_inr).toBe(60);
        expect(p.newToken.token_type).toBe("standard");
        expect(p.newToken.geographic_scope).toBe("DISTRICT");
        expect(p.newToken.scope_district_id).toBe("cbe");
        expect(p.newToken.replacement_for_token_id).toBe("orig-1");
        expect(p.newToken.reissue_reason).toBe(REASON);
    });

    it("never carries the old beneficiary or the old dates", () => {
        const p = plan({ original: expired({ beneficiary_id: "ben-1" }) });
        if (!p.ok) throw new Error(p.error);
        expect(p.newToken.beneficiary_id).toBeNull();
        expect(Object.keys(p.newToken)).not.toContain("id");
        expect(Object.keys(p.newToken)).not.toContain("qr_hash");
    });

    it("does not touch the original — it stays permanently expired", () => {
        const p = plan();
        if (!p.ok) throw new Error(p.error);
        expect(Object.keys(p.newToken)).not.toContain("status_of_original");
        expect(p.newToken.status).not.toBe("expired");
    });

    it("pApAmA-distributed: back to the pool UNACTIVATED — the 60 days start at distribution", () => {
        const p = plan();
        if (!p.ok) throw new Error(p.error);
        expect(p.newToken.status).toBe("in_admin_pool");
        expect(p.newToken.activated_at).toBeNull();
        expect(p.newToken.expires_at).toBeNull();
    });

    it("donor-controlled: live, activated now, expiring after token_expiry_days", () => {
        const p = plan({ original: expired({ distribution_mode: "DONOR_CONTROLLED" }) });
        if (!p.ok) throw new Error(p.error);
        expect(p.newToken.status).toBe("live");
        expect(p.newToken.activated_at).toBe(NOW);
        expect(Date.parse(p.newToken.expires_at!) - Date.parse(NOW)).toBe(60 * DAY);
    });

    it("donor-controlled with token_expiry_days UNSET is refused, never defaulted", () => {
        const p = plan({ original: expired({ distribution_mode: "DONOR_CONTROLLED" }), expiryDays: null });
        expect(p.ok).toBe(false);
    });

    it("draws the value back out of the Meal Pool when expiry had returned it", () => {
        const p = plan();
        if (!p.ok) throw new Error(p.error);
        expect(p.poolDebitInr).toBe(60);
    });

    it("draws nothing from the pool when the value never went in", () => {
        const p = plan({ original: expired({ value_returned_to_pool_at: null }) });
        if (!p.ok) throw new Error(p.error);
        expect(p.poolDebitInr).toBe(0);
    });
});

describe("A-2 token display payload", () => {
    const base = {
        serial_number: "PPM-0001",
        token_type: "special_care",
        value_inr: 100,
        status: "live",
        distribution_mode: "DONOR_CONTROLLED" as const,
        geographic_scope: "DISTRICT",
        scope_city: null,
        scope_pincode: null,
        activated_at: "2026-09-01T00:00:00.000Z",
        expires_at: "2026-10-31T00:00:00.000Z",
    };

    it("carries type, value, scope, activation and expiry", () => {
        const d = buildTokenDisplayPayload(base, { districtName: "Coimbatore", stateName: "Tamil Nadu" });
        expect(d.token_type_label).toBe("SPECIAL CARE");
        expect(d.value_label).toBe("₹100");
        expect(d.scope_label).toBe("Valid in Coimbatore district, Tamil Nadu");
        expect(d.activated_at).toBe(base.activated_at);
        expect(d.expires_at).toBe(base.expires_at);
        expect(d.validity_label).toMatch(/2026.*–.*2026/);
    });

    it("says 'Expired – Not Redeemed' for an expired token", () => {
        expect(buildTokenDisplayPayload({ ...base, status: "expired" }).status_label).toBe("Expired – Not Redeemed");
    });

    it("names the replacement once an expired token is reissued", () => {
        const d = buildTokenDisplayPayload({ ...base, status: "expired" }, { replacedBySerial: "PPM-RIS-1" });
        expect(d.status_label).toBe("Expired – Reissued as PPM-RIS-1");
    });

    it("an unactivated pool token explains when its validity starts", () => {
        const d = buildTokenDisplayPayload({
            ...base,
            distribution_mode: "PAPAMA_DISTRIBUTED",
            activated_at: null,
            expires_at: null,
        });
        expect(d.validity_label).toMatch(/from when it is given out/);
    });

    it("carries nothing about the beneficiary", () => {
        const d = buildTokenDisplayPayload(base);
        expect(JSON.stringify(d)).not.toMatch(/beneficiar|category|medical/i);
    });

    it("labels every scope", () => {
        expect(scopeLabel("PAN_INDIA", {})).toBe("Valid across India");
        expect(scopeLabel("STATE", { state: "Kerala" })).toBe("Valid in Kerala");
        expect(scopeLabel("CITY", { city: "Salem" })).toBe("Valid in Salem");
        expect(scopeLabel("PIN", { pincode: "641001" })).toBe("Valid at PIN 641001");
    });
});
