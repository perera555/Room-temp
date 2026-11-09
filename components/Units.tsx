"use client";

import type { Booking, UnitData } from "@/lib/types";
import { fmtRange, nights } from "./BookingCalendar";

export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#e66767"];

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function guestStatus(bookings: Booking[], unit: string | null, todayKey: string) {
  const mine = unit ? bookings.filter((b) => b.unit === unit) : bookings;
  const staying = mine.find((b) => b.start <= todayKey && b.end > todayKey) ?? null;
  const next = mine.filter((b) => b.start > todayKey).sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
  return { staying, next };
}

function comfort(t: number) {
  if (t < 16) return { label: "Cold", dot: "#60a5fa" };
  if (t < 18) return { label: "Cool", dot: "#93c5fd" };
  if (t <= 23) return { label: "Comfortable", dot: "#34d399" };
  return { label: "Warm", dot: "#fb923c" };
}

export function UnitTabs({ units, value, onChange }: { units: UnitData[]; value: string; onChange: (id: string) => void }) {
  const tabs = [{ id: "all", name: "All units" }, ...units.map((u) => ({ id: u.id, name: u.name }))];
  return (
    <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Units">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          aria-pressed={value === t.id}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
            value === t.id
              ? "bg-gradient-to-r from-sky-500 to-emerald-500 text-white shadow-lg"
              : "border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-2)] hover:text-white"
          }`}
        >
          {t.name}
        </button>
      ))}
    </nav>
  );
}

export function UnitCards({
  units,
  bookings,
  todayKey,
  onOpen,
}: {
  units: UnitData[];
  bookings: Booking[];
  todayKey: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      {units.map((u, ui) => {
        const temps = u.rooms.map((r) => r.temp.at(-1)?.v).filter((v): v is number => v != null);
        const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
        const { staying, next } = guestStatus(bookings, u.id, todayKey);
        return (
          <button
            key={u.id}
            onClick={() => onOpen(u.id)}
            className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0)_35%),var(--surface)] p-4 text-left shadow-[0_10px_40px_rgba(0,0,0,0.45)] transition duration-200 hover:-translate-y-0.5 hover:border-sky-400/40"
          >
            <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: SERIES_COLORS[ui % SERIES_COLORS.length] }} />
            <span
              className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl transition group-hover:opacity-35"
              style={{ background: SERIES_COLORS[ui % SERIES_COLORS.length] }}
            />
            <div className="relative flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-[var(--ink-1)]">{u.name}</div>
                <div className="truncate text-xs text-[var(--ink-3)]">{u.note}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold tabular-nums text-[var(--ink-1)]">{avg != null ? `${avg.toFixed(1)}°` : "—"}</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">average</div>
              </div>
            </div>

            <div
              className={`mt-3 rounded-xl px-3 py-2 text-xs ${
                staying ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30" : "bg-black/25 text-[var(--ink-2)]"
              }`}
            >
              {staying ? (
                <>
                  <b className="text-emerald-100">● {staying.guest}</b> · until{" "}
                  {new Date(staying.end + "T12:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
                </>
              ) : next ? (
                <>
                  ○ Empty · next <b className="text-[var(--ink-1)]">{next.guest}</b>{" "}
                  {new Date(next.start + "T12:00:00").toLocaleDateString([], { day: "numeric", month: "short" })}
                </>
              ) : (
                "○ Empty · no upcoming bookings"
              )}
            </div>

            <ul className="mt-3 grid grid-cols-1 gap-1">
              {u.rooms.length === 0 && <li className="text-xs text-[var(--ink-3)]">No sensors reporting yet</li>}
              {u.rooms.map((r) => {
                const t = r.temp.at(-1)?.v;
                const h = r.humidity.at(-1)?.v;
                const c = t != null ? comfort(t) : null;
                return (
                  <li key={r.key} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-[13px] odd:bg-white/[0.025]">
                    <span className="flex min-w-0 items-center gap-2 text-[var(--ink-2)]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c?.dot ?? "#555" }} title={c?.label} />
                      <span className="truncate">{r.label}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 tabular-nums">
                      {h != null && (
                        <span className={h >= 70 ? "font-semibold text-amber-300" : "text-[var(--ink-3)]"} title={h >= 70 ? "High humidity — ventilate" : "Humidity"}>
                          {h >= 70 ? "⚠ " : ""}
                          {Math.round(h)}%
                        </span>
                      )}
                      <b className="w-12 text-right text-[var(--ink-1)]">{t != null ? `${t.toFixed(1)}°` : "—"}</b>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-auto pt-3 text-right text-xs text-sky-300 opacity-70 group-hover:opacity-100">Open {u.name} →</div>
          </button>
        );
      })}
    </div>
  );
}

function RoomIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  const p = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
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
  if (n.includes("living"))
    return (
      <svg {...p}>
        <path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3v-5ZM6 18v2M18 18v2" />
      </svg>
    );
  return (
    <svg {...p}>
      <path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01" />
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

/** Big banner + room cards for a single unit. */
export function UnitHero({ unit, bookings, todayKey, index }: { unit: UnitData; bookings: Booking[]; todayKey: string; index: number }) {
  const color = SERIES_COLORS[index % SERIES_COLORS.length];
  const temps = unit.rooms.map((r) => r.temp.at(-1)?.v).filter((v): v is number => v != null);
  const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
  const warmest = unit.rooms.reduce<{ label: string; v: number } | null>((m, r) => {
    const v = r.temp.at(-1)?.v;
    return v != null && (!m || v > m.v) ? { label: r.label, v } : m;
  }, null);
  const coolest = unit.rooms.reduce<{ label: string; v: number } | null>((m, r) => {
    const v = r.temp.at(-1)?.v;
    return v != null && (!m || v < m.v) ? { label: r.label, v } : m;
  }, null);
  const damp = unit.rooms.filter((r) => (r.humidity.at(-1)?.v ?? 0) >= 70).length;
  const { staying, next } = guestStatus(bookings, unit.id, todayKey);
  const fmt = (k: string) => new Date(k + "T12:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

  return (
    <section className="flex flex-col gap-3">
      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] sm:p-7"
        style={{ background: `radial-gradient(900px 300px at 0% 0%, ${color}55, transparent 60%), radial-gradient(600px 300px at 100% 100%, #10b98133, transparent 60%), #121417` }}
      >
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              {unit.note}
            </div>
            <h2 className="mt-1 text-4xl font-semibold tracking-tight text-white sm:text-5xl">{unit.name}</h2>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/10 px-3 py-1 text-white/85">{unit.rooms.length} rooms</span>
              {warmest && <span className="rounded-full bg-white/10 px-3 py-1 text-white/85">▲ Warmest: {warmest.label} {warmest.v.toFixed(1)}°</span>}
              {coolest && <span className="rounded-full bg-white/10 px-3 py-1 text-white/85">▼ Coolest: {coolest.label} {coolest.v.toFixed(1)}°</span>}
              {damp > 0 && <span className="rounded-full bg-amber-400/20 px-3 py-1 font-semibold text-amber-200">⚠ {damp} damp room{damp > 1 ? "s" : ""}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <div
              className={`min-w-56 rounded-2xl px-4 py-3 ${
                staying ? "bg-gradient-to-br from-emerald-300 to-emerald-500 text-emerald-950 shadow-lg shadow-emerald-900/40" : "bg-white/10 text-white"
              }`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider opacity-75">{staying ? "Guest staying now" : next ? "Next guest" : "Bookings"}</div>
              <div className="truncate text-xl font-semibold">{staying?.guest ?? next?.guest ?? "No upcoming guests"}</div>
              <div className="text-xs opacity-80">
                {staying ? `Checks out ${fmt(staying.end)}` : next ? `Arrives ${fmt(next.start)} · ${nights(next)} nights` : "Calendar is clear"}
              </div>
            </div>
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
        {unit.rooms.map((r, i) => {
          const t = r.temp.at(-1)?.v;
          const h = r.humidity.at(-1)?.v;
          const c = t != null ? comfort(t) : null;
          const vals = r.temp.map((p) => p.v);
          const lo = vals.length ? Math.min(...vals) : null;
          const hi = vals.length ? Math.max(...vals) : null;
          const sc = SERIES_COLORS[i % SERIES_COLORS.length];
          return (
            <div
              key={r.key}
              className="group relative min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0)_45%),var(--surface)] p-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.4)] transition hover:-translate-y-0.5 hover:border-white/20"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: `${sc}26`, color: sc }}>
                  <RoomIcon name={r.label} />
                </span>
                {c && (
                  <span className="flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium text-[var(--ink-2)]">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
                    {c.label}
                  </span>
                )}
              </div>
              <div className="mt-2 truncate text-sm font-medium text-[var(--ink-2)]">{r.label}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums tracking-tight text-[var(--ink-1)]">{t != null ? t.toFixed(1) : "—"}°</span>
                {h != null && (
                  <span className={`text-sm tabular-nums ${h >= 70 ? "font-semibold text-amber-300" : "text-[var(--ink-3)]"}`}>
                    {h >= 70 ? "⚠ " : "💧"}
                    {Math.round(h)}%
                  </span>
                )}
              </div>
              <Sparkline points={r.temp} color={sc} />
              {lo != null && hi != null && (
                <div className="flex justify-between text-[10px] tabular-nums text-[var(--ink-3)]">
                  <span>24h low {lo.toFixed(1)}°</span>
                  <span>high {hi.toFixed(1)}°</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Gantt-style occupancy view: one row per unit. */
export function Occupancy({ units, bookings, now, days = 21 }: { units: UnitData[]; bookings: Booking[]; now: Date; days?: number }) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const list = Array.from({ length: days }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const keys = list.map(dayKey);
  const todayKey = dayKey(now);
  const first = keys[0];
  const endKey = dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + days));
  const idx = (k: string) => (k <= first ? 0 : k >= endKey ? days : keys.indexOf(k));
  const occupiedNights = units.reduce(
    (acc, u) => acc + keys.filter((k) => k >= todayKey && bookings.some((b) => b.unit === u.id && b.start <= k && b.end > k)).length,
    0,
  );
  const futureDays = keys.filter((k) => k >= todayKey).length;
  const pct = Math.round((occupiedNights / Math.max(1, futureDays * units.length)) * 100);

  return (
    <section className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Occupancy · next 3 weeks</h2>
        <span className="text-xs text-[var(--ink-2)]">
          <b className="text-[var(--ink-1)]">{pct}%</b> of nights booked
        </span>
      </header>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid" style={{ gridTemplateColumns: `90px repeat(${days}, minmax(0,1fr))` }}>
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
          {units.map((u) => (
            <div key={u.id} className="relative grid border-t border-[var(--border)]" style={{ gridTemplateColumns: `90px repeat(${days}, minmax(0,1fr))` }}>
              <div className="py-2.5 text-sm font-medium text-[var(--ink-1)]">{u.name}</div>
              {keys.map((k) => (
                <div key={k} className={k === todayKey ? "bg-sky-400/10" : ""} />
              ))}
              {bookings
                .filter((b) => b.unit === u.id && b.end > first && b.start < endKey)
                .map((b) => {
                  const s = idx(b.start);
                  const e = Math.max(idx(b.end), s + 1);
                  const current = b.start <= todayKey && b.end > todayKey;
                  return (
                    <div
                      key={b.id}
                      title={`${b.guest} · ${fmtRange(b)} · ${nights(b)} nights`}
                      className={`z-[1] my-1.5 truncate rounded-lg px-2 py-1 text-xs font-semibold shadow ${
                        current ? "bg-gradient-to-r from-emerald-300 to-emerald-400 text-emerald-950" : "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white"
                      }`}
                      style={{ gridRow: 1, gridColumn: `${s + 2} / ${e + 2}` }}
                    >
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

/** List of who is in, who arrives next — for the all-units view. */
export function Agenda({ units, bookings, todayKey }: { units: UnitData[]; bookings: Booking[]; todayKey: string }) {
  const name = (id: string | null) => units.find((u) => u.id === id)?.name ?? "Unassigned";
  const inHouse = bookings.filter((b) => b.start <= todayKey && b.end > todayKey);
  const arrivals = bookings.filter((b) => b.start >= todayKey).sort((a, b) => a.start.localeCompare(b.start) || (a.unit ?? "").localeCompare(b.unit ?? "")).slice(0, 8);
  const checkoutsToday = bookings.filter((b) => b.end === todayKey);
  const fmt = (k: string) => new Date(k + "T12:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-100/80">
          In house today · {inHouse.length}/{units.length} units
        </h3>
        <ul className="space-y-1.5">
          {inHouse.length === 0 && <li className="text-sm text-emerald-100/70">No guests tonight</li>}
          {inHouse.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-emerald-300 to-emerald-400 px-3 py-2 text-emerald-950 shadow">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{b.guest}</span>
                <span className="text-[11px] opacity-80">out {fmt(b.end)}</span>
              </span>
              <span className="shrink-0 rounded-full bg-emerald-950/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">{name(b.unit)}</span>
            </li>
          ))}
        </ul>
      </div>
      {checkoutsToday.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-100/80">Checking out today</h3>
          <ul className="space-y-1 text-sm text-emerald-50">
            {checkoutsToday.map((b) => (
              <li key={b.id}>
                🧹 {b.guest} · <span className="text-emerald-100/70">{name(b.unit)}</span>
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
            <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl bg-emerald-950/30 px-3 py-2 ring-1 ring-white/10">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-white">{b.guest}</span>
                <span className="text-[11px] text-emerald-100/75">
                  {fmt(b.start)} · {nights(b)} night{nights(b) === 1 ? "" : "s"}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">{name(b.unit)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
