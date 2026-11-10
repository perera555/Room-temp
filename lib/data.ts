import { parseIcs } from "./ical";
import type {
  Booking,
  DashboardData,
  EnergyDay,
  EnergySlot,
  Forecast,
  GasState,
  Point,
  RoomSeries,
  SourceState,
  UnitData,
  ServiceStatus,
  Services,
  TelecomLink,
  UnitInfo,
  UtilitiesState,
  UtilityEntry,
} from "./types";
import { UNITS, airbnbRoomsFor, airbnbUnitIds, gasUnitIds, roomFrom, stripTags, unitIdFrom } from "./units";
import { loadGasChanges, loadReadings, loadServiceOverrides, loadTelecomMap, loadUnitInfo, loadUtilityEntries, storeEnabled } from "./store";
import { alertSettings } from "./alerts";

const HOUR = 3_600_000;
/** Sri Lanka is UTC+5:30 — used only to shape the sample (demo) data. */
const LOCAL_OFFSET_H = 5.5;
const DEFAULT_LAT = "6.9271"; // Colombo
const DEFAULT_LON = "79.8612";
const DAY = 24 * HOUR;

/* ------------------------------------------------------------------ */
/* Deterministic noise so demo data is stable between refreshes        */
/* ------------------------------------------------------------------ */
function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
}
function smoothNoise(seed: number, t: number) {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash(seed * 7919 + i);
  const b = hash(seed * 7919 + i + 1);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u - 0.5;
}
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Rooms (indoor sensors)                                              */
/* ------------------------------------------------------------------ */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function roomProfile(name: string) {
  const n = name.toLowerCase();
  // Sample values for a tropical (Sri Lanka) home.
  if (n.includes("bath")) return { base: 27.2, hum: 80, bath: true, kitchen: false };
  if (n.includes("kitchen")) return { base: 28.6, hum: 72, bath: false, kitchen: true };
  if (n.includes("hall") || n.includes("business")) return { base: 27.0, hum: 66, bath: false, kitchen: false }; // A/C
  if (n.includes("living")) return { base: 28.2, hum: 70, bath: false, kitchen: false };
  return { base: 27.6, hum: 71, bath: false, kitchen: false };
}

function demoUnits(now: number): UnitData[] {
  const step = 20 * 60_000;
  const end = Math.floor(now / step) * step;
  const start = end - DAY;
  return UNITS.map((u, ui) => ({
    id: u.id,
    name: u.name,
    note: u.note,
    airbnbRooms: [],
    owner: null,
    usage: null,
    rooms: u.rooms.map((name, ri) => {
      const p = roomProfile(name);
      const seed = ui * 20 + ri + 1;
      const offset = (hash(seed) - 0.5) * 1.6 + (ui === 0 ? 0.4 : (ui - 2) * 0.25); // upper floors a touch warmer
      const temp: Point[] = [];
      const humidity: Point[] = [];
      for (let t = start; t <= end; t += step) {
        const h = (t / HOUR + LOCAL_OFFSET_H) % 24;
        // warmest mid-afternoon, coolest before dawn
        const heat = 2.4 * Math.exp(-((h - 14.5) ** 2) / 14) - 0.6 * Math.exp(-((h - 5) ** 2) / 6);
        const cooking = p.kitchen ? 1.4 * Math.exp(-((h - 18.5) ** 2) / 0.6) + 0.9 * Math.exp(-((h - 7) ** 2) / 0.5) : 0;
        const n = smoothNoise(seed, t / (2 * HOUR)) * 1.1;
        temp.push({ t, v: round(p.base + offset - 0.8 + heat + cooking + n) });
        const showers = p.bath ? 16 * Math.exp(-((h - (7.6 + hash(seed + 3))) ** 2) / 0.35) : 0;
        humidity.push({
          t,
          v: Math.round(p.hum + smoothNoise(seed + 50, t / (3 * HOUR)) * 8 - heat * 1.5 + showers),
        });
      }
      return { key: `${u.id}-${slug(name)}`, label: name, temp, humidity };
    }),
  }));
}

type Reading = { t: string | number; temp?: number; humidity?: number };
type FeedRoom = { name: string; unit?: string; readings: Reading[] };
type SensorFeed = { units?: { name: string; rooms: FeedRoom[] }[]; rooms?: FeedRoom[] };

async function liveUnits(url: string, now: number): Promise<UnitData[]> {
  const feed = await getJson<SensorFeed>(url, {
    headers: process.env.SENSOR_FEED_TOKEN
      ? { Authorization: `Bearer ${process.env.SENSOR_FEED_TOKEN}` }
      : undefined,
  });
  const since = now - DAY;
  const toSeries = (room: FeedRoom, unitId: string): RoomSeries => {
    const rows = room.readings
      .map((r) => ({ ...r, ms: typeof r.t === "number" ? r.t : Date.parse(r.t) }))
      .filter((r) => Number.isFinite(r.ms) && r.ms >= since)
      .sort((a, b) => a.ms - b.ms);
    return {
      key: `${unitId}-${slug(room.name)}`,
      label: room.name,
      temp: rows.filter((r) => r.temp != null).map((r) => ({ t: r.ms, v: r.temp! })),
      humidity: rows.filter((r) => r.humidity != null).map((r) => ({ t: r.ms, v: r.humidity! })),
    };
  };

  // Accept either { units: [{ name, rooms }] } or a flat { rooms: [{ name, unit }] }.
  const grouped = new Map<string, FeedRoom[]>();
  for (const u of feed.units ?? []) grouped.set(unitIdFrom(u.name) ?? slug(u.name), u.rooms);
  for (const r of feed.rooms ?? []) {
    const id = unitIdFrom(r.unit) ?? "unit1";
    grouped.set(id, [...(grouped.get(id) ?? []), r]);
  }
  if (!grouped.size) throw new Error("Sensor feed has no rooms");

  const known = UNITS.map((u) => ({
    id: u.id,
    name: u.name,
    note: u.note,
    airbnbRooms: [],
    owner: null,
    usage: null,
    rooms: (grouped.get(u.id) ?? []).map((r) => toSeries(r, u.id)),
  }));
  const extra = [...grouped.entries()]
    .filter(([id]) => !UNITS.some((u) => u.id === id))
    .map(([id, rooms]) => ({ id, name: id, note: "", airbnbRooms: [], owner: null, usage: null, rooms: rooms.map((r) => toSeries(r, id)) }));
  return [...known, ...extra];
}

/** Readings pushed by sensors to /api/readings (stored in Upstash Redis). */
async function storedUnits(now: number): Promise<UnitData[]> {
  const rows = await loadReadings(now - DAY);
  const withData = rows.filter((r) => r.readings.length);
  if (!withData.length) throw new Error("No sensor readings received yet");
  return UNITS.map((u) => {
    const mine = withData.filter((r) => r.unit === u.id);
    const order = (name: string) => {
      const i = u.rooms.findIndex((n) => n.toLowerCase() === name.toLowerCase());
      return i === -1 ? 99 : i;
    };
    return {
      id: u.id,
      name: u.name,
      note: u.note,
    airbnbRooms: [],
    owner: null,
    usage: null,
      rooms: mine
        .sort((a, b) => order(a.room) - order(b.room))
        .map((r) => {
          const rs = r.readings.sort((a, b) => a.t - b.t);
          return {
            key: `${u.id}-${slug(r.room)}`,
            label: r.room,
            temp: rs.filter((x) => x.temp != null).map((x) => ({ t: x.t, v: x.temp! })),
            humidity: rs.filter((x) => x.humidity != null).map((x) => ({ t: x.t, v: x.humidity! })),
          };
        }),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Outside weather — Open-Meteo (free, no key)                         */
/* ------------------------------------------------------------------ */
async function outsideWeather(now: number) {
  const lat = process.env.LATITUDE ?? DEFAULT_LAT;
  const lon = process.env.LONGITUDE ?? DEFAULT_LON;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&minutely_15=temperature_2m,relative_humidity_2m&past_days=1&forecast_days=1&timezone=UTC`;
  const j = await getJson<{
    minutely_15: { time: string[]; temperature_2m: number[]; relative_humidity_2m: number[] };
  }>(url);
  const temp: Point[] = [];
  const humidity: Point[] = [];
  j.minutely_15.time.forEach((iso, i) => {
    const t = Date.parse(iso + "Z");
    if (t < now - DAY || t > now) return;
    const tv = j.minutely_15.temperature_2m[i];
    const hv = j.minutely_15.relative_humidity_2m[i];
    if (tv != null) temp.push({ t, v: tv });
    if (hv != null) humidity.push({ t, v: hv });
  });
  if (temp.length < 4) throw new Error("Open-Meteo returned too little data");
  return { temp, humidity };
}

function demoOutside(now: number) {
  const step = 15 * 60_000;
  const end = Math.floor(now / step) * step;
  const temp: Point[] = [];
  const humidity: Point[] = [];
  for (let t = end - DAY; t <= end; t += step) {
    const h = (t / HOUR + LOCAL_OFFSET_H) % 24;
    const diurnal = Math.sin(((h - 9) / 24) * 2 * Math.PI);
    temp.push({ t, v: round(28 + 3.5 * diurnal + smoothNoise(99, t / (4 * HOUR)) * 1.2) });
    humidity.push({ t, v: Math.round(78 - 12 * diurnal + smoothNoise(98, t / (4 * HOUR)) * 8) });
  }
  return { temp, humidity };
}

/* ------------------------------------------------------------------ */
/* Forecast + wind — Open-Meteo                                        */
/* ------------------------------------------------------------------ */
const windUnit = () => (process.env.WIND_UNIT ?? "kmh").toLowerCase(); // kmh | mph | ms | kn
const windLabel = (u: string) => ({ mph: "mph", kmh: "km/h", ms: "m/s", kn: "kn" })[u] ?? u;

async function liveForecast(): Promise<Forecast> {
  const lat = process.env.LATITUDE ?? DEFAULT_LAT;
  const lon = process.env.LONGITUDE ?? DEFAULT_LON;
  const u = windUnit();
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code,is_day` +
    `&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset` +
    `&forecast_days=7&timezone=auto&timeformat=unixtime&wind_speed_unit=${u}`;
  type J = {
    utc_offset_seconds: number;
    current: Record<string, number>;
    hourly: Record<string, number[]>;
    daily: Record<string, number[]>;
  };
  const j = await getJson<J>(url);
  const nowSec = Date.now() / 1000;
  const h = j.hourly;
  const hourly = h.time
    .map((t, i) => ({
      t: t * 1000,
      temp: h.temperature_2m[i],
      wind: h.wind_speed_10m[i],
      gust: h.wind_gusts_10m[i],
      rain: h.precipitation_probability[i] ?? 0,
      code: h.weather_code[i],
    }))
    .filter((r) => r.t / 1000 >= nowSec - 3600)
    .slice(0, 25);
  const d = j.daily;
  const daily = d.time.map((t, i) => ({
    date: new Date((t + j.utc_offset_seconds) * 1000).toISOString().slice(0, 10),
    code: d.weather_code[i],
    max: d.temperature_2m_max[i],
    min: d.temperature_2m_min[i],
    rain: d.precipitation_probability_max[i] ?? 0,
    wind: d.wind_speed_10m_max[i],
    gust: d.wind_gusts_10m_max[i],
    dir: d.wind_direction_10m_dominant[i],
    sunrise: d.sunrise[i] * 1000,
    sunset: d.sunset[i] * 1000,
  }));
  const c = j.current;
  return {
    windUnit: windLabel(u),
    current: {
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      wind: c.wind_speed_10m,
      gust: c.wind_gusts_10m,
      dir: c.wind_direction_10m,
      code: c.weather_code,
      isDay: c.is_day === 1,
    },
    hourly,
    daily,
  };
}

function demoForecast(now: number): Forecast {
  const codes = [3, 61, 2, 1, 80, 0, 45];
  const start = Math.floor(now / HOUR) * HOUR;
  const hourly = Array.from({ length: 25 }, (_, i) => {
    const t = start + i * HOUR;
    const hh = (t / HOUR + LOCAL_OFFSET_H) % 24;
    const wind = round(12 + smoothNoise(41, t / (5 * HOUR)) * 10 + 3 * Math.sin(hh / 4), 0);
    return {
      t,
      temp: round(28 + 3.5 * Math.sin(((hh - 9) / 24) * 2 * Math.PI), 1),
      wind,
      gust: round(wind * 1.6, 0),
      rain: Math.round(hash(i + 300) * 60),
      code: codes[Math.floor(i / 6) % codes.length],
    };
  });
  const today = Math.floor(now / DAY) * DAY;
  const daily = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(today + i * DAY).toISOString().slice(0, 10),
    code: codes[i],
    max: round(30 + hash(i + 50) * 3, 1),
    min: round(23.5 + hash(i + 60) * 2, 1),
    rain: Math.round(hash(i + 70) * 90),
    wind: round(10 + hash(i + 80) * 15, 0),
    gust: round(22 + hash(i + 90) * 20, 0),
    dir: Math.round(hash(i + 95) * 360),
    sunrise: today + i * DAY + 0.6 * HOUR, // ≈ 06:05 Sri Lanka
    sunset: today + i * DAY + 12.4 * HOUR, // ≈ 17:55 Sri Lanka
  }));
  return {
    windUnit: windLabel(windUnit()),
    current: { temp: hourly[0].temp, feels: hourly[0].temp + 3, humidity: 76, wind: hourly[0].wind, gust: hourly[0].gust, dir: 230, code: 3, isDay: true },
    hourly,
    daily,
  };
}

/* ------------------------------------------------------------------ */
/* Energy — Octopus Energy API (optional) or demo                      */
/* ------------------------------------------------------------------ */
type OctoRow = { consumption: number; interval_start: string };

async function octopus(path: string, from: number, to: number): Promise<OctoRow[]> {
  const key = process.env.OCTOPUS_API_KEY!;
  const url =
    `https://api.octopus.energy/v1/${path}/consumption/` +
    `?period_from=${new Date(from).toISOString()}&period_to=${new Date(to).toISOString()}` +
    `&page_size=25000&order_by=period`;
  const j = await getJson<{ results: OctoRow[] }>(url, {
    headers: { Authorization: "Basic " + Buffer.from(key + ":").toString("base64") },
  });
  return j.results;
}

function buildEnergy(slots: EnergySlot[], now: number) {
  const elecRate = Number(process.env.ELEC_RATE_PENCE ?? 24.5);
  const gasRate = Number(process.env.GAS_RATE_PENCE ?? 6.3);
  const byDay = new Map<string, EnergyDay>();
  for (let d = 29; d >= 0; d--) {
    const date = new Date(now - d * DAY).toISOString().slice(0, 10);
    byDay.set(date, { date, elec: 0, gas: 0 });
  }
  for (const s of slots) {
    const day = byDay.get(new Date(s.t).toISOString().slice(0, 10));
    if (day) {
      day.elec += s.elec;
      day.gas += s.gas;
    }
  }
  const daily = [...byDay.values()].map((d) => ({
    date: d.date,
    elec: round(d.elec, 2),
    gas: round(d.gas, 2),
  }));
  const last = slots.slice(-48);
  const elec = daily.reduce((a, d) => a + d.elec, 0);
  const gas = daily.reduce((a, d) => a + d.gas, 0);
  return {
    daily,
    halfHourly: last.map((s) => ({ t: s.t, elec: round(s.elec, 3), gas: round(s.gas, 3) })),
    totals: {
      elec: round(elec, 0),
      gas: round(gas, 0),
      cost: round((elec * elecRate + gas * gasRate) / 100, 2),
    },
    lastDay: {
      elec: round(last.reduce((a, s) => a + s.elec, 0), 1),
      gas: round(last.reduce((a, s) => a + s.gas, 0), 1),
      from: last[0]?.t ?? now,
      to: (last.at(-1)?.t ?? now) + 30 * 60_000,
    },
  };
}

async function liveEnergy(now: number) {
  const from = now - 31 * DAY;
  const mpan = process.env.OCTOPUS_ELEC_MPAN;
  const eSerial = process.env.OCTOPUS_ELEC_SERIAL;
  const mprn = process.env.OCTOPUS_GAS_MPRN;
  const gSerial = process.env.OCTOPUS_GAS_SERIAL;
  const [elec, gas] = await Promise.all([
    mpan && eSerial
      ? octopus(`electricity-meter-points/${mpan}/meters/${eSerial}`, from, now)
      : Promise.resolve([] as OctoRow[]),
    mprn && gSerial
      ? octopus(`gas-meter-points/${mprn}/meters/${gSerial}`, from, now)
      : Promise.resolve([] as OctoRow[]),
  ]);
  // SMETS2 gas meters report m³ — convert to kWh.
  const gasFactor = process.env.OCTOPUS_GAS_UNITS === "kwh" ? 1 : 11.1868;
  const map = new Map<number, EnergySlot>();
  const slot = (iso: string) => {
    const t = Date.parse(iso);
    let s = map.get(t);
    if (!s) map.set(t, (s = { t, elec: 0, gas: 0 }));
    return s;
  };
  elec.forEach((r) => (slot(r.interval_start).elec += r.consumption));
  gas.forEach((r) => (slot(r.interval_start).gas += r.consumption * gasFactor));
  const slots = [...map.values()].sort((a, b) => a.t - b.t);
  if (!slots.length) throw new Error("Octopus returned no consumption");
  return buildEnergy(slots, now);
}

function demoEnergy(now: number) {
  const step = 30 * 60_000;
  // Smart meter data usually lags — end at last midnight UTC.
  const end = Math.floor(now / DAY) * DAY;
  const slots: EnergySlot[] = [];
  for (let t = end - 30 * DAY; t < end; t += step) {
    const h = (t / HOUR) % 24;
    const dayIdx = Math.floor(t / DAY);
    const busy = 0.6 + hash(dayIdx) * 0.9;
    const base = 0.09 + hash(t / step) * 0.05;
    const evening = h >= 17 && h < 22 ? 0.35 * busy * hash(t / step + 3) : 0;
    const morning = h >= 7 && h < 9 ? 0.25 * busy * hash(t / step + 5) : 0;
    const spike = hash(t / step + 9) > 0.93 ? 0.4 + hash(t / step + 1) * 0.5 : 0;
    const gas =
      (h >= 6 && h < 9) || (h >= 17 && h < 21)
        ? 0.04 + hash(t / step + 2) * 0.25 * busy
        : 0;
    slots.push({ t, elec: base + evening + morning + spike, gas });
  }
  return buildEnergy(slots, end - 1);
}

/* ------------------------------------------------------------------ */
/* Weight                                                              */
/* ------------------------------------------------------------------ */
function demoWeight(now: number): Point[] {
  const out: Point[] = [];
  const end = Math.floor(now / DAY);
  let w = 76.2;
  for (let d = end - 540; d <= end; d++) {
    w += (hash(d) - 0.5) * 0.35 + (76.4 - w) * 0.03 + Math.sin(d / 60) * 0.02;
    if (hash(d + 77) > 0.35) out.push({ t: d * DAY + 7 * HOUR, v: round(w) });
  }
  return out;
}

async function liveWeight(url: string): Promise<Point[]> {
  const rows = await getJson<{ date: string; kg: number }[]>(url);
  return rows
    .map((r) => ({ t: Date.parse(r.date), v: r.kg }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
}

/* ------------------------------------------------------------------ */
/* Bookings — Google Calendar / Airbnb iCal links                      */
/* ------------------------------------------------------------------ */
function addDays(day: string, n: number) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function demoBookings(now: number): Booking[] {
  const today = new Date(now).toISOString().slice(0, 10);
  const unit = airbnbUnitIds()[0] ?? "unit3";
  const plan: Record<string, [string, number, number][]> = {
    "Bedroom 1": [["Faye", -7, -4], ["Alberto", -3, 2], ["Calum", 6, 10], ["Marta", 15, 20]],
    "Bedroom 2": [["Kenji", -2, 4], ["Sophie", 5, 8], ["Lena", 11, 18]],
    "Bedroom 3": [["Priya", 1, 3], ["Diego", 4, 11], ["Hannah", 13, 16], ["Tomás", 19, 23]],
  };
  return Object.entries(plan).flatMap(([room, rows]) =>
    rows.map(([guest, s, e], i) => ({
      id: `demo-${room}-${i}`,
      guest,
      start: addDays(today, s),
      end: addDays(today, e),
      source: "Demo",
      unit,
      room,
      checkInTime: null,
      checkOutTime: null,
    })),
  );
}

/**
 * Works out unit + bedroom from the event title or the calendar label,
 * e.g. title "Faye – Bed 1" or label "Unit 2 Bedroom 1".
 */
function tagUnit(b: Booking, calendarLabel: string): Booking {
  const airbnb = airbnbUnitIds();
  const unit =
    unitIdFrom(b.guest) ?? unitIdFrom(calendarLabel) ?? (airbnb.length === 1 ? airbnb[0] : null);
  const room = roomFrom(b.guest) ?? roomFrom(calendarLabel);
  return { ...b, guest: stripTags(b.guest), unit, room };
}

async function liveBookings(spec: string): Promise<Booking[]> {
  // Format: "Label|https://…ics, Label2|https://…ics" (label optional)
  const entries = spec
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i) => {
      const [a, b] = s.includes("|") ? s.split("|") : [`Calendar ${i + 1}`, s];
      return { label: a.trim(), url: b.trim().replace(/^webcal:/, "https:") };
    });
  const results = await Promise.allSettled(
    entries.map(async (e) => {
      const res = await fetch(e.url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`${res.status} for ${e.label}`);
      return parseIcs(await res.text(), e.label).map((b) => tagUnit(b, e.label));
    }),
  );
  const ok = results.filter((r) => r.status === "fulfilled");
  if (!ok.length) throw new Error("No calendar could be loaded");
  const seen = new Set<string>();
  return ok
    .flatMap((r) => r.value)
    .filter((b) => {
      // Same unit + same dates in two calendars (e.g. Google and Airbnb) = one booking.
      const k = `${b.unit ?? "-"}|${b.room ?? "-"}|${b.start}|${b.end}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

/* ------------------------------------------------------------------ */
/* LPG gas cylinder (12.5 kg)                                          */
/* ------------------------------------------------------------------ */
function gasFrom(unit: { id: string; name: string }, changes: number[], source: GasState["source"], canRecord: boolean): GasState {
  const sizeKg = Number(process.env.GAS_CYLINDER_KG ?? 12.5);
  const fallbackDays = Number(process.env.GAS_CYLINDER_DAYS ?? 90); // about 3 months per cylinder
  const gaps = changes.slice(1).map((t, i) => (t - changes[i]) / DAY).filter((d) => d >= 7 && d <= 365);
  const recent = gaps.slice(-5);
  const learned = recent.length > 0;
  const typicalDays = learned ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : fallbackDays;
  return { unit: unit.id, unitName: unit.name, source, canRecord, sizeKg, changes, typicalDays, learned };
}

/** Units that use an LPG cylinder (GAS_UNITS, default Unit 1 only). */
const gasUnits = () => {
  const ids = gasUnitIds();
  return UNITS.filter((u) => ids.includes(u.id));
};

/** Each unit's address and utility accounts (saved in the app; empty until filled in). */
async function getUnitInfo(): Promise<Record<string, UnitInfo>> {
  let saved: Record<string, Record<string, string>> = {};
  if (storeEnabled()) {
    try {
      saved = await loadUnitInfo();
    } catch (err) {
      console.error("[dashboard] unit info failed:", err);
    }
  }
  return Object.fromEntries(
    UNITS.map((u) => {
      const s = saved[u.id] ?? {};
      return [
        u.id,
        {
          address1: s.address1 ?? "",
          address2: s.address2 ?? "",
          city: s.city ?? "",
          elecProvider: s.elecProvider || "CEB",
          elecAccount: s.elecAccount ?? "",
          waterProvider: s.waterProvider || "NWSDB",
          waterAccount: s.waterAccount ?? "",
          gasSupplier: s.gasSupplier || "Litro",
          telecomProvider: s.telecomProvider || "SLT-Mobitel",
          telecomAccount: s.telecomAccount ?? "",
          notes: s.notes ?? "",
        },
      ];
    }),
  );
}

/**
 * Services in use per unit. Defaults: electricity + water for every unit,
 * gas for GAS_UNITS (Unit 1). Switches saved in the app override these.
 */
async function getServices(): Promise<Services> {
  let overrides: Record<string, Record<string, ServiceStatus>> = {};
  if (storeEnabled()) {
    try {
      overrides = await loadServiceOverrides();
    } catch (err) {
      console.error("[dashboard] services failed:", err);
    }
  }
  const gasIds = gasUnitIds();
  return Object.fromEntries(
    UNITS.map((u) => [
      u.id,
      {
        electricity: overrides[u.id]?.electricity ?? "in_use",
        water: overrides[u.id]?.water ?? "in_use",
        gas: overrides[u.id]?.gas ?? (gasIds.includes(u.id) ? "in_use" : "off"),
        telecom: overrides[u.id]?.telecom ?? "in_use",
      },
    ]),
  );
}

async function getGas(now: number, services: Services): Promise<GasState[]> {
  const canRecord = storeEnabled();
  let stored: Record<string, number[]> = {};
  if (canRecord) {
    try {
      stored = await loadGasChanges(UNITS.map((u) => u.id));
    } catch (err) {
      console.error("[dashboard] gas history failed:", err);
    }
  }
  // gas tracker for units that use gas (always, or on request once a cylinder is recorded)
  const configured = gasUnitIds();
  const units = UNITS.filter((u) => {
    const st = services[u.id]?.gas;
    if (st === "in_use") return true;
    if (st === "on_request") return (stored[u.id]?.length ?? 0) > 0 || configured.includes(u.id);
    return false;
  });
  return units.map((u, i) => {
    if (stored[u.id]?.length) return gasFrom(u, stored[u.id], "live", true);
    // e.g. GAS_LAST_CHANGED_UNIT2=2026-11-02 (or GAS_LAST_CHANGED for all)
    const raw = process.env[`GAS_LAST_CHANGED_${u.id.toUpperCase()}`] ?? process.env.GAS_LAST_CHANGED;
    const last = raw ? Date.parse(raw) : NaN;
    if (Number.isFinite(last)) return gasFrom(u, [last], "settings", canRecord);
    // sample history: cylinders lasting ~3 months, each unit at a different point
    const ago = [41, 55, 12, 30][i % 4]; // all comfortably above the "order soon" level
    return gasFrom(u, [now - (ago + 181) * DAY, now - (ago + 90) * DAY, now - ago * DAY], "demo", canRecord);
  });
}

/* ------------------------------------------------------------------ */
/* Utility records (electricity / water / gas) per unit                */
/* ------------------------------------------------------------------ */
const OWNER = (u: { owner: string | null; usage: string | null }) => u.owner ?? u.usage ?? "";
function demoUtilities(now: number): UtilityEntry[] {
  const out: UtilityEntry[] = [];
  const first = new Date(now);
  // last 3 full months
  for (let m = 1; m <= 3; m++) {
    const from = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - m, 1));
    const to = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - m + 1, 0));
    const f = from.toISOString().slice(0, 10);
    const t = to.toISOString().slice(0, 10);
    UNITS.forEach((u, ui) => {
      const busy = u.id === "unit5" ? 1.6 : u.id === "unit1" ? 1.3 : 1;
      const kwh = Math.round((150 + hash(ui * 10 + m) * 90) * busy);
      out.push({ id: `demo-e-${u.id}-${m}`, unit: u.id, kind: "electricity", from: f, to: t, amount: kwh, cost: Math.round(kwh * 42 + 400), customer: OWNER(u), account: "", note: "Sample CEB bill" });
      const water = Math.round((12 + hash(ui * 20 + m) * 10) * (u.id === "unit5" ? 0.5 : 1));
      const gb = Math.round(60 + hash(ui * 30 + m) * 90);
      out.push({ id: `demo-t-${u.id}-${m}`, unit: u.id, kind: "telecom", from: f, to: t, amount: gb, cost: gb > 100 ? 4990 : 3490, customer: OWNER(u), account: "", note: "Sample SLT-Mobitel fibre" });
      out.push({ id: `demo-w-${u.id}-${m}`, unit: u.id, kind: "water", from: f, to: t, amount: water, cost: Math.round(water * 95 + 300), customer: OWNER(u), account: "", note: "Sample water bill" });
    });
  }
  // Sample gas history for each gas unit, matching the sample cylinder changes (each cylinder ≈ 3 months)
  const isoAgo = (d: number) => new Date(now - d * DAY).toISOString().slice(0, 10);
  gasUnits().forEach((u, i) => {
    const ago = [41, 55, 12, 30][i % 4];
    const owner = OWNER(u);
    out.push({ id: `demo-g-${u.id}-1`, unit: u.id, kind: "gas", from: isoAgo(ago + 181), to: isoAgo(ago + 90), amount: 12.5, cost: 4100, customer: owner, account: "", note: "Sample: Litro 12.5 kg" });
    out.push({ id: `demo-g-${u.id}-2`, unit: u.id, kind: "gas", from: isoAgo(ago + 90), to: isoAgo(ago), amount: 12.5, cost: 4250, customer: owner, account: "", note: "Sample: Litro 12.5 kg" });
  });
  return out.sort((a, b) => b.to.localeCompare(a.to));
}

async function getUtilities(now: number): Promise<UtilitiesState> {
  const canRecord = storeEnabled();
  if (canRecord) {
    try {
      const entries = await loadUtilityEntries<UtilityEntry>();
      if (entries.length) return { source: "live", canRecord, entries: entries.sort((a, b) => b.to.localeCompare(a.to)) };
    } catch (err) {
      console.error("[dashboard] utilities failed:", err);
    }
  }
  return { source: "demo", canRecord, entries: demoUtilities(now) };
}

/* ------------------------------------------------------------------ */
async function withFallback<T>(
  name: string,
  live: (() => Promise<T>) | null,
  demo: () => T,
): Promise<[T, SourceState]> {
  if (!live) return [demo(), "demo"];
  try {
    return [await live(), "live"];
  } catch (err) {
    console.error(`[dashboard] ${name} failed, using demo data:`, err);
    return [demo(), "demo"];
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const now = Date.now();
  const env = process.env;

  const [[units, roomsSrc], [outside, outsideSrc], [forecast, forecastSrc], [energy, energySrc], [weight, weightSrc], [bookings, calSrc]] =
    await Promise.all([
      withFallback(
        "rooms",
        env.SENSOR_FEED_URL
          ? () => liveUnits(env.SENSOR_FEED_URL!, now)
          : storeEnabled()
            ? () => storedUnits(now)
            : null,
        () => demoUnits(now),
      ),
      withFallback("outside", env.DISABLE_WEATHER ? null : () => outsideWeather(now), () => demoOutside(now)),
      withFallback("forecast", env.DISABLE_WEATHER ? null : () => liveForecast(), () => demoForecast(now)),
      withFallback(
        "energy",
        env.OCTOPUS_API_KEY ? () => liveEnergy(now) : null,
        () => demoEnergy(now),
      ),
      withFallback("weight", env.WEIGHT_FEED_URL ? () => liveWeight(env.WEIGHT_FEED_URL!) : null, () => demoWeight(now)),
      withFallback("calendar", env.CALENDAR_ICAL_URLS ? () => liveBookings(env.CALENDAR_ICAL_URLS!) : null, () => demoBookings(now)),
    ]);

  const services = await getServices();
  const unitInfo = await getUnitInfo();
  // telecom bill connections: D1 → Unit 2, D2 → Unit 3, D3 → Units 3 & 4 (shared) unless changed in the app
  let telecomMap: TelecomLink[] = [
    { code: "D1", units: ["unit2"] },
    { code: "D2", units: ["unit3"] },
    { code: "D3", units: ["unit3", "unit4"] },
  ];
  if (storeEnabled()) {
    try {
      telecomMap = (await loadTelecomMap()) ?? telecomMap;
    } catch (err) {
      console.error("[dashboard] telecom map failed:", err);
    }
  }
  const [gas, utilities] = await Promise.all([getGas(now, services), getUtilities(now)]);

  return {
    generatedAt: new Date(now).toISOString(),
    location: env.LOCATION_NAME ?? "Sri Lanka",
    gas,
    utilities,
    services,
    alerts: alertSettings(),
    unitInfo,
    telecomMap,
    billScan: Boolean(env.ANTHROPIC_API_KEY),
    sources: {
      rooms: roomsSrc,
      outside: outsideSrc,
      forecast: forecastSrc,
      energy: energySrc,
      weight: weightSrc,
      calendar: calSrc,
    },
    units: units.map((u) => {
      const def = UNITS.find((d) => d.id === u.id);
      return { ...u, owner: def?.owner ?? null, usage: def?.usage ?? null, airbnbRooms: airbnbRoomsFor(u.id) };
    }),
    outside,
    forecast,
    energy,
    weight,
    // Airbnb/all-day events have no times → use the house check-in/out times.
    bookings: bookings.map((b) => ({
      ...b,
      checkInTime: b.checkInTime ?? env.CHECKIN_TIME ?? "14:00",
      checkOutTime: b.checkOutTime ?? env.CHECKOUT_TIME ?? "11:00",
    })),
  };
}
