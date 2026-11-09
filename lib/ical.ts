import type { Booking } from "./types";

function unescapeText(v: string) {
  return v
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

const TIME_ZONE = process.env.TIMEZONE ?? "Asia/Colombo";

/**
 * Converts an iCal DATE or DATE-TIME value into a local day (YYYY-MM-DD)
 * and, for timed events, a local time (HH:MM).
 */
function toDayTime(value: string): { day: string; time: string | null } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h && z) {
    // UTC timestamp → the property's local day and time.
    const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(dt);
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(dt);
    return { day, time };
  }
  return { day: `${y}-${mo}-${d}`, time: h ? `${h}:${mi}` : null };
}

/** Days that block the calendar but are not real guests (Airbnb host blocks etc). */
const IGNORE = /not available|blocked|closed period/i;

/**
 * Minimal iCal (RFC 5545) parser — enough for Google Calendar and Airbnb
 * exports. Returns one booking per VEVENT.
 */
export function parseIcs(text: string, source: string): Booking[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const out: Booking[] = [];
  let ev: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      ev = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (ev?.DTSTART) {
        const s = toDayTime(ev.DTSTART);
        const e = ev.DTEND ? toDayTime(ev.DTEND) : null;
        const start = s?.day ?? null;
        let end = e?.day ?? null;
        if (start && (!end || end <= start)) {
          const d = new Date(start + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + 1);
          end = d.toISOString().slice(0, 10);
        }
        const summary = unescapeText(ev.SUMMARY ?? "Guest");
        if (start && end && ev.STATUS !== "CANCELLED" && !IGNORE.test(summary)) {
          out.push({
            id: ev.UID ?? `${source}-${start}-${end}`,
            guest: summary || "Guest",
            start,
            end,
            source,
            unit: null,
            room: null,
            // Times only when the event is timed AND spans nights (a real stay).
            checkInTime: s?.time && end > start ? s.time : null,
            checkOutTime: e?.time && end > start ? e.time : null,
          });
        }
      }
      ev = null;
      continue;
    }
    if (!ev) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).split(";")[0].toUpperCase();
    ev[key] = line.slice(idx + 1);
  }
  return out;
}
