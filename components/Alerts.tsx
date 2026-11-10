"use client";

import { useEffect, useRef, useState } from "react";
import type { DashboardData } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* What is too hot / too cold right now                                */
/* ------------------------------------------------------------------ */
export type TempAlert = { key: string; unit: string; room: string; temp: number; kind: "hot" | "cold" };

/** Rooms outside the limits. Only real sensor data raises alerts (never sample data). */
export function findTempAlerts(data: DashboardData): TempAlert[] {
  if (data.sources.rooms !== "live") return [];
  const { hot, cold } = data.alerts ?? { hot: 32, cold: 20 };
  const out: TempAlert[] = [];
  for (const u of data.units)
    for (const r of u.rooms) {
      const t = r.temp.at(-1)?.v;
      if (t == null) continue;
      const kind = t >= hot ? "hot" : t <= cold ? "cold" : null;
      if (kind) out.push({ key: `${u.id}|${r.label}|${kind}`, unit: u.name, room: r.label, temp: t, kind });
    }
  return out;
}

/* ------------------------------------------------------------------ */
/* Sound, voice and notification preferences (per device)              */
/* ------------------------------------------------------------------ */
const VOICE_KEY = "rt:alert-voice";
const PREF_EVENT = "rt-alert-pref";
const REPEAT_MS = 15 * 60_000; // say it again every 15 minutes while it lasts

export function useVoicePref(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setOn(localStorage.getItem(VOICE_KEY) === "on");
      } catch {}
    };
    read();
    window.addEventListener(PREF_EVENT, read);
    return () => window.removeEventListener(PREF_EVENT, read);
  }, []);
  const set = (v: boolean) => {
    try {
      localStorage.setItem(VOICE_KEY, v ? "on" : "off");
    } catch {}
    window.dispatchEvent(new Event(PREF_EVENT));
  };
  return [on, set];
}

/** Three short beeps (no sound file needed). */
export function beep(kind: "hot" | "cold" | "test" = "test") {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const freq = kind === "hot" ? 880 : kind === "cold" ? 520 : 700;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      o.type = "square";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.35 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.35);
      o.stop(ctx.currentTime + i * 0.35 + 0.3);
    }
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {}
}

/** Read a sentence aloud with the device's built-in voice. */
export function say(text: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find((v) => /en[-_](GB|IN|US)/i.test(v.lang)) ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
    u.rate = 0.95;
    u.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
}

function notify(title: string, body: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const opts = { body, icon: "/icons/192", badge: "/icons/192", tag: title, requireInteraction: true } as NotificationOptions;
    const plain = () => {
      try {
        new Notification(title, opts);
      } catch {}
    };
    // the offline helper (service worker) shows notifications best; fall back while it is still installing
    const reg = navigator.serviceWorker ? navigator.serviceWorker.getRegistration() : Promise.resolve(undefined);
    reg
      .then((r) => (r?.active ? r.showNotification(title, opts) : plain()))
      .catch(plain);
  } catch {}
}

const sentence = (a: TempAlert) =>
  `Warning. ${a.unit}, ${a.room} is too ${a.kind === "hot" ? "hot" : "cold"}. ${Math.round(a.temp)} degrees.`;

/**
 * Mounted once on the dashboard. When a new room goes out of range it beeps,
 * speaks the warning (if voice is on) and shows a notification. Repeats every 15 min.
 */
export function AlertAnnouncer({ alerts }: { alerts: TempAlert[] }) {
  const [voice] = useVoicePref();
  const lastSaid = useRef(new Map<string, number>());

  useEffect(() => {
    const announce = () => {
      const now = Date.now();
      const due = alerts.filter((a) => now - (lastSaid.current.get(a.key) ?? 0) >= REPEAT_MS);
      // forget rooms that are back to normal, so a new problem is announced at once
      for (const k of [...lastSaid.current.keys()]) if (!alerts.some((a) => a.key === k)) lastSaid.current.delete(k);
      if (!due.length) return;
      due.forEach((a) => lastSaid.current.set(a.key, now));
      for (const a of due) notify(a.kind === "hot" ? `🔥 Too hot: ${a.unit} · ${a.room}` : `🥶 Too cold: ${a.unit} · ${a.room}`, `${a.temp.toFixed(1)}°C`);
      if (voice) {
        beep(due[0].kind);
        setTimeout(() => say(due.map(sentence).join(" ")), 1100);
      }
    };
    announce();
    const t = setInterval(announce, 60_000);
    return () => clearInterval(t);
  }, [alerts, voice]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Red / blue bar listing the rooms                                    */
/* ------------------------------------------------------------------ */
export function AlertBar({ alerts, compact = false }: { alerts: TempAlert[]; compact?: boolean }) {
  if (!alerts.length) return null;
  const hot = alerts.filter((a) => a.kind === "hot");
  const cold = alerts.filter((a) => a.kind === "cold");
  return (
    <div role="alert" className="flex flex-col gap-1.5">
      {[
        { list: hot, cls: "border-red-400/60 from-red-600/45 to-orange-700/30", label: "🔥 TOO HOT" },
        { list: cold, cls: "border-sky-300/60 from-sky-600/45 to-indigo-700/30", label: "🥶 TOO COLD" },
      ]
        .filter((g) => g.list.length)
        .map((g) => (
          <div key={g.label} className={`chip-3d flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-gradient-to-r text-white ${g.cls} ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm"}`}>
            <b className="animate-pulse tracking-wider">{g.label}</b>
            {g.list.map((a) => (
              <span key={a.key}>
                <b>
                  {a.unit} · {a.room}
                </b>{" "}
                {a.temp.toFixed(1)}°C
              </span>
            ))}
          </div>
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Alerts panel: limits, switches, test                                */
/* ------------------------------------------------------------------ */
export function AlertsPanel({ data }: { data: DashboardData }) {
  const [voice, setVoice] = useVoicePref();
  const [perm, setPerm] = useState<string>("default");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const a = data.alerts ?? { hot: 32, cold: 20, repeatMin: 60, channels: { ntfy: false, whatsapp: false, telegram: false } };
  const ch = a.channels;
  const anyPhone = ch.ntfy || ch.whatsapp || ch.telegram;

  useEffect(() => {
    if ("Notification" in window) setPerm(Notification.permission);
  }, []);

  async function test() {
    setBusy(true);
    setMsg(null);
    // on this screen
    if (voice) {
      beep("test");
      setTimeout(() => say("This is a test. Room Temp alerts are working."), 1100);
    }
    notify("🔔 Test alert", "Room Temp alerts are working on this device.");
    // to the phone
    try {
      const res = await fetch("/api/alerts/test", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      setMsg(res.ok ? `✓ Test sent to: ${(j.sent as string[]).join(", ") || "-"}` : `Phone message: ${j.error ?? res.status}`);
    } catch {
      setMsg("Phone message: no connection");
    } finally {
      setBusy(false);
    }
  }

  const Row = ({ ok, label, hint }: { ok: boolean; label: string; hint: string }) => (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span className="text-[var(--ink-1)]">{label}</span>
      <span className={`text-xs ${ok ? "font-semibold text-emerald-300" : "text-[var(--ink-3)]"}`}>{ok ? "● connected" : hint}</span>
    </li>
  );

  return (
    <section className="card-3d min-w-0 rounded-2xl p-4 hover:!translate-y-0">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Temperature alerts</h2>
        <button
          onClick={test}
          disabled={busy}
          className="rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:brightness-110 disabled:opacity-50"
        >
          🔔 Test alert
        </button>
      </header>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="chip-3d rounded-xl border border-red-400/30 bg-red-500/10 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-red-200">🔥 Too hot at</div>
          <div className="text-2xl font-semibold tabular-nums text-white">≥ {a.hot}°C</div>
        </div>
        <div className="chip-3d rounded-xl border border-sky-300/30 bg-sky-500/10 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-200">🥶 Too cold at</div>
          <div className="text-2xl font-semibold tabular-nums text-white">≤ {a.cold}°C</div>
        </div>
      </div>

      <div className="mb-3 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">On this screen</div>
        <label className="chip-3d flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <span className="text-sm text-[var(--ink-1)]">
            🔊 Voice &amp; beep
            <span className="block text-[11px] text-[var(--ink-3)]">Speaks the warning out loud (needs speakers)</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={voice}
            onChange={(e) => {
              setVoice(e.target.checked);
              if (e.target.checked) {
                beep("test"); // a tap unlocks sound in the browser
                setTimeout(() => say("Voice alerts are on."), 1100);
              }
            }}
          />
        </label>
        <div className="chip-3d flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <span className="text-sm text-[var(--ink-1)]">
            🔔 Pop-up notifications
            <span className="block text-[11px] text-[var(--ink-3)]">While this app is open</span>
          </span>
          {perm === "granted" ? (
            <span className="text-xs font-semibold text-emerald-300">● on</span>
          ) : perm === "denied" ? (
            <span className="text-xs text-amber-300">blocked in browser settings</span>
          ) : (
            <button
              onClick={async () => setPerm(await Notification.requestPermission())}
              className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
            >
              Turn on
            </button>
          )}
        </div>
      </div>

      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Messages to your phone (even when the app is closed)</div>
      <ul className="mt-1.5 space-y-1.5 rounded-xl border border-white/5 bg-black/20 px-3 py-2">
        <Row ok={ch.ntfy} label="📲 ntfy app (easiest)" hint="set NTFY_TOPIC" />
        <Row ok={ch.whatsapp} label="💬 WhatsApp" hint="set CALLMEBOT_WHATSAPP" />
        <Row ok={ch.telegram} label="✈️ Telegram" hint="set TELEGRAM_BOT_TOKEN" />
      </ul>
      {!anyPhone && <p className="mt-2 text-[11px] text-[var(--ink-3)]">Set one up in Vercel settings. Steps are in the user guide (?) under “Alerts”.</p>}
      {data.sources.rooms !== "live" && (
        <p className="mt-2 text-[11px] text-amber-300/90">Alerts start when real room sensors send readings (sample data never raises alarms).</p>
      )}
      {msg && <p className="mt-2 text-xs text-[var(--ink-2)]">{msg}</p>}
    </section>
  );
}

/** Small 🔊 on/off button for the wall view header. */
export function VoiceToggle() {
  const [voice, setVoice] = useVoicePref();
  return (
    <button
      onClick={() => {
        const v = !voice;
        setVoice(v);
        if (v) {
          beep("test");
          setTimeout(() => say("Voice alerts are on."), 1100);
        }
      }}
      title={voice ? "Voice alerts on (tap to turn off)" : "Voice alerts off (tap to turn on)"}
      aria-label="Voice alerts"
      aria-pressed={voice}
      className={`grid h-9 w-9 place-items-center rounded-full border text-sm ${voice ? "border-emerald-400/50 bg-emerald-500/20" : "border-[var(--border)] bg-[var(--surface)] opacity-70"}`}
    >
      {voice ? "🔊" : "🔇"}
    </button>
  );
}
