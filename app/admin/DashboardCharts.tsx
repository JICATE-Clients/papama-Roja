"use client";

import { useState } from "react";

import { inr } from "@/lib/format";

/**
 * The dashboard's two charts, hand-rolled as inline SVG.
 *
 * No charting library: the project has none, and two static plots do not justify
 * the dependency or the bundle weight. Everything here is plain SVG with a React
 * hover layer.
 *
 * COLOURS ARE NOT CHOSEN BY EYE. The categorical trio below was run through the
 * dataviz validator against this surface (#fffdf8) and passes all five checks —
 * lightness band, chroma floor, CVD separation (ΔE 16.0 deutan / 8.4 tritan),
 * normal-vision floor (20.3) and 3:1 contrast. All three are already in the
 * app's SECTION_COLOR map, so the charts speak the console's existing palette.
 * If you add a fourth status, re-run the validator; do not append a hue.
 */

/** One accent per token state. Fixed order — never cycled, never reassigned. */
const PIPELINE_COLORS: Record<string, string> = {
    live: "#0B7A55",
    distributed: "#6B79C4",
    redeemed: "#B8860B",
};
const PIPELINE_FALLBACK = "#8A8578";

/** Money-over-time is ONE series, so it is sequential (one hue), not categorical. */
const MONEY = "#0B7A55";

const AXIS = "#B9B2A4";
const GRID = "#EAE3D6";

export interface MoneyPoint {
    /** ISO date, YYYY-MM-DD. */
    date: string;
    /** Cumulative rupees raised up to and including that date. */
    total: number;
}

export interface PipelineSlice {
    status: string;
    count: number;
}

function niceCeiling(v: number): number {
    if (v <= 0) return 1;
    const mag = 10 ** Math.floor(Math.log10(v));
    return Math.ceil(v / mag) * mag;
}

const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

/**
 * Cumulative money raised. An area chart rather than daily bars because the
 * gifts are clustered — days of nothing between them — and a bar-per-day would
 * be mostly empty air. Cumulative also answers the question an admin actually
 * has: how much has come in altogether.
 */
export function MoneyChart({ points }: { points: MoneyPoint[] }) {
    const [hover, setHover] = useState<number | null>(null);

    if (points.length < 2) {
        return (
            <ChartCard title="Money raised" subtitle="Cumulative, all time">
                <EmptyPlot note="Not enough donations yet to draw a trend." />
            </ChartCard>
        );
    }

    const active = hover != null ? points[hover] : null;

    /*
     * Two viewBoxes, not one scaled.
     *
     * An SVG with a plain `w-full` renders at its viewBox ASPECT, so the 900x210
     * box that looks right in a desktop column collapsed to ~70px tall on a
     * 390px phone and shrank the axis labels to about 8px. Same plot, a portrait
     * box below sm — which is also why the font size is a function of width.
     */
    return (
        <ChartCard title="Money raised" subtitle="Cumulative, all time">
            <div className="sm:hidden">
                <MoneyPlot points={points} active={active} onHover={setHover} w={380} h={250} />
            </div>
            <div className="hidden sm:block">
                <MoneyPlot points={points} active={active} onHover={setHover} w={900} h={210} />
            </div>

            <p className="mt-1 h-4 text-xs text-slate-500">
                {active ? `${dayLabel(active.date)} · ${inr(active.total)} raised in total` : ""}
            </p>
        </ChartCard>
    );
}

function MoneyPlot({
    points,
    active,
    onHover,
    w: W,
    h: H,
}: {
    points: MoneyPoint[];
    active: MoneyPoint | null;
    onHover: (i: number | null) => void;
    w: number;
    h: number;
}) {
    const wide = W > 600;
    const fs = wide ? 10 : 13;
    const PAD = { top: 14, right: 16, bottom: wide ? 26 : 30, left: wide ? 52 : 60 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const t0 = new Date(points[0].date).getTime();
    const t1 = new Date(points[points.length - 1].date).getTime();
    const span = Math.max(1, t1 - t0);
    const maxY = niceCeiling(points[points.length - 1].total);

    const x = (iso: string) => PAD.left + ((new Date(iso).getTime() - t0) / span) * innerW;
    const y = (v: number) => PAD.top + innerH - (v / maxY) * innerH;

    const line = points.map((p) => `${x(p.date)},${y(p.total)}`).join(" ");
    const area = `${PAD.left},${PAD.top + innerH} ${line} ${PAD.left + innerW},${PAD.top + innerH}`;

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            role="img"
            aria-label={`Cumulative money raised, ${inr(points[points.length - 1].total)} to date`}
            onMouseLeave={() => onHover(null)}
        >
            {/* Recessive grid — three hairlines, no box, no vertical rules. */}
            {[0, 0.5, 1].map((f) => (
                <g key={f}>
                    <line
                        x1={PAD.left}
                        x2={PAD.left + innerW}
                        y1={y(maxY * f)}
                        y2={y(maxY * f)}
                        stroke={GRID}
                        strokeWidth="1"
                    />
                    <text x={PAD.left - 8} y={y(maxY * f) + fs / 3} textAnchor="end" fontSize={fs} fill={AXIS}>
                        {inr(Math.round(maxY * f))}
                    </text>
                </g>
            ))}

            <polygon points={area} fill={MONEY} opacity="0.10" />
            <polyline
                points={line}
                fill="none"
                stroke={MONEY}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
            />

            {/* Crosshair + emphasised point on hover. */}
            {active && (
                <>
                    <line
                        x1={x(active.date)}
                        x2={x(active.date)}
                        y1={PAD.top}
                        y2={PAD.top + innerH}
                        stroke={AXIS}
                        strokeWidth="1"
                        strokeDasharray="3 3"
                    />
                    <circle
                        cx={x(active.date)}
                        cy={y(active.total)}
                        r="4.5"
                        fill={MONEY}
                        stroke="#fffdf8"
                        strokeWidth="2"
                    />
                </>
            )}

            {/* Invisible hit bands — targets far bigger than the marks. */}
            {points.map((p, i) => {
                const half = innerW / points.length / 2;
                return (
                    <rect
                        key={p.date + i}
                        x={x(p.date) - half}
                        y={PAD.top}
                        width={half * 2}
                        height={innerH}
                        fill="transparent"
                        onMouseEnter={() => onHover(i)}
                    />
                );
            })}

            <text x={PAD.left} y={H - 8} fontSize={fs} fill={AXIS}>
                {dayLabel(points[0].date)}
            </text>
            <text x={PAD.left + innerW} y={H - 8} textAnchor="end" fontSize={fs} fill={AXIS}>
                {dayLabel(points[points.length - 1].date)}
            </text>
        </svg>
    );
}

/**
 * Where the tokens are. Part-to-whole across a handful of named states, so a
 * horizontal stacked bar — not a pie, and not one bar per state, which would
 * lose the "out of how many" that makes the number mean something.
 */
export function PipelineChart({ slices }: { slices: PipelineSlice[] }) {
    const [hover, setHover] = useState<string | null>(null);
    const total = slices.reduce((s, x) => s + x.count, 0);

    if (total === 0) {
        return (
            <ChartCard title="Token pipeline" subtitle="Where every minted token sits">
                <EmptyPlot note="No tokens minted yet." />
            </ChartCard>
        );
    }

    return (
        <ChartCard title="Token pipeline" subtitle={`Where all ${total} minted tokens sit`}>
            {/* 2px surface gaps between segments — the spacer that keeps adjacent
                fills readable without a stroke. */}
            <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-lg">
                {slices.map((s) => (
                    <div
                        key={s.status}
                        className="h-full transition-opacity first:rounded-l-lg last:rounded-r-lg"
                        style={{
                            width: `${(s.count / total) * 100}%`,
                            backgroundColor: PIPELINE_COLORS[s.status] ?? PIPELINE_FALLBACK,
                            opacity: hover && hover !== s.status ? 0.35 : 1,
                        }}
                        onMouseEnter={() => setHover(s.status)}
                        onMouseLeave={() => setHover(null)}
                        title={`${s.status}: ${s.count} of ${total}`}
                    />
                ))}
            </div>

            {/* Direct labels — identity never rests on colour alone. */}
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                {slices.map((s) => (
                    <li key={s.status} className="flex items-center gap-2">
                        <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: PIPELINE_COLORS[s.status] ?? PIPELINE_FALLBACK }}
                        />
                        <span className="text-[13px] text-slate-600 capitalize">{s.status}</span>
                        <span className="text-[13px] font-semibold tabular-nums text-slate-900">
                            {s.count}
                        </span>
                    </li>
                ))}
            </ul>
        </ChartCard>
    );
}

function ChartCard({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/[0.06]">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
            <div className="mt-4 flex flex-1 flex-col justify-center">{children}</div>
        </div>
    );
}

function EmptyPlot({ note }: { note: string }) {
    return (
        <div className="flex h-[160px] items-center justify-center rounded-lg bg-slate-50/70 text-xs text-slate-400">
            {note}
        </div>
    );
}
