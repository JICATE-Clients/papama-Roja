"use client";

import { useEffect, useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type { BeneficiaryResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    BoolBadge,
    Dash,
    DetailDrawer,
    FilterBar,
    ListStates,
    Pagination,
    StatusBadge,
    TableHead,
    TableShell,
    useAction,
    useAdminList,
    useClientTable,
    useDetailDrawer,
    type DetailSection,
} from "../_ui";

interface BeneficiaryDetail {
    beneficiary: BeneficiaryResponse & {
        eligibility_expires_at: string | null;
        registered_by: string | null;
        registered_by_name: string | null;
        registered_by_role: string | null;
        updated_at: string | null;
    };
    redemptions: {
        id: string;
        vendor_id: string | null;
        menu_value_inr: number | null;
        token_value_inr: number | null;
        co_pay_inr: number | null;
        payment_status: string | null;
        redeemed_at: string | null;
    }[];
}

const rupee = (n: number | null | undefined) => (n != null ? `₹${n.toLocaleString("en-IN")}` : "—");
const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : null);

/** Days-until / expired label for an eligibility window. */
function eligibilityNote(expires: string | null): { text: string; soon: boolean } | null {
    if (!expires) return null;
    const days = Math.round((new Date(expires).getTime() - Date.now()) / 86_400_000);
    if (days < 0) return { text: "Eligibility expired", soon: true };
    if (days <= 14) return { text: `Expires in ${days}d`, soon: true };
    return { text: `Expires ${new Date(expires).toLocaleDateString()}`, soon: false };
}

/**
 * Admin beneficiaries page. Privacy-first: only boolean presence flags
 * (aadhaar_linked, face_hash_valid) are ever shown — never the raw hashes. Rows
 * open a detail drawer (eligibility window + redemption history); admins can
 * suspend/activate/block. Toasts resolve to the layout <ToastHost>.
 */
export default function AdminBeneficiariesPage() {
    const canManage = useCan("beneficiary_registration", "update");
    const { items, state, errorMsg, reload } = useAdminList<BeneficiaryResponse>(
        "/api/admin/beneficiaries",
        "beneficiaries",
        "/admin/beneficiaries"
    );

    const action = useAction({
        method: "PATCH",
        endpoint: () => "/api/admin/beneficiaries",
        onDone: reload,
        successMessage: () => "Beneficiary updated.",
    });

    const table = useClientTable(items, {
        searchKeys: ["full_name", "beneficiary_id", "category", "status", "eligibility"],
        tabKey: "status",
        pageSize: 15,
    });

    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Active", value: "active", count: table.tabCounts.active },
            { label: "Suspended", value: "suspended", count: table.tabCounts.suspended },
            { label: "Blocked", value: "blocked", count: table.tabCounts.blocked },
        ],
        [table.tabCounts]
    );

    const drawer = useDetailDrawer<BeneficiaryResponse>();
    const [detail, setDetail] = useState<BeneficiaryDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    useEffect(() => {
        const sel = drawer.selected;
        if (!sel) {
            setDetail(null);
            return;
        }
        let cancelled = false;
        setDetail(null);
        setDetailLoading(true);
        fetch(`/api/admin/beneficiaries/${sel.beneficiary_id}`, { credentials: "same-origin", cache: "no-store" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((d: BeneficiaryDetail) => !cancelled && setDetail(d))
            .catch(() => !cancelled && setDetail(null))
            .finally(() => !cancelled && setDetailLoading(false));
        return () => {
            cancelled = true;
        };
    }, [drawer.selected]);

    // "Name" leads: without it every row began at Category and twenty
    // beneficiaries were indistinguishable from one another.
    const columns = ["Name", "Category", "Status", "Eligibility", "Aadhaar", "Face hash", "Registered"];

    const b = detail?.beneficiary;
    const elig = eligibilityNote(b?.eligibility_expires_at ?? null);
    const sections: DetailSection[] = b
        ? [
              { label: "Name", value: b.full_name ?? "Not recorded" },
              { label: "Category", value: b.category.replace(/_/g, " ") },
              { label: "Status", value: b.status },
              { label: "Eligibility", value: b.eligibility },
              { label: "Eligibility window", value: elig ? elig.text : "No expiry", full: true },
              { label: "Aadhaar", value: b.aadhaar_linked ? "Linked" : "Not linked" },
              { label: "Face hash", value: b.face_hash_valid ? "Valid" : "Missing" },
              { label: "Registered", value: date(b.registered_at) },
              {
                  label: "Registered by",
                  value: b.registered_by_name
                      ? `${b.registered_by_name}${b.registered_by_role ? ` (${b.registered_by_role})` : ""}`
                      : b.registered_by_role,
              },
          ]
        : [];

    return (
        <div>
            <AdminPageHeader
                title="Beneficiaries"
                subtitle="Approved beneficiary registry. Identity hashes are never shown — only presence flags. Click a row for eligibility & redemption history."
                count={state === "ready" ? items.length : undefined}
            />

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search by category, status, eligibility…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="beneficiaries"
                emptyHint="Beneficiaries will appear here once they are registered and approved."
                table={
                    <>
                        <TableShell hideCols={[4, 5, 6, 7]}>
                            <TableHead columns={columns} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((b) => (
                                    <tr
                                        key={b.beneficiary_id}
                                        onClick={() => drawer.openRow(b)}
                                        className="cursor-pointer hover:bg-slate-50"
                                    >
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                            {b.full_name ?? (
                                                /* full_name is optional by design, so a lot of rows
                                                   have none. Fall back to a short id rather than an
                                                   empty cell — it is still something to read out,
                                                   match against the drawer, and search on. */
                                                <span className="font-mono text-xs text-slate-400">
                                                    {b.beneficiary_id.slice(0, 8)}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 capitalize text-slate-600">
                                            {b.category.replace(/_/g, " ")}
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={b.status} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={b.eligibility} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <BoolBadge value={b.aadhaar_linked} yes="Linked" no="No" />
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <BoolBadge value={b.face_hash_valid} yes="Valid" no="Missing" />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            {new Date(b.registered_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableShell>
                        <Pagination page={table.page} pageCount={table.pageCount} onPage={table.setPage} />
                    </>
                }
            />

            <DetailDrawer
                open={drawer.open}
                onClose={drawer.close}
                title={drawer.selected ? `${drawer.selected.category.replace(/_/g, " ")} beneficiary` : "Beneficiary"}
                subtitle="Eligibility & redemption history"
                status={detail?.beneficiary.status ?? drawer.selected?.status}
                sections={sections}
                loading={detailLoading}
                actions={
                    canManage && b && b.status !== "blocked" ? (
                        <>
                            {b.status === "suspended" ? (
                                <ActionButton
                                    tone="primary"
                                    disabled={action.busyId === b.beneficiary_id}
                                    onClick={() =>
                                        action.run(b.beneficiary_id, {
                                            beneficiary_id: b.beneficiary_id,
                                            action: "activate",
                                        })
                                    }
                                >
                                    Activate
                                </ActionButton>
                            ) : (
                                <ActionButton
                                    tone="warn"
                                    disabled={action.busyId === b.beneficiary_id}
                                    onClick={() =>
                                        action.run(
                                            b.beneficiary_id,
                                            { beneficiary_id: b.beneficiary_id, action: "suspend" },
                                            "Suspend this beneficiary? They cannot redeem while suspended."
                                        )
                                    }
                                >
                                    Suspend
                                </ActionButton>
                            )}
                            <ActionButton
                                tone="danger"
                                disabled={action.busyId === b.beneficiary_id}
                                onClick={() =>
                                    action.run(
                                        b.beneficiary_id,
                                        { beneficiary_id: b.beneficiary_id, action: "block" },
                                        "Block this beneficiary permanently? This cannot be undone here."
                                    )
                                }
                            >
                                Block
                            </ActionButton>
                        </>
                    ) : null
                }
            >
                {detail && (
                    <section>
                        {elig && (
                            <p
                                className={`mb-4 inline-block rounded-md px-2.5 py-1 text-xs font-medium ${
                                    elig.soon ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-600"
                                }`}
                            >
                                {elig.text}
                            </p>
                        )}
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Redemption history
                        </h3>
                        {detail.redemptions.length === 0 ? (
                            <p className="text-sm text-slate-400">No redemptions yet.</p>
                        ) : (
                            <ul className="space-y-2">
                                {detail.redemptions.map((r) => (
                                    <li
                                        key={r.id}
                                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                    >
                                        <span className="text-slate-600">{date(r.redeemed_at)}</span>
                                        <span className="font-medium text-slate-900">
                                            {rupee(r.menu_value_inr ?? r.token_value_inr)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}
            </DetailDrawer>
        </div>
    );
}
