"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useCan } from "@/components/auth/AppUserProvider";
import { shortDate } from "@/lib/format";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    FilterBar,
    ListStates,
    Pagination,
    StatusBadge,
    TableHead,
    TableShell,
    useAction,
    useClientTable,
} from "../_ui";

type ListState = "loading" | "ready" | "forbidden" | "error";

interface DonationRow {
    id: string;
    amount_inr: number;
    status: string;
    payment_ref: string | null;
    financial_year: string | null;
    created_at: string;
    donor_label: string;
    is_guest: boolean;
}

const rupee = (n: number | null | undefined) => (n != null ? `₹${n.toLocaleString("en-IN")}` : "—");

/**
 * Admin donations page — every gift (attributed + anonymous Guest Pool) with the
 * Guest Pool balance and a "convert pool → tokens" action that mints the pooled
 * anonymous credit into in_admin_pool tokens (Path B).
 */
export default function AdminDonationsPage() {
    const router = useRouter();
    const canMint = useCan("token_generation", "create");

    const [donations, setDonations] = useState<DonationRow[]>([]);
    const [poolBalance, setPoolBalance] = useState(0);
    const [state, setState] = useState<ListState>("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await fetch("/api/admin/donations", { cache: "no-store" });
        if (res.status === 401) {
            router.push("/login?redirect=/admin/donations");
            return;
        }
        if (res.status === 403) {
            setState("forbidden");
            return;
        }
        if (!res.ok) {
            const b = await res.json().catch(() => ({}));
            setErrorMsg(b.error ?? `Request failed (${res.status})`);
            setState("error");
            return;
        }
        const b = (await res.json()) as { donations: DonationRow[]; pool_balance: number };
        setDonations(b.donations ?? []);
        setPoolBalance(b.pool_balance ?? 0);
        setState("ready");
    }, [router]);

    useEffect(() => {
        void load();
    }, [load]);

    const table = useClientTable(donations, {
        searchKeys: ["donor_label", "payment_ref", "status"],
        pageSize: 20,
    });

    const mint = useAction({
        method: "POST",
        endpoint: () => "/api/admin/pool/mint",
        onDone: load,
        successMessage: (d) => `Minted ${d.minted ?? ""} pool token(s) into the admin pool.`,
    });

    const canReverse = useCan("donor_donation_credit", "update");
    const reverse = useAction({
        method: "POST",
        endpoint: (id) => `/api/admin/donations/${id}/reverse`,
        onDone: load,
        successMessage: (d) =>
            `Donation reversed; ₹${(d.reversed as number) ?? 0} credit clawed back${d.partial ? " (partial)" : ""}.`,
    });

    const [count, setCount] = useState("");

    return (
        <div>
            <AdminPageHeader
                title="Donations"
                subtitle="Every gift — attributed and anonymous. Anonymous gifts accumulate on the Guest Pool; convert that balance into pool tokens to distribute."
                count={state === "ready" ? donations.length : undefined}
            />

            {/* Guest Pool card + convert action */}
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                        Guest pool balance
                    </p>
                    <p className="mt-0.5 text-2xl font-semibold text-emerald-800">{rupee(poolBalance)}</p>
                    <p className="mt-0.5 text-xs text-emerald-700/70">
                        Accumulated anonymous donations awaiting conversion into admin-pool tokens.
                    </p>
                </div>
                {canMint && (
                    <div className="flex w-full items-end gap-2 sm:w-auto">
                        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-600 sm:flex-none">
                            Tokens to mint
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={count}
                                onChange={(e) => setCount(e.target.value)}
                                placeholder="count"
                                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 sm:w-24"
                            />
                        </label>
                        <ActionButton
                            tone="primary"
                            disabled={mint.busyId === "pool"}
                            onClick={() => {
                                const n = Number(count);
                                if (!Number.isInteger(n) || n <= 0) return;
                                mint.run(
                                    "pool",
                                    { count: n },
                                    `Mint ${n} Standard token(s) from the guest pool into the admin pool for distribution?`
                                );
                                setCount("");
                            }}
                        >
                            {mint.busyId === "pool" ? "Minting…" : "Convert to tokens"}
                        </ActionButton>
                    </div>
                )}
            </div>

            {state === "ready" && donations.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search by donor, ref, status…"
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={donations.length === 0}
                resourceLabel="donations"
                emptyHint="Donations will appear here as gifts are received."
                table={
                    <>
                        <TableShell hideCols={[1, 4, 5, 6]}>
                            <TableHead
                                columns={[
                                    "Date",
                                    "Donor",
                                    "Amount",
                                    "Status",
                                    "Reference",
                                    "FY",
                                    ...(canReverse ? ["Actions"] : []),
                                ]}
                            />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((d) => (
                                    <tr key={d.id} className="hover:bg-slate-50">
                                        <td className="whitespace-nowrap px-2 py-3 text-slate-500 md:px-4">
                                            {shortDate(d.created_at)}
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-800">
                                            {d.donor_label}
                                            {d.is_guest && (
                                                <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                                                    guest
                                                </span>
                                            )}
                                            {/* Date and Status cost 174px of a 342px card, so both are
                                                dropped below md and reprinted here — a donations list
                                                that shows neither when it was given nor whether it
                                                cleared is not a donations list. */}
                                            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 md:hidden">
                                                {shortDate(d.created_at)}
                                                <StatusBadge value={d.status} />
                                            </span>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 font-medium text-slate-900">
                                            {rupee(d.amount_inr)}
                                        </td>
                                        <td className="px-2 md:px-4 py-3">
                                            <StatusBadge value={d.status} />
                                        </td>
                                        <td className="px-2 md:px-4 py-3 font-mono text-xs text-slate-400">
                                            <Dash>{d.payment_ref}</Dash>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-slate-500">
                                            <Dash>{d.financial_year}</Dash>
                                        </td>
                                        {canReverse && (
                                            <td className="px-2 md:px-4 py-3">
                                                {d.status === "completed" ? (
                                                    <ActionButton
                                                        tone="danger"
                                                        disabled={reverse.busyId === d.id}
                                                        onClick={() =>
                                                            reverse.run(
                                                                d.id,
                                                                {},
                                                                `Reverse this ₹${d.amount_inr} donation as a failed payment and claw back the matching credit? This does NOT refund money to the donor.`
                                                            )
                                                        }
                                                    >
                                                        {reverse.busyId === d.id ? "Reversing…" : "Reverse"}
                                                    </ActionButton>
                                                ) : (
                                                    <Dash>{null}</Dash>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </TableShell>
                        <Pagination page={table.page} pageCount={table.pageCount} onPage={table.setPage} />
                    </>
                }
            />
        </div>
    );
}
