"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { GasState, UnitData, UtilitiesState, UtilityEntry, UtilityKind } from "@/lib/types";

const DAY = 86_400_000;
const fmt = (t: number) => new Date(t).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
const fmtDay = (k: string) => new Date(k + "T12:00:00").toLocaleDateString([], { day: "numeric", month: "short", year: "2-digit" });
const lkr = (n: number | null) => (n == null ? "—" : `LKR ${Math.round(n).toLocaleString()}`);

export const KIND: Record<UtilityKind, { label: string; icon: string; unit: string; color: string }> = {
  electricity: { label: "Electricity", icon: "⚡", unit: "kWh", color: "#facc15" },
  water: { label: "Water", icon: "💧", unit: "units (m³)", color: "#38bdf8" },
  gas: { label: "Gas", icon: "🔥", unit: "kg", color: "#fb923c" },
};

export const daysIn = (e: UtilityEntry) =>
  Math.max(1, Math.round((Date.parse(e.to + "T00:00:00Z") - Date.parse(e.from + "T00:00:00Z")) / DAY) + 1);

export function gasSummary(gas: GasState, now: number) {
  const last = gas.changes.at(-1) ?? now;
  const days = Math.max(0, (now - last) / DAY);
  const pct = Math.max(0, Math.min(100, Math.round((1 - days / gas.typicalDays) * 100)));
  const daysLeft = Math.max(0, Math.round(gas.typicalDays - days));
  const emptyAt = last + gas.typicalDays * DAY;
  const level = pct <= 10 ? "critical" : pct <= 25 ? "low" : "ok";
  return { last, days: Math.floor(days), pct, daysLeft, emptyAt, level, kgLeft: (gas.sizeKg * pct) / 100 };
}

/** The gas cylinder with the least left (for the summary tile). */
export function lowestGas(gas: GasState[], now: number) {
  return gas
    .map((g) => ({ g, s: gasSummary(g, now) }))
    .sort((a, b) => a.s.pct - b.s.pct)[0];
}

const latest = (entries: UtilityEntry[], unit: string, kind: UtilityKind) => entries.find((e) => e.unit === unit && e.kind === kind);

async function post(url: string, body: object, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: method === "DELETE" ? undefined : JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
  return j;
}

/* ------------------------------------------------------------------ */
function Bar({ pct, level }: { pct: number; level: string }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-white/10 shadow-inner">
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: level === "critical" ? "#d03b3b" : level === "low" ? "#fab219" : "linear-gradient(90deg,#16a34a,#22c55e)" }}
      />
    </div>
  );
}

function Ring({ pct, level }: { pct: number; level: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const color = level === "critical" ? "#d03b3b" : level === "low" ? "#fab219" : "#0ca30c";
  return (
    <svg width="116" height="116" viewBox="0 0 116 116" role="img" aria-label={`About ${pct}% gas left`}>
      <circle cx="58" cy="58" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
      <circle cx="58" cy="58" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 58 58)" />
      <text x="58" y="56" textAnchor="middle" className="fill-[var(--ink-1)] text-[22px] font-semibold tabular-nums">
        {pct}%
      </text>
      <text x="58" y="74" textAnchor="middle" className="fill-[var(--ink-3)] text-[9px] uppercase tracking-wider">
        est. left
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Add record form (modal)                                             */
/* ------------------------------------------------------------------ */
export function EnergyForm({
  units,
  defaultUnit,
  onClose,
  onSaved,
}: {
  units: UnitData[];
  defaultUnit?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const monthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const firstUnit = units.find((u) => u.id === defaultUnit) ?? units[0];
  const [f, setF] = useState({
    unit: firstUnit?.id ?? "",
    kind: "electricity" as UtilityKind,
    from: iso(monthStart),
    to: iso(monthEnd),
    amount: "",
    cost: "",
    customer: firstUnit?.owner ?? "",
    account: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const days = f.from && f.to ? Math.max(1, Math.round((Date.parse(f.to) - Date.parse(f.from)) / DAY) + 1) : null;
  const perDay = days && f.amount ? Number(f.amount) / days : null;

  const input = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-sky-500/50 focus:ring-2";
  const label = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]";

  // Rendered into <body> so no transformed parent card can trap the overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            await post("/api/utilities", { ...f, amount: Number(f.amount), cost: f.cost === "" ? null : Number(f.cost) });
            onSaved();
            onClose();
          } catch (x) {
            setErr(x instanceof Error ? x.message : "Could not save");
          } finally {
            setBusy(false);
          }
        }}
        className="card-3d max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 hover:!translate-y-0"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Add energy record</h2>
          <button type="button" onClick={onClose} className="rounded-full px-2 text-xl text-[var(--ink-3)] hover:text-white" aria-label="Close">
            ×
          </button>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2">
          {(Object.keys(KIND) as UtilityKind[]).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => set("kind", k)}
              className={`chip-3d rounded-xl border px-2 py-2 text-sm font-semibold ${
                f.kind === k ? "border-sky-400/60 bg-sky-500/20 text-white" : "border-white/10 bg-black/30 text-[var(--ink-2)]"
              }`}
            >
              {KIND[k].icon} {KIND[k].label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={label} htmlFor="ef-unit">Unit</label>
            <select
              id="ef-unit"
              className={input}
              value={f.unit}
              onChange={(e) => {
                const u = units.find((x) => x.id === e.target.value);
                setF((p) => ({ ...p, unit: e.target.value, customer: p.customer && p.customer !== (units.find((x) => x.id === p.unit)?.owner ?? "") ? p.customer : u?.owner ?? "" }));
              }}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.owner ?? u.usage ?? u.note}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ef-from">From</label>
            <input id="ef-from" type="date" required className={input} value={f.from} onChange={(e) => set("from", e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="ef-to">To</label>
            <input id="ef-to" type="date" required min={f.from} className={input} value={f.to} onChange={(e) => set("to", e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="ef-amount">Used ({KIND[f.kind].unit})</label>
            <input id="ef-amount" type="number" step="any" min="0" required inputMode="decimal" className={input} value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder={f.kind === "gas" ? "12.5" : ""} />
          </div>
          <div>
            <label className={label} htmlFor="ef-cost">Cost (LKR)</label>
            <input id="ef-cost" type="number" step="any" min="0" inputMode="decimal" className={input} value={f.cost} onChange={(e) => set("cost", e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label className={label} htmlFor="ef-customer">Customer</label>
            <input id="ef-customer" className={input} value={f.customer} onChange={(e) => set("customer", e.target.value)} placeholder="Name on the bill" />
          </div>
          <div>
            <label className={label} htmlFor="ef-account">Account no.</label>
            <input id="ef-account" className={input} value={f.account} onChange={(e) => set("account", e.target.value)} placeholder="CEB / water a/c no." />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="ef-note">Note</label>
            <input id="ef-note" className={input} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. meter 12345 → 12590" />
          </div>
        </div>

        {days && (
          <p className="mt-3 text-xs text-[var(--ink-2)]">
            {days} days{perDay != null && Number.isFinite(perDay) ? ` · ${perDay.toFixed(2)} ${KIND[f.kind].unit.split(" ")[0]} per day` : ""}
          </p>
        )}
        {err && <p className="mt-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 text-sm text-[var(--ink-2)] hover:text-white">
            Cancel
          </button>
          <button disabled={busy} className="rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-lg hover:brightness-110 disabled:opacity-50">
            {busy ? "Saving…" : "Save record"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Utilities panel                                                     */
/* ------------------------------------------------------------------ */
function LatestLine({ e, kind }: { e: UtilityEntry | undefined; kind: UtilityKind }) {
  const k = KIND[kind];
  if (!e) return <span className="text-[var(--ink-3)]">{k.icon} no record yet</span>;
  return (
    <span className="tabular-nums">
      {k.icon} <b className="text-[var(--ink-1)]">{(e.amount / daysIn(e)).toFixed(1)}</b>
      <span className="text-[var(--ink-3)]">/day</span> · {lkr(e.cost)}
    </span>
  );
}

export function UtilitiesPanel({
  gas,
  utilities,
  units,
  unitId,
  now,
  onChanged,
}: {
  gas: GasState[];
  utilities: UtilitiesState;
  units: UnitData[];
  unitId: string | null;
  now: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const demo = utilities.source === "demo" || gas.some((g) => g.source === "demo");

  async function gasAction(unit: string, action: "fitted" | "undo", confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      await post("/api/gas", { unit, action });
      setMsg("Saved ✓");
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const one = unitId ? gas.find((g) => g.unit === unitId) : null;
  const unitName = unitId ? units.find((u) => u.id === unitId)?.name : null;

  return (
    <section className="card-3d min-w-0 rounded-2xl p-4 hover:!translate-y-0">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">{unitName ? `${unitName} · energy` : "Energy · gas, electricity, water"}</h2>
        <div className="flex items-center gap-2">
          {demo && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">Sample data</span>
          )}
          <button onClick={() => setForm(true)} className="rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:brightness-110">
            + Add record
          </button>
        </div>
      </header>

      {one ? (
        <UnitEnergy g={one} utilities={utilities} now={now} busy={busy} onGas={gasAction} />
      ) : unitId ? (
        <p className="text-sm text-[var(--ink-3)]">No gas cylinder in this unit.</p>
      ) : (
        <div className="space-y-2">
          {units.map((u) => {
            const g = gas.find((x) => x.unit === u.id);
            const s = g ? gasSummary(g, now) : null;
            return (
              <div key={u.id} className="chip-3d grid grid-cols-[64px_1fr] items-center gap-2 rounded-xl border border-white/5 bg-black/25 px-3 py-2">
                <b className="text-sm text-[var(--ink-1)]">{u.name}</b>
                <div className="min-w-0 space-y-1 text-xs text-[var(--ink-2)]">
                  {s ? (
                    <div className="flex items-center gap-2">
                      <span className="w-16 shrink-0">🔥 Gas {s.pct}%</span>
                      <div className="min-w-0 flex-1">
                        <Bar pct={s.pct} level={s.level} />
                      </div>
                      <span className={`shrink-0 tabular-nums ${s.level !== "ok" ? "font-semibold text-amber-300" : ""}`}>{s.daysLeft}d left</span>
                    </div>
                  ) : (
                    <div className="text-[var(--ink-3)]">🔥 no cylinder</div>
                  )}
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <LatestLine e={latest(utilities.entries, u.id, "electricity")} kind="electricity" />
                    <LatestLine e={latest(utilities.entries, u.id, "water")} kind="water" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-[var(--ink-2)]">{msg}</p>}
      {form && <EnergyForm units={units} defaultUnit={unitId ?? undefined} onClose={() => setForm(false)} onSaved={onChanged} />}
    </section>
  );
}

function UnitEnergy({
  g,
  utilities,
  now,
  busy,
  onGas,
}: {
  g: GasState;
  utilities: UtilitiesState;
  now: number;
  busy: boolean;
  onGas: (unit: string, action: "fitted" | "undo", confirmText: string) => void;
}) {
  const s = gasSummary(g, now);
  const history = g.changes
    .map((t, i) => ({ t, lasted: i < g.changes.length - 1 ? Math.round((g.changes[i + 1] - t) / DAY) : null }))
    .reverse()
    .slice(0, 3);
  return (
    <div className="space-y-3">
      <div className="chip-3d rounded-2xl border border-white/5 bg-black/25 p-3">
        <div className="mb-1 font-semibold text-[var(--ink-1)]">🔥 Gas cylinder · {g.sizeKg} kg LPG</div>
        <div className="flex flex-wrap items-center gap-3">
          <Ring pct={s.pct} level={s.level} />
          <div className="min-w-0 flex-1 space-y-1 text-sm text-[var(--ink-2)]">
            <div>
              Fitted <b className="text-[var(--ink-1)]">{fmt(s.last)}</b> · {s.days} days ago
            </div>
            <div>
              ≈ <b className="text-[var(--ink-1)]">{s.kgLeft.toFixed(1)} kg</b> · <b className="text-[var(--ink-1)]">{s.daysLeft} days</b> left
            </div>
            <div>
              Empty around <b className="text-[var(--ink-1)]">{fmt(s.emptyAt)}</b>
            </div>
            <div className="text-xs text-[var(--ink-3)]">{g.learned ? `Usually lasts ${g.typicalDays} days` : `Assuming ${g.typicalDays} days per cylinder`}</div>
          </div>
        </div>
        {s.level !== "ok" && (
          <div className={`mt-2 rounded-xl px-3 py-2 text-sm font-semibold ${s.level === "critical" ? "bg-red-500/15 text-red-200" : "bg-amber-400/15 text-amber-200"}`}>
            {s.level === "critical" ? "⛔ Gas almost finished: order today" : "⚠ Gas running low: order soon"}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            disabled={busy}
            onClick={() => onGas(g.unit, "fitted", `Record a new ${g.sizeKg} kg cylinder fitted in ${g.unitName} today?`)}
            className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-1.5 text-sm font-semibold text-white shadow hover:brightness-110 disabled:opacity-50"
          >
            New cylinder fitted
          </button>
          {g.source === "live" && (
            <button disabled={busy} onClick={() => onGas(g.unit, "undo", "Remove the most recent cylinder record?")} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[var(--ink-2)] hover:text-white">
              Undo last
            </button>
          )}
        </div>
        {history.length > 1 && (
          <ul className="mt-2 space-y-0.5 border-t border-white/5 pt-2 text-xs text-[var(--ink-3)]">
            {history.map((h) => (
              <li key={h.t} className="flex justify-between tabular-nums">
                <span>{fmt(h.t)}</span>
                <span>{h.lasted != null ? `lasted ${h.lasted} days` : "current"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["electricity", "water"] as const).map((k) => {
          const e = latest(utilities.entries, g.unit, k);
          return (
            <div key={k} className="chip-3d rounded-xl border border-white/5 bg-black/25 p-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: KIND[k].color }}>
                {KIND[k].icon} {KIND[k].label}
              </div>
              {e ? (
                <>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--ink-1)]">
                    {e.amount} <span className="text-xs font-normal text-[var(--ink-3)]">{KIND[k].unit.split(" ")[0]}</span>
                  </div>
                  <div className="text-xs text-[var(--ink-2)]">
                    {fmtDay(e.from)} → {fmtDay(e.to)}
                  </div>
                  <div className="text-xs text-[var(--ink-2)]">
                    {(e.amount / daysIn(e)).toFixed(1)}/day · {lkr(e.cost)}
                  </div>
                </>
              ) : (
                <div className="mt-1 text-xs text-[var(--ink-3)]">No record yet. Use + Add record.</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Print & export                                                      */
/* ------------------------------------------------------------------ */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function printRecords(rows: UtilityEntry[], title: string, name: (id: string) => string, location: string) {
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) {
    window.alert("Please allow pop-ups for this site to print.");
    return;
  }
  const total = rows.reduce((a, e) => a + (e.cost ?? 0), 0);
  const byKind = (Object.keys(KIND) as UtilityKind[])
    .map((k) => {
      const r = rows.filter((e) => e.kind === k);
      return r.length
        ? `<div class="sum"><b>${KIND[k].label}</b><span>${r.reduce((a, e) => a + e.amount, 0).toLocaleString()} ${KIND[k].unit.split(" ")[0]}</span><span>${lkr(r.reduce((a, e) => a + (e.cost ?? 0), 0))}</span></div>`
        : "";
    })
    .join("");
  const body = rows
    .map(
      (e) => `<tr>
        <td>${esc(name(e.unit))}</td><td>${KIND[e.kind].label}</td>
        <td>${fmtDay(e.from)}</td><td>${fmtDay(e.to)}</td><td class="n">${daysIn(e)}</td>
        <td class="n">${e.amount} ${KIND[e.kind].unit.split(" ")[0]}</td><td class="n">${(e.amount / daysIn(e)).toFixed(2)}</td>
        <td class="n">${lkr(e.cost)}</td><td>${esc(e.customer || "")}</td><td>${esc(e.account || "")}</td><td>${esc(e.note || "")}</td>
      </tr>`,
    )
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:24px}
    h1{font-size:20px;margin:0} .meta{color:#555;font-size:12px;margin:4px 0 16px}
    .sums{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px}
    .sum{border:1px solid #ccc;border-radius:8px;padding:8px 12px;display:flex;flex-direction:column;font-size:12px;min-width:150px}
    .sum b{font-size:13px}
    table{width:100%;border-collapse:collapse;font-size:11px} th,td{border:1px solid #bbb;padding:5px 6px;text-align:left;vertical-align:top}
    th{background:#eee;text-transform:uppercase;font-size:10px;letter-spacing:.04em} .n{text-align:right;white-space:nowrap}
    tfoot td{font-weight:700;background:#f6f6f6} .sign{margin-top:40px;display:flex;gap:60px;font-size:12px}
    .sign div{border-top:1px solid #333;padding-top:4px;width:220px}
    @media print{body{margin:10mm} button{display:none}} @page{size:A4 landscape;margin:10mm}
    button{margin-bottom:12px;padding:8px 16px;font-size:14px;cursor:pointer}
  </style></head><body>
  <button onclick="window.print()">🖨 Print / Save as PDF</button>
  <h1>${esc(title)}</h1>
  <div class="meta">${esc(location)} · ${rows.length} records · printed ${new Date().toLocaleString()}</div>
  <div class="sums">${byKind}<div class="sum"><b>Total cost</b><span>${lkr(total)}</span></div></div>
  <table><thead><tr><th>Unit</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Used</th><th>Per day</th><th>Cost</th><th>Customer</th><th>Account</th><th>Note</th></tr></thead>
  <tbody>${body || '<tr><td colspan="11">No records</td></tr>'}</tbody>
  <tfoot><tr><td colspan="7" class="n">Total</td><td class="n">${lkr(total)}</td><td colspan="3"></td></tr></tfoot></table>
  <div class="sign"><div>Prepared by</div><div>Checked by</div><div>Date</div></div>
  <script>setTimeout(function(){window.print()},300)</script>
  </body></html>`);
  w.document.close();
}

function downloadCsv(rows: UtilityEntry[], name: (id: string) => string, filename: string) {
  const q = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Unit", "Type", "From", "To", "Days", "Used", "Measure", "Per day", "Cost (LKR)", "Customer", "Account no", "Note"];
  const lines = rows.map((e) =>
    [name(e.unit), KIND[e.kind].label, e.from, e.to, daysIn(e), e.amount, KIND[e.kind].unit.split(" ")[0], (e.amount / daysIn(e)).toFixed(2), e.cost, e.customer, e.account, e.note]
      .map(q)
      .join(","),
  );
  // BOM so Excel opens UTF-8 correctly
  const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ------------------------------------------------------------------ */
/* Energy records list                                                 */
/* ------------------------------------------------------------------ */
export function EnergyRecords({
  utilities,
  units,
  unitId,
  location,
  onChanged,
}: {
  utilities: UtilitiesState;
  units: UnitData[];
  unitId: string | null;
  location: string;
  onChanged: () => void;
}) {
  const [unit, setUnit] = useState<string>(unitId ?? "all");
  const [kind, setKind] = useState<UtilityKind | "all">("all");
  const [form, setForm] = useState(false);
  const rows = useMemo(
    () => utilities.entries.filter((e) => (unit === "all" || e.unit === unit) && (kind === "all" || e.kind === kind)),
    [utilities.entries, unit, kind],
  );
  const total = rows.reduce((a, e) => a + (e.cost ?? 0), 0);
  const name = (id: string) => units.find((u) => u.id === id)?.name ?? id;

  async function remove(e: UtilityEntry) {
    if (!window.confirm(`Delete this ${KIND[e.kind].label.toLowerCase()} record for ${name(e.unit)} (${fmtDay(e.from)} → ${fmtDay(e.to)})?`)) return;
    try {
      await post(`/api/utilities?id=${encodeURIComponent(e.id)}`, {}, "DELETE");
      onChanged();
    } catch (x) {
      window.alert(x instanceof Error ? x.message : "Could not delete");
    }
  }

  const sel = "rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white";
  return (
    <section className="card-3d min-w-0 rounded-2xl p-4 hover:!translate-y-0">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Energy records</h2>
        <div className="flex flex-wrap items-center gap-2">
          {utilities.source === "demo" && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">Sample data</span>
          )}
          <select aria-label="Filter by unit" className={sel} value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="all">All units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select aria-label="Filter by type" className={sel} value={kind} onChange={(e) => setKind(e.target.value as UtilityKind | "all")}>
            <option value="all">All types</option>
            {(Object.keys(KIND) as UtilityKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND[k].label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const t = `Energy records · ${unit === "all" ? "All units" : name(unit)} · ${kind === "all" ? "All types" : KIND[kind].label}`;
              printRecords(rows, t, name, location);
            }}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            🖨 Print
          </button>
          <button
            onClick={() => downloadCsv(rows, name, `energy-records-${unit}-${kind}-${new Date().toISOString().slice(0, 10)}.csv`)}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            ⬇ Excel (CSV)
          </button>
          <button onClick={() => setForm(true)} className="rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:brightness-110">
            + Add record
          </button>
        </div>
      </header>
      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-black/30 text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
            <tr>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">To</th>
              <th className="px-3 py-2 text-right">Days</th>
              <th className="px-3 py-2 text-right">Used</th>
              <th className="px-3 py-2 text-right">Per day</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Note</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-[var(--ink-3)]">
                  No records yet. Press + Add record.
                </td>
              </tr>
            )}
            {rows.map((e) => (
              <tr key={e.id} className="border-t border-white/5 odd:bg-white/[0.02] hover:bg-white/[0.05]">
                <td className="px-3 py-2 font-medium text-[var(--ink-1)]">{name(e.unit)}</td>
                <td className="px-3 py-2">
                  <span style={{ color: KIND[e.kind].color }}>{KIND[e.kind].icon}</span> {KIND[e.kind].label}
                </td>
                <td className="px-3 py-2">{fmtDay(e.from)}</td>
                <td className="px-3 py-2">{fmtDay(e.to)}</td>
                <td className="px-3 py-2 text-right">{daysIn(e)}</td>
                <td className="px-3 py-2 text-right text-[var(--ink-1)]">
                  {e.amount} <span className="text-xs text-[var(--ink-3)]">{KIND[e.kind].unit.split(" ")[0]}</span>
                </td>
                <td className="px-3 py-2 text-right">{(e.amount / daysIn(e)).toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-[var(--ink-1)]">{lkr(e.cost)}</td>
                <td className="max-w-40 truncate px-3 py-2">{e.customer || "—"}</td>
                <td className="px-3 py-2 text-[var(--ink-3)]">{e.account || "—"}</td>
                <td className="max-w-48 truncate px-3 py-2 text-[var(--ink-3)]" title={e.note}>
                  {e.note || "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {utilities.source === "live" && (
                    <button onClick={() => remove(e)} className="rounded px-2 text-[var(--ink-3)] hover:text-red-300" aria-label="Delete record" title="Delete">
                      🗑
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t border-white/10 bg-black/30 text-sm">
              <tr>
                <td colSpan={7} className="px-3 py-2 text-right text-[var(--ink-3)]">
                  Total cost ({rows.length} records)
                </td>
                <td className="px-3 py-2 text-right font-semibold text-[var(--ink-1)]">{lkr(total)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {form && <EnergyForm units={units} defaultUnit={unit !== "all" ? unit : undefined} onClose={() => setForm(false)} onSaved={onChanged} />}
    </section>
  );
}
