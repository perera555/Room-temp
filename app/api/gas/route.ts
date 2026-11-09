import { addGasChange, removeLastGasChange, storeEnabled } from "@/lib/store";
import { UNITS } from "@/lib/units";

/**
 * Record that a new gas cylinder was fitted in a unit.
 * POST {"unit":"unit2","action":"fitted"}                      → now
 * POST {"unit":"unit2","action":"fitted","date":"2026-11-02"}  → a past date
 * POST {"unit":"unit2","action":"undo"}                        → remove the last record
 * Protected by the dashboard password (see proxy.ts) when one is set.
 */
export async function POST(req: Request) {
  if (!storeEnabled()) {
    return Response.json(
      { error: "To save this, connect Upstash Redis in Vercel → Storage (see the user guide)." },
      { status: 503 },
    );
  }
  let body: { unit?: string; action?: string; date?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const unit = UNITS.find((u) => u.id === body.unit)?.id;
  if (!unit) return Response.json({ error: "Choose a unit" }, { status: 400 });

  if (body.action === "undo") {
    await removeLastGasChange(unit);
    return Response.json({ ok: true });
  }
  const t = body.date ? Date.parse(body.date) : Date.now();
  if (!Number.isFinite(t) || t > Date.now() + 86_400_000) return Response.json({ error: "Invalid date" }, { status: 400 });
  await addGasChange(unit, t);
  return Response.json({ ok: true });
}
