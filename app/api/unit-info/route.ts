import { saveUnitInfo, storeEnabled } from "@/lib/store";
import { UNITS } from "@/lib/units";

/**
 * Save a unit's address and utility accounts.
 * POST {"unit":"unit2","address1":"…","address2":"…","city":"…","elecProvider":"CEB","elecAccount":"…",
 *       "waterProvider":"NWSDB","waterAccount":"…","gasSupplier":"Litro","notes":"…"}
 * Protected by the dashboard password (see proxy.ts) when one is set.
 */
const FIELDS = ["address1", "address2", "city", "elecProvider", "elecAccount", "waterProvider", "waterAccount", "gasSupplier", "telecomProvider", "telecomAccount", "notes"] as const;

export async function POST(req: Request) {
  if (!storeEnabled()) {
    return Response.json({ error: "To save this, connect Upstash Redis in Vercel → Storage (see the user guide)." }, { status: 503 });
  }
  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {}
  const unit = UNITS.find((u) => u.id === b.unit)?.id;
  if (!unit) return Response.json({ error: "Choose a unit" }, { status: 400 });
  const info = Object.fromEntries(FIELDS.map((f) => [f, String(b[f] ?? "").trim().slice(0, f === "notes" ? 200 : 80)]));
  await saveUnitInfo(unit, info);
  return Response.json({ ok: true, info });
}
