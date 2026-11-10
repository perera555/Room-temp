import { after, connection } from "next/server";
import { getDashboardData } from "@/lib/data";
import { passwordEnabled } from "@/lib/auth";
import { checkReading } from "@/lib/alerts";

export async function GET() {
  await connection();
  const data = await getDashboardData();

  // Readings from SENSOR_FEED_URL don't pass through /api/readings, so check
  // them for too hot / too cold here, after the response has been sent.
  if (process.env.SENSOR_FEED_URL && data.sources.rooms === "live") {
    after(async () => {
      for (const u of data.units)
        for (const r of u.rooms) {
          const t = r.temp.at(-1)?.v;
          if (t != null) await checkReading(u.id, r.label, t).catch((e) => console.error("[alerts]", e));
        }
    });
  }

  return Response.json(data, {
    headers: {
      // Public edge caching only when the dashboard isn't password protected.
      "Cache-Control": passwordEnabled()
        ? "private, max-age=60"
        : "public, s-maxage=120, stale-while-revalidate=600",
    },
  });
}
