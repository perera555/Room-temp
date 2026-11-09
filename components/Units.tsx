"use client";

import type { Booking, RoomSeries, UnitData } from "@/lib/types";
import { fmtRange, nights, shortRoom } from "./BookingCalendar";

export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#e66767"];

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const fmtDay = (k: string) => new Date(k + "T12:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

/** Who is in a unit (or one bedroom) tonight, and who arrives next. Whole-unit bookings (room = null) count for every room. */
export function guestStatus(bookings: Booking[], unit: string | null, todayKey: string, room: string | null = null) {
  const mine = bookings.filter((b) => (!unit || b.unit === unit) && (!room || b.room === room || b.room == null));
  const staying = mine.find((b) => b.start <= todayKey && b.end > todayKey) ?? null;
  const next = mine.filter((b) => b.start > todayKey).sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
  const checkIn = mine.find((b) => b.start === todayKey) ?? null;
  const checkOut = mine.find((b) => b.end === todayKey) ?? null;
  return { staying, next, checkIn, checkOut };
}

export type Conflict = { a: Booking; b: Booking; room: string; from: string; to: string };

/**
 * Overbooking check: two bookings in the same unit whose nights overlap, in the
 * same bedroom (or where one of them books the whole unit).
 */
export function findOverbookings(bookings: Booking[], todayKey: string): Conflict[] {
  const out: Conflict[] = [];
  const live = bookings.filter((b) => b.end > todayKey && b.unit);
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.unit !== b.unit) continue;
      const sameRoom = a.room == null || b.room == null || a.room === b.room;
      if (!sameRoom) continue;
      if (a.start < b.end && b.start < a.end) {
        out.push({
          a,
          b,
          room: a.room ?? b.room ?? "Whole unit",
          from: a.start > b.start ? a.start : b.start,
          to: a.end < b.end ? a.end : b.end,
        });
      }
    }
  return out.sort((x, y) => x.from.localeCompare(y.from));
}

/** Red alert listing every overbooking. Renders nothing when there are none. */
export function OverbookingAlert({ conflicts, compact = false }: { conflicts: Conflict[]; compact?: boolean }) {
  if (!conflicts.length) return null;
  const d = (k: string) => new Date(k + "T12:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  return (
    <div
      role="alert"
      className={`chip-3d flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-red-400/60 bg-gradient-to-r from-red-600/40 to-red-900/40 text-red-50 ${
        compact ? "px-3 py-1.5 text-xs" : "px-4 py-3 text-sm"
      }`}
    >
      <b className="flex items-center gap-2 uppercase tracking-wider">
        <span className="animate-pulse">⚠</span> Overbooking{conflicts.length > 1 ? ` ×${conflicts.length}` : ""}
      </b>
      {conflicts.map((c, i) => (
        <span key={i}>
          <b>{c.room}</b>: {c.a.guest} &amp; {c.b.guest} both booked {d(c.from)} → {d(c.to)}
        </span>
      ))}
      <span className="opacity-75">Cancel or move one booking.</span>
    </div>
  );
}

/** All Airbnb bedrooms across the property, e.g. [{unit, room:"Bedroom 1"}, …]. */
export function airbnbRoomList(units: UnitData[]) {
  return units.flatMap((u) => u.airbnbRooms.map((room) => ({ unit: u, room })));
}

/** Humidity (%) above which a room counts as damp. Tropical homes sit around 65–80%. */
export const DAMP = 85;

/** Comfort bands tuned for a tropical climate (Sri Lanka). */
function comfort(t: number) {
  if (t < 22) return { label: "Cool", dot: "#60a5fa" };
  if (t <= 28) return { label: "Comfortable", dot: "#34d399" };
  if (t <= 31) return { label: "Warm", dot: "#fb923c" };
  return { label: "Hot", dot: "#ef4444" };
}

function AirbnbBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`rounded-full bg-[#ff385c]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#ff8fa3] ring-1 ring-[#ff385c]/30 ${className}`}>
      Airbnb
    </span>
  );
}

export function UnitTabs({ units, value, onChange }: { units: UnitData[]; value: string; onChange: (id: string) => void }) {
  const tabs = [{ id: "all", name: "All units", airbnb: false }, ...units.map((u) => ({ id: u.id, name: u.name, airbnb: u.airbnbRooms.length > 0 }))];
  return (
    <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Units">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          aria-pressed={value === t.id}
          className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
            value === t.id
              ? "bg-gradient-to-r from-sky-500 to-emerald-500 text-white shadow-lg"
              : "border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-2)] hover:text-white"
          }`}
        >
          {t.name}
          {t.airbnb && <span className="h-1.5 w-1.5 rounded-full bg-[#ff385c]" title="Airbnb" />}
        </button>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */
export function RoomIcon({ name, size = 20 }: { name: string; size?: number }) {
  const n = name.toLowerCase();
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (n.includes("bath"))
    return (
      <svg {...p}>
        <path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3ZM6 12V6a2 2 0 0 1 4 0M7 20l-1 2M17 20l1 2" />
      </svg>
    );
  if (n.includes("kitchen"))
    return (
      <svg {...p}>
        <path d="M4 10h16v4a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-4ZM2 10h20M9 6c0-1 1-1 1-2M14 6c0-1 1-1 1-2" />
      </svg>
    );
  if (n.includes("hall") || n.includes("office") || n.includes("business"))
    return (
      <svg {...p}>
        <path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M8.5 11h1M14.5 11h1" />
      </svg>
    );
  if (n.includes("living"))
    return (
      <svg {...p}>
        <path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3v-5ZM6 18v2M18 18v2" />
      </svg>
    );
  // double bed
  return (
    <svg {...p}>
      <path d="M3 19v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 16h18M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M8 11V9.5a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1V11M12.5 11V9.5a1 1 0 0 1 1-1H15a1 1 0 0 1 1 1V11" />
    </svg>
  );
}

function Sparkline({ points, color }: { points: { t: number; v: number }[]; color: string }) {
  if (points.length < 2) return null;
  const W = 120;
  const H = 36;
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const t0 = points[0].t;
  const t1 = points.at(-1)!.t;
  const xy = points.map((p) => [((p.t - t0) / (t1 - t0 || 1)) * W, H - 3 - ((p.v - min) / (max - min || 1)) * (H - 6)]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const id = `sp-${color.slice(1)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-9 w-full" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Guest line for an Airbnb bedroom. */
function GuestLine({ status, compact = false }: { status: ReturnType<typeof guestStatus>; compact?: boolean }) {
  const { staying, next, checkIn, checkOut } = status;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {staying ? (
        <span className="truncate rounded-full bg-emerald-400/20 px-2 py-0.5 font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
          ● {staying.guest}
          {!compact && <span className="font-normal text-emerald-100/80"> · out {fmtDay(staying.end)}</span>}
        </span>
      ) : (
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[var(--ink-3)] ring-1 ring-white/10">
          ○ Vacant{next && !compact ? ` · next ${next.guest} ${fmtDay(next.start)}` : ""}
        </span>
      )}
      {checkIn && <span className="rounded-full bg-sky-400/20 px-2 py-0.5 font-semibold text-sky-200">↘ Check-in today</span>}
      {checkOut && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 font-semibold text-amber-200">🧹 Check-out today</span>}
    </div>
  );
}

/** Small separate box for a check-in or check-out date + time. */
export function TimeBox({ kind, day, time, todayKey }: { kind: "in" | "out"; day: string; time: string | null; todayKey?: string }) {
  const isIn = kind === "in";
  const today = todayKey === day;
  return (
    <div
      className={`chip-3d flex h-[68px] min-w-0 flex-1 basis-0 flex-col justify-center rounded-lg px-2.5 ${
        isIn ? "chip-in" : "chip-out"
      } ${today ? "chip-today" : ""}`}
    >
      <div className={`text-[9px] font-semibold uppercase tracking-wider ${isIn ? "text-sky-300" : "text-amber-300"}`}>
        {isIn ? "↘ Check-in" : "↗ Check-out"}
        {today && " · today"}
      </div>
      <div className="truncate text-xs text-white/85">{fmtDay(day)}</div>
      <div className="text-base font-semibold leading-tight tabular-nums text-white">{time ?? "—"}</div>
    </div>
  );
}

/** Guest name with separate check-in and check-out boxes. */
export function StayDates({ b, big = false, todayKey }: { b: Booking; big?: boolean; todayKey?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <div className={`truncate font-semibold text-white ${big ? "text-lg" : "text-sm"}`}>{b.guest}</div>
        <div className="shrink-0 text-[11px] text-white/45">
          {nights(b)} night{nights(b) === 1 ? "" : "s"}
        </div>
      </div>
      <div className="mt-1.5 flex gap-2">
        <TimeBox kind="in" day={b.start} time={b.checkInTime} todayKey={todayKey} />
        <TimeBox kind="out" day={b.end} time={b.checkOutTime} todayKey={todayKey} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Airbnb bedrooms (overview)                                          */
/* ------------------------------------------------------------------ */
export function AirbnbRooms({ units, bookings, todayKey, onOpen }: { units: UnitData[]; bookings: Booking[]; todayKey: string; onOpen: (id: string) => void }) {
  const list = airbnbRoomList(units);
  if (!list.length) return null;
  const booked = list.filter(({ unit, room }) => guestStatus(bookings, unit.id, todayKey, room).staying).length;
  const multiUnit = new Set(list.map((l) => l.unit.id)).size > 1;

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/10 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      style={{ background: "radial-gradient(800px 260px at 0% 0%, rgba(255,56,92,0.20), transparent 60%), radial-gradient(700px 300px at 100% 100%, rgba(16,185,129,0.18), transparent 60%), #121417" }}
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <AirbnbBadge />
            <span className="text-xs uppercase tracking-[0.16em] text-white/60">{[...new Set(list.map((l) => l.unit.name))].join(", ")} · rooms let individually</span>
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Guest rooms tonight</h2>
        </div>
        <div className="text-right">
          <div className="text-4xl font-semibold tabular-nums text-white">
            {booked}
            <span className="text-white/40">/{list.length}</span>
          </div>
          <div className="text-xs uppercase tracking-wider text-white/60">rooms booked</div>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {list.map(({ unit, room }, i) => {
          const series = unit.rooms.find((r) => r.label === room);
          const t = series?.temp.at(-1)?.v;
          const h = series?.humidity.at(-1)?.v;
          const st = guestStatus(bookings, unit.id, todayKey, room);
          const color = SERIES_COLORS[i % SERIES_COLORS.length];
          return (
            <button
              key={`${unit.id}-${room}`}
              onClick={() => onOpen(unit.id)}
              className={`group relative min-w-0 overflow-hidden rounded-2xl p-4 text-left ring-1 transition hover:-translate-y-0.5 ${
                st.staying ? "bg-emerald-950/40 ring-emerald-400/30" : "bg-black/30 ring-white/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: `${color}26`, color }}>
                    <RoomIcon name={room} size={24} />
                  </span>
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {multiUnit ? `${unit.name} · ` : ""}
                      {room}
                    </div>
                    <div className="text-xs text-white/55">Double bed · single guest or couple (max 2)</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-semibold tabular-nums text-white">{t != null ? `${t.toFixed(1)}°` : "—"}</div>
                  {h != null && <div className={`text-xs tabular-nums ${h >= DAMP ? "font-semibold text-amber-300" : "text-white/55"}`}>{h >= DAMP ? "⚠ " : "💧 "}{Math.round(h)}%</div>}
                </div>
              </div>
              <div className="mt-3 rounded-xl bg-white/5 px-3 py-2.5">
                <div className={`text-[10px] font-semibold uppercase tracking-wider ${st.staying ? "text-emerald-300" : "text-white/50"}`}>
                  {st.staying ? "Occupied now" : "Vacant tonight"}
                </div>
                {st.staying ? <StayDates b={st.staying} big todayKey={todayKey} /> :<div className="text-sm text-white/55">No guest tonight</div>}
              </div>
              <div className="mt-2 rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Next guest</div>
                {st.next ? <StayDates b={st.next} todayKey={todayKey} /> :<div className="text-sm text-white/45">Nothing booked yet</div>}
              </div>
              {(st.checkIn || st.checkOut) && (
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  {st.checkOut && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 font-semibold text-amber-200">🧹 {st.checkOut.guest} leaves today: clean room</span>}
                  {st.checkIn && <span className="rounded-full bg-sky-400/20 px-2 py-0.5 font-semibold text-sky-200">↘ {st.checkIn.guest} arrives today</span>}
                </div>
              )}
              {series && <div className="mt-2"><Sparkline points={series.temp} color={color} /></div>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Compact unit cards (overview, bottom)                               */
/* ------------------------------------------------------------------ */
export function UnitCards({ units, bookings, todayKey, onOpen }: { units: UnitData[]; bookings: Booking[]; todayKey: string; onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      {units.map((u, ui) => {
        const temps = u.rooms.map((r) => r.temp.at(-1)?.v).filter((v): v is number => v != null);
        const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
        const color = SERIES_COLORS[ui % SERIES_COLORS.length];
        const isAirbnb = u.airbnbRooms.length > 0;
        return (
          <button
            key={u.id}
            onClick={() => onOpen(u.id)}
            className="card-3d group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl p-4 text-left"
          >
            <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color }} />
            <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl transition group-hover:opacity-35" style={{ background: color }} />
            <div className="relative flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-lg font-semibold text-[var(--ink-1)]">
                  {u.name} {isAirbnb && <AirbnbBadge />}
                </div>
                <div className="truncate text-xs text-[var(--ink-3)]">{u.note}</div>
                {u.owner && <div className="truncate text-xs text-[var(--ink-2)]">Owner · {u.owner}</div>}
                {u.usage && !isAirbnb && <div className="mt-1 inline-block rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-200">{u.usage}</div>}
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold tabular-nums text-[var(--ink-1)]">{avg != null ? `${avg.toFixed(1)}°` : "—"}</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">average</div>
              </div>
            </div>

            <ul className="relative mt-3 grid grid-cols-1 gap-1">
              {u.rooms.length === 0 && <li className="text-xs text-[var(--ink-3)]">No sensors reporting yet</li>}
              {u.rooms.map((r) => {
                const t = r.temp.at(-1)?.v;
                const h = r.humidity.at(-1)?.v;
                const c = t != null ? comfort(t) : null;
                const let_ = u.airbnbRooms.includes(r.label);
                const st = let_ ? guestStatus(bookings, u.id, todayKey, r.label) : null;
                return (
                  <li key={r.key} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-[13px] odd:bg-white/[0.025]">
                    <span className="flex min-w-0 items-center gap-2 text-[var(--ink-2)]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c?.dot ?? "#555" }} title={c?.label} />
                      <span className="truncate">{r.label}</span>
                      {st && (
                        <span className={`truncate text-[11px] ${st.staying ? "font-semibold text-emerald-300" : "text-[var(--ink-3)]"}`}>
                          {st.staying ? st.staying.guest : "vacant"}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 tabular-nums">
                      {h != null && (
                        <span className={h >= DAMP ? "font-semibold text-amber-300" : "text-[var(--ink-3)]"} title={h >= DAMP ? "High humidity: ventilate" : "Humidity"}>
                          {h >= DAMP ? "⚠ " : ""}
                          {Math.round(h)}%
                        </span>
                      )}
                      <b className="w-12 text-right text-[var(--ink-1)]">{t != null ? `${t.toFixed(1)}°` : "—"}</b>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="relative mt-auto pt-3 text-right text-xs text-sky-300 opacity-70 group-hover:opacity-100">Open {u.name} →</div>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Unit page: banner + room tiles                                      */
/* ------------------------------------------------------------------ */
function RoomTile({ r, i, unit, bookings, todayKey }: { r: RoomSeries; i: number; unit: UnitData; bookings: Booking[]; todayKey: string }) {
  const t = r.temp.at(-1)?.v;
  const h = r.humidity.at(-1)?.v;
  const c = t != null ? comfort(t) : null;
  const vals = r.temp.map((p) => p.v);
  const lo = vals.length ? Math.min(...vals) : null;
  const hi = vals.length ? Math.max(...vals) : null;
  const sc = SERIES_COLORS[i % SERIES_COLORS.length];
  const let_ = unit.airbnbRooms.includes(r.label);
  return (
    <div className="card-3d group flex h-full min-h-[190px] min-w-0 flex-col overflow-hidden rounded-2xl p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: `${sc}26`, color: sc }}>
          <RoomIcon name={r.label} />
        </span>
        {let_ ? (
          <AirbnbBadge />
        ) : (
          c && (
            <span className="flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium text-[var(--ink-2)]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
              {c.label}
            </span>
          )
        )}
      </div>
      <div className="mt-2 truncate text-sm font-medium text-[var(--ink-2)]">
        {r.label}
        {let_ && <span className="text-[var(--ink-3)]"> · double, 1–2 guests</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-[var(--ink-1)]">{t != null ? t.toFixed(1) : "—"}°</span>
        {h != null && (
          <span className={`text-sm tabular-nums ${h >= DAMP ? "font-semibold text-amber-300" : "text-[var(--ink-3)]"}`}>
            {h >= DAMP ? "⚠ " : "💧"}
            {Math.round(h)}%
          </span>
        )}
      </div>
      {let_ && (
        <div className="mt-1">
          <GuestLine status={guestStatus(bookings, unit.id, todayKey, r.label)} compact />
        </div>
      )}
      <div className="mt-auto">
        <Sparkline points={r.temp} color={sc} />
        {lo != null && hi != null && (
          <div className="flex justify-between text-[10px] tabular-nums text-[var(--ink-3)]">
            <span>24h low {lo.toFixed(1)}°</span>
            <span>high {hi.toFixed(1)}°</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function UnitHero({ unit, bookings, todayKey, index }: { unit: UnitData; bookings: Booking[]; todayKey: string; index: number }) {
  const color = SERIES_COLORS[index % SERIES_COLORS.length];
  const temps = unit.rooms.map((r) => r.temp.at(-1)?.v).filter((v): v is number => v != null);
  const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
  const pick = (cmp: (a: number, b: number) => boolean) =>
    unit.rooms.reduce<{ label: string; v: number } | null>((m, r) => {
      const v = r.temp.at(-1)?.v;
      return v != null && (!m || cmp(v, m.v)) ? { label: r.label, v } : m;
    }, null);
  const warmest = pick((a, b) => a > b);
  const coolest = pick((a, b) => a < b);
  const damp = unit.rooms.filter((r) => (r.humidity.at(-1)?.v ?? 0) >= DAMP).length;
  const isAirbnb = unit.airbnbRooms.length > 0;
  const booked = unit.airbnbRooms.filter((room) => guestStatus(bookings, unit.id, todayKey, room).staying).length;

  return (
    <section className="flex flex-col gap-3">
      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] sm:p-7"
        style={{ background: `radial-gradient(900px 300px at 0% 0%, ${color}55, transparent 60%), radial-gradient(600px 300px at 100% 100%, ${isAirbnb ? "#ff385c33" : "#10b98133"}, transparent 60%), #121417` }}
      >
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              {unit.note}
            </div>
            <h2 className="mt-1 flex items-center gap-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {unit.name} {isAirbnb && <AirbnbBadge className="text-xs" />}
            </h2>
            {unit.owner && (
              <div className="mt-2 text-sm text-white/80">
                Owner · <b className="text-white">{unit.owner}</b>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {unit.usage && <span className="rounded-full bg-white/15 px-3 py-1 font-semibold text-white">{unit.usage}</span>}
              <span className="rounded-full bg-white/10 px-3 py-1 text-white/85">{unit.rooms.length} rooms</span>
              {isAirbnb && (
                <span className="rounded-full bg-white/10 px-3 py-1 text-white/85">
                  {unit.airbnbRooms.length} double bedrooms on Airbnb · single guest or couple each
                </span>
              )}
              {warmest && <span className="rounded-full bg-white/10 px-3 py-1 text-white/85">▲ Warmest: {warmest.label} {warmest.v.toFixed(1)}°</span>}
              {coolest && <span className="rounded-full bg-white/10 px-3 py-1 text-white/85">▼ Coolest: {coolest.label} {coolest.v.toFixed(1)}°</span>}
              {damp > 0 && <span className="rounded-full bg-amber-400/20 px-3 py-1 font-semibold text-amber-200">⚠ {damp} damp room{damp > 1 ? "s" : ""}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-6">
            {isAirbnb && (
              <div className="min-w-60 rounded-2xl bg-white/10 px-4 py-3 text-white">
                <div className="text-[10px] font-semibold uppercase tracking-wider opacity-75">
                  Tonight · {booked}/{unit.airbnbRooms.length} rooms booked
                </div>
                <ul className="mt-1 space-y-1">
                  {unit.airbnbRooms.map((room) => {
                    const st = guestStatus(bookings, unit.id, todayKey, room);
                    return (
                      <li key={room} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-white/70">{shortRoom(room)}</span>
                        <b className={st.staying ? "text-emerald-300" : "font-normal text-white/50"}>{st.staying ? st.staying.guest : "Vacant"}</b>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="text-right">
              <div className="text-6xl font-semibold leading-none tracking-tight text-white tabular-nums sm:text-7xl">{avg != null ? avg.toFixed(1) : "—"}°</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-white/60">Average indoor</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">
        {unit.rooms.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--ink-3)]">
            No sensors reporting for {unit.name} yet. See the user guide → Room sensors.
          </div>
        )}
        {unit.rooms.map((r, i) => (
          <RoomTile key={r.key} r={r} i={i} unit={unit} bookings={bookings} todayKey={todayKey} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Occupancy timeline: one row per Airbnb bedroom                      */
/* ------------------------------------------------------------------ */
export function Occupancy({
  units,
  bookings,
  now,
  days = 21,
  compact = false,
}: {
  units: UnitData[];
  bookings: Booking[];
  now: Date;
  days?: number;
  compact?: boolean;
}) {
  const rows = airbnbRoomList(units);
  if (!rows.length) return null;
  const multiUnit = new Set(rows.map((r) => r.unit.id)).size > 1;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const list = Array.from({ length: days }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const keys = list.map(dayKey);
  const todayKey = dayKey(now);
  const first = keys[0];
  const endKey = dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + days));
  const idx = (k: string) => (k <= first ? 0 : k >= endKey ? days : keys.indexOf(k));
  const inRoom = (b: Booking, unitId: string, room: string) => b.unit === unitId && (b.room === room || b.room == null);
  const future = keys.filter((k) => k >= todayKey);
  const bookedNights = rows.reduce((acc, { unit, room }) => acc + future.filter((k) => bookings.some((b) => inRoom(b, unit.id, room) && b.start <= k && b.end > k)).length, 0);
  const pct = Math.round((bookedNights / Math.max(1, future.length * rows.length)) * 100);
  const cols = `${compact ? 52 : 110}px repeat(${days}, minmax(0,1fr))`;
  // overbooked bookings: 1 = first of a pair (top), 2 = second (shifted down so both show)
  const clashIds = new Map<string, number>();
  for (const c of findOverbookings(bookings, todayKey)) {
    if (!clashIds.has(c.a.id)) clashIds.set(c.a.id, 1);
    clashIds.set(c.b.id, clashIds.get(c.a.id) === 1 ? 2 : 1);
  }

  return (
    <section className={`card-3d min-w-0 rounded-2xl hover:!translate-y-0 ${compact ? "p-3" : "p-4"}`}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
          <AirbnbBadge /> Room occupancy · next {days >= 21 ? "3 weeks" : `${Math.round(days / 7)} weeks`}
        </h2>
        <span className="text-xs text-[var(--ink-2)]">
          <b className="text-[var(--ink-1)]">{pct}%</b> of room-nights booked
        </span>
      </header>
      <div className="overflow-x-auto">
        <div className={compact ? "" : "min-w-[760px]"}>
          <div className="grid" style={{ gridTemplateColumns: cols }}>
            <div />
            {list.map((d, i) => (
              <div
                key={keys[i]}
                className={`pb-1 text-center text-[10px] leading-tight tabular-nums ${
                  keys[i] === todayKey ? "font-bold text-white" : d.getDay() === 0 || d.getDay() === 6 ? "text-[var(--ink-2)]" : "text-[var(--ink-3)]"
                }`}
              >
                {d.toLocaleDateString([], { weekday: "narrow" })}
                <br />
                {d.getDate()}
              </div>
            ))}
          </div>
          {rows.map(({ unit, room }) => (
            <div key={`${unit.id}-${room}`} className="relative grid border-t border-[var(--border)]" style={{ gridTemplateColumns: cols }}>
              <div className={`font-medium text-[var(--ink-1)] ${compact ? "py-1.5 text-xs" : "py-2.5 text-sm"}`}>
                {multiUnit ? `${unit.name} · ` : ""}
                {compact ? shortRoom(room) : room}
              </div>
              {keys.map((k) => (
                <div key={k} className={k === todayKey ? "bg-sky-400/10" : ""} />
              ))}
              {bookings
                .filter((b) => inRoom(b, unit.id, room) && b.end > first && b.start < endKey)
                .map((b) => {
                  const s = idx(b.start);
                  const e = Math.max(idx(b.end), s + 1);
                  const current = b.start <= todayKey && b.end > todayKey;
                  const clash = clashIds.get(b.id);
                  return (
                    <div
                      key={b.id}
                      title={`${b.guest} · ${fmtRange(b)} · ${nights(b)} nights${clash ? " · ⚠ OVERBOOKED" : ""}`}
                      className={`z-[1] truncate rounded-md px-2 font-semibold shadow ${
                        clash === 1 ? "mt-1 self-start py-0 text-[10px] leading-4" : clash === 2 ? "mb-1 self-end py-0 text-[10px] leading-4" : "my-1.5 py-1 text-xs"
                      } ${
                        clash
                          ? "bg-gradient-to-r from-red-500 to-red-600 text-white ring-2 ring-red-300"
                          : current
                            ? "bg-gradient-to-r from-emerald-300 to-emerald-400 text-emerald-950"
                            : "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white"
                      }`}
                      style={{ gridRow: 1, gridColumn: `${s + 2} / ${e + 2}` }}
                    >
                      {clash ? "⚠ " : ""}
                      {b.guest}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Agenda: in house / arrivals / departures                            */
/* ------------------------------------------------------------------ */
export function Agenda({ units, bookings, todayKey }: { units: UnitData[]; bookings: Booking[]; todayKey: string }) {
  const rooms = airbnbRoomList(units);
  const multiUnit = new Set(rooms.map((r) => r.unit.id)).size > 1;
  const where = (b: Booking) => {
    const u = units.find((x) => x.id === b.unit)?.name ?? "";
    const r = b.room ? shortRoom(b.room) : "Whole unit";
    return multiUnit ? `${u} · ${r}` : r;
  };
  const inHouse = bookings.filter((b) => b.start <= todayKey && b.end > todayKey);
  const arrivals = bookings
    .filter((b) => b.start >= todayKey)
    .sort((a, b) => a.start.localeCompare(b.start) || (a.room ?? "").localeCompare(b.room ?? ""))
    .slice(0, 8);
  const checkoutsToday = bookings.filter((b) => b.end === todayKey);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-100/80">
          In house tonight · {inHouse.length}/{rooms.length || "–"} rooms
        </h3>
        <ul className="space-y-1.5">
          {inHouse.length === 0 && <li className="text-sm text-emerald-100/70">No guests tonight</li>}
          {inHouse.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-emerald-300 to-emerald-400 px-3 py-2 text-emerald-950 shadow">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{b.guest}</span>
                <span className="block text-[11px] opacity-80">
                  In {fmtDay(b.start)} {b.checkInTime} → Out {fmtDay(b.end)} {b.checkOutTime}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-emerald-950/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">{where(b)}</span>
            </li>
          ))}
        </ul>
      </div>
      {checkoutsToday.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-100/80">Checking out today: clean</h3>
          <ul className="space-y-1 text-sm text-emerald-50">
            {checkoutsToday.map((b) => (
              <li key={b.id}>
                🧹 {b.guest} · <span className="text-emerald-100/70">{where(b)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-100/80">Upcoming arrivals</h3>
        <ul className="space-y-1.5">
          {arrivals.length === 0 && <li className="text-sm text-emerald-100/70">Nothing booked yet</li>}
          {arrivals.map((b) => (
            <li key={b.id} className="card-3d rounded-xl !bg-emerald-950/40 px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="truncate font-semibold text-white">{b.guest}</span>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
                  {where(b)} · {nights(b)}n
                </span>
              </div>
              <div className="flex gap-2">
                <TimeBox kind="in" day={b.start} time={b.checkInTime} todayKey={todayKey} />
                <TimeBox kind="out" day={b.end} time={b.checkOutTime} todayKey={todayKey} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
