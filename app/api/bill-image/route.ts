import { loadBillImage, saveBillImage, storeEnabled } from "@/lib/store";

/**
 * Bill photos.
 * POST {"dataUrl":"data:image/jpeg;base64,..."}  → {"id":"..."}   (photo is shrunk on the device first)
 * GET  /api/bill-image?id=...                     → the image (or PDF)
 * Protected by the dashboard password (see proxy.ts) when one is set.
 */
const MAX = 1_800_000; // ~1.3 MB file after base64

export async function POST(req: Request) {
  if (!storeEnabled()) {
    return Response.json({ error: "To save bill photos, connect Upstash Redis in Vercel → Storage (see the user guide)." }, { status: 503 });
  }
  let b: { dataUrl?: unknown } = {};
  try {
    b = await req.json();
  } catch {}
  const dataUrl = typeof b.dataUrl === "string" ? b.dataUrl : "";
  if (!/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    return Response.json({ error: "Send a JPG / PNG / WEBP photo or a PDF" }, { status: 400 });
  }
  if (dataUrl.length > MAX) return Response.json({ error: "Photo is too big (max about 1.3 MB). Try a smaller photo." }, { status: 400 });
  const id = crypto.randomUUID();
  await saveBillImage(id, dataUrl);
  return Response.json({ ok: true, id });
}

export async function GET(req: Request) {
  if (!storeEnabled()) return new Response("Not set up", { status: 503 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Bad id", { status: 400 });
  const dataUrl = await loadBillImage(id);
  const m = dataUrl?.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=86400", "Content-Disposition": `inline; filename="bill-${id.slice(0, 8)}"` },
  });
}
