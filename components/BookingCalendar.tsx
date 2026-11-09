"use client";

import type { Booking } from "@/lib/types";

const DAY = 86_400_000;

function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function parseDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function fmtRange(b: Booking) {
  const f = (d: Date) => d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  return `${f(parseDay(b.start))} – ${f(parseDay(b.end))}`;
}
export function nights(b: Booking) {
  return Math.round((parseDay(b.end).getTime() - parseDay(b.start).getTime()) / DAY);
}
export const shortRoom = (r: string) => r.replace(/^bedroom\s*/i, "Bed ");

/**
 * Vertical calendar (days down the side). With `lanes`, each bedroom gets its own column.
 */
export function BookingCalendar({
  bookings,
  now,
  days = 28,
  lanes = [],
}: {
  bookings: Booking[];
  now: Date;
  days?: number;
  lanes?: string[];
}) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday this week
  const list = Array.from({ length: days }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const keys = list.map(dayKey);
  const todayKey = dayKey(now);
  const firstKey = keys[0];
  const endKey = dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + days));
  const nLanes = Math.max(1, lanes.length);
  const header = lanes.length > 0 ? 1 : 0;
  const idx = (k: string) => (k <= firstKey ? 0 : k >= endKey ? days : keys.indexOf(k));

  const visible = bookings
    .filter((b) => b.end > firstKey && b.start < endKey)
    .map((b) => {
      const s = idx(b.start);
      const e = Math.max(idx(b.end), s + 1);
      const lane = b.room ? lanes.indexOf(b.room) : -1;
      return { b, s, e, lane, current: b.start <= todayKey && b.end > todayKey, past: b.end <= todayKey };
    })
    .filter((v) => lanes.length === 0 || v.lane >= 0 || v.b.room == null);

  return (
    <div
      className="grid min-h-[620px] gap-x-1.5"
      style={{
        gridTemplateColumns: `52px repeat(${nLanes}, minmax(0,1fr))`,
        gridTemplateRows: `${header ? "auto " : ""}repeat(${days}, minmax(22px, 1fr))`,
      }}
    >
      {header > 0 &&
        lanes.map((l, i) => (
          <div key={l} style={{ gridRow: 1, gridColumn: i + 2 }} className="pb-2 text-center">
            <div className="text-[11px] font-semibold text-white">{shortRoom(l)}</div>
            <div className="text-[9px] uppercase tracking-wider text-emerald-100/60">Double</div>
          </div>
        ))}
      {list.map((d, i) => {
        const k = keys[i];
        const isToday = k === todayKey;
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        return (
          <div
            key={k}
            style={{ gridRow: i + 1 + header, gridColumn: `1 / span ${nLanes + 1}` }}
            className={`flex items-center border-t border-white/[0.06] pl-1 text-[11px] tabular-nums ${
              isToday ? "rounded-md bg-white/15 font-semibold text-white" : weekend ? "text-emerald-100/80" : "text-emerald-100/55"
            }`}
          >
            {d.getDate()} {d.toLocaleDateString([], { month: "short" })}
          </div>
        );
      })}
      {visible.map(({ b, s, e, lane, current, past }) => (
        <div
          key={b.id}
          style={{
            gridRow: `${s + 1 + header} / ${e + 1 + header}`,
            gridColumn: lane >= 0 ? lane + 2 : `2 / span ${nLanes}`,
          }}
          className={`relative z-[1] my-[2px] overflow-hidden rounded-xl px-2 py-1.5 shadow-lg ring-1 transition ${
            current
              ? "bg-gradient-to-br from-emerald-300 to-emerald-500 text-emerald-950 ring-white/60"
              : past
                ? "bg-emerald-900/50 text-emerald-100/70 ring-white/10"
                : "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white ring-white/20"
          }`}
          title={`${b.guest}${b.room ? ` · ${b.room}` : ""} · ${fmtRange(b)} · ${nights(b)} nights · ${b.source}`}
        >
          <div className="truncate text-sm font-semibold leading-tight">{b.guest}</div>
          {e - s >= 2 && (
            <div className="truncate text-[10px] opacity-85">
              {nights(b)} night{nights(b) === 1 ? "" : "s"}
              {nLanes === 1 ? ` · ${fmtRange(b)}` : ""}
            </div>
          )}
          {current && e - s >= 3 && (
            <span className="mt-1 inline-block rounded-full bg-emerald-950/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-200">
              Staying
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
