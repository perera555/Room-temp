/**
 * Temperature alerts: when a room gets too hot or too cold, send a message to
 * the owner's phone (ntfy push, WhatsApp via CallMeBot, and/or Telegram).
 *
 * Settings (Vercel → Environment Variables):
 *   ALERT_HOT=32            too hot at or above this °C
 *   ALERT_COLD=20           too cold at or below this °C
 *   ALERT_REPEAT_MIN=60     repeat while still wrong, every N minutes
 *   NTFY_TOPIC=…            ntfy.sh topic (install the free "ntfy" app and subscribe)
 *   CALLMEBOT_WHATSAPP=+94771234567:APIKEY[,+9471…:APIKEY2]
 *   TELEGRAM_BOT_TOKEN=…    and TELEGRAM_CHAT_ID=…
 */
import { clearAlertMemory, getAlertMemory, setAlertMemory, storeEnabled } from "./store";
import { UNITS } from "./units";

export type AlertSettings = {
  hot: number;
  cold: number;
  repeatMin: number;
  channels: { ntfy: boolean; whatsapp: boolean; telegram: boolean };
};

export function alertSettings(): AlertSettings {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    hot: num(process.env.ALERT_HOT, 32),
    cold: num(process.env.ALERT_COLD, 20),
    repeatMin: num(process.env.ALERT_REPEAT_MIN, 60),
    channels: {
      ntfy: Boolean(process.env.NTFY_TOPIC),
      whatsapp: Boolean(process.env.CALLMEBOT_WHATSAPP),
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    },
  };
}

const unitName = (id: string) => UNITS.find((u) => u.id === id)?.name ?? id;

/* ------------------------------------------------------------------ */
/* Senders                                                             */
/* ------------------------------------------------------------------ */
async function viaNtfy(title: string, text: string, urgent: boolean) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return null;
  const server = (process.env.NTFY_SERVER ?? "https://ntfy.sh").replace(/\/$/, "");
  const res = await fetch(`${server}/${encodeURIComponent(topic)}`, {
    method: "POST",
    // ntfy headers must be plain ASCII, so the emoji live in the body text
    headers: { Title: title.replace(/[^\x20-\x7E]/g, "").trim() || "Room Temp", Priority: urgent ? "urgent" : "default", Tags: urgent ? "warning" : "white_check_mark" },
    body: text,
    signal: AbortSignal.timeout(8000),
  });
  return res.ok ? "ntfy" : `ntfy failed (${res.status})`;
}

async function viaWhatsApp(text: string) {
  const spec = process.env.CALLMEBOT_WHATSAPP;
  if (!spec) return null;
  const out: string[] = [];
  for (const pair of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [phone, apikey] = pair.split(":").map((s) => s.trim());
    if (!phone || !apikey) continue;
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    out.push(res.ok ? `whatsapp ${phone.slice(-4)}` : `whatsapp ${phone.slice(-4)} failed (${res.status})`);
  }
  return out.join(", ") || null;
}

async function viaTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return null;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
    signal: AbortSignal.timeout(8000),
  });
  return res.ok ? "telegram" : `telegram failed (${res.status})`;
}

/** Send to every configured channel. Returns what happened per channel. */
export async function sendAlert(title: string, text: string, urgent = true): Promise<string[]> {
  const results = await Promise.allSettled([viaNtfy(title, text, urgent), viaWhatsApp(`${title}\n${text}`), viaTelegram(`${title}\n${text}`)]);
  return results.flatMap((r) => (r.status === "fulfilled" ? (r.value ? [r.value] : []) : [`error: ${String(r.reason).slice(0, 80)}`]));
}

/* ------------------------------------------------------------------ */
/* Check one reading                                                   */
/* ------------------------------------------------------------------ */
/**
 * Called for every new room reading. Sends "too hot / too cold" once, repeats
 * every ALERT_REPEAT_MIN while it continues, and "back to normal" when it recovers.
 * Needs the Upstash store to remember what was already sent.
 */
export async function checkReading(unit: string, room: string, temp: number) {
  if (!storeEnabled()) return;
  const s = alertSettings();
  if (!s.channels.ntfy && !s.channels.whatsapp && !s.channels.telegram) return;

  const kind = temp >= s.hot ? "hot" : temp <= s.cold ? "cold" : null;
  const key = `rt:alert:${unit}:${room}`;
  const prev = await getAlertMemory(key);
  const where = `${unitName(unit)} · ${room}`;

  if (kind) {
    const due = !prev || prev.kind !== kind || Date.now() - prev.sentAt >= s.repeatMin * 60_000;
    if (!due) return;
    const title = kind === "hot" ? `🔥 TOO HOT: ${where}` : `🥶 TOO COLD: ${where}`;
    const text =
      kind === "hot"
        ? `${where} is ${temp.toFixed(1)}°C (limit ${s.hot}°C). Check the A/C, fan and windows.`
        : `${where} is ${temp.toFixed(1)}°C (limit ${s.cold}°C). Check the A/C setting.`;
    await sendAlert(title, text, true);
    await setAlertMemory(key, { kind, sentAt: Date.now() });
  } else if (prev) {
    await sendAlert(`✅ Back to normal: ${where}`, `${where} is ${temp.toFixed(1)}°C again.`, false);
    await clearAlertMemory(key);
  }
}
