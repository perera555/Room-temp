import { saveReadings, storeEnabled, type StoredReading } from "@/lib/store";
import { unitIdFrom } from "@/lib/units";

/**
 * Sensors send readings here.
 *
 *  GET  /api/readings?key=KEY&unit=2&room=Kitchen&temp=20.4&hum=55
 *       (Shelly H&T "action URL" style — Shelly adds &temp=..&hum=.. itself)
 *  POST /api/readings?key=KEY   body: {"unit":"2","room":"Kitchen","temp":20.4,"humidity":55}
 *       or an array of those objects.
 */
type Input = { unit?: string | number; room?: string; temp?: unknown; humidity?: unknown; hum?: unknown; t?: unknown };

function num(v: unknown) {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function authorised(req: Request, url: URL) {
  const key = process.env.SENSOR_API_KEY;
  if (!key) return false;
  const given = url.searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return given === key;
}

async function handle(req: Request, items: Input[]) {
  const url = new URL(req.url);
  if (!process.env.SENSOR_API_KEY)
    return Response.json({ error: "Set SENSOR_API_KEY in Vercel first" }, { status: 503 });
  if (!authorised(req, url)) return Response.json({ error: "Wrong or missing key" }, { status: 401 });
  if (!storeEnabled())
    return Response.json({ error: "Connect Upstash Redis in Vercel → Storage first" }, { status: 503 });

  const rows = [];
  for (const it of items) {
    const unitRaw = String(it.unit ?? "");
    const unit = unitIdFrom(/^\d+$/.test(unitRaw) ? `unit ${unitRaw}` : unitRaw);
    const room = String(it.room ?? "").trim().slice(0, 40);
    const r: StoredReading = {
      t: num(it.t) ?? Date.now(),
      temp: num(it.temp),
      humidity: num(it.humidity ?? it.hum),
    };
    if (!unit || !room) return Response.json({ error: "unit (1-5) and room are required" }, { status: 400 });
    if (r.temp == null && r.humidity == null)
      return Response.json({ error: "temp or humidity is required" }, { status: 400 });
    if (r.temp != null && (r.temp < -40 || r.temp > 80)) return Response.json({ error: "temp out of range" }, { status: 400 });
    rows.push({ unit, room, r });
  }
  await saveReadings(rows);
  return Response.json({ ok: true, saved: rows.length });
}

export async function GET(req: Request) {
  // Some sensors append "?temp=..&hum=.." even when the URL already has a "?",
  // so a value can look like "Bedroom 1?temp=20&hum=50". Split those out.
  const p = new URLSearchParams();
  for (const [k, v] of new URL(req.url).searchParams) {
    const [value, extra] = v.split("?");
    p.set(k, value);
    if (extra) for (const [k2, v2] of new URLSearchParams(extra)) p.set(k2, v2);
  }
  return handle(req, [{ unit: p.get("unit") ?? undefined, room: p.get("room") ?? undefined, temp: p.get("temp"), hum: p.get("hum") ?? p.get("humidity") }]);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const items = (Array.isArray(body) ? body : [body]) as Input[];
  if (items.length > 200) return Response.json({ error: "Max 200 readings per request" }, { status: 400 });
  return handle(req, items);
}
