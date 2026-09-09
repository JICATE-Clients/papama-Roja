import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    volunteerIncidentCategorySchema,
    volunteerIncidentCreateSchema,
} from "@/lib/validation/schemas";
import { PERMISSION_MATRIX } from "@/lib/permissions/matrix";

/**
 * Acceptance tests for Work Order E-5 (B-31) — volunteer incident reporting.
 *
 * The card's criterion: "report filed in ≤2 taps + optional note; appears in
 * admin queue with volunteer/time/location context".
 *
 * Two taps is a SCHEMA property before it is a UI one — it is only achievable
 * if `category` is the sole required field. Most of these tests defend that.
 */

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");

/** CD §D-9's list, verbatim and in the client's order. */
const CLIENT_CATEGORIES = [
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

describe("E-5 — the eleven categories are the client's own list", () => {
    it("has exactly eleven", () => {
        expect(volunteerIncidentCategorySchema.options).toHaveLength(11);
    });

    it("matches CD §D-9 verbatim and in order", () => {
        // Not a taxonomy we designed. Merging or renaming these needs a client
        // decision, so drift fails here rather than in a report six months on.
        expect(volunteerIncidentCategorySchema.options).toEqual(CLIENT_CATEGORIES);
    });

    it("the database enum carries the same eleven", () => {
        const sql = read("supabase/migrations/20260907000013_volunteer_incident_reports.sql");
        for (const category of CLIENT_CATEGORIES) {
            expect(sql).toContain(`'${category}'`);
        }
    });
});

describe("E-5 — two taps: category is the only required field", () => {
    it("accepts a report carrying nothing but a category", () => {
        // Tap a category, tap send. This is the acceptance criterion.
        const r = volunteerIncidentCreateSchema.safeParse({ category: "no_token" });
        expect(r.success).toBe(true);
    });

    it("rejects a report with no category — there must be SOMETHING to triage", () => {
        expect(volunteerIncidentCreateSchema.safeParse({}).success).toBe(false);
    });

    it("does NOT require a note", () => {
        // Requiring one would mean typing while standing in a queue in front of
        // someone hungry, and the report would not get filed at all.
        const r = volunteerIncidentCreateSchema.safeParse({ category: "urgent_need" });
        expect(r.success).toBe(true);
    });

    it("does NOT require a vendor or location", () => {
        const r = volunteerIncidentCreateSchema.safeParse({ category: "partner_closed" });
        expect(r.success).toBe(true);
    });

    it("accepts the optional extras when they are offered", () => {
        const r = volunteerIncidentCreateSchema.safeParse({
            category: "food_safety_concern",
            note: "Rice smelled off; advised the partner to withdraw the batch.",
            vendor_id: "11111111-1111-4111-8111-111111111111",
            geo: { lat: 11.0168, lng: 76.9558 },
        });
        expect(r.success).toBe(true);
    });

    it("rejects an unknown category rather than filing it as 'other'", () => {
        // Silently coercing would corrupt the client's taxonomy.
        expect(
            volunteerIncidentCreateSchema.safeParse({ category: "vendor_was_rude" }).success
        ).toBe(false);
    });
});

describe("E-5 — safety reports lead the queue", () => {
    const sql = read("supabase/migrations/20260907000013_volunteer_incident_reports.sql");

    it("derives is_safety by TRIGGER, not from the caller", () => {
        // A client that forgot to set it would silently drop a safety report to
        // the bottom of the queue — the one failure this column exists to stop.
        expect(sql).toContain("set_volunteer_incident_safety");
        expect(sql).toMatch(/new\.is_safety := new\.category in \('food_safety_concern', 'safety_concern'\)/);
    });

    it("the admin queue sorts safety first, regardless of age", () => {
        const src = read("app/api/admin/volunteer-incidents/route.ts");
        expect(src).toMatch(/\.order\("is_safety", \{ ascending: false \}\)/);
        // Ordering is enforced in the query, not left to whoever builds the
        // screen.
        const safetyIdx = src.indexOf('order("is_safety"');
        const createdIdx = src.indexOf('order("created_at"');
        expect(safetyIdx).toBeGreaterThan(-1);
        expect(safetyIdx).toBeLessThan(createdIdx);
    });

    it("surfaces an open-safety count so the queue cannot hide one", () => {
        expect(read("app/api/admin/volunteer-incidents/route.ts")).toContain("safety_open");
    });
});

describe("E-5 — the admin queue carries the required context", () => {
    const src = read("app/api/admin/volunteer-incidents/route.ts");

    it("returns volunteer, time and location", () => {
        // The card's stated requirement.
        expect(src).toContain("volunteer:volunteers(full_name, phone)");
        expect(src).toContain("created_at");
        expect(src).toContain("district:districts(name)");
        expect(src).toMatch(/geo_lat, geo_lng/);
    });

    it("defaults to items still needing attention", () => {
        expect(src).toMatch(/\.in\("status", \["open", "acknowledged", "in_progress"\]\)/);
    });

    it("guards the status flow with a compare-and-set", () => {
        // Two admins acting at once must not both win.
        expect(src).toMatch(/\.eq\("status", incident\.status\)/);
    });
});

describe("E-5 — permission-matrix change is deliberate and narrow", () => {
    it("volunteers may create and read their OWN incident reports", () => {
        const cell = PERMISSION_MATRIX.quality_feedback_complaints_inspections.volunteer;
        expect(cell?.create).toBe("own");
        expect(cell?.read).toBe("own");
    });

    it("volunteers may NOT update or delete — triage is staff work", () => {
        // The matrix spells a denied action "none" rather than omitting it.
        const cell = PERMISSION_MATRIX.quality_feedback_complaints_inspections.volunteer;
        expect(cell?.update).toBe("none");
        expect(cell?.delete).toBe("none");
    });

    it("scope stays 'own' — incidents can name a Food Partner", () => {
        // A volunteer reads back what they filed and nothing else; an incident
        // may describe a safety situation, and that is staff information.
        const cell = PERMISSION_MATRIX.quality_feedback_complaints_inspections.volunteer;
        expect(cell?.read).not.toBe("all");
    });
});

describe("E-5 — assistance requests are folded in", () => {
    it("urgent_need and safety_concern exist as categories", () => {
        // The card folds assistance requests into this form. A separate
        // mechanism would mean a volunteer choosing which system to use under
        // pressure.
        expect(volunteerIncidentCategorySchema.options).toContain("urgent_need");
        expect(volunteerIncidentCategorySchema.options).toContain("safety_concern");
    });
});
