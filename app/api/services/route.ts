import { setService, storeEnabled } from "@/lib/store";
import { UNITS } from "@/lib/units";

/**
 * Set a service status for a unit.
 * POST {"unit":"unit2","kind":"gas","status":"on_request"}   // in_use | on_request | off
 * (older form {"on":true|false} still accepted)
 * Protected by the dashboard password (see proxy.ts) when one is set.
 */
const KINDS = ["electricity", "water", "gas"];
const STATUSES = ["in_use", "on_request", "off"] as const;

export async function POST(req: Request) {
  if (!storeEnabled()) {
    return Response.json({ error: "To save this, connect Upstash Redis in Vercel → Storage (see the user guide)." }, { status: 503 });
  }
  let b: { unit?: string; kind?: string; status?: string; on?: unknown } = {};
  try {
    b = await req.json();
  } catch {}
  if (!UNITS.some((u) => u.id === b.unit)) return Response.json({ error: "Choose a unit" }, { status: 400 });
  if (!b.kind || !KINDS.includes(b.kind)) return Response.json({ error: "Choose electricity, water or gas" }, { status: 400 });
  const status = (STATUSES as readonly string[]).includes(b.status ?? "") ? (b.status as (typeof STATUSES)[number]) : b.on === undefined ? null : b.on ? "in_use" : "off";
  if (!status) return Response.json({ error: "status must be in_use, on_request or off" }, { status: 400 });
  await setService(b.unit!, b.kind, status);
  return Response.json({ ok: true });
}
