"use client";

import type { Booking } from "@/lib/types";

const DAY = 86_400_000;

function dayKey(d: Date) {
  // local calendar day as YYYY-MM-DD
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
  const s = parseDay(b.start);
  const e = parseDay(b.end);
  const f = (d: Date) => d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  return `${f(s)} – ${f(e)}`;
}
export function nights(b: Booking) {
  return Math.round((parseDay(b.end).getTime() - parseDay(b.start).getTime()) / DAY);
}

export function BookingCalendar({ bookings, now, days = 28 }: { bookings: Booking[]; now: Date; days?: number }) {
  // Start on Monday of the current week.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const list = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const keys = list.map(dayKey);
  const todayKey = dayKey(now);
  const firstKey = keys[0];
  const endKey = dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + days));

  const visible = bookings
    .filter((b) => b.end > firstKey && b.start < endKey)
    .map((b) => {
      const s = Math.max(0, keys.indexOf(b.start) === -1 ? (b.start < firstKey ? 0 : days) : keys.indexOf(b.start));
      const eIdx = keys.indexOf(b.end);
      const e = eIdx === -1 ? days : eIdx;
      const current = b.start <= todayKey && b.end > todayKey;
      const past = b.end <= todayKey;
      return { b, s, e: Math.max(e, s + 1), current, past };
    });

  return (
    <div
      className="grid min-h-[620px] grid-cols-[56px_minmax(0,1fr)] gap-x-2"
      style={{ gridTemplateRows: `repeat(${days}, minmax(22px, 1fr))` }}
    >
      {list.map((d, i) => {
        const k = keys[i];
        const isToday = k === todayKey;
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        return (
          <div
            key={k}
            style={{ gridRow: i + 1, gridColumn: "1 / span 2" }}
            className={`flex items-center border-t border-white/[0.06] pl-1 text-[11px] tabular-nums ${
              isToday ? "rounded-md bg-white/15 font-semibold text-white" : weekend ? "text-emerald-100/80" : "text-emerald-100/55"
            }`}
          >
            <span className="w-[52px]">
              {d.getDate()} {d.toLocaleDateString([], { month: "short" })}
            </span>
          </div>
        );
      })}
      {visible.map(({ b, s, e, current, past }) => (
        <div
          key={b.id}
          style={{ gridRow: `${s + 1} / ${e + 1}`, gridColumn: 2 }}
          className={`relative z-[1] my-[2px] overflow-hidden rounded-xl px-3 py-2 shadow-lg ring-1 transition ${
            current
              ? "bg-gradient-to-br from-emerald-300 to-emerald-500 text-emerald-950 ring-white/60"
              : past
                ? "bg-emerald-900/50 text-emerald-100/70 ring-white/10"
                : "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white ring-white/20"
          }`}
          title={`${b.guest} · ${fmtRange(b)} · ${b.source}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="truncate text-base font-semibold leading-tight">{b.guest}</div>
            {current && (
              <span className="shrink-0 rounded-full bg-emerald-950/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                Staying
              </span>
            )}
          </div>
          {e - s >= 2 && (
            <div className="truncate text-[11px] opacity-85">
              {fmtRange(b)} · {nights(b)} night{nights(b) === 1 ? "" : "s"}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
