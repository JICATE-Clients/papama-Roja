"use client";

import { useRouter } from "next/navigation";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

/**
 * Shared admin-console UI primitives + the proven list-fetch state machine,
 * extracted verbatim from the verified vendors page so every section page
 * behaves identically: cookie → GET /api/admin/* → requireAppUser → matrix → DB,
 * with 401 → login bounce, 403 → access-denied, error → notice, empty → notice.
 */

type ListState = "loading" | "ready" | "forbidden" | "error";

/**
 * Fetches an admin list route and reduces it to the four render states.
 * @param apiPath    the GET /api/admin/* endpoint
 * @param dataKey    the array key in the JSON envelope (e.g. "vendors", "config")
 * @param pageHref   the /admin/* page URL, used as the post-login redirect target
 */
export function useAdminList<T>(apiPath: string, dataKey: string, pageHref: string) {
    const router = useRouter();
    const [items, setItems] = useState<T[]>([]);
    const [state, setState] = useState<ListState>("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const res = await fetch(apiPath, { cache: "no-store" });

        if (res.status === 401) {
            router.push(`/login?redirect=${pageHref}`);
            return;
        }
        if (res.status === 403) {
            setState("forbidden");
            return;
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setErrorMsg(body.error ?? `Request failed (${res.status})`);
            setState("error");
            return;
        }

        const body = (await res.json()) as Record<string, T[]>;
        setItems(body[dataKey] ?? []);
        setState("ready");
    }, [router, apiPath, dataKey, pageHref]);

    useEffect(() => {
        void reload();
    }, [reload]);

    return { items, state, errorMsg, reload };
}

/**
 * Row-level mutation runner shared by the admin action columns. PATCHes the given
 * endpoint, tracks a per-row busy id, surfaces the error body, and reloads the
 * list on success. The server still enforces the matrix — UI gating is cosmetic.
 *
 * @param apiPath  the PATCH endpoint (same route as the list's GET)
 * @param reload   the list reloader (from useAdminList) to run after success
 */
export function useRowAction(apiPath: string, reload: () => Promise<void>) {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const run = useCallback(
        async (rowId: string, payload: Record<string, unknown>, confirmText?: string) => {
            if (confirmText && !window.confirm(confirmText)) return;
            setBusyId(rowId);
            setActionError(null);
            try {
                const res = await fetch(apiPath, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (res.status === 401) {
                    router.push("/login?redirect=/admin");
                    return;
                }
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    setActionError(body.error ?? `Action failed (${res.status})`);
                    return;
                }
                await reload();
            } finally {
                setBusyId(null);
            }
        },
        [apiPath, reload, router]
    );

    return { run, busyId, actionError };
}

/**
 * Page title + subtitle + (when ready) a row count, matching the vendors header.
 * `action` is a right-aligned slot for the page's one primary control (e.g. the
 * vendors "Add vendor" toggle); on a phone the header stacks, so it lands under
 * the subtitle rather than squeezing the title.
 */
export function AdminPageHeader({
    title,
    subtitle,
    count,
    action,
}: {
    title: string;
    subtitle: string;
    count?: number;
    action?: ReactNode;
}) {
    return (
        <div className="mb-5 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
                <div className="flex items-baseline gap-2.5">
                    <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{title}</h1>
                    {count != null && (
                        <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
                            {count}
                        </span>
                    )}
                </div>
                <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-500">{subtitle}</p>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

/**
 * Section heading inside a page — an h2 with an optional subtitle and a
 * right-aligned action slot (e.g. a "view all" link or a small control). One
 * step down the hierarchy from AdminPageHeader's h1.
 */
export function SectionHeading({
    title,
    subtitle,
    action,
}: {
    title: string;
    subtitle?: string;
    action?: ReactNode;
}) {
    return (
        <div className="mb-3 flex items-end justify-between gap-3">
            <div>
                <h2 className="text-base font-semibold text-slate-900">{title}</h2>
                {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
            </div>
            {action}
        </div>
    );
}

/**
 * One labelled figure in a summary row. Lifted out of the analytics page when
 * the ledgers page needed the same tile — a second private copy is how two
 * summary rows start drifting apart.
 */
export function StatTile({
    label,
    value,
    small,
    tone,
}: {
    label: string;
    value: string;
    /** Long values (money) need the smaller size to stay on one line. */
    small?: boolean;
    /** `alert` for a figure that means something is wrong. */
    tone?: "alert";
}) {
    return (
        <div
            className={`rounded-2xl p-4 shadow-sm ring-1 ${
                tone === "alert" ? "bg-red-50 ring-red-200" : "bg-white ring-slate-900/[0.06]"
            }`}
        >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p
                className={`mt-1 font-semibold tabular-nums ${small ? "text-lg" : "text-2xl"} ${
                    tone === "alert" ? "text-red-700" : "text-slate-900"
                }`}
            >
                {value}
            </p>
        </div>
    );
}

/** Card shell around a `<table>`, identical chrome to the vendors table. */
export function TableShell({
    children,
    hideCols,
}: {
    children: ReactNode;
    /** 1-based column positions to drop below `md` (see pa-tcol-hide-* in globals.css). */
    hideCols?: number[];
}) {
    const hide = (hideCols ?? []).map((n) => `pa-tcol-hide-${n}`).join(" ");
    return (
        <div className="pa-admin-tablewrap overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/[0.06]">
            <table
                className={`w-full border-collapse text-left text-[13.5px] md:min-w-[680px] ${hide}`.trim()}
            >
                {children}
            </table>
        </div>
    );
}

/** Uppercase column-header row; pass the labels in order. */
export function TableHead({ columns }: { columns: string[] }) {
    return (
        <thead className="bg-slate-50">
            <tr className="border-b border-slate-200">
                {columns.map((c) => (
                    <th
                        key={c}
                        className="whitespace-nowrap px-2 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 md:px-4"
                    >
                        {c}
                    </th>
                ))}
            </tr>
        </thead>
    );
}

const BADGE_TONES: Record<string, string> = {
    // green — healthy / approved / done
    approved: "bg-green-50 text-green-700 ring-green-600/20",
    verified: "bg-green-50 text-green-700 ring-green-600/20",
    active: "bg-green-50 text-green-700 ring-green-600/20",
    completed: "bg-green-50 text-green-700 ring-green-600/20",
    paid: "bg-green-50 text-green-700 ring-green-600/20",
    reconciled: "bg-green-50 text-green-700 ring-green-600/20",
    released: "bg-green-50 text-green-700 ring-green-600/20",
    resolved: "bg-green-50 text-green-700 ring-green-600/20",
    granted: "bg-green-50 text-green-700 ring-green-600/20",
    // amber — pending / in flight
    pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
    scheduled: "bg-amber-50 text-amber-700 ring-amber-600/20",
    open: "bg-amber-50 text-amber-700 ring-amber-600/20",
    in_progress: "bg-amber-50 text-amber-700 ring-amber-600/20",
    partially_granted: "bg-amber-50 text-amber-700 ring-amber-600/20",
    medium: "bg-amber-50 text-amber-700 ring-amber-600/20",
    // orange — held / suspended
    suspended: "bg-orange-50 text-orange-700 ring-orange-600/20",
    locked: "bg-orange-50 text-orange-700 ring-orange-600/20",
    held: "bg-orange-50 text-orange-700 ring-orange-600/20",
    inactive: "bg-orange-50 text-orange-700 ring-orange-600/20",
    // red — failure / risk
    rejected: "bg-red-50 text-red-700 ring-red-600/20",
    failed: "bg-red-50 text-red-700 ring-red-600/20",
    blocked: "bg-red-50 text-red-700 ring-red-600/20",
    high: "bg-red-50 text-red-700 ring-red-600/20",
    denied: "bg-red-50 text-red-700 ring-red-600/20",
    // slate — low / neutral / closed
    low: "bg-slate-100 text-slate-600 ring-slate-500/20",
    closed: "bg-slate-100 text-slate-600 ring-slate-500/20",
    dismissed: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

/** Capitalised, underscores-to-spaces status pill, tone keyed off the value. */
export function StatusBadge({ value }: { value: string | null | undefined }) {
    if (!value) return <Dash>{null}</Dash>;
    const tone = BADGE_TONES[value] ?? "bg-slate-100 text-slate-600 ring-slate-500/20";
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[12px] font-medium capitalize ring-1 ring-inset ${tone}`}
        >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
            {value.replace(/_/g, " ")}
        </span>
    );
}

/** Yes/No pill for privacy-safe boolean flags (e.g. aadhaar_linked, blocked). */
export function BoolBadge({
    value,
    yes = "Yes",
    no = "No",
    danger = false,
}: {
    value: boolean;
    yes?: string;
    no?: string;
    /** When true, a `true` value reads as a risk (red) rather than healthy (green). */
    danger?: boolean;
}) {
    const tone = value
        ? danger
            ? "bg-red-50 text-red-700 ring-red-600/20"
            : "bg-green-50 text-green-700 ring-green-600/20"
        : "bg-slate-100 text-slate-600 ring-slate-500/20";
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
        >
            {value ? yes : no}
        </span>
    );
}

/** Renders a value or an em-dash when it is null/empty. */
export function Dash({ children }: { children: ReactNode }) {
    const empty = children == null || children === "";
    return <>{empty ? "—" : children}</>;
}

export function Notice({
    tone,
    title,
    children,
}: {
    // `ok` is for a check that PASSED — the ledgers page leads with one, and a
    // passing invariant reported in neutral grey reads as "no data yet".
    tone: "info" | "ok" | "warn" | "error";
    title: string;
    children: ReactNode;
}) {
    const tones = {
        info: "bg-white text-slate-600 ring-slate-900/[0.06]",
        ok: "bg-green-50 text-green-800 ring-green-200",
        warn: "bg-amber-50 text-amber-800 ring-amber-200",
        error: "bg-red-50 text-red-800 ring-red-200",
    } as const;
    return (
        <div className={`rounded-2xl p-6 text-sm ring-1 ${tones[tone]}`}>
            <p className="font-medium">{title}</p>
            <p className="mt-1 opacity-90">{children}</p>
        </div>
    );
}

export type BtnTone = "primary" | "danger" | "warn" | "neutral";

const BTN_TONES: Record<BtnTone, string> = {
    primary: "border-green-300 bg-green-50 text-green-700 hover:bg-green-100",
    danger: "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
    warn: "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100",
    neutral: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
};

/** Small tone-coloured action button used in admin table action columns. */
export function ActionButton({
    tone,
    disabled,
    onClick,
    children,
}: {
    tone: BtnTone;
    disabled: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 ${BTN_TONES[tone]}`}
        >
            {children}
        </button>
    );
}

export function SkeletonTable() {
    return (
        <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200/60" />
            ))}
        </div>
    );
}

/**
 * Shared "run a job" action bar — one POST to a job endpoint with busy/success/
 * error states. Used by the settlement-run, fraud-scan and token expire-sweep
 * controls (replaces three near-identical hand-rolled bars). Optional `children`
 * render extra controls (e.g. a period select) before the button; `body` is a
 * thunk so it reads the latest of those controls' state at click time.
 */
export function RunJobBar({
    label,
    endpoint,
    buttonText,
    busyText,
    successMessage,
    onDone,
    body,
    children,
}: {
    label: string;
    endpoint: string;
    buttonText: string;
    busyText: string;
    successMessage: (data: Record<string, unknown>) => string;
    onDone: () => void;
    body?: () => Record<string, unknown>;
    children?: ReactNode;
}) {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function run() {
        setBusy(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: body ? { "Content-Type": "application/json" } : undefined,
                body: body ? JSON.stringify(body()) : undefined,
            });
            const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            if (!res.ok) throw new Error((data.error as string) ?? `Failed (${res.status})`);
            setMsg(successMessage(data));
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Action failed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.06]">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            {children}
            <button
                type="button"
                onClick={run}
                disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 active:scale-[.98] disabled:opacity-60"
            >
                {busy ? busyText : buttonText}
            </button>
            {msg && <span className="text-xs font-medium text-green-700">{msg}</span>}
            {err && <span className="text-xs font-medium text-red-700">{err}</span>}
        </div>
    );
}

/**
 * The shared loading/forbidden/error/empty/ready switch. Pass the loaded `table`
 * render only; the four non-ready states are handled identically everywhere.
 */
export function ListStates({
    state,
    errorMsg,
    isEmpty,
    resourceLabel,
    emptyHint,
    table,
}: {
    state: ListState;
    errorMsg: string | null;
    isEmpty: boolean;
    resourceLabel: string;
    emptyHint: string;
    table: ReactNode;
}) {
    if (state === "loading") return <SkeletonTable />;

    if (state === "forbidden")
        return (
            <Notice tone="warn" title="Access denied">
                Your role does not have permission to view {resourceLabel}.
            </Notice>
        );

    if (state === "error")
        return (
            <Notice tone="error" title={`Couldn’t load ${resourceLabel}`}>
                {errorMsg}
            </Notice>
        );

    if (isEmpty)
        return (
            <Notice tone="info" title={`No ${resourceLabel} yet`}>
                {emptyHint}
            </Notice>
        );

    return <>{table}</>;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * DESIGN-SYSTEM SPINE (Wave 1) — DetailDrawer, FilterBar, useClientTable,
 * Pagination, toasts, and a unified action runner. Every section page builds
 * its drill-down + filtering + actions on these so the uplift is consistent.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** One label/value row in a DetailDrawer's body grid. */
export interface DetailSection {
    label: string;
    value: ReactNode;
    /** Render the value in a monospace font (ids, serials, hashes). */
    mono?: boolean;
    /** Span the full width of the grid (long text, sub-tables). */
    full?: boolean;
}

export interface DetailDrawerProps {
    open: boolean;
    /** Wired to backdrop click, Esc, and the close button. */
    onClose: () => void;
    title: string;
    subtitle?: string;
    /** Renders a <StatusBadge> in the header when set. */
    status?: string;
    /** The universal label/value body. */
    sections: DetailSection[];
    /** Escape hatch for richer content (timelines, QR, sub-tables). */
    children?: ReactNode;
    /** Footer action bar — pass <ActionButton>s. */
    actions?: ReactNode;
    /** Show a skeleton body while lazily fetching detail. */
    loading?: boolean;
}

/**
 * Right slide-over drawer that any list row opens for drill-down. Backdrop
 * click + Esc close it, focus is trapped to the panel, the body scroll is
 * locked while open, and `aria-modal` marks it for assistive tech. The common
 * case is just `sections`; richer content goes in `children`.
 */
export function DetailDrawer({
    open,
    onClose,
    title,
    subtitle,
    status,
    sections,
    children,
    actions,
    loading,
}: DetailDrawerProps) {
    // Esc to close + lock body scroll while open.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex justify-end"
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            {/* Backdrop */}
            <button
                type="button"
                aria-label="Close detail panel"
                onClick={onClose}
                className="absolute inset-0 h-full w-full cursor-default bg-slate-900/30"
            />
            {/* Panel */}
            <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-xl animate-[slideIn_0.18s_ease-out]">
                <style>{`@keyframes slideIn{from{transform:translateX(16px);opacity:.4}to{transform:translateX(0);opacity:1}}`}</style>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="truncate text-base font-semibold text-slate-900">{title}</h2>
                            {status && <StatusBadge value={status} />}
                        </div>
                        {subtitle && <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        autoFocus
                        aria-label="Close"
                        className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                        <X size={20} weight="bold" aria-hidden />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {loading ? (
                        <SkeletonTable />
                    ) : (
                        <>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                                {sections.map((s, i) => (
                                    <div key={`${s.label}-${i}`} className={s.full ? "col-span-2" : ""}>
                                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                                            {s.label}
                                        </dt>
                                        <dd
                                            className={`mt-0.5 text-sm text-slate-800 ${
                                                s.mono ? "break-all font-mono text-xs" : ""
                                            }`}
                                        >
                                            <Dash>{s.value}</Dash>
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            {children && <div className="mt-5">{children}</div>}
                        </>
                    )}
                </div>

                {/* Footer actions */}
                {actions && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Drawer open/close + selected-row state. A page does
 * `const drawer = useDetailDrawer<Row>()`, `onClick={() => drawer.openRow(r)}`
 * on the `<tr>`, and reads `drawer.selected` inside <DetailDrawer>.
 */
export function useDetailDrawer<T>() {
    const [selected, setSelected] = useState<T | null>(null);
    const openRow = useCallback((row: T) => setSelected(row), []);
    const close = useCallback(() => setSelected(null), []);
    return { selected, open: selected != null, openRow, close };
}

export interface FilterTab {
    label: string;
    value: string;
    count?: number;
}

export interface FilterBarProps {
    search: string;
    onSearch: (s: string) => void;
    searchPlaceholder?: string;
    tabs?: FilterTab[];
    activeTab?: string;
    onTab?: (v: string) => void;
}

/** Search box + optional status tabs above a list. Pairs with useClientTable. */
export function FilterBar({
    search,
    onSearch,
    searchPlaceholder = "Search…",
    tabs,
    activeTab,
    onTab,
}: FilterBarProps) {
    return (
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            {tabs && tabs.length > 0 && (
                <div className="flex flex-wrap items-center gap-0.5 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-900/[0.06]">
                    {tabs.map((t) => {
                        const active = t.value === activeTab;
                        return (
                            <button
                                key={t.value}
                                type="button"
                                onClick={() => onTab?.(t.value)}
                                className={`rounded-md px-2.5 py-1 text-[12.5px] font-medium capitalize transition ${
                                    active
                                        ? "bg-[#0B7A55] text-white"
                                        : "text-slate-600 hover:bg-slate-100"
                                }`}
                            >
                                {t.label}
                                {t.count != null && (
                                    <span
                                        className={`ml-1.5 tabular-nums ${active ? "text-white/70" : "text-slate-400"}`}
                                    >
                                        {t.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
            <input
                type="search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full max-w-xs rounded-xl bg-white px-3 py-[7px] shadow-sm ring-1 ring-slate-900/[0.06] text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-[#0B7A55]/40 sm:w-72"
            />
        </div>
    );
}

export interface ClientTableOptions<T> {
    /** Keys whose stringified values are matched against the search term. */
    searchKeys: (keyof T)[];
    /** Key whose value is matched against the active tab (omit for no tabs). */
    tabKey?: keyof T;
    /** Rows per page (omit/0 = no pagination). */
    pageSize?: number;
}

/**
 * Client-side filter + status-tab + pagination over an already-loaded list
 * (admin lists are bounded; useAdminList loads the full array). Returns the
 * visible slice plus the controls a page wires into <FilterBar>/<Pagination>.
 * `tabCounts` is keyed by the tabKey value ("all" = full length).
 */
export function useClientTable<T>(items: T[], opts: ClientTableOptions<T>) {
    const { searchKeys, tabKey, pageSize = 0 } = opts;
    const [search, setSearch] = useState("");
    const [activeTab, setActiveTab] = useState("all");
    const [page, setPage] = useState(1);

    // Reset to page 1 whenever the filter inputs change.
    useEffect(() => {
        setPage(1);
    }, [search, activeTab]);

    const tabCounts = useMemo(() => {
        const counts: Record<string, number> = { all: items.length };
        if (tabKey) {
            for (const it of items) {
                const k = String(it[tabKey]);
                counts[k] = (counts[k] ?? 0) + 1;
            }
        }
        return counts;
    }, [items, tabKey]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return items.filter((it) => {
            if (tabKey && activeTab !== "all" && String(it[tabKey]) !== activeTab) return false;
            if (!term) return true;
            return searchKeys.some((k) => {
                const v = it[k];
                return v != null && String(v).toLowerCase().includes(term);
            });
        });
    }, [items, search, activeTab, tabKey, searchKeys]);

    const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;

    // Clamp the page when the filtered set shrinks (e.g. a row action + reload
    // drops the last row off the current page). Without this the user is stranded
    // on an out-of-range page that slices to an empty table, and <Pagination> is
    // hidden once pageCount falls to 1 — leaving no way back. Derive a safe page
    // for slicing AND sync state so the pager's disabled bounds stay correct.
    const safePage = Math.min(page, pageCount);
    useEffect(() => {
        if (page > pageCount) setPage(pageCount);
    }, [page, pageCount]);

    const rows = useMemo(() => {
        if (pageSize <= 0) return filtered;
        const start = (safePage - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, safePage, pageSize]);

    return {
        rows,
        filteredCount: filtered.length,
        search,
        setSearch,
        activeTab,
        setActiveTab,
        page: safePage,
        pageCount,
        setPage,
        tabCounts,
    };
}

/** Prev/next pager. Hidden when there is a single page. */
export function Pagination({
    page,
    pageCount,
    onPage,
}: {
    page: number;
    pageCount: number;
    onPage: (p: number) => void;
}) {
    if (pageCount <= 1) return null;
    return (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <button
                type="button"
                onClick={() => onPage(page - 1)}
                disabled={page <= 1}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
                Previous
            </button>
            <span className="text-xs text-slate-500">
                Page {page} of {pageCount}
            </span>
            <button
                type="button"
                onClick={() => onPage(page + 1)}
                disabled={page >= pageCount}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
                Next
            </button>
        </div>
    );
}

/* ── Toasts ─────────────────────────────────────────────────────────────────
 * Transient success/error notices for row actions. Wrap the admin shell in
 * <ToastHost> once; any descendant calls useToast().success/error.
 */

interface Toast {
    id: number;
    tone: "success" | "error";
    message: string;
}

interface ToastApi {
    success: (message: string) => void;
    error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Provider + on-screen toast stack. Mount once near the admin layout root. */
export function ToastHost({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const push = useCallback((tone: Toast["tone"], message: string) => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, tone, message }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const api = useMemo<ToastApi>(
        () => ({
            success: (m) => push("success", m),
            error: (m) => push("error", m),
        }),
        [push]
    );

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        role="status"
                        className={`pointer-events-auto rounded-lg border px-4 py-2.5 text-sm font-medium shadow-md ${
                            t.tone === "success"
                                ? "border-green-200 bg-green-50 text-green-800"
                                : "border-red-200 bg-red-50 text-red-800"
                        }`}
                    >
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

/**
 * Toast API. Returns a no-op-safe object when no <ToastHost> is mounted (so a
 * page renders fine in isolation/tests) — but logs so a missing host is noticed.
 */
export function useToast(): ToastApi {
    const ctx = useContext(ToastContext);
    if (ctx) return ctx;
    return {
        success: (m) => console.log("[toast:success]", m),
        error: (m) => console.warn("[toast:error]", m),
    };
}

/**
 * Unified row-action runner (replaces the per-page POST/PATCH hand-rollers).
 * `endpoint` is a function of the row id so POST-to-`/x/[id]/decide` and
 * PATCH-to-`/x` both fit. Tracks a per-row busy id, raises a toast on
 * success/failure when a <ToastHost> is mounted, and runs `onDone` on success.
 *
 * useRowAction (PATCH-only, no toast) is kept below for back-compat.
 */
export function useAction(config: {
    method: "POST" | "PATCH";
    endpoint: (rowId: string) => string;
    onDone: () => void | Promise<void>;
    /** Optional success-toast text from the response body. */
    successMessage?: (data: Record<string, unknown>) => string;
}) {
    const router = useRouter();
    const toast = useToast();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = useCallback(
        async (rowId: string, payload: Record<string, unknown>, confirmText?: string) => {
            if (confirmText && !window.confirm(confirmText)) return;
            setBusyId(rowId);
            setError(null);
            try {
                const res = await fetch(config.endpoint(rowId), {
                    method: config.method,
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify(payload),
                });
                if (res.status === 401) {
                    router.push("/login?redirect=/admin");
                    return;
                }
                const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
                if (!res.ok) {
                    const msg = (data.error as string) ?? `Action failed (${res.status})`;
                    setError(msg);
                    toast.error(msg);
                    return;
                }
                toast.success(config.successMessage ? config.successMessage(data) : "Done.");
                await config.onDone();
            } catch {
                const msg = "Network error — please try again.";
                setError(msg);
                toast.error(msg);
            } finally {
                setBusyId(null);
            }
        },
        // config is recreated per render; depend on its stable parts.
        [config, router, toast]
    );

    return { run, busyId, error };
}
