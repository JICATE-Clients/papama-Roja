import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Acceptance tests for Work Order P-2 (B-29b) — need-to-know role surfaces.
 *
 * The card's criterion: "vendor-side API responses contain no beneficiary
 * category/medical data; snapshot tests per role."
 *
 * The card also says to VERIFY CURRENT EXPOSURE FIRST, so these tests are
 * written as a standing audit of each role's surface rather than as a check on
 * one change. What they found:
 *
 *   VENDOR    — already clean. The preview returns token type/value/validity
 *               only, the redemption list carries no beneficiary column, and
 *               check details are generic.
 *   VOLUNTEER — LEAKED. The beneficiary-registration list returned `category`
 *               raw, and because that feature grants volunteers read scope
 *               "all", it exposed the vulnerability category of EVERY
 *               registration in the system. Fixed by this card.
 *   ADMIN     — keeps category, which is correct: eligibility work needs it.
 */

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");

/**
 * Source with comments removed. Several of these files legitimately DISCUSS the
 * privacy rule — redemptions/route.ts names the P-1 fix — so a raw text search
 * would match prose and prove nothing.
 */
function codeOnly(src: string): string {
    return src
        .split("\n")
        .filter((l) => {
            const t = l.trim();
            return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
        })
        .join("\n");
}

/**
 * Just the GET handler — the read surface. Stops at the next `export const`, so
 * a POST that legitimately WRITES sensitive data (assisted registration collects
 * a face hash and an Aadhaar hash) is not mistaken for a disclosure.
 */
function responsePath(src: string): string {
    const code = codeOnly(src);
    const get = code.indexOf("export const GET");
    if (get === -1) return code;
    const rest = code.slice(get + 1);
    const next = rest.indexOf("export const");
    return next === -1 ? code.slice(get) : code.slice(get, get + 1 + next);
}

/**
 * Fields no non-admin READ surface may return (CD §D-10).
 *
 * Deliberately does NOT include the identity hashes. Selecting `face_hash` in
 * order to return `face_hash_present: r.face_hash != null` is correct handling,
 * not a leak — a text sweep cannot tell the two apart, so that behaviour gets
 * its own exact assertion above ("reduced to presence booleans, never returned
 * raw") rather than a blunt rule here that would fail on good code and push
 * someone to weaken it.
 */
const SENSITIVE = ["beneficiary_category", "medical_condition", "eligibility_status"];

describe("P-2 — VENDOR surfaces: token type, value, validity only", () => {
    it("the preview returns no beneficiary object", () => {
        const src = read("app/api/vendor/redemptions/preview/route.ts");
        expect(src).not.toMatch(/beneficiary:/);
    });

    it("the preview returns exactly the four permitted token fields", () => {
        const src = read("app/api/vendor/redemptions/preview/route.ts");
        const tokenBlock = src.slice(src.indexOf("token: result.token"), src.indexOf("menu_item:"));
        const fields = [...tokenBlock.matchAll(/^\s{22}(\w+):/gm)].map((m) => m[1]);
        // CD §D-10 need-to-know for a Food Partner: token type/value/validity.
        expect(fields.sort()).toEqual(["expires_at", "id", "status", "token_type", "value_inr"]);
    });

    it("the redemption list selects no beneficiary column", () => {
        const src = read("app/api/vendor/redemptions/route.ts");
        const getBlock = src.slice(src.indexOf("export const GET"));
        expect(getBlock).not.toMatch(/beneficiary_id|category|face_hash|aadhaar/);
    });

    it("no vendor route returns a beneficiary category", () => {
        for (const file of [
            "app/api/vendor/redemptions/route.ts",
            "app/api/vendor/redemptions/preview/route.ts",
            "app/api/vendor/menus/route.ts",
        ]) {
            // Comments stripped: these files legitimately EXPLAIN the rule —
            // redemptions/route.ts documents the P-1 fix by name.
            expect(codeOnly(read(file))).not.toContain("beneficiary_category");
        }
    });
});

describe("P-2 — VOLUNTEER surfaces: transaction minimum", () => {
    const src = read("app/api/volunteer/beneficiary-registrations/route.ts");

    it("the registration list no longer returns category", () => {
        // THE LEAK THIS CARD FIXED. The feature grants volunteers read scope
        // "all", so a raw `category` exposed the vulnerability category of
        // every registration in the system — not only ones they assisted with.
        const getBlock = src.slice(src.indexOf("export const GET"), src.indexOf("export const POST"));
        expect(getBlock).not.toMatch(/category: r\.category/);
    });

    it("category is not even SELECTED, so a later map edit cannot re-expose it", () => {
        const getBlock = src.slice(src.indexOf("export const GET"), src.indexOf("export const POST"));
        const selectCall = getBlock.slice(getBlock.indexOf(".select("), getBlock.indexOf(".order("));
        expect(selectCall).not.toMatch(/\bcategory\b/);
    });

    it("identity hashes are still reduced to presence booleans, never returned raw", () => {
        // This was already correct before the card and must stay that way.
        expect(src).toContain("face_hash_present: r.face_hash != null");
        expect(src).toContain("aadhaar_present: r.aadhaar_hash != null");
        const getBlock = src.slice(src.indexOf("export const GET"), src.indexOf("export const POST"));
        expect(getBlock).not.toMatch(/face_hash: r\.face_hash|aadhaar_hash: r\.aadhaar_hash/);
    });

    it("the volunteer UI no longer renders a Category column", () => {
        const ui = read("app/volunteer/beneficiaries/page.tsx");
        expect(ui).not.toMatch(/r\.category/);
        expect(ui).not.toMatch(/"Category"/);
    });

    it("the volunteer still gets what the assist function needs", () => {
        // Over-stripping would make the screen useless and is not what CD asks:
        // a volunteer must be able to find and follow up the registration they
        // helped with.
        expect(src).toContain("full_name: r.full_name");
        expect(src).toContain("status: r.registration_status");
    });

    it("volunteer incident categories are NOT beneficiary categories", () => {
        // `category` on volunteer_incidents is the eleven-item CD §D-9 list, a
        // different concept entirely. Guarding against a future over-eager
        // sweep that strips it.
        const incidents = read("app/api/volunteer/incidents/route.ts");
        expect(incidents).toContain("category");
    });
});

describe("P-2 — ADMIN surfaces keep what eligibility work requires", () => {
    it("the admin beneficiary view still carries category", () => {
        // CD §D-10: "Special Care categories shall remain restricted to
        // authorised PAPAMA personnel on a NEED-TO-KNOW basis" — admins doing
        // eligibility work are exactly that need. Stripping it here would break
        // the review process the privacy rule exists to support.
        const src = read("app/api/admin/beneficiaries/route.ts");
        expect(src).toMatch(/category/);
    });
});

describe("P-2 — no non-admin RESPONSE carries a medical or identity field", () => {
    const NON_ADMIN = [
        "app/api/vendor/redemptions/route.ts",
        "app/api/vendor/redemptions/preview/route.ts",
        "app/api/volunteer/beneficiary-registrations/route.ts",
        "app/api/volunteer/allocation/route.ts",
        "app/api/volunteer/tokens/route.ts",
    ];

    /**
     * Scoped to the RESPONSE path, not the whole file. CD §D-10 restricts what
     * is DISCLOSED to a role, not what that role may submit — a volunteer
     * assisting a registration legitimately sends a face hash and an Aadhaar
     * hash, and the POST schema that accepts them is the intended flow. Auditing
     * the whole file would flag that collection as a leak, which would be wrong
     * and would push someone to weaken the assist feature to silence a test.
     */
    it.each(NON_ADMIN)("%s discloses nothing sensitive", (file) => {
        const response = responsePath(read(file));
        for (const field of SENSITIVE) {
            expect(response).not.toContain(field);
        }
    });

    it("the volunteer registration POST may still COLLECT identity hashes", () => {
        // Asserting the boundary explicitly, so a later "privacy sweep" does not
        // strip the collection path and break assisted registration.
        const src = read("app/api/volunteer/beneficiary-registrations/route.ts");
        expect(src).toContain("aadhaar_hash: z.string()");
    });
});
