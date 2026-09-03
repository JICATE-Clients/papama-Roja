"use client";

import { useEffect, useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import { shortDate } from "@/lib/format";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    DetailDrawer,
    FilterBar,
    ListStates,
    Pagination,
    RunJobBar,
    StatusBadge,
    TableHead,
    TableShell,
    useAction,
    useAdminList,
    useClientTable,
    useDetailDrawer,
    type DetailSection,
} from "../_ui";

type TokenRow = {
    id: string;
    /** The identifier printed on the QR — what anyone in the field will quote. */
    serial_number: string | null;
    status: string;
    token_type: string;
    value_inr: number | null;
    has_donor: boolean;
    has_beneficiary: boolean;
    /** Who funded it. Null for pool/emergency tokens with no donor attached. */
    donor_name: string | null;
    minted_at: string | null;
    expires_at: string | null;
    redeemed_at: string | null;
};

/** Shape returned by GET /api/admin/tokens/[id]. */
interface TokenDetail {
    token: {
        id: string;
        serial_number: string | null;
        qr_hash: string | null;
        token_type: string;
        value_inr: number | null;
        status: string;
        has_donor: boolean;
        donor_name: string | null;
        has_beneficiary: boolean;
        special_instructions: string | null;
        expires_at: string | null;
        minted_at: string | null;
        distributed_at: string | null;
        redeemed_at: string | null;
        expired_at: string | null;
        cancelled_at: string | null;
    };
    handoffs: {
        id: string;
        channel: string;
        distributed_by: string | null;
        actor_name: string | null;
        actor_role: string | null;
        beneficiary_id: string | null;
        distribution_location: string | null;
        notes: string | null;
        distributed_at: string;
    }[];
    redemption: {
        id: string;
        vendor_id: string | null;
        token_value_inr: number | null;
        menu_value_inr: number | null;
        difference_paid_inr: number | null;
        co_pay_inr: number | null;
        payment_status: string | null;
        proof_status: string | null;
        redeemed_at: string | null;
    } | null;
    forfeited_inr: number | null;
    audit: { id: string; action: string; summary: string | null; actor_role: string | null; created_at: string }[];
}

const STATUS_TABS = [
    "all",
    "live",
    "in_admin_pool",
    "assigned_to_volunteer",
    "distributed",
    "redeemed",
    "expired",
] as const;

const rupee = (n: number | null | undefined) =>
    n != null ? `₹${n.toLocaleString("en-IN")}` : "—";
const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : null);

/**
 * Custody, derived from the lifecycle status.
 *
 * NOT a table column any more: it is a pure function of `status`, so showing
 * both put the same fact in two adjacent cells. It survives for the detail
 * drawer, where spelling out "Beneficiary" beside the raw enum is clearer.
 */
function holderOf(status: string): string {
    switch (status) {
        case "generated":
        case "live":
            return "Donor";
        case "in_admin_pool":
            return "Admin pool";
        case "assigned_to_volunteer":
            return "Volunteer";
        case "distributed":
            return "Beneficiary";
        case "redeemed":
            return "Redeemed";
        case "expired":
            return "Expired";
        default:
            return "—";
    }
}

const channelLabel: Record<string, string> = {
    donor_self: "Donor self-distributed",
    admin_to_volunteer: "Admin → volunteer",
    volunteer_request_grant: "Granted on request",
    volunteer_to_beneficiary: "Volunteer → beneficiary",
    admin_revoke: "Revoked to pool",
};

/** True when a live/distributed token expires within 7 days. */
function expiringSoon(t: TokenRow): boolean {
    if (!t.expires_at || t.status === "redeemed" || t.status === "expired") return false;
    const days = (new Date(t.expires_at).getTime() - Date.now()) / 86_400_000;
    return days >= 0 && days <= 7;
}

/** Admin token registry — lifecycle list + per-token detail drawer + revoke (token-flow §6, TOK-6). */
export default function AdminTokensPage() {
    const canSweep = useCan("token_generation", "update");
    const canRevoke = useCan("token_distribution", "update");

    const { items, state, errorMsg, reload } = useAdminList<TokenRow>(
        "/api/admin/tokens",
        "tokens",
        "/admin/tokens"
    );

    const table = useClientTable(items, {
        searchKeys: ["serial_number", "id", "donor_name", "status", "token_type"],
        tabKey: "status",
        pageSize: 15,
    });

    const tabs = useMemo(
        () =>
            STATUS_TABS.map((v) => ({
                label: v === "all" ? "All" : v.replace(/_/g, " "),
                value: v,
                count: table.tabCounts[v],
            })),
        [table.tabCounts]
    );

    const drawer = useDetailDrawer<TokenRow>();

    // Lazily fetch the full lifecycle detail when a row opens the drawer.
    const [detail, setDetail] = useState<TokenDetail | null>(null);
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
        fetch(`/api/admin/tokens/${sel.id}`, { credentials: "same-origin", cache: "no-store" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((d: TokenDetail) => {
                if (!cancelled) setDetail(d);
            })
            .catch(() => {
                if (!cancelled) setDetail(null);
            })
            .finally(() => {
                if (!cancelled) setDetailLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [drawer.selected]);

    const revoke = useAction({
        method: "POST",
        endpoint: (id) => `/api/admin/tokens/${id}/revoke`,
        onDone: async () => {
            await reload();
            drawer.close();
        },
        successMessage: () => "Token revoked back to the admin pool.",
    });

    const t = detail?.token;
    const sections: DetailSection[] = t
        ? [
              { label: "Serial", value: t.serial_number, mono: true },
              { label: "Type", value: t.token_type.replace(/_/g, " ") },
              { label: "Value", value: rupee(t.value_inr) },
              { label: "Holder", value: holderOf(t.status) },
              ...(t.donor_name ? [{ label: "Donor", value: t.donor_name }] : []),
              { label: "Minted", value: date(t.minted_at) },
              { label: "Expires", value: date(t.expires_at) },
              { label: "Distributed", value: date(t.distributed_at) },
              { label: "Redeemed", value: date(t.redeemed_at) },
              ...(t.expired_at ? [{ label: "Expired", value: date(t.expired_at) }] : []),
              ...(t.cancelled_at ? [{ label: "Revoked", value: date(t.cancelled_at) }] : []),
              { label: "QR hash", value: t.qr_hash, mono: true, full: true },
              ...(t.special_instructions
                  ? [{ label: "Instructions", value: t.special_instructions, full: true }]
                  : []),
          ]
        : [];

    return (
        <div>
            <AdminPageHeader
                title="Tokens"
                subtitle="Token registry by lifecycle status. Click a token for its full journey; run the expire-sweep to auto-invalidate lapsed tokens."
                count={state === "ready" ? items.length : undefined}
            />

            {canSweep && (
                <RunJobBar
                    label="Expiry sweep:"
                    endpoint="/api/admin/tokens/expire-sweep"
                    buttonText="Run expire-sweep"
                    busyText="Sweeping…"
                    successMessage={(d) =>
                        Number(d.expired) > 0
                            ? `Invalidated ${d.expired} expired token(s).`
                            : "No tokens were past expiry."
                    }
                    onDone={reload}
                />
            )}

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search by serial, donor, status, type…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="tokens"
                emptyHint="Minted tokens will appear here."
                table={
                    <>
                        <TableShell hideCols={[2, 5, 6, 7, 8]}>
                            <TableHead
                                columns={["Serial", "Type", "Value", "Status", "Funded by", "Minted", "Expires", "Redeemed"]}
                            />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((t) => (
                                    <tr
                                        key={t.id}
                                        onClick={() => drawer.openRow(t)}
                                        className="cursor-pointer hover:bg-slate-50"
                                    >
                                        <td className="px-2 md:px-4 py-3 font-mono text-xs text-slate-700">
                                            {t.serial_number ?? (
                                                <span className="text-slate-400">{t.id.slice(0, 8)}</span>
                                            )}
                                            {/* Expires costs 86px of a 312px card at 360, but an
                                                imminent expiry is the one thing on this row worth
                                                acting on — so it is reprinted, warning and all. */}
                                            {t.expires_at && (
                                                <span
                                                    className={`mt-1 block font-sans text-[11px] md:hidden ${
                                                        expiringSoon(t)
                                                            ? "font-medium text-orange-700"
                                                            : "text-slate-500"
                                                    }`}
                                                >
                                                    exp {shortDate(t.expires_at)}
                                                    {expiringSoon(t) ? " ⚠" : ""}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 capitalize text-slate-700">
                                            {t.token_type.replace(/_/g, " ")}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">{rupee(t.value_inr)}</td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={t.status} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-600">
                                            {t.donor_name ?? (
                                                <span className="text-slate-400">
                                                    {t.has_donor ? "Donor" : "Pool"}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            <Dash>{t.minted_at ? new Date(t.minted_at).toLocaleDateString() : null}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            {t.expires_at ? (
                                                <span
                                                    className={
                                                        expiringSoon(t)
                                                            ? "rounded bg-orange-50 px-1.5 py-0.5 text-xs font-medium text-orange-700"
                                                            : ""
                                                    }
                                                >
                                                    {new Date(t.expires_at).toLocaleDateString()}
                                                    {expiringSoon(t) ? " ⚠" : ""}
                                                </span>
                                            ) : (
                                                <Dash>{null}</Dash>
                                            )}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            <Dash>
                                                {t.redeemed_at ? new Date(t.redeemed_at).toLocaleDateString() : null}
                                            </Dash>
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
                title={
                    detail?.token.serial_number
                        ? detail.token.serial_number
                        : `Token ${drawer.selected?.id.slice(0, 8) ?? ""}`
                }
                subtitle="Token lifecycle & journey"
                status={detail?.token.status ?? drawer.selected?.status}
                sections={sections}
                loading={detailLoading}
                actions={
                    canRevoke && detail?.token.status === "assigned_to_volunteer" ? (
                        <ActionButton
                            tone="danger"
                            disabled={revoke.busyId === detail.token.id}
                            onClick={() =>
                                revoke.run(
                                    detail.token.id,
                                    {},
                                    "Revoke this token from the volunteer back to the admin pool? It can then be re-allocated."
                                )
                            }
                        >
                            {revoke.busyId === detail.token.id ? "Revoking…" : "Revoke to pool"}
                        </ActionButton>
                    ) : null
                }
            >
                {detail && (
                    <div className="space-y-5">
                        {/* Hand-off history */}
                        <section>
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                Hand-off history
                            </h3>
                            {detail.handoffs.length === 0 ? (
                                <p className="text-sm text-slate-400">No hand-offs recorded yet.</p>
                            ) : (
                                <ol className="space-y-2 border-l border-slate-200 pl-4">
                                    {detail.handoffs.map((h) => (
                                        <li key={h.id} className="relative">
                                            <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-slate-300" />
                                            <p className="text-sm font-medium text-slate-700">
                                                {channelLabel[h.channel] ?? h.channel}
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                {date(h.distributed_at)}
                                                {h.actor_name
                                                    ? ` · by ${h.actor_name}${h.actor_role ? ` (${h.actor_role})` : ""}`
                                                    : h.actor_role
                                                      ? ` · by ${h.actor_role}`
                                                      : ""}
                                                {h.distribution_location ? ` · ${h.distribution_location}` : ""}
                                                {h.notes ? ` · ${h.notes}` : ""}
                                            </p>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>

                        {/* Redemption + value handling */}
                        {detail.redemption && (
                            <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                    Redemption & value handling
                                </h3>
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                                    <dt className="text-slate-500">Redeemed</dt>
                                    <dd className="text-slate-800">{date(detail.redemption.redeemed_at)}</dd>
                                    <dt className="text-slate-500">Menu value</dt>
                                    <dd className="text-slate-800">{rupee(detail.redemption.menu_value_inr)}</dd>
                                    <dt className="text-slate-500">Difference paid</dt>
                                    <dd className="text-slate-800">{rupee(detail.redemption.difference_paid_inr)}</dd>
                                    <dt className="text-slate-500">Co-pay</dt>
                                    <dd className="text-slate-800">{rupee(detail.redemption.co_pay_inr)}</dd>
                                    {detail.forfeited_inr != null && (
                                        <>
                                            <dt className="text-slate-500">Forfeited</dt>
                                            <dd className="text-slate-800">{rupee(detail.forfeited_inr)}</dd>
                                        </>
                                    )}
                                    <dt className="text-slate-500">Payment</dt>
                                    <dd>
                                        <Dash>{detail.redemption.payment_status}</Dash>
                                    </dd>
                                    <dt className="text-slate-500">Proof</dt>
                                    <dd>
                                        <Dash>{detail.redemption.proof_status}</Dash>
                                    </dd>
                                </dl>
                            </section>
                        )}

                        {/* Audit trail */}
                        {detail.audit.length > 0 && (
                            <section>
                                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                    Audit trail
                                </h3>
                                <ul className="space-y-1.5">
                                    {detail.audit.map((a) => (
                                        <li key={a.id} className="text-xs text-slate-500">
                                            <span className="font-medium text-slate-700">{a.action}</span>
                                            {a.summary ? ` — ${a.summary}` : ""}
                                            <span className="text-slate-400"> · {date(a.created_at)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </div>
                )}
            </DetailDrawer>
        </div>
    );
}
