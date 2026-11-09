"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DashboardData, Point, UnitData } from "@/lib/types";
import { LineChart, Legend, type LineSeries } from "./charts";
import { shortRoom } from "./BookingCalendar";
import { HourlyStrip, WeatherIcon, describe, compass } from "./Weather";
import { daysIn, gasSummary, lowestGas } from "./Utilities";
import {
  DAMP,
  Occupancy,
  OverbookingAlert,
  SERIES_COLORS,
  StayDates,
  TimeBox,
  airbnbRoomList,
  dayKey,
  findOverbookings,
  guestStatus,
  RoomIcon,
} from "./Units";

const OUTSIDE = "#9085e9";

/* ---------- helpers ---------- */
function useHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setH(Math.floor(el.clientHeight));
    const ro = new ResizeObserver(([e]) => setH(Math.floor(e.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, h] as const;
}

/** Fills the remaining height of a flex column with a chart. */
function Fill({ grow = 1, children }: { grow?: number; children: (h: number) => ReactNode }) {
  const [ref, h] = useHeight<HTMLDivElement>();
  return (
    <div ref={ref} className="min-h-0" style={{ flex: `${grow} 1 0` }}>
      {h > 40 && children(h)}
    </div>
  );
}

function averageSeries(series: Point[][]): Point[] {
  const B = 30 * 60_000;
  const acc = new Map<number, { s: number; n: number }>();
  for (const pts of series)
    for (const p of pts) {
      const k = Math.round(p.t / B) * B;
      const a = acc.get(k) ?? { s: 0, n: 0 };
      a.s += p.v;
      a.n += 1;
      acc.set(k, a);
    }
  return [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([t, a]) => ({ t, v: Math.round((a.s / a.n) * 10) / 10 }));
}

const short = (label: string) =>
  label
    .replace(/^bedroom\s*/i, "Bed ")
    .replace(/^bathroom\s*/i, "Bath ")
    .replace(/^living room$/i, "Living")
    .replace(/^business hall$/i, "Hall")
    .trim();

function Card({ title, right, className = "", children }: { title: string; right?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`card-3d flex min-h-0 min-w-0 flex-col rounded-2xl p-3 hover:!translate-y-0 ${className}`}>
      <header className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
        <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">{title}</h2>
        {right && <div className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--ink-3)]">{right}</div>}
      </header>
      {children}
    </section>
  );
}

function Pill({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent: string }) {
  return (
    <div className="card-3d flex h-[52px] min-w-0 flex-1 basis-0 flex-col justify-center rounded-xl px-3 hover:!translate-y-0">
      <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl" style={{ background: accent }} />
      <div className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold leading-tight tabular-nums text-[var(--ink-1)]">{value}</span>
        {sub && <span className="truncate text-[11px] text-[var(--ink-2)]">{sub}</span>}
      </div>
    </div>
  );
}

/**
 * The wall layout is designed for 1920×1080 and scaled to fit any screen,
 * so a 32" TV, a laptop or a 4K monitor all show everything on one screen.
 */
// The smallest canvas the layout needs. Bigger windows scale everything up
// (easier to read on a 32" TV); smaller or maximized-with-toolbars windows
// scale down only as much as needed. Width and height both stretch to fill.
const DESIGN_W = 1600;
const DESIGN_H = 860;
function useFitScale() {
  const [box, setBox] = useState({ s: 1, w: DESIGN_W, h: DESIGN_H });
  useEffect(() => {
    const fit = () => {
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = document.documentElement.clientHeight || window.innerHeight;
      const s = Math.max(0.6, Math.min(vw / DESIGN_W, vh / DESIGN_H, 1.6));
      setBox({ s, w: vw / s, h: vh / s });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return box;
}

/* ---------- main ---------- */
export function WallView({
  data,
  now,
  updated,
  loading,
  error,
  onReload,
  onDetailed,
  banner,
}: {
  data: DashboardData;
  now: Date;
  updated: string;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onDetailed: () => void;
  banner?: ReactNode; // offline / sync status bar
}) {
  const todayKey = dayKey(now);
  const f = data.forecast;
  const low = lowestGas(data.gas, now.getTime());
  const gas = low?.s ?? { pct: 0, daysLeft: 0, level: "ok" as const };
  const rooms = airbnbRoomList(data.units);
  const booked = rooms.filter(({ unit, room }) => guestStatus(data.bookings, unit.id, todayKey, room).staying).length;

  const tempSeries: LineSeries[] = data.units
    .map((u, i) => ({ key: u.id, label: u.name, color: SERIES_COLORS[i], points: averageSeries(u.rooms.map((r) => r.temp)) }))
    .filter((s) => s.points.length);
  const humSeries: LineSeries[] = [
    ...data.units.map((u, i) => ({ key: `h-${u.id}`, label: u.name, color: SERIES_COLORS[i], points: averageSeries(u.rooms.map((r) => r.humidity)) })),
    { key: "h-out", label: "Outside", color: OUTSIDE, points: data.outside.humidity },
  ].filter((s) => s.points.length);
  const allTemps = data.units.flatMap((u) => u.rooms.map((r) => r.temp.at(-1)?.v)).filter((v): v is number => v != null);
  const indoor = allTemps.length ? allTemps.reduce((a, b) => a + b, 0) / allTemps.length : null;
  const anyDemo = Object.values(data.sources).includes("demo") || data.gas.some((g) => g.source === "demo") || data.utilities.source === "demo";
  const fit = useFitScale();
  const conflicts = findOverbookings(data.bookings, todayKey);

  return (
    <div
      className="fixed left-0 top-0 flex flex-col gap-3 overflow-hidden p-3"
      style={{ width: fit.w, height: fit.h, transform: `scale(${fit.s})`, transformOrigin: "0 0" }}
    >
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3">
        <img src="/icons/192" alt="" width={40} height={40} className="rounded-xl shadow-lg" />
        <div className="w-[230px] shrink-0">
          <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">
            <span className="text-[var(--ink-1)]">{data.location}</span>{" "}
            <span className="bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-400 bg-clip-text text-transparent">Dashboard</span>
          </h1>
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
            <span className={`h-1.5 w-1.5 rounded-full ${error ? "bg-red-400" : "animate-pulse bg-emerald-400"}`} />
            <b className={error ? "text-red-300" : "text-emerald-300"}>{error ? "OFFLINE" : "LIVE"}</b>· {now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 gap-2">
          <Pill label="Indoor average" value={indoor != null ? `${indoor.toFixed(1)}°` : "—"} sub={`${data.units.length} units`} accent="linear-gradient(90deg,#3987e5,#199e70)" />
          <Pill
            label="Outside now"
            value={`${(data.outside.temp.at(-1)?.v ?? f.current.temp).toFixed(1)}°`}
            sub={`${describe(f.current.code)} · ${Math.round(f.current.wind)} ${f.windUnit} ${compass(f.current.dir)}`}
            accent={OUTSIDE}
          />
          <Pill
            label={`Gas · lowest ${low?.g.unitName ?? ""}`}
            value={`${gas.pct}%`}
            sub={`≈ ${gas.daysLeft} days left${gas.level !== "ok" ? " · order!" : ""}`}
            accent={gas.level === "critical" ? "#d03b3b" : gas.level === "low" ? "#fab219" : "#f97316"}
          />
          <Pill label="Airbnb rooms tonight" value={`${booked}/${rooms.length}`} sub="booked" accent="linear-gradient(90deg,#ff385c,#10b981)" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {anyDemo && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300" title="Some panels show sample data until connected">
              Sample data
            </span>
          )}
          <div className="text-right">
            <div className="text-3xl font-semibold leading-none tabular-nums tracking-tight text-[var(--ink-1)]">
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
            </div>
            <div className="text-[10px] text-[var(--ink-3)]">updated {updated}</div>
          </div>
          <button onClick={onReload} disabled={loading} aria-label="Refresh" title="Refresh" className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-2)] hover:text-white disabled:opacity-50">
            <svg className={loading ? "animate-spin" : ""} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
            </svg>
          </button>
          <button onClick={onDetailed} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--ink-2)] hover:text-white" title="Scrolling view with every detail, unit pages and energy records">
            Detailed view
          </button>
          <a href="/report" className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--ink-2)] hover:text-white" title="Print or save every record as PDF">
            🖨 Report
          </a>
          <Link href="/guide" aria-label="User guide" className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-sm font-bold text-[var(--ink-2)] hover:text-white">
            ?
          </Link>
        </div>
      </header>

      {banner && <div className="shrink-0 empty:hidden">{banner}</div>}

      {conflicts.length > 0 && (
        <div className="shrink-0">
          <OverbookingAlert conflicts={conflicts} compact />
        </div>
      )}

      {/* 4 columns */}
      <div className="grid min-h-0 flex-1 grid-cols-[1.25fr_1.05fr_0.95fr_1fr] gap-3">
        {/* A: temperatures */}
        <Card title="Temperatures · last 24 h" right={`updated ${updated}`}>
          <Legend items={tempSeries.map((s) => ({ label: s.label, color: s.color }))} />
          <Fill grow={1.3}>{(h) => <LineChart series={tempSeries} unit="°" height={h} ariaLabel="Average indoor temperature per unit, last 24 hours" />}</Fill>
          <div className="mt-1 shrink-0 text-xs font-medium text-[var(--ink-1)]">
            Outside <span className="text-[var(--ink-3)]">· {data.location}</span>
          </div>
          <Fill grow={0.65}>
            {(h) => <LineChart series={[{ key: "out", label: "Outside", color: OUTSIDE, points: data.outside.temp }]} unit="°" area height={h} ariaLabel="Outside temperature, last 24 hours" />}
          </Fill>
          <div className="mt-1 shrink-0 text-xs font-medium text-[var(--ink-1)]">Humidity</div>
          <Legend items={humSeries.map((s) => ({ label: s.label, color: s.color }))} />
          <Fill grow={1}>{(h) => <LineChart series={humSeries} unit="%" decimals={0} height={h} ariaLabel="Humidity per unit and outside, last 24 hours" />}</Fill>
        </Card>

        {/* B: weather + all units */}
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <Card title={`Weather · ${data.location}`} className="shrink-0">
            <div className="flex items-center gap-3">
              <WeatherIcon code={f.current.code} isDay={f.current.isDay} size={52} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tabular-nums text-[var(--ink-1)]">{Math.round(f.current.temp)}°</span>
                  <span className="truncate text-sm text-[var(--ink-1)]">{describe(f.current.code)}</span>
                </div>
                <div className="text-[11px] text-[var(--ink-2)]">
                  Feels {Math.round(f.current.feels)}° · Humidity {f.current.humidity}%
                </div>
              </div>
              <div className="chip-3d rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-center">
                <div className="text-[9px] uppercase tracking-wider text-sky-300">Wind</div>
                <div className="text-lg font-semibold leading-tight tabular-nums text-[var(--ink-1)]">
                  {Math.round(f.current.wind)} <span className="text-[10px] font-normal text-[var(--ink-3)]">{f.windUnit}</span>
                </div>
                <div className="text-[10px] text-[var(--ink-2)]">
                  {compass(f.current.dir)} · gusts {Math.round(f.current.gust)}
                </div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {f.daily.map((d, i) => (
                <div key={d.date} className={`chip-3d flex flex-col items-center rounded-lg py-1.5 text-center ${i === 0 ? "border border-sky-400/40 bg-sky-400/10" : "border border-white/5 bg-black/25"}`}>
                  <div className="text-[10px] font-semibold text-[var(--ink-1)]">{i === 0 ? "Today" : new Date(d.date + "T12:00:00").toLocaleDateString([], { weekday: "short" })}</div>
                  <WeatherIcon code={d.code} size={24} />
                  <div className="text-[11px] tabular-nums">
                    <b className="text-[var(--ink-1)]">{Math.round(d.max)}°</b> <span className="text-[var(--ink-3)]">{Math.round(d.min)}°</span>
                  </div>
                  <div className="text-[10px] tabular-nums text-sky-300">💧{d.rain}%</div>
                  <div className="text-[10px] tabular-nums text-[var(--ink-3)]">{Math.round(d.wind)}</div>
                </div>
              ))}
            </div>
            <div className="mb-1 mt-2 flex items-baseline justify-between text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
              <span>Next hours</span>
              <span>💧 rain · wind {f.windUnit}</span>
            </div>
            <HourlyStrip forecast={f} count={8} step={2} compact />
          </Card>

          <Card title="All units · room temperatures" className="flex-1" right={<span>⚠ ≥{DAMP}% damp</span>}>
            <div className="grid min-h-0 flex-1 gap-1.5 overflow-hidden" style={{ gridTemplateRows: `repeat(${data.units.length}, minmax(0,1fr))` }}>
              {data.units.map((u, ui) => (
                <UnitRow key={u.id} u={u} color={SERIES_COLORS[ui]} />
              ))}
            </div>
          </Card>
        </div>

        {/* C: gas + occupancy + arrivals */}
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <Card title="Energy per unit" className="shrink-0" right={<span>🔥 gas · ⚡/day · 💧/day</span>}>
            <div className="space-y-1">
              {data.units.map((u) => {
                const g = data.gas.find((x) => x.unit === u.id);
                const s = g ? gasSummary(g, now.getTime()) : null;
                const el = data.utilities.entries.find((e) => e.unit === u.id && e.kind === "electricity");
                const wa = data.utilities.entries.find((e) => e.unit === u.id && e.kind === "water");
                return (
                  <div key={u.id} className="grid grid-cols-[44px_1fr_56px_56px] items-center gap-2 text-[11px]">
                    <b className="text-[var(--ink-1)]">{u.name.replace("Unit ", "U")}</b>
                    {s ? (
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${s.pct}%`, background: s.level === "critical" ? "#d03b3b" : s.level === "low" ? "#fab219" : "#22c55e" }}
                          />
                        </div>
                        <span className={`w-12 shrink-0 text-right tabular-nums ${s.level !== "ok" ? "font-semibold text-amber-300" : "text-[var(--ink-2)]"}`}>
                          {s.pct}% {s.daysLeft}d
                        </span>
                      </div>
                    ) : (
                      <span className="text-[var(--ink-3)]" title="Gas not in use now · available on request">not in use now</span>
                    )}
                    <span className="text-right tabular-nums text-[var(--ink-2)]" title="Electricity kWh per day (latest record)">
                      ⚡{el ? (el.amount / daysIn(el)).toFixed(1) : "–"}
                    </span>
                    <span className="text-right tabular-nums text-[var(--ink-2)]" title="Water units per day (latest record)">
                      💧{wa ? (wa.amount / daysIn(wa)).toFixed(1) : "–"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="shrink-0">
            <Occupancy units={data.units} bookings={data.bookings} now={now} days={14} compact />
          </div>

          <Card title="Upcoming arrivals" className="flex-1">
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
              {data.bookings
                .filter((b) => b.start >= todayKey)
                .sort((a, b) => a.start.localeCompare(b.start))
                .slice(0, 3)
                .map((b) => (
                  <li key={b.id} className="shrink-0">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <b className="truncate text-[var(--ink-1)]">{b.guest}</b>
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[var(--ink-2)]">{b.room ? shortRoom(b.room) : "Unit"}</span>
                    </div>
                    <div className="flex gap-2">
                      <TimeBox kind="in" day={b.start} time={b.checkInTime} todayKey={todayKey} />
                      <TimeBox kind="out" day={b.end} time={b.checkOutTime} todayKey={todayKey} />
                    </div>
                  </li>
                ))}
            </ul>
          </Card>
        </div>

        {/* D: guest rooms tonight */}
        <section className="card-3d flex min-h-0 min-w-0 flex-col rounded-2xl !bg-gradient-to-b from-emerald-700 via-emerald-800 to-emerald-950 p-3 hover:!translate-y-0">
          <header className="mb-2 flex shrink-0 items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
              Guest rooms tonight · {rooms[0]?.unit.name ?? ""}
            </h2>
            <span className="text-lg font-semibold tabular-nums text-white">
              {booked}
              <span className="text-white/50">/{rooms.length}</span>
            </span>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5">
            {rooms.map(({ unit, room }, i) => {
              const st = guestStatus(data.bookings, unit.id, todayKey, room);
              const series = unit.rooms.find((r) => r.label === room);
              const t = series?.temp.at(-1)?.v;
              const h = series?.humidity.at(-1)?.v;
              return (
                <div key={room} className={`chip-3d flex min-h-0 flex-1 flex-col rounded-xl p-2.5 ${st.staying ? "bg-emerald-950/45 ring-1 ring-emerald-300/30" : "bg-black/25 ring-1 ring-white/10"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${SERIES_COLORS[i]}33`, color: SERIES_COLORS[i] }}>
                        <RoomIcon name={room} size={18} />
                      </span>
                      <div>
                        <div className="text-sm font-semibold leading-tight text-white">{room}</div>
                        <div className="text-[10px] text-white/55">Double bed · 1–2 guests</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-semibold leading-tight tabular-nums text-white">{t != null ? `${t.toFixed(1)}°` : "—"}</div>
                      {h != null && <div className={`text-[10px] tabular-nums ${h >= DAMP ? "font-semibold text-amber-300" : "text-white/55"}`}>💧{Math.round(h)}%</div>}
                    </div>
                  </div>
                  <div className={`mt-1.5 text-[9px] font-semibold uppercase tracking-wider ${st.staying ? "text-emerald-300" : "text-white/50"}`}>
                    {st.staying ? "Occupied now" : "Vacant tonight"}
                    {st.checkOut && <span className="ml-1 text-amber-300">· 🧹 clean today</span>}
                  </div>
                  {st.staying ? (
                    <StayDates b={st.staying} todayKey={todayKey} />
                  ) : (
                    <div className="text-xs text-white/50">No guest tonight</div>
                  )}
                  <div className="mt-auto truncate pt-1.5 text-[11px] text-white/70">
                    <span className="text-white/45">Next:</span>{" "}
                    {st.next ? (
                      <>
                        <b className="text-white">{st.next.guest}</b> · in {new Date(st.next.start + "T12:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} {st.next.checkInTime}
                      </>
                    ) : (
                      "nothing booked"
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function UnitRow({ u, color }: { u: UnitData; color: string }) {
  const temps = u.rooms.map((r) => r.temp.at(-1)?.v).filter((v): v is number => v != null);
  const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
  return (
    <div className="chip-3d flex min-h-0 flex-col justify-center overflow-hidden rounded-xl border border-white/5 bg-black/25 px-2.5 py-1">
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
          <b className="text-xs text-[var(--ink-1)]">{u.name}</b>
          <span className="truncate text-[10px] text-[var(--ink-3)]">
            {u.usage ?? u.owner ?? u.note}
          </span>
        </div>
        <span className="text-sm font-semibold tabular-nums text-[var(--ink-1)]">{avg != null ? `${avg.toFixed(1)}°` : "—"}</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {u.rooms.map((r) => {
          const t = r.temp.at(-1)?.v;
          const h = r.humidity.at(-1)?.v;
          const damp = h != null && h >= DAMP;
          const let_ = u.airbnbRooms.includes(r.label);
          return (
            <div
              key={r.key}
              title={`${r.label}: ${t?.toFixed(1) ?? "—"}°, ${h ?? "—"}%`}
              className={`flex items-center justify-between gap-1 rounded-md px-1.5 py-0.5 text-[11px] ${damp ? "bg-amber-400/15" : "bg-white/[0.04]"} ${let_ ? "ring-1 ring-[#ff385c]/40" : ""}`}
            >
              <span className="truncate text-[var(--ink-3)]">{short(r.label)}</span>
              <b className="tabular-nums text-[var(--ink-1)]">{t != null ? `${t.toFixed(1)}°` : "—"}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
