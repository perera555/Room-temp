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
  const info: Record<string, unknown> = Object.fromEntries(FIELDS.map((f) => [f, String(b[f] ?? "").trim().slice(0, f === "notes" ? 200 : 80)]));
  // mobile numbers / data SIMs (Mobitel, Dialog, Hutch, Airtel) - up to 10 per unit
  info.mobiles = (Array.isArray(b.mobiles) ? b.mobiles : [])
    .map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      const monthly = Number(o.monthly);
      return {
        number: String(o.number ?? "").replace(/[^\d+]/g, "").slice(0, 15),
        provider: String(o.provider ?? "").trim().slice(0, 30),
        package: String(o.package ?? "").trim().slice(0, 60),
        monthly: o.monthly === "" || o.monthly == null || !Number.isFinite(monthly) || monthly < 0 ? null : monthly,
      };
    })
    .filter((m) => m.number)
    .slice(0, 10);
  await saveUnitInfo(unit, info);
  return Response.json({ ok: true, info });
}
