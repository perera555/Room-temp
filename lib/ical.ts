import type { Booking } from "./types";

function unescapeText(v: string) {
  return v
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/** Converts an iCal DATE or DATE-TIME value into YYYY-MM-DD. */
function toDay(value: string): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h && z) {
    // UTC timestamp — shift to the calendar day in UTC.
    const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
    return dt.toISOString().slice(0, 10);
  }
  return `${y}-${mo}-${d}`;
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
        const start = toDay(ev.DTSTART);
        let end = ev.DTEND ? toDay(ev.DTEND) : null;
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
