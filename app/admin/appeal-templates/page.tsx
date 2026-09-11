"use client";

import { useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import { shortDate } from "@/lib/format";

import {
    ActionButton,
    AdminPageHeader,
    ListStates,
    Notice,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useRowAction,
} from "../_ui";

/**
 * Emergency appeal templates (E-6 / B-26 b,c, CD §D-6).
 *
 * Two rules this screen exists to make visible:
 *
 *   1. AN UNAPPROVED TEMPLATE CANNOT DISPATCH. A draft simply has no send path.
 *      The dispatch service refuses it; this page shows why.
 *   2. AN INSTANT TEMPLATE IS PRE-APPROVED and may go out during an emergency
 *      without waiting for a fresh approval — and always leaves a post-send
 *      review task. A flood does not wait for an approval queue, but speed must
 *      not quietly become an absence of oversight.
 *
 * Phase 1 delivers in-app now and email when the official account lands (an
 * external dependency). SMS and WhatsApp are Phase 2 — the dispatch layer is
 * channel-abstract, so adding them is one adapter.
 */

interface TemplateRow {
    id: string;
    name: string;
    subject: string;
    body: string;
    audience: string;
    status: string;
    is_instant: boolean;
    approved_at: string | null;
    created_at: string;
}

const AUDIENCE_LABEL: Record<string, string> = {
    all: "All donors",
    individual: "Individual donors",
    csr: "CSR supporters",
};

export default function AdminAppealTemplatesPage() {
    const canCreate = useCan("emergency_disaster_mode", "create");
    const canManage = useCan("emergency_disaster_mode", "update");
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const { items, state, errorMsg, reload } = useAdminList<TemplateRow>(
        "/api/admin/appeal-templates",
        "templates",
        "/admin/appeal-templates"
    );
    const { run, busyId, actionError } = useRowAction("/api/admin/appeal-templates", reload);

    async function create(form: HTMLFormElement) {
        const fd = new FormData(form);
        setSaving(true);
        setFormError(null);
        try {
            const res = await fetch("/api/admin/appeal-templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: fd.get("name"),
                    subject: fd.get("subject"),
                    body: fd.get("body"),
                    audience: fd.get("audience"),
                }),
            });
            if (!res.ok) {
                const b = await res.json().catch(() => ({}));
                setFormError(b.error ?? `Failed (${res.status})`);
                return;
            }
            form.reset();
            setShowForm(false);
            await reload();
        } finally {
            setSaving(false);
        }
    }

    const instant = items.filter((t) => t.is_instant).length;

    return (
        <div className="mx-auto max-w-6xl">
            <AdminPageHeader
                title="Appeal templates"
                subtitle="Donor appeal wording. Only approved templates can be sent."
                count={items.length}
                action={
                    canCreate ? (
                        <ActionButton
                            tone="primary"
                            disabled={false}
                            onClick={() => setShowForm((s) => !s)}
                        >
                            {showForm ? "Cancel" : "New template"}
                        </ActionButton>
                    ) : undefined
                }
            />

            {instant > 0 && (
                <div className="mb-5">
                    <Notice tone="warn" title="Pre-approved instant templates">
                        {instant} template(s) can be sent during an emergency without a fresh
                        approval. Every instant send leaves a post-send review task.
                    </Notice>
                </div>
            )}

            {(actionError || formError) && (
                <div className="mb-5">
                    <Notice tone="error" title="Action failed">
                        {actionError ?? formError}
                    </Notice>
                </div>
            )}

            {showForm && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void create(e.currentTarget);
                    }}
                    className="mb-8 rounded-2xl bg-white p-6 ring-1 ring-slate-900/[0.06]"
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700">Name</span>
                            <input
                                name="name"
                                required
                                placeholder="Flood appeal — individuals"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600"
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700">Audience</span>
                            <select
                                name="audience"
                                defaultValue="all"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600"
                            >
                                <option value="all">All donors</option>
                                <option value="individual">Individual donors</option>
                                <option value="csr">CSR supporters</option>
                            </select>
                        </label>
                        <label className="block text-sm sm:col-span-2">
                            <span className="mb-1 block font-medium text-slate-700">Subject</span>
                            <input
                                name="subject"
                                required
                                placeholder="Urgent: {{emergency_ref}}"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600"
                            />
                        </label>
                        <label className="block text-sm sm:col-span-2">
                            <span className="mb-1 block font-medium text-slate-700">Body</span>
                            <textarea
                                name="body"
                                required
                                rows={4}
                                placeholder="Please help families affected by {{emergency_ref}}."
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600"
                            />
                            <span className="mt-1 block text-xs text-slate-500">
                                {"{{emergency_ref}}"} is replaced with the Emergency ID when sent.
                                An unknown placeholder is left visible rather than blanked, so a
                                mistake is obvious instead of reading as clumsy copy.
                            </span>
                        </label>
                    </div>
                    <div className="mt-5">
                        <ActionButton tone="primary" disabled={saving} onClick={() => {}}>
                            {saving ? "Saving…" : "Save as draft"}
                        </ActionButton>
                        <span className="ml-3 text-xs text-slate-500">
                            Saved as a draft — it cannot be sent until approved.
                        </span>
                    </div>
                </form>
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="templates"
                emptyHint="No templates yet. An appeal cannot be sent without an approved one."
                table={
                    <TableShell hideCols={[2, 4]}>
                        <TableHead
                            columns={["Template", "Audience", "Status", "Created", "Action"]}
                        />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((t) => (
                                <tr key={t.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        <span className="font-medium text-slate-800">{t.name}</span>
                                        {t.is_instant && (
                                            <span className="ml-2 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                                Instant
                                            </span>
                                        )}
                                        <span className="mt-1 block text-xs text-slate-500">
                                            {t.subject}
                                        </span>
                                        <span className="mt-1 block text-[11px] text-slate-500 md:hidden">
                                            {AUDIENCE_LABEL[t.audience] ?? t.audience}
                                            {" · "}
                                            {shortDate(t.created_at)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        {AUDIENCE_LABEL[t.audience] ?? t.audience}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={t.status} />
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                                        {shortDate(t.created_at)}
                                    </td>
                                    <td className="px-4 py-3">
                                        {canManage && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {t.status === "draft" && (
                                                    <ActionButton
                                                        tone="primary"
                                                        disabled={busyId === t.id}
                                                        onClick={() =>
                                                            run(t.id, {
                                                                template_id: t.id,
                                                                action: "approve",
                                                            })
                                                        }
                                                    >
                                                        Approve
                                                    </ActionButton>
                                                )}
                                                {t.status === "approved" && !t.is_instant && (
                                                    <ActionButton
                                                        tone="warn"
                                                        disabled={busyId === t.id}
                                                        onClick={() =>
                                                            run(
                                                                t.id,
                                                                {
                                                                    template_id: t.id,
                                                                    action: "mark_instant",
                                                                },
                                                                "Mark instant? It can then be sent during an emergency without a fresh approval — each send leaves a post-send review task."
                                                            )
                                                        }
                                                    >
                                                        Mark instant
                                                    </ActionButton>
                                                )}
                                                {t.is_instant && (
                                                    <ActionButton
                                                        tone="neutral"
                                                        disabled={busyId === t.id}
                                                        onClick={() =>
                                                            run(t.id, {
                                                                template_id: t.id,
                                                                action: "unmark_instant",
                                                            })
                                                        }
                                                    >
                                                        Unmark instant
                                                    </ActionButton>
                                                )}
                                                {t.status !== "retired" && (
                                                    <ActionButton
                                                        tone="danger"
                                                        disabled={busyId === t.id}
                                                        onClick={() =>
                                                            run(
                                                                t.id,
                                                                {
                                                                    template_id: t.id,
                                                                    action: "retire",
                                                                },
                                                                "Retire this template? It can no longer be sent."
                                                            )
                                                        }
                                                    >
                                                        Retire
                                                    </ActionButton>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}
