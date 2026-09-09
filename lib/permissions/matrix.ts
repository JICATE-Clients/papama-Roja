import type { UserRole } from "@/lib/types/enums";

/**
 * Phase-1 Role Access Matrix — encodes docs/papama-phase1-spec.md §6 verbatim.
 * This is the authorization source of truth consumed by lib/permissions.
 */

/** The protected feature areas (rows of the §6 matrix). */
export const FEATURES = [
    // --- Original 11 ---
    "donor_donation_credit",
    "token_generation",
    "token_distribution",
    "beneficiary_registration",
    "token_redemption",
    "vendor_management",
    "vendor_menu_pricing",
    "vendor_settlement",
    "proof_of_service",
    "fraud_monitoring",
    "audit_reports",
    // --- Spec §6 Revision 2 features ---
    "donor_sponsorship_counters",                // [M1-2]
    "institution_bulk_allocation",               // [M1-11]
    "vendor_discovery",                          // [M1-5]
    "vendor_capacity_availability",              // [M1-4]
    "financial_ledgers_reconciliation",          // [M1-12]
    "refunds_failed_payments",                   // [M2-4]
    "csr_module",                                // [M1-7]
    "volunteer_management",                      // [M1-13]
    "quality_feedback_complaints_inspections",   // [M2-11]
    "emergency_disaster_mode",                   // [M2-9]
    "analytics_dashboard",                       // [M2-8]
    "public_transparency_dashboard",             // [M1-14]
    "document_management",                       // [M2-13]
    "consent_management",                        // [M2-14]
] as const;
export type Feature = (typeof FEATURES)[number];

/** CRUD actions. */
export type Action = "create" | "read" | "update" | "delete";

/**
 * Scope of an allowed action:
 *  - "all"  → across all rows
 *  - "own"  → only rows the caller owns (enforced together with RLS)
 *  - "none" → not allowed
 */
export type Scope = "all" | "own" | "none";

/**
 * Special capabilities beyond plain CRUD (the parenthetical notes in §6):
 *  approve       — Vendor_Manager approves vendors/menus
 *  override      — Admin overrides settlement (hold/delay)
 *  scan_proof    — Vendor scans token / submits proof during redemption
 *  assist        — Volunteer assists beneficiary registration (cannot approve)
 *  self_register — Guest/Beneficiary self-registration
 *  donate        — Guest donates via QR/web without an account
 */
export type Capability =
    | "approve"
    | "override"
    | "scan_proof"
    | "assist"
    | "self_register"
    | "donate";

export interface Permission {
    create: Scope;
    read: Scope;
    update: Scope;
    delete: Scope;
    caps: Capability[];
}

const NONE: Permission = { create: "none", read: "none", update: "none", delete: "none", caps: [] };
const R_ALL: Permission = { create: "none", read: "all", update: "none", delete: "none", caps: [] };
const CRUD_ALL: Permission = { create: "all", read: "all", update: "all", delete: "all", caps: [] };

function perm(p: Partial<Permission>): Permission {
    return { ...NONE, ...p };
}

/**
 * matrix[feature][role] → Permission. Any (feature, role) not listed defaults
 * to NONE. Mirrors the §6 table cell-by-cell.
 */
export const PERMISSION_MATRIX: Record<Feature, Partial<Record<UserRole, Permission>>> = {
    donor_donation_credit: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        donor: perm({ create: "own", read: "own", update: "own" }),
        guest: perm({ create: "all", caps: ["donate"] }), // donate via QR/web
    },
    token_generation: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        volunteer: R_ALL,
        donor: perm({ create: "own", read: "own", update: "own" }), // Own (CRU)
    },
    token_distribution: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        volunteer: perm({ create: "own", read: "own" }), // CR
        donor: perm({ create: "own", read: "own", update: "own" }), // CRU
    },
    beneficiary_registration: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        volunteer: perm({ create: "all", read: "all", caps: ["assist"] }), // CR (assist), cannot approve
        beneficiary: perm({ read: "own" }), // Own
        guest: perm({ create: "own", caps: ["self_register"] }), // Self-register
    },
    token_redemption: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        vendor: perm({ create: "own", read: "own", caps: ["scan_proof"] }), // CR (scan/proof)
        volunteer: R_ALL,
        beneficiary: perm({ read: "own" }), // Own
    },
    vendor_management: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: perm({ create: "all", read: "all", update: "all", caps: ["approve"] }), // Approve/CRU
        vendor: perm({ read: "own", update: "own" }), // Own profile
        volunteer: R_ALL,
    },
    vendor_menu_pricing: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: perm({ read: "all", update: "all", caps: ["approve"] }), // Approve
        vendor: perm({ create: "own", read: "own", update: "own" }), // Propose (Own)
    },
    vendor_settlement: {
        admin: perm({ create: "all", read: "all", update: "all", delete: "all", caps: ["override"] }), // CRUD + Override
        compliance: perm({ read: "all", caps: ["approve"] }), // spec §6: R + Approve
        vendor_manager: R_ALL,
        vendor: perm({ read: "own" }), // Own (view)
    },
    proof_of_service: {
        // Admin reviews uploaded proofs: read all + update (approve/reject) →
        // approval releases the redemption's locked payment for settlement.
        admin: perm({ read: "all", update: "all", caps: ["approve"] }),
        compliance: R_ALL,
        vendor_manager: R_ALL,
        vendor: perm({ create: "own" }), // C (Own) — upload proof for own redemptions
    },
    fraud_monitoring: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
    },
    audit_reports: {
        admin: CRUD_ALL,
        compliance: R_ALL,
    },

    // === Spec §6 Revision 2 features =========================================

    // [M1-2] Donor Sponsorship Counters — §6 row 2
    donor_sponsorship_counters: {
        admin: R_ALL,
        compliance: R_ALL,
        donor: perm({ read: "own" }),
    },

    // [M1-11] Institution Bulk Allocation — §6 row 5
    institution_bulk_allocation: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        volunteer: R_ALL,
        beneficiary: perm({ read: "own" }), // Institution own view
    },

    // [M1-5] Vendor Discovery — §6 row 7
    vendor_discovery: {
        admin: R_ALL,
        vendor_manager: R_ALL,
        vendor: perm({ read: "own" }), // Own listing
        volunteer: R_ALL,
        beneficiary: R_ALL,
    },

    // [M1-4] Vendor Capacity & Availability — §6 row 10
    vendor_capacity_availability: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        vendor: perm({ create: "own", read: "own", update: "own" }), // Own (CRU)
        beneficiary: perm({ read: "own" }), // R (status)
    },

    // [M1-12] Financial Ledgers & Reconciliation — §6 row 14
    financial_ledgers_reconciliation: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor: perm({ read: "own" }), // Own payable (R)
    },

    // [M2-4] Refunds / Failed Payments — §6 row 15
    refunds_failed_payments: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        donor: perm({ create: "own", read: "own" }), // Own (view/request) — addon #20: donor self-initiates
    },

    // [M1-7] CSR Module — §6 row 16
    csr_module: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        donor: perm({ create: "own", read: "own", update: "own" }), // Own (corporate)
    },

    // [M1-13] Volunteer Management — §6 row 17
    volunteer_management: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        volunteer: perm({ read: "own" }), // Own profile/activity
    },

    // [M2-11] Quality: Feedback / Complaints / Inspections — §6 row 18
    quality_feedback_complaints_inspections: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: perm({ create: "all", read: "all", update: "all" }), // CRU
        vendor: perm({ read: "own", update: "own" }), // Own (respond)
        beneficiary: perm({ create: "own" }), // C (feedback/complaint)
        /**
         * PERMISSION-MATRIX CHANGE (E-5 / B-31, CD §D-9) — flagged deliberately.
         *
         * Volunteers gain create+read on their OWN field incident reports. This
         * mirrors the beneficiary grant directly above: an incident report is
         * structurally the same thing as a complaint — a field report into a
         * staff queue — so it belongs here rather than widening
         * volunteer_management, which is about volunteer records themselves.
         *
         * Scope is "own": a volunteer reads back what they filed and nothing
         * else. Incidents can name a Food Partner or describe a safety
         * situation, and that is staff information.
         */
        volunteer: perm({ create: "own", read: "own" }), // C+R own incident reports
    },

    // [M2-9] Emergency / Disaster Mode — §6 row 19
    emergency_disaster_mode: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        volunteer: R_ALL,
    },

    // [M2-8] Analytics Dashboard — §6 row 20
    analytics_dashboard: {
        admin: R_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
    },

    // [M1-14] Public Transparency Dashboard — §6 row 21
    public_transparency_dashboard: {
        admin: R_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        vendor: R_ALL,
        volunteer: R_ALL,
        donor: R_ALL,
        beneficiary: R_ALL,
        guest: R_ALL,
    },

    // [M2-13] Document Management — §6 row 22
    document_management: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        vendor: perm({ create: "own", read: "own" }), // Own (upload)
        beneficiary: perm({ create: "own", read: "own" }), // Own (upload)
    },

    // [M2-14] Consent Management — §6 row 23
    consent_management: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        donor: perm({ create: "own", read: "own", update: "own" }), // Own
        beneficiary: perm({ create: "own", read: "own", update: "own" }), // Own
    },
};
