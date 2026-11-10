import { alertSettings, sendAlert } from "@/lib/alerts";

/**
 * Send a test message to every configured channel (ntfy / WhatsApp / Telegram).
 * POST /api/alerts/test
 * Protected by the dashboard password (see proxy.ts) when one is set.
 */
export async function POST() {
  const s = alertSettings();
  if (!s.channels.ntfy && !s.channels.whatsapp && !s.channels.telegram) {
    return Response.json(
      { error: "No phone channel set up yet. Add NTFY_TOPIC (easiest), CALLMEBOT_WHATSAPP or TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in Vercel, then Redeploy." },
      { status: 400 },
    );
  }
  const sent = await sendAlert(
    "🔔 Test alert from Room Temp",
    `Alerts are working. You'll be told when a room is ≥ ${s.hot}°C (too hot) or ≤ ${s.cold}°C (too cold).`,
    false,
  );
  return Response.json({ ok: true, sent });
}
