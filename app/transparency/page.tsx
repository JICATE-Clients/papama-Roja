import Link from "next/link";

import { PublicShell, CARD, PRIMARY_BTN } from "@/components/public/PublicShell";
import { C } from "@/components/landing/theme";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBoolean } from "@/lib/system-config";
import { getTransparencyStats, type TransparencyStats } from "@/lib/services/transparency";
import { inr as rupees } from "@/lib/format";

/**
 * Public transparency dashboard (addon #14). Aggregate-only impact numbers, no
 * PII. Published only while system_config transparency_dashboard_enabled is on;
 * otherwise a neutral "not available" panel is shown. Server-rendered so the
 * numbers come straight from the SECURITY DEFINER aggregate function.
 *
 * This is a PUBLIC page — the landing page links to it in four places — so it
 * runs on the same warm shell as /donate and /donor/signup. It was previously
 * raw slate on a blue-grey gradient, which made a visitor arriving from the
 * ivory landing page look like they had left the site.
 */
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Transparency · pApAmA",
    description: "Aggregate impact of the pApAmA meal-token programme.",
};

async function loadStats(): Promise<{ enabled: boolean; stats: TransparencyStats | null }> {
    const admin = createAdminClient();
    let enabled = false;
    try {
        enabled = await getBoolean("transparency_dashboard_enabled", admin as never);
    } catch {
        enabled = false;
    }
    if (!enabled) return { enabled: false, stats: null };
    try {
        const stats = await getTransparencyStats(admin);
        return { enabled: true, stats };
    } catch {
        return { enabled: true, stats: null };
    }
}

const num = (n: number) => n.toLocaleString("en-IN");

export default async function TransparencyPage() {
    const { enabled, stats } = await loadStats();

    return (
        <PublicShell rightLink={{ href: "/donate", label: "Donate a meal →" }} maxWidth={1040}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
                <p
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: C.accent,
                        margin: 0,
                    }}
                >
                    pApAmA · Transparency
                </p>
                <h1
                    style={{
                        fontSize: "clamp(28px, 4vw, 42px)",
                        fontWeight: 800,
                        letterSpacing: "-0.033em",
                        lineHeight: 1.1,
                        color: C.ink,
                        margin: "10px 0 0",
                    }}
                >
                    Our impact, in the open
                </h1>
                <p
                    style={{
                        fontSize: 15.5,
                        lineHeight: 1.6,
                        color: C.inkSoft,
                        maxWidth: 560,
                        margin: "14px auto 0",
                    }}
                >
                    Every meal token funded by a donor, served by a vendor, to a verified
                    beneficiary. These are programme-wide totals — no personal data is shown.
                </p>
            </div>

            {!enabled || !stats ? (
                <div style={{ ...CARD, maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
                    <p style={{ fontSize: 16, fontWeight: 600, color: C.ink, margin: 0 }}>
                        The transparency dashboard isn’t published yet.
                    </p>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: C.inkSoft, margin: "10px 0 0" }}>
                        Please check back soon. In the meantime, you can still support the
                        programme.
                    </p>
                    <Link href="/donate" style={{ ...PRIMARY_BTN, marginTop: 20 }}>
                        Donate a meal
                    </Link>
                </div>
            ) : (
                <>
                    <div
                        style={{
                            display: "grid",
                            gap: 14,
                            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                        }}
                    >
                        <StatCard
                            label="Total donations"
                            value={rupees(stats.total_donations_inr)}
                            hint="Completed contributions"
                            accent
                        />
                        <StatCard label="Meals sponsored" value={num(stats.meals_sponsored)} hint="Tokens funded" />
                        <StatCard label="Meals served" value={num(stats.meals_served)} hint="Redeemed at vendors" />
                        <StatCard label="Active vendors" value={num(stats.active_vendors)} hint="Approved food outlets" />
                        <StatCard label="Beneficiaries reached" value={num(stats.active_beneficiaries)} hint="Active, verified" />
                        <StatCard label="Cities covered" value={num(stats.cities_covered)} hint="Across the network" />
                    </div>

                    <p
                        style={{
                            marginTop: 32,
                            textAlign: "center",
                            fontSize: 12.5,
                            lineHeight: 1.6,
                            color: C.inkSoft,
                        }}
                    >
                        Figures are aggregate totals refreshed live. No personally identifiable
                        information is published.
                    </p>
                </>
            )}
        </PublicShell>
    );
}

function StatCard({
    label,
    value,
    hint,
    accent = false,
}: {
    label: string;
    value: string;
    hint: string;
    accent?: boolean;
}) {
    return (
        <div
            style={{
                ...CARD,
                padding: 22,
                ...(accent ? { background: C.accentSoft, borderColor: "#BFD9CB" } : null),
            }}
        >
            <p
                style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: C.inkSoft,
                    margin: 0,
                }}
            >
                {label}
            </p>
            <p
                style={{
                    fontSize: 30,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    color: accent ? C.accent : C.ink,
                    margin: "8px 0 0",
                }}
            >
                {value}
            </p>
            <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "4px 0 0" }}>{hint}</p>
        </div>
    );
}
