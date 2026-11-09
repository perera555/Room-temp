import { addUtilityEntry, deleteUtilityEntry, storeEnabled } from "@/lib/store";
import type { UtilityEntry, UtilityKind } from "@/lib/types";
import { UNITS } from "@/lib/units";

/**
 * Add or remove a utility record (electricity / water / gas usage between two dates).
 * POST   {"kind":"electricity","from":"2026-10-01","to":"2026-10-31","amount":245,"cost":9850,"note":"CEB bill"}
 * DELETE /api/utilities?id=…
 * Protected by the dashboard password (see proxy.ts) when one is set.
 */
const KINDS: UtilityKind[] = ["electricity", "water", "gas"];
const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const noStore = () =>
  Response.json({ error: "To save records, connect Upstash Redis in Vercel → Storage (see the user guide)." }, { status: 503 });

export async function POST(req: Request) {
  if (!storeEnabled()) return noStore();
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const unit = UNITS.find((u) => u.id === b.unit)?.id;
  if (!unit) return Response.json({ error: "Choose a unit" }, { status: 400 });
  const kind = b.kind as UtilityKind;
  const amount = Number(b.amount);
  const cost = b.cost === "" || b.cost == null ? null : Number(b.cost);
  if (!KINDS.includes(kind)) return Response.json({ error: "Choose electricity, water or gas" }, { status: 400 });
  if (!isDay(b.from) || !isDay(b.to)) return Response.json({ error: "From and To dates are required" }, { status: 400 });
  if (b.to < b.from) return Response.json({ error: "To date must be after From date" }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) return Response.json({ error: "Enter the amount used" }, { status: 400 });
  if (cost != null && (!Number.isFinite(cost) || cost < 0)) return Response.json({ error: "Cost must be a number" }, { status: 400 });

  const entry: UtilityEntry = {
    id: crypto.randomUUID(),
    unit,
    kind,
    from: b.from,
    to: b.to,
    amount,
    cost,
    customer: String(b.customer ?? "").trim().slice(0, 80),
    account: String(b.account ?? "").trim().slice(0, 40),
    note: String(b.note ?? "").trim().slice(0, 120),
  };
  await addUtilityEntry(entry);
  return Response.json({ ok: true, entry });
}

export async function DELETE(req: Request) {
  if (!storeEnabled()) return noStore();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const ok = await deleteUtilityEntry(id);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
