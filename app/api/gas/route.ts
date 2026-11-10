import { addGasChange, addGasWeight, markServiceUsed, removeLastGasChange, storeEnabled } from "@/lib/store";
import { UNITS } from "@/lib/units"; // any unit can start using gas: its first cylinder record turns the tracker on

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
  let body: { unit?: string; action?: string; date?: string; weight?: unknown; tare?: unknown } = {};
  try {
    body = await req.json();
  } catch {}
  const unit = UNITS.find((u) => u.id === body.unit)?.id;
  if (!unit) return Response.json({ error: "Choose a unit" }, { status: 400 });

  // ⚖ weigh-in: total weight on the scale and the empty cylinder weight (TW stamped on it)
  if (body.action === "weigh") {
    const gross = Number(body.weight);
    const tare = Number(body.tare);
    if (!Number.isFinite(gross) || gross <= 0 || gross > 100) return Response.json({ error: "Enter the weight shown on the scale (kg)" }, { status: 400 });
    if (!Number.isFinite(tare) || tare <= 0 || tare >= gross + 20) return Response.json({ error: "Enter the empty cylinder weight (TW on the cylinder)" }, { status: 400 });
    await addGasWeight(unit, { t: Date.now(), gross, tare });
    return Response.json({ ok: true, gasLeft: Math.max(0, Math.round((gross - tare) * 10) / 10) });
  }

  if (body.action === "undo") {
    await removeLastGasChange(unit);
    return Response.json({ ok: true });
  }
  const t = body.date ? Date.parse(body.date) : Date.now();
  if (!Number.isFinite(t) || t > Date.now() + 86_400_000) return Response.json({ error: "Invalid date" }, { status: 400 });
  await addGasChange(unit, t);
  await markServiceUsed(unit, "gas"); // fitting a cylinder: off -> in use (keeps "on request")
  return Response.json({ ok: true });
}
