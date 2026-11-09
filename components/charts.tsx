"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Point } from "@/lib/types";

/* ---------------------------------------------------------------- */
/* Helpers                                                          */
/* ---------------------------------------------------------------- */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.floor(el.clientWidth)); // layout size (unaffected by CSS scale)
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceStep(range: number, count: number) {
  const raw = range / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}
function niceTicks(min: number, max: number, count = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const step = niceStep(max - min, count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return { lo, hi, ticks };
}

/** Monotone cubic path (Fritsch–Carlson) — smooth without overshoot. */
function monotonePath(p: [number, number][]) {
  const n = p.length;
  if (n === 0) return "";
  if (n === 1) return `M${p[0][0]},${p[0][1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = p[i + 1][0] - p[i][0] || 1e-6;
    m[i] = (p[i + 1][1] - p[i][1]) / dx[i];
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${(p[i][0] + h).toFixed(1)},${(p[i][1] + t[i] * h).toFixed(1)},${(p[i + 1][0] - h).toFixed(1)},${(p[i + 1][1] - t[i + 1] * h).toFixed(1)},${p[i + 1][0].toFixed(1)},${p[i + 1][1].toFixed(1)}`;
  }
  return d;
}

function nearest(points: Point[], t: number) {
  let lo = 0;
  let hi = points.length - 1;
  if (hi < 0) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid;
    else hi = mid;
  }
  return Math.abs(points[lo].t - t) <= Math.abs(points[hi].t - t) ? points[lo] : points[hi];
}

export type XFormat = "time" | "day" | "month";
function fmtX(t: number, f: XFormat) {
  const d = new Date(t);
  if (f === "time") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (f === "day") return d.toLocaleDateString([], { day: "numeric", month: "short" });
  return d.toLocaleDateString([], { month: "short", year: "2-digit" });
}
function fmtTooltipX(t: number, f: XFormat) {
  const d = new Date(t);
  if (f === "time")
    return d.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function timeTicks(min: number, max: number, f: XFormat, width: number) {
  const target = Math.max(2, Math.floor(width / 70));
  const H = 3_600_000;
  const D = 24 * H;
  const steps =
    f === "time"
      ? [H, 2 * H, 3 * H, 4 * H, 6 * H, 12 * H]
      : f === "day"
        ? [D, 2 * D, 5 * D, 7 * D, 14 * D]
        : [30 * D, 61 * D, 91 * D, 182 * D];
  const step = steps.find((s) => (max - min) / s <= target) ?? steps.at(-1)!;
  const out: number[] = [];
  if (f === "month") {
    const months = Math.round(step / (30 * D));
    const d = new Date(min);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() + 1);
    while (d.getTime() <= max) {
      if (d.getMonth() % months === 0) out.push(d.getTime());
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }
  const offset = new Date(min).getTimezoneOffset() * 60_000;
  let t = Math.ceil((min - offset) / step) * step + offset;
  for (; t <= max; t += step) out.push(t);
  return out;
}

/* ---------------------------------------------------------------- */
/* Legend                                                           */
/* ---------------------------------------------------------------- */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-2)]">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- */
/* Tooltip                                                          */
/* ---------------------------------------------------------------- */
function Tooltip({
  x,
  width,
  title,
  rows,
}: {
  x: number;
  width: number;
  title: string;
  rows: { label: string; color: string; value: string }[];
}) {
  const left = x > width - 170 ? x - 166 : x + 14;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-[var(--border)] bg-[var(--tooltip)] px-3 py-2 text-xs shadow-xl backdrop-blur"
      style={{ left: Math.max(0, left) }}
    >
      <div className="mb-1 font-medium text-[var(--ink-1)]">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 text-[var(--ink-2)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
            {r.label}
          </span>
          <span className="tabular-nums text-[var(--ink-1)]">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Line / area chart                                                */
/* ---------------------------------------------------------------- */
export type LineSeries = { key: string; label: string; color: string; points: Point[] };

export function LineChart({
  series,
  height = 220,
  unit = "",
  decimals = 1,
  xFormat = "time",
  area = false,
  endLabels = true,
  ariaLabel,
  footer,
}: {
  series: LineSeries[];
  height?: number;
  unit?: string;
  decimals?: number;
  xFormat?: XFormat;
  area?: boolean;
  endLabels?: boolean;
  ariaLabel: string;
  footer?: ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverT, setHoverT] = useState<number | null>(null);

  const all = series.flatMap((s) => s.points);
  const tMin = Math.min(...all.map((p) => p.t));
  const tMax = Math.max(...all.map((p) => p.t));
  const vals = all.map((p) => p.v);
  const { lo, hi, ticks } = niceTicks(Math.min(...vals), Math.max(...vals), height < 160 ? 3 : 4);

  const labelW = endLabels && width > 420 ? 108 : 8;
  const M = { l: 38, r: labelW, t: 10, b: 24 };
  const iw = Math.max(10, width - M.l - M.r);
  const ih = height - M.t - M.b;
  const x = (t: number) => M.l + ((t - tMin) / (tMax - tMin || 1)) * iw;
  const y = (v: number) => M.t + (1 - (v - lo) / (hi - lo || 1)) * ih;

  const paths = useMemo(
    () =>
      series.map((s) => {
        const pts = s.points.map((p) => [x(p.t), y(p.v)] as [number, number]);
        const line = monotonePath(pts);
        const fill = area && pts.length
          ? `${line}L${pts.at(-1)![0]},${M.t + ih}L${pts[0][0]},${M.t + ih}Z`
          : "";
        return { s, line, fill };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, width, height, lo, hi],
  );

  // End labels, pushed apart to avoid collisions
  const labels = useMemo(() => {
    if (labelW < 20) return [];
    const items = series
      .filter((s) => s.points.length)
      .map((s) => {
        const last = s.points.at(-1)!;
        return { s, v: last.v, y: y(last.v) };
      })
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++)
      if (items[i].y - items[i - 1].y < 13) items[i].y = items[i - 1].y + 13;
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, width, height, lo, hi, labelW]);

  const xt = width ? timeTicks(tMin, tMax, xFormat, iw) : [];
  const hoverPts =
    hoverT != null
      ? series.map((s) => ({ s, p: nearest(s.points, hoverT) })).filter((h) => h.p)
      : [];
  const hoverX = hoverPts[0]?.p ? x(hoverPts[0].p.t) : 0;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && all.length > 1 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = (e.clientX - r.left) * (width / (r.width || width)); // correct for CSS scaling
            if (px < M.l || px > M.l + iw) return setHoverT(null);
            setHoverT(tMin + ((px - M.l) / iw) * (tMax - tMin));
          }}
          onPointerLeave={() => setHoverT(null)}
          className="touch-pan-y select-none"
        >
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={M.l + iw} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
              <text x={M.l - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-[var(--ink-3)] text-[10px] tabular-nums">
                {v}
                {unit === "%" ? "" : ""}
              </text>
            </g>
          ))}
          {xt.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={M.t} y2={M.t + ih} stroke="var(--grid)" strokeWidth={1} opacity={0.6} />
              <text x={x(t)} y={height - 6} textAnchor="middle" className="fill-[var(--ink-3)] text-[10px] tabular-nums">
                {fmtX(t, xFormat)}
              </text>
            </g>
          ))}
          <line x1={M.l} x2={M.l + iw} y1={M.t + ih} y2={M.t + ih} stroke="var(--axis)" />
          {paths.map(({ s, fill }) => fill && <path key={`f-${s.key}`} d={fill} fill={`url(#g-${s.key})`} />)}
          {paths.map(({ s, line }) => (
            <path key={s.key} d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {labels.map(({ s, v, y: ly }) => (
            <g key={`l-${s.key}`} transform={`translate(${M.l + iw + 8},${ly})`}>
              <circle r={3.5} cx={2} fill={s.color} />
              <text x={10} dy="0.32em" className="fill-[var(--ink-2)] text-[11px]">
                {s.label} <tspan className="fill-[var(--ink-1)] font-semibold tabular-nums">{v.toFixed(decimals)}{unit}</tspan>
              </text>
            </g>
          ))}
          {hoverPts.length > 0 && (
            <g pointerEvents="none">
              <line x1={hoverX} x2={hoverX} y1={M.t} y2={M.t + ih} stroke="var(--ink-3)" strokeDasharray="3 3" />
              {hoverPts.map(({ s, p }) => (
                <circle key={s.key} cx={x(p!.t)} cy={y(p!.v)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
      )}
      {hoverPts.length > 0 && (
        <Tooltip
          x={hoverX}
          width={width}
          title={fmtTooltipX(hoverPts[0].p!.t, xFormat)}
          rows={hoverPts.map(({ s, p }) => ({
            label: s.label,
            color: s.color,
            value: `${p!.v.toFixed(decimals)}${unit}`,
          }))}
        />
      )}
      {footer}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Stacked bar chart                                                */
/* ---------------------------------------------------------------- */
export type BarKey = { key: string; label: string; color: string };
export type BarDatum = { t: number; values: Record<string, number> };

function topRounded(x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function StackedBars({
  data,
  keys,
  height = 200,
  unit = "kWh",
  xFormat = "day",
  decimals = 1,
  ariaLabel,
}: {
  data: BarDatum[];
  keys: BarKey[];
  height?: number;
  unit?: string;
  xFormat?: XFormat;
  decimals?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((d) => keys.reduce((a, k) => a + (d.values[k.key] ?? 0), 0));
  const { hi, ticks } = niceTicks(0, Math.max(...totals, 0.1), height < 160 ? 3 : 4);
  const M = { l: 38, r: 8, t: 10, b: 24 };
  const iw = Math.max(10, width - M.l - M.r);
  const ih = height - M.t - M.b;
  const slot = iw / Math.max(1, data.length);
  const gap = Math.min(4, slot * 0.3);
  const bw = Math.max(1, slot - gap);
  const y = (v: number) => M.t + (1 - v / (hi || 1)) * ih;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 62))));

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerLeave={() => setHover(null)} className="select-none">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={M.l + iw} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
              <text x={M.l - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-[var(--ink-3)] text-[10px] tabular-nums">
                {v}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            let acc = 0;
            const x0 = M.l + i * slot + gap / 2;
            const segs = keys.filter((k) => (d.values[k.key] ?? 0) > 0);
            return (
              <g key={d.t} opacity={hover == null || hover === i ? 1 : 0.45}>
                {segs.map((k, si) => {
                  const v = d.values[k.key];
                  const yTop = y(acc + v);
                  const yBot = y(acc);
                  acc += v;
                  // 2px surface gap between stacked segments
                  const h = Math.max(0, yBot - yTop - (si > 0 ? 2 : 0));
                  const isTop = si === segs.length - 1;
                  return isTop ? (
                    <path key={k.key} d={topRounded(x0, yTop, bw, h, 4)} fill={k.color} />
                  ) : (
                    <rect key={k.key} x={x0} y={yTop} width={bw} height={h} fill={k.color} />
                  );
                })}
                <rect
                  x={M.l + i * slot}
                  y={M.t}
                  width={slot}
                  height={ih}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                  onPointerDown={() => setHover(i)}
                />
                {i % labelEvery === 0 && (
                  <text x={x0 + bw / 2} y={height - 6} textAnchor="middle" className="fill-[var(--ink-3)] text-[10px] tabular-nums">
                    {fmtX(d.t, xFormat)}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={M.l} x2={M.l + iw} y1={M.t + ih} y2={M.t + ih} stroke="var(--axis)" />
        </svg>
      )}
      {hover != null && data[hover] && (
        <Tooltip
          x={M.l + hover * slot + slot / 2}
          width={width}
          title={fmtTooltipX(data[hover].t, xFormat)}
          rows={[
            ...keys.map((k) => ({
              label: k.label,
              color: k.color,
              value: `${(data[hover].values[k.key] ?? 0).toFixed(decimals)} ${unit}`,
            })),
            { label: "Total", color: "transparent", value: `${totals[hover].toFixed(decimals)} ${unit}` },
          ]}
        />
      )}
    </div>
  );
}
