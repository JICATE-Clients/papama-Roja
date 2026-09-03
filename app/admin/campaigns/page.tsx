"use client";

import { useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import { inr, shortDate } from "@/lib/format";
import type { CampaignResponse, CampaignStatus } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    FilterBar,
    ListStates,
    Notice,
    Pagination,
    StatusBadge,
    TableHead,
    TableShell,
    useAction,
    useAdminList,
    useClientTable,
} from "../_ui";

const CATEGORIES = ["School", "Orphanage", "Disaster Relief", "Community Kitchen"] as const;

/** Lifecycle moves offered for a campaign in a given state. */
function actionsFor(c: CampaignResponse): { to: CampaignStatus; label: string; confirm?: string }[] {
    if (c.status === "completed") return [];
    if (c.status === "paused") {
        return [
            { to: "active", label: "Resume" },
            {
                to: "completed",
                label: "Complete",
                confirm: "Mark this campaign complete? It cannot be reopened — a new appeal would be a new campaign.",
            },
        ];
    }
    return [
        { to: "paused", label: "Pause" },
        {
            to: "completed",
            label: "Complete",
            confirm: "Mark this campaign complete? It cannot be reopened — a new appeal would be a new campaign.",
        },
    ];
}

/**
 * Admin campaigns — the fund-raising appeals donors give to.
 *
 * The raised figures come from real donations, never from `campaigns.raised_tokens`
 * (a dead counter inherited from the donor module's old table). That matters
 * here more than it sounds: today NOTHING attributes a donation to a campaign —
 * the donate flow never sets `campaign_id` — so every total is legitimately
 * zero, and the page says so out loud rather than rendering a row of ₹0s that
 * reads as "nobody gave".
 */
export default function AdminCampaignsPage() {
    const canCreate = useCan("emergency_disaster_mode", "create");
    const canUpdate = useCan("emergency_disaster_mode", "update");
    const [showCreate, setShowCreate] = useState(false);

    const { items, state, errorMsg, reload } = useAdminList<CampaignResponse>(
        "/api/admin/campaigns",
        "campaigns",
        "/admin/campaigns"
    );

    const setStatus = useAction({
        method: "PATCH",
        endpoint: () => "/api/admin/campaigns",
        onDone: reload,
        successMessage: (d) => `Campaign ${d.status}.`,
    });

    const table = useClientTable(items, {
        searchKeys: ["title", "organization_name", "location"],
        tabKey: "status",
        pageSize: 15,
    });
    const tabs = useMemo(
        () => [
            { label: "All", value: "all", count: table.tabCounts.all },
            { label: "Active", value: "active", count: table.tabCounts.active },
            { label: "Paused", value: "paused", count: table.tabCounts.paused },
            { label: "Completed", value: "completed", count: table.tabCounts.completed },
        ],
        [table.tabCounts]
    );

    // Zero attributed donations across every campaign is the normal state today,
    // and it is a wiring gap rather than a fundraising result — worth saying once
    // at the top instead of leaving an admin to infer it from a column of zeros.
    const nothingAttributed =
        state === "ready" && items.length > 0 && items.every((c) => c.donation_count === 0);

    // Status is hidden below md and reprinted as a chip under the title instead:
    // measured, its badge column costs 112px of a 358px card, more than any
    // other, and the title needs that room more than a fifth column does.
    const columns = ["Campaign", "Category", "Raised", "Target", "Status", "Created"];
    if (canUpdate) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Campaigns"
                subtitle="Fund-raising appeals donors give to. A Disaster Relief campaign is the emergency case — there is no separate emergency category."
                count={state === "ready" ? items.length : undefined}
                action={
                    canCreate ? (
                        <button
                            type="button"
                            onClick={() => setShowCreate((o) => !o)}
                            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
                        >
                            {showCreate ? "Cancel" : "New campaign"}
                        </button>
                    ) : null
                }
            />

            {canCreate && showCreate && (
                <NewCampaignForm
                    onDone={() => {
                        setShowCreate(false);
                        void reload();
                    }}
                />
            )}

            {nothingAttributed && (
                <div className="mb-5">
                    <Notice tone="warn" title="No donation is attributed to a campaign">
                        The donate flow does not set a campaign on the gift it creates, so every
                        raised total below is zero for that reason — not because no one has given.
                        Attribution has to be wired into the donation routes before these figures
                        mean anything.
                    </Notice>
                </div>
            )}

            {state === "ready" && items.length > 0 && (
                <FilterBar
                    search={table.search}
                    onSearch={table.setSearch}
                    searchPlaceholder="Search by title, organisation, place…"
                    tabs={tabs}
                    activeTab={table.activeTab}
                    onTab={table.setActiveTab}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="campaigns"
                emptyHint="Create one to give donors something specific to give to."
                table={
                    <>
                        <TableShell hideCols={[2, 4, 5, 6]}>
                            <TableHead columns={columns} />
                            <tbody className="divide-y divide-slate-100">
                                {table.rows.map((c) => (
                                    <tr key={c.id} className="align-top">
                                        <td className="px-2 py-3 md:px-4">
                                            <span className="font-medium text-slate-900">{c.title}</span>
                                            <span className="mt-0.5 block text-[11px] text-slate-500">
                                                {c.organization_name}
                                                {c.location ? ` · ${c.location}` : ""}
                                            </span>
                                            <span className="mt-1 block md:hidden">
                                                <StatusBadge value={c.status} />
                                            </span>
                                        </td>
                                        <td className="px-2 py-3 text-slate-600 md:px-4">
                                            <Dash>{c.category}</Dash>
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-3 tabular-nums text-slate-700 md:px-4">
                                            {inr(c.raised_inr)}
                                            <span className="mt-0.5 block text-[11px] text-slate-400">
                                                {c.donation_count === 0
                                                    ? "no donations"
                                                    : `${c.donation_count} donation${c.donation_count === 1 ? "" : "s"}`}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-3 tabular-nums text-slate-500 md:px-4">
                                            {c.target_tokens > 0 ? `${c.target_tokens} tokens` : "—"}
                                        </td>
                                        <td className="px-2 py-3 md:px-4">
                                            <StatusBadge value={c.status} />
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-3 text-slate-500 md:px-4">
                                            {shortDate(c.created_at)}
                                        </td>
                                        {canUpdate && (
                                            <td className="px-2 py-3 md:px-4">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {actionsFor(c).map((a) => (
                                                        <ActionButton
                                                            key={a.to}
                                                            tone={a.to === "completed" ? "neutral" : "primary"}
                                                            disabled={setStatus.busyId === c.id}
                                                            onClick={() =>
                                                                setStatus.run(
                                                                    c.id,
                                                                    { campaign_id: c.id, status: a.to },
                                                                    a.confirm
                                                                )
                                                            }
                                                        >
                                                            {a.label}
                                                        </ActionButton>
                                                    ))}
                                                    {actionsFor(c).length === 0 && (
                                                        <span className="text-xs text-slate-400">—</span>
                                                    )}
                                                </div>
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

/**
 * Create a campaign. `category` is a fixed list, not free text: the table's
 * CHECK constraint accepts exactly these four, and a typed-in fifth used to
 * reach Postgres and come back as a 500.
 */
function NewCampaignForm({ onDone }: { onDone: () => void }) {
    const [title, setTitle] = useState("");
    const [org, setOrg] = useState("");
    const [category, setCategory] = useState<string>(CATEGORIES[0]);
    const [location, setLocation] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("");
    const [target, setTarget] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function submit() {
        setErr(null);
        if (!title.trim()) {
            setErr("Give the campaign a title.");
            return;
        }
        if (!org.trim()) {
            setErr("Name the organisation running it.");
            return;
        }
        const priceNum = Number(price);
        if (!Number.isInteger(priceNum) || priceNum <= 0) {
            setErr("Token price must be a whole number of rupees above zero.");
            return;
        }
        const targetNum = target.trim() === "" ? 0 : Number(target);
        if (!Number.isInteger(targetNum) || targetNum < 0) {
            setErr("Target must be a whole number of tokens, or blank.");
            return;
        }

        setBusy(true);
        try {
            const res = await fetch("/api/admin/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    organization_name: org.trim(),
                    category,
                    token_price_inr: priceNum,
                    ...(targetNum > 0 ? { target_tokens: targetNum } : {}),
                    ...(location.trim() ? { location: location.trim() } : {}),
                    ...(description.trim() ? { description: description.trim() } : {}),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not create the campaign.");
        } finally {
            setBusy(false);
        }
    }

    const field = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700";

    return (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-1 text-sm font-medium text-slate-700">New campaign</p>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
                Starts active. Donors see the title, the organisation and the place, so write them
                the way a donor would want to read them.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs text-slate-600 sm:col-span-2">
                    Title<span className="text-red-600"> *</span>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={busy}
                        placeholder="Hot meals for the Cuddalore flood shelters"
                        className={field}
                    />
                </label>
                <label className="text-xs text-slate-600">
                    Category
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        disabled={busy}
                        className={field}
                    >
                        {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs text-slate-600">
                    Organisation<span className="text-red-600"> *</span>
                    <input
                        type="text"
                        value={org}
                        onChange={(e) => setOrg(e.target.value)}
                        disabled={busy}
                        className={field}
                    />
                </label>
                <label className="text-xs text-slate-600">
                    Place
                    <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        disabled={busy}
                        className={field}
                    />
                </label>
                <label className="text-xs text-slate-600">
                    Token price (₹)<span className="text-red-600"> *</span>
                    <input
                        type="number"
                        min={1}
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        disabled={busy}
                        className={field}
                    />
                </label>
                <label className="text-xs text-slate-600">
                    Target (tokens)
                    <input
                        type="number"
                        min={0}
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                        disabled={busy}
                        placeholder="Leave blank for no target"
                        className={field}
                    />
                </label>
                <label className="text-xs text-slate-600 sm:col-span-2 lg:col-span-3">
                    Description
                    <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={busy}
                        placeholder="What the money pays for."
                        className={field}
                    />
                </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={submit}
                    disabled={busy}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                    {busy ? "Creating…" : "Create campaign"}
                </button>
                {err && <span className="text-xs font-medium text-red-700">{err}</span>}
            </div>
        </div>
    );
}
