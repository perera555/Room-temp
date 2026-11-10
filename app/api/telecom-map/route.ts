import { saveTelecomMap, storeEnabled } from "@/lib/store";
import { UNITS } from "@/lib/units";

/**
 * Save which units each telecom bill connection belongs to.
 * POST {"map":[{"code":"D1","units":["unit2"]},{"code":"D3","units":["unit3","unit4"]}]}
 * Protected by the dashboard password (see proxy.ts) when one is set.
 */
export async function POST(req: Request) {
  if (!storeEnabled()) {
    return Response.json({ error: "To save this, connect Upstash Redis in Vercel → Storage (see the user guide)." }, { status: 503 });
  }
  let b: { map?: unknown } = {};
  try {
    b = await req.json();
  } catch {}
  if (!Array.isArray(b.map)) return Response.json({ error: "map must be a list" }, { status: 400 });
  const ids = new Set(UNITS.map((u) => u.id));
  const map = b.map
    .map((m) => ({
      code: String((m as { code?: unknown }).code ?? "").trim().toUpperCase().slice(0, 20),
      units: (Array.isArray((m as { units?: unknown }).units) ? ((m as { units: unknown[] }).units) : []).map(String).filter((u) => ids.has(u)),
    }))
    .filter((m) => m.code && m.units.length)
    .slice(0, 30);
  await saveTelecomMap(map);
  return Response.json({ ok: true, map });
}
