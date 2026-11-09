"use client";

import { useState } from "react";
import type { GasState } from "@/lib/types";

const DAY = 86_400_000;
const fmt = (t: number) => new Date(t).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

export function gasSummary(gas: GasState, now: number) {
  const last = gas.changes.at(-1) ?? now;
  const days = Math.max(0, (now - last) / DAY);
  const pct = Math.max(0, Math.min(100, Math.round((1 - days / gas.typicalDays) * 100)));
  const daysLeft = Math.max(0, Math.round(gas.typicalDays - days));
  const emptyAt = last + gas.typicalDays * DAY;
  const level = pct <= 10 ? "critical" : pct <= 25 ? "low" : "ok";
  return { last, days: Math.floor(days), pct, daysLeft, emptyAt, level, kgLeft: (gas.sizeKg * pct) / 100 };
}

function Ring({ pct, level }: { pct: number; level: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = level === "critical" ? "#d03b3b" : level === "low" ? "#fab219" : "#0ca30c";
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`About ${pct}% gas left`}>
      <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
      <circle
        cx="66"
        cy="66"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 66 66)"
      />
      <text x="66" y="62" textAnchor="middle" className="fill-[var(--ink-1)] text-[26px] font-semibold tabular-nums">
        {pct}%
      </text>
      <text x="66" y="82" textAnchor="middle" className="fill-[var(--ink-3)] text-[10px] uppercase tracking-wider">
        est. left
      </text>
    </svg>
  );
}

function CylinderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 2h6M10 2v2.5M14 2v2.5M7 7a5 5 0 0 1 10 0v12a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3V7ZM7 11h10M7 17h10" />
    </svg>
  );
}

function Soon({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-2.5">
      <span className="text-xl" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--ink-1)]">{title}</div>
        <div className="truncate text-xs text-[var(--ink-3)]">{text}</div>
      </div>
      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Coming soon</span>
    </div>
  );
}

export function UtilitiesPanel({ gas, now, onChanged }: { gas: GasState; now: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const s = gasSummary(gas, now);

  async function send(body: object, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/gas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
      setMsg("Saved ✓");
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const history = gas.changes
    .map((t, i) => ({ t, lasted: i < gas.changes.length - 1 ? Math.round((gas.changes[i + 1] - t) / DAY) : null }))
    .reverse()
    .slice(0, 4);

  return (
    <section className="card-3d min-w-0 rounded-2xl p-4 hover:!translate-y-0">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Utilities</h2>
        {gas.source === "demo" && (
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            Sample data
          </span>
        )}
      </header>

      {/* Gas cylinder */}
      <div className="rounded-2xl bg-black/25 p-4 ring-1 ring-white/5">
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500/15 text-orange-300">
            <CylinderIcon />
          </span>
          <div>
            <div className="font-semibold text-[var(--ink-1)]">Gas cylinder</div>
            <div className="text-xs text-[var(--ink-3)]">{gas.sizeKg} kg LPG · estimate</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Ring pct={s.pct} level={s.level} />
          <div className="min-w-0 flex-1 space-y-1.5 text-sm">
            <div className="text-[var(--ink-2)]">
              Fitted <b className="text-[var(--ink-1)]">{fmt(s.last)}</b> · {s.days} day{s.days === 1 ? "" : "s"} ago
            </div>
            <div className="text-[var(--ink-2)]">
              About <b className="text-[var(--ink-1)]">{s.kgLeft.toFixed(1)} kg</b> · <b className="text-[var(--ink-1)]">{s.daysLeft} days</b> left
            </div>
            <div className="text-[var(--ink-2)]">
              Likely empty around <b className="text-[var(--ink-1)]">{fmt(s.emptyAt)}</b>
            </div>
            <div className="text-xs text-[var(--ink-3)]">
              {gas.learned ? `A cylinder usually lasts ${gas.typicalDays} days here` : `Assuming ${gas.typicalDays} days per cylinder until history builds up`}
            </div>
          </div>
        </div>

        {s.level !== "ok" && (
          <div
            className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${
              s.level === "critical" ? "bg-red-500/15 text-red-200 ring-1 ring-red-500/40" : "bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/40"
            }`}
          >
            {s.level === "critical" ? "⛔ Gas almost finished: order a new cylinder today" : "⚠ Gas running low: order a new cylinder soon"}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            disabled={busy}
            onClick={() => send({ action: "fitted" }, `Record that a new ${gas.sizeKg} kg gas cylinder was fitted today?`)}
            className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
          >
            New cylinder fitted
          </button>
          {gas.source === "live" && (
            <button
              disabled={busy}
              onClick={() => send({ action: "undo" }, "Remove the most recent cylinder record?")}
              className="rounded-full border border-[var(--border)] px-3 py-2 text-xs text-[var(--ink-2)] hover:text-white disabled:opacity-50"
            >
              Undo last
            </button>
          )}
          {msg && <span className="text-xs text-[var(--ink-2)]">{msg}</span>}
        </div>

        {history.length > 1 && (
          <ul className="mt-3 space-y-1 border-t border-white/5 pt-2 text-xs text-[var(--ink-3)]">
            {history.map((h) => (
              <li key={h.t} className="flex justify-between tabular-nums">
                <span>{fmt(h.t)}</span>
                <span>{h.lasted != null ? `lasted ${h.lasted} days` : "current"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <Soon icon="⚡" title="Electricity" text="CEB / LECO meter: to be connected later" />
        <Soon icon="💧" title="Water" text="Water meter / tank level: to be connected later" />
      </div>
    </section>
  );
}
