import type { Action, Feature } from "@/lib/permissions";

/**
 * The admin console's section directory — single source of truth for both the
 * home-page card grid (app/admin/page.tsx) and the persistent nav strip
 * (app/admin/AdminHeader.tsx). Each entry names the permission cell that gates
 * it so the nav can hide links a role can't use (`useCan(feature, action)`);
 * the server route still enforces the matrix regardless.
 */
export interface AdminSection {
    href: string;
    title: string;
    description: string;
    /** Permission cell the nav gates the link on (read access to the section). */
    feature: Feature;
    action: Action;
    /** Short label for the compact nav strip (defaults to title). */
    navLabel?: string;
    /** Sidebar grouping. 25 flat links needed a horizontal scrollbar to fit. */
    group: AdminGroup;
}

/**
 * Sidebar groups, in render order. Chosen around what someone is trying to DO
 * rather than which table backs the page: who we work with, where the money
 * goes, running the programme day to day, checking it behaved, and the knobs.
 */
export const ADMIN_GROUPS = ["People", "Money", "Operations", "Oversight", "Setup"] as const;
export type AdminGroup = (typeof ADMIN_GROUPS)[number];

export const ADMIN_SECTIONS: AdminSection[] = [
    {
        href: "/admin/vendors",
        group: "People",
        title: "Vendors",
        description: "Registered food vendors and their onboarding/KYC status.",
        feature: "vendor_management",
        action: "read",
    },
    {
        href: "/admin/campaigns",
        group: "Money",
        title: "Campaigns",
        description: "Fund-raising appeals donors give to, and what each has raised.",
        feature: "emergency_disaster_mode",
        action: "read",
    },
    {
        href: "/admin/ledgers",
        group: "Money",
        title: "Ledgers",
        description: "The triple-ledger money trail and the reconciliation check on top of it.",
        feature: "financial_ledgers_reconciliation",
        action: "read",
    },
    {
        href: "/admin/refunds",
        group: "Money",
        title: "Refunds",
        description: "Failed or duplicate payments and the refund requests raised against them.",
        feature: "refunds_failed_payments",
        action: "read",
    },
    {
        href: "/admin/donations",
        group: "Money",
        title: "Donations",
        description: "All gifts (attributed + anonymous); convert the guest pool into distributable tokens.",
        feature: "donor_donation_credit",
        action: "read",
    },
    {
        href: "/admin/beneficiaries",
        group: "People",
        title: "Beneficiaries",
        description: "Approved beneficiary registry — category, status, eligibility.",
        feature: "beneficiary_registration",
        action: "read",
    },
    {
        href: "/admin/beneficiary-registrations",
        group: "People",
        title: "Beneficiary registrations",
        description: "Review eligibility submissions; approve to create verified beneficiaries.",
        feature: "beneficiary_registration",
        action: "read",
        navLabel: "Registrations",
    },
    {
        href: "/admin/vendor-menus",
        group: "Operations",
        title: "Vendor menus",
        description: "Approve vendor-proposed menu items (incl. Special-Care equivalents).",
        feature: "vendor_menu_pricing",
        action: "read",
        navLabel: "Menus",
    },
    {
        href: "/admin/volunteers",
        group: "People",
        title: "Volunteers",
        description: "Volunteer registry for token distribution (Path B).",
        feature: "token_distribution",
        action: "read",
    },
    {
        href: "/admin/tokens",
        group: "Money",
        title: "Tokens",
        description: "Token registry by status/holder; run the expire-sweep for lapsed tokens.",
        feature: "token_generation",
        action: "read",
    },
    {
        href: "/admin/proofs",
        group: "Operations",
        title: "Proof review",
        description:
            "Verify vendor plate-photo + receipt proofs; approval releases the locked payment for settlement.",
        feature: "proof_of_service",
        action: "read",
        navLabel: "Proofs",
    },
    {
        href: "/admin/settlements",
        group: "Money",
        title: "Settlements",
        description: "Vendor settlement headers and payout status.",
        feature: "vendor_settlement",
        action: "read",
    },
    {
        href: "/admin/fraud",
        group: "Oversight",
        title: "Fraud",
        description: "Fraud flags, severity, detection method and resolution.",
        feature: "fraud_monitoring",
        action: "read",
    },
    {
        href: "/admin/reports",
        group: "Oversight",
        title: "Reports",
        description: "Generated compliance & CSR report exports.",
        feature: "audit_reports",
        action: "read",
    },
    {
        href: "/admin/audit-logs",
        group: "Oversight",
        title: "Audit logs",
        description: "Append-only, immutable trail of every admin action.",
        feature: "audit_reports",
        action: "read",
        navLabel: "Audit",
    },
    {
        href: "/admin/ngo-partners",
        group: "People",
        title: "NGO partners",
        description: "Partner NGO/organisation reference registry.",
        feature: "audit_reports",
        action: "read",
        navLabel: "NGOs",
    },
    {
        href: "/admin/system-config",
        group: "Setup",
        title: "System config",
        description: "Admin-tunable rules read at runtime (thresholds, limits).",
        feature: "audit_reports",
        action: "read",
        navLabel: "Config",
    },
    // --- Phase-1 addon areas (pages created by Wave-2 agents) ---------------
    {
        href: "/admin/scheduled-reminders",
        group: "Operations",
        title: "Scheduled reminders",
        description: "Occasions donors booked a token for, and the seven-day reminder sweep.",
        feature: "token_distribution",
        action: "read",
    },
    {
        href: "/admin/meal-windows",
        group: "Operations",
        title: "Meal windows",
        description: "Configure per-slot serving windows (breakfast/lunch/dinner/snack) enforced at redemption.",
        feature: "token_redemption",
        action: "read",
        navLabel: "Meals",
    },
    {
        href: "/admin/vendor-capacity",
        group: "Operations",
        title: "Vendor capacity",
        description: "Vendor daily capacity & availability windows; throttle redemptions when capacity is reached.",
        feature: "vendor_management",
        action: "read",
        navLabel: "Capacity",
    },
    {
        href: "/admin/vendor-feedback",
        group: "Oversight",
        title: "Vendor feedback",
        description: "Beneficiary feedback, inspections and auto-suspend review for vendors.",
        feature: "vendor_management",
        action: "read",
        navLabel: "Feedback",
    },
    {
        href: "/admin/settlement-audit",
        group: "Money",
        title: "Settlement audit",
        description: "Random and flagged settlement audit queue; review before payout release.",
        feature: "vendor_settlement",
        action: "read",
        navLabel: "Audit queue",
    },
    {
        href: "/admin/institutions",
        group: "People",
        title: "Institutions",
        description: "Partner institutions: bulk token allocation and per-institution redemption reporting.",
        feature: "audit_reports",
        action: "read",
    },
    {
        href: "/admin/csr",
        group: "Money",
        title: "Corporate CSR",
        description: "Corporate CSR donors and aggregated CSR reports (by company / campaign / financial year).",
        feature: "audit_reports",
        action: "read",
        navLabel: "CSR",
    },
    {
        href: "/admin/volunteer-activity",
        group: "Operations",
        title: "Volunteer activity",
        description: "Volunteer zones and field-activity log (tokens distributed, registrations assisted).",
        feature: "token_distribution",
        action: "read",
        navLabel: "Activity",
    },
    {
        href: "/admin/emergency",
        group: "Operations",
        title: "Emergency mode",
        description: "Global emergency relief toggle and relaxed per-day meal limits.",
        feature: "audit_reports",
        action: "read",
        navLabel: "Emergency",
    },
    // --- addon2 areas -------------------------------------------------------
    {
        href: "/admin/analytics",
        group: "Oversight",
        title: "Analytics",
        description: "Meals served, donation trends, vendor performance, token utilisation, financial and fraud summaries — by city and category.",
        feature: "audit_reports",
        action: "read",
    },
    {
        href: "/admin/notification-templates",
        group: "Setup",
        title: "Notification templates",
        description: "Editable copy for donor notifications ({{placeholders}}) per kind and channel.",
        feature: "audit_reports",
        action: "read",
        navLabel: "Templates",
    },
    {
        href: "/admin/complaints",
        group: "Oversight",
        title: "Complaints",
        description: "Beneficiary complaint queue — triage open → investigating → resolved/dismissed.",
        feature: "vendor_management",
        action: "read",
    },
];
