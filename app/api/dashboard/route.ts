import { connection } from "next/server";
import { getDashboardData } from "@/lib/data";
import { passwordEnabled } from "@/lib/auth";

export async function GET() {
  await connection();
  const data = await getDashboardData();
  return Response.json(data, {
    headers: {
      // Public edge caching only when the dashboard isn't password protected.
      "Cache-Control": passwordEnabled()
        ? "private, max-age=60"
        : "public, s-maxage=120, stale-while-revalidate=600",
    },
  });
}
