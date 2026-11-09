import { setService, storeEnabled } from "@/lib/store";
import { UNITS } from "@/lib/units";

/**
 * Turn a service on/off for a unit.
 * POST {"unit":"unit2","kind":"gas","on":true}
 * Protected by the dashboard password (see proxy.ts) when one is set.
 */
const KINDS = ["electricity", "water", "gas"];

export async function POST(req: Request) {
  if (!storeEnabled()) {
    return Response.json({ error: "To save this, connect Upstash Redis in Vercel → Storage (see the user guide)." }, { status: 503 });
  }
  let b: { unit?: string; kind?: string; on?: unknown } = {};
  try {
    b = await req.json();
  } catch {}
  if (!UNITS.some((u) => u.id === b.unit)) return Response.json({ error: "Choose a unit" }, { status: 400 });
  if (!b.kind || !KINDS.includes(b.kind)) return Response.json({ error: "Choose electricity, water or gas" }, { status: 400 });
  await setService(b.unit!, b.kind, Boolean(b.on));
  return Response.json({ ok: true });
}
