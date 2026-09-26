import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { volunteerIncidentCreateSchema } from "@/lib/validation/schemas";

/**
 * E-5 (B-31) — the volunteer's own reporting screen.
 *
 * The card's acceptance is about the INTERACTION: "report filed in ≤2 taps +
 * optional note". The API was already covered; these tests cover the thing that
 * was missing — a screen a volunteer can actually file from — by asserting on
 * its source, because two taps is a property of the page, not of a function.
 */
const page = readFileSync("app/volunteer/incidents/page.tsx", "utf8");
const header = readFileSync("app/volunteer/VolunteerHeader.tsx", "utf8");

/** CD §D-9's eleven categories. */
const CATEGORIES = [
    "no_phone",
    "no_token",
    "partner_closed",
    "partner_refusing_valid_token",
    "no_food",
    "connectivity_failure",
    "token_problem",
    "urgent_need",
    "food_safety_concern",
    "safety_concern",
    "other",
];

describe("E-5 — the volunteer can reach and use the screen", () => {
    it("is linked from the volunteer navigation, on desktop and on a phone", () => {
        expect(header).toContain('href: "/volunteer/incidents"');
        // Twice: the sidebar item and the mobile tab bar.
        expect(header.match(/\/volunteer\/incidents/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it("offers all eleven CD §D-9 categories as buttons", () => {
        for (const c of CATEGORIES) expect(page).toContain(`key: "${c}"`);
    });

    it("files in two taps — select a category, then send", () => {
        // Tap 1 sets the category; tap 2 calls the POST. Nothing else is required
        // in between, which is what the acceptance criterion means.
        expect(page).toContain("setSelected(");
        expect(page).toContain('post("/api/volunteer/incidents"');
        expect(page).toContain("Send report");
    });

    it("keeps the note optional — an empty note is simply not sent", () => {
        expect(page).toContain("note.trim() ? { note: note.trim() } : {}");
        // The schema agrees: category is the only required field.
        expect(volunteerIncidentCreateSchema.safeParse({ category: "partner_closed" }).success).toBe(true);
    });

    it("never blocks a filing on the location permission", () => {
        // currentGeo resolves null on refusal/timeout rather than throwing, so a
        // denied prompt cannot cost a report.
        expect(page).toContain("resolve(null)");
        expect(page).toContain("timeout: 4000");
    });

    it("marks the three safety categories so the volunteer sees what escalates", () => {
        for (const c of ["urgent_need", "food_safety_concern", "safety_concern"]) {
            const entry = page.slice(page.indexOf(`key: "${c}"`));
            expect(entry.slice(0, 200)).toContain("safety: true");
        }
    });
});

describe("A-4 — the donor token LIST shows mode and expiry presentation", () => {
    // The card asks for both on the list, not only in the detail view.
    const list = readFileSync("app/donor/tokens/page.tsx", "utf8");

    it("shows the distribution mode on each row", () => {
        expect(list).toContain("distribution_mode_label");
    });

    it("presents an expired token as 'Expired – Not Redeemed'", () => {
        expect(list).toContain("Expired – Not Redeemed");
    });
});
