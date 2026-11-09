"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { sendOrQueue } from "@/lib/outbox";
import type { GasState, ServiceStatus, Services, UnitData, UtilitiesState, UtilityEntry, UtilityKind } from "@/lib/types";

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

/** Labels and colours for the three service statuses. */
export const STATUS: Record<ServiceStatus, { label: string; short: string; long: string; active: string; chip: string }> = {
  in_use: {
    label: "In use",
    short: "in use",
    long: "In use",
    active: "border-emerald-400/60 bg-emerald-500/20 text-emerald-100",
    chip: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  },
  on_request: {
    label: "On request",
    short: "on request",
    long: "On request · provided whenever a tenant needs it",
    active: "border-sky-400/60 bg-sky-500/20 text-sky-100",
    chip: "border-sky-400/40 bg-sky-500/15 text-sky-200",
  },
  off: {
    label: "Not in use now",
    short: "not in use",
    long: "Not in use now · can be added any time",
    active: "border-amber-400/60 bg-amber-500/20 text-amber-100",
    chip: "border-dashed border-white/15 bg-black/25 text-[var(--ink-3)]",
  },
};
const NEXT_STATUS: Record<ServiceStatus, ServiceStatus> = { in_use: "on_request", on_request: "off", off: "in_use" };

const latest = (entries: UtilityEntry[], unit: string, kind: UtilityKind) => entries.find((e) => e.unit === unit && e.kind === kind);

/** Save to the server, or, when offline, keep it on this device and sync later. */
function post(url: string, body: object, method = "POST") {
  return sendOrQueue(url, method, method === "DELETE" ? null : body);
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
  services,
  defaultUnit,
  onClose,
  onSaved,
}: {
  units: UnitData[];
  services: Services; // which services each unit uses
  defaultUnit?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const monthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const firstUnit = units.find((u) => u.id === defaultUnit) ?? units[0];
  const KINDS = Object.keys(KIND) as UtilityKind[];
  const [f, setF] = useState({
    unit: firstUnit?.id ?? "",
    from: iso(monthStart),
    to: iso(monthEnd),
    customer: firstUnit?.owner ?? "",
    account: "",
    note: "",
  });
  // checklist: which services this record covers, each with its own amount + cost
  // nothing pre-ticked: only services the user ticks ask for an amount
  const [picked, setPicked] = useState<Record<UtilityKind, boolean>>({ electricity: false, water: false, gas: false });
  const [amount, setAmount] = useState<Record<UtilityKind, string>>({ electricity: "", water: "", gas: "12.5" });
  const [cost, setCost] = useState<Record<UtilityKind, string>>({ electricity: "", water: "", gas: "" });
  // "Status in this unit" field: In use / On request / Not in use now ("" = leave as it is)
  const [statusSel, setStatusSel] = useState<Record<UtilityKind, "" | ServiceStatus>>({ electricity: "", water: "", gas: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const days = f.from && f.to ? Math.max(1, Math.round((Date.parse(f.to) - Date.parse(f.from)) / DAY) + 1) : null;
  const chosen = KINDS.filter((k) => picked[k]);
  const totalCost = chosen.reduce((a, k) => a + (Number(cost[k]) || 0), 0);

  const input = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-sky-500/50 focus:ring-2";
  const label = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]";

  // Rendered into <body> so no transformed parent card can trap the overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          const statusChanges = KINDS.filter((k) => statusSel[k] !== "");
          if (!chosen.length && !statusChanges.length) {
            setErr("Tick a service to add its bill, or choose a status (In use / On request / Not in use now)");
            return;
          }
          const missing = chosen.filter((k) => amount[k].trim() === "");
          if (missing.length) {
            setErr(`Enter “Used” for ${missing.map((k) => KIND[k].label).join(" and ")}, or untick it`);
            return;
          }
          setBusy(true);
          setErr(null);
          try {
            // one record per ticked service
            for (const k of chosen) {
              await post("/api/utilities", { ...f, kind: k, amount: Number(amount[k]), cost: cost[k] === "" ? null : Number(cost[k]) });
            }
            // status chosen for this unit (saved after the records, so it wins)
            for (const k of statusChanges) {
              await post("/api/services", { unit: f.unit, kind: k, status: statusSel[k] });
            }
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

        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]">Services · tick one or more</div>
        <div className="mb-2 grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <ServiceCheck
              key={k}
              kind={k}
              on={picked[k]}
              busy={busy}
              compact
              onChange={(on) => {
                setPicked((p) => ({ ...p, [k]: on }));
                if (on && statusSel[k] === "off") setStatusSel((p) => ({ ...p, [k]: "" }));
              }}
            />
          ))}
        </div>
        <div className="mb-3 rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-2">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]">
            Status in this unit <span className="normal-case tracking-normal">(optional · now: {KINDS.map((k) => `${KIND[k].icon} ${STATUS[services[f.unit]?.[k] ?? "off"].short}`).join("  ")})</span>
          </div>
          <div className="space-y-1.5">
            {KINDS.map((k) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-sm text-[var(--ink-2)]">
                  {KIND[k].icon} {KIND[k].label}
                </span>
                <div className="grid flex-1 grid-cols-3 gap-1">
                  {(["in_use", "on_request", "off"] as const).map((s) => (
                    <label
                      key={s}
                      className={`flex cursor-pointer items-center justify-center gap-1 rounded-lg border px-1.5 py-1 text-center text-[11px] font-semibold ${
                        statusSel[k] === s ? STATUS[s].active : "border-white/10 text-[var(--ink-3)] hover:text-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={statusSel[k] === s}
                        disabled={busy}
                        onChange={(e) => {
                          const v = e.target.checked ? s : "";
                          setStatusSel((p) => ({ ...p, [k]: v }));
                          // not in use → no bill for it, so no "Used" amount is asked
                          if (v === "off") setPicked((p) => ({ ...p, [k]: false }));
                        }}
                      />
                      {statusSel[k] === s ? "☑" : "☐"} {STATUS[s].label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
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
            {chosen.some((k) => services[f.unit]?.[k] === "off" && statusSel[k] === "") && (
              <p className="mt-1 text-[11px] text-amber-300">
                Not in use yet in this unit: {chosen.filter((k) => services[f.unit]?.[k] === "off").map((k) => KIND[k].label).join(", ")}. Saving marks it “In use”
                (or pick “On request” below).
              </p>
            )}
          </div>
          <div>
            <label className={label} htmlFor="ef-from">From</label>
            <input id="ef-from" type="date" required className={input} value={f.from} onChange={(e) => set("from", e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="ef-to">To</label>
            <input id="ef-to" type="date" required min={f.from} className={input} value={f.to} onChange={(e) => set("to", e.target.value)} />
          </div>
          {chosen.length === 0 && (
            <p className="col-span-2 rounded-xl border border-dashed border-white/10 px-3 py-2 text-xs text-[var(--ink-3)]">
              Tick ⚡ Electricity, 💧 Water or 🔥 Gas above to enter a bill. To only mark a service as not used, tick it under “Not in use now” and save.
            </p>
          )}
          {chosen.map((k) => (
            <div key={k} className="col-span-2 grid grid-cols-2 gap-3 rounded-xl border border-white/5 bg-black/20 p-2.5">
              <div className="col-span-2 -mb-1 text-xs font-semibold" style={{ color: KIND[k].color }}>
                {KIND[k].icon} {KIND[k].label}
                {days && Number(amount[k]) > 0 && (
                  <span className="ml-2 font-normal text-[var(--ink-3)]">
                    {(Number(amount[k]) / days).toFixed(2)} {KIND[k].unit.split(" ")[0]}/day
                  </span>
                )}
              </div>
              <div>
                <label className={label} htmlFor={`ef-amount-${k}`}>Used ({KIND[k].unit})</label>
                <input
                  id={`ef-amount-${k}`}
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  className={input}
                  value={amount[k]}
                  onChange={(e) => setAmount((p) => ({ ...p, [k]: e.target.value }))}
                />
              </div>
              <div>
                <label className={label} htmlFor={`ef-cost-${k}`}>Cost (LKR)</label>
                <input
                  id={`ef-cost-${k}`}
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  className={input}
                  value={cost[k]}
                  onChange={(e) => setCost((p) => ({ ...p, [k]: e.target.value }))}
                  placeholder="optional"
                />
              </div>
            </div>
          ))}
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
            {days} days · {chosen.length} record{chosen.length === 1 ? "" : "s"}
            {totalCost > 0 && ` · total LKR ${Math.round(totalCost).toLocaleString()}`}
          </p>
        )}
        {err && <p className="mt-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 text-sm text-[var(--ink-2)] hover:text-white">
            Cancel
          </button>
          <button disabled={busy} className="rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-lg hover:brightness-110 disabled:opacity-50">
            {busy ? "Saving…" : chosen.length > 1 ? `Save ${chosen.length} records` : chosen.length === 1 ? "Save record" : "Save"}
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
  services,
  now,
  onChanged,
}: {
  gas: GasState[];
  utilities: UtilitiesState;
  units: UnitData[];
  unitId: string | null;
  services: Services;
  now: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [fitting, setFitting] = useState<GasState | null>(null);
  const demo = utilities.source === "demo" || gas.some((g) => g.source === "demo");

  async function setStatus(unit: string, kind: UtilityKind, status: ServiceStatus) {
    const name = units.find((u) => u.id === unit)?.name ?? unit;
    if (!window.confirm(`${name}: set ${KIND[kind].label.toLowerCase()} to “${STATUS[status].label}”? (records are kept)`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await post("/api/services", { unit, kind, status });
      setMsg("Saved ✓");
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function undoGas(unit: string) {
    if (!window.confirm("Remove the most recent cylinder record?")) return;
    setBusy(true);
    setMsg(null);
    try {
      await post("/api/gas", { unit, action: "undo" });
      setMsg("Removed ✓");
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const one = unitId ? gas.find((g) => g.unit === unitId) : null;
  // a blank tracker for a unit that starts using gas (its first cylinder turns tracking on)
  const startGas = (id: string): GasState => ({
    unit: id,
    unitName: units.find((u) => u.id === id)?.name ?? id,
    source: "live",
    canRecord: utilities.canRecord,
    sizeKg: gas[0]?.sizeKg ?? 12.5,
    changes: [],
    typicalDays: gas[0]?.typicalDays ?? 90,
    learned: false,
  });
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

      {unitId && <ServiceSwitches unit={unitId} services={services} busy={busy} onSet={setStatus} />}

      {one ? (
        <UnitEnergy g={one} utilities={utilities} services={services} now={now} busy={busy} onFitted={() => setFitting(one)} onUndo={() => undoGas(one.unit)} />
      ) : unitId ? (
        <NoGasUnit unitId={unitId} utilities={utilities} services={services} onStart={() => setFitting(startGas(unitId))} />
      ) : (
        <div className="space-y-2">
          {units.map((u) => {
            const g = gas.find((x) => x.unit === u.id);
            const s = g ? gasSummary(g, now) : null;
            return (
              <div key={u.id} className="chip-3d grid grid-cols-[64px_1fr] items-center gap-2 rounded-xl border border-white/5 bg-black/25 px-3 py-2">
                <b className="text-sm text-[var(--ink-1)]">{u.name}</b>
                <div className="min-w-0 space-y-1.5 text-xs text-[var(--ink-2)]">
                  <ServiceSwitches unit={u.id} services={services} busy={busy} onSet={setStatus} compact />
                  {s && g ? (
                    <div className="flex items-center gap-2">
                      <span className="w-16 shrink-0">🔥 Gas {s.pct}%</span>
                      <div className="min-w-0 flex-1">
                        <Bar pct={s.pct} level={s.level} />
                      </div>
                      <span className={`shrink-0 tabular-nums ${s.level !== "ok" ? "font-semibold text-amber-300" : ""}`}>{s.daysLeft}d left</span>
                      <button
                        onClick={() => setFitting(g)}
                        className="shrink-0 rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-semibold text-orange-200 ring-1 ring-orange-400/40 hover:bg-orange-500/30"
                        title="Record a new cylinder (date, cost)"
                      >
                        + New cylinder
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 text-[var(--ink-3)]">
                      <span>{services[u.id]?.gas === "on_request" ? "🔥 Gas: on request · no cylinder yet" : "🔥 Gas: not in use now · can be added any time"}</span>
                      <button
                        onClick={() => setFitting(startGas(u.id))}
                        className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-orange-200 ring-1 ring-white/10 hover:bg-orange-500/20"
                        title="This unit starts using gas: record its first cylinder"
                      >
                        🔥 Start gas
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap justify-between gap-x-3">
                    {(["electricity", "water"] as const).map((k) =>
                      services[u.id]?.[k] === "off" ? (
                        <span key={k} className="text-[var(--ink-3)]">
                          {KIND[k].icon} not in use now
                        </span>
                      ) : (
                        <span key={k}>
                          <LatestLine e={latest(utilities.entries, u.id, k)} kind={k} />
                          {services[u.id]?.[k] === "on_request" && <span className="ml-1 text-[10px] font-semibold text-sky-300">◐ on request</span>}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-[var(--ink-2)]">{msg}</p>}
      {form && <EnergyForm units={units} services={services} defaultUnit={unitId ?? undefined} onClose={() => setForm(false)} onSaved={onChanged} />}
      {fitting && (
        <GasFittedForm
          g={fitting}
          customer={units.find((u) => u.id === fitting.unit)?.owner ?? ""}
          onClose={() => setFitting(null)}
          onSaved={() => {
            setMsg("New cylinder saved ✓");
            onChanged();
          }}
        />
      )}
    </section>
  );
}

/** One checklist box: ticked = service in use, unticked = not in use (available on request). */
function ServiceCheck({
  kind,
  on,
  busy,
  onChange,
  compact = false,
}: {
  kind: UtilityKind;
  on: boolean;
  busy: boolean;
  onChange: (on: boolean) => void;
  compact?: boolean;
}) {
  return (
    <label
      className={`chip-3d flex cursor-pointer select-none items-center gap-2 rounded-xl border transition ${busy ? "opacity-50" : ""} ${
        on ? "border-emerald-400/40 bg-emerald-500/15" : "border-dashed border-white/15 bg-black/25"
      } ${compact ? "px-2 py-1" : "px-3 py-2"}`}
      title={on ? `${KIND[kind].label}: in use (untick if not used)` : `${KIND[kind].label}: not in use, available on request (tick when used)`}
    >
      <input type="checkbox" className="peer sr-only" checked={on} disabled={busy} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center rounded-md border-2 font-bold peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 ${
          compact ? "h-4 w-4 text-[10px]" : "h-5 w-5 text-xs"
        } ${on ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/30 bg-transparent text-transparent"}`}
      >
        ✓
      </span>
      <span className="min-w-0">
        <span className={`block font-semibold text-[var(--ink-1)] ${compact ? "text-[11px]" : "text-sm"}`}>
          {KIND[kind].icon} {KIND[kind].label}
        </span>
        {!compact && <span className={`block text-[11px] ${on ? "text-emerald-300" : "text-[var(--ink-3)]"}`}>{on ? "In use" : "Not in use now"}</span>}
      </span>
    </label>
  );
}

/**
 * Services checklist for one unit: each service is ● In use, ◐ On request
 * (provided whenever a tenant needs it) or ○ Not in use now.
 * Full size: three tick-boxes per service. Compact: a chip that cycles on tap.
 */
function ServiceSwitches({
  unit,
  services,
  busy,
  onSet,
  compact = false,
}: {
  unit: string;
  services: Services;
  busy: boolean;
  onSet: (unit: string, kind: UtilityKind, status: ServiceStatus) => void;
  compact?: boolean;
}) {
  const icon: Record<ServiceStatus, string> = { in_use: "●", on_request: "◐", off: "○" };
  if (compact) {
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {(["electricity", "water", "gas"] as const).map((k) => {
          const st = services[unit]?.[k] ?? "off";
          return (
            <button
              key={k}
              disabled={busy}
              onClick={() => onSet(unit, k, NEXT_STATUS[st])}
              title={`${KIND[k].label}: ${STATUS[st].long}. Tap to change.`}
              className={`chip-3d truncate rounded-lg border px-2 py-1 text-left text-[11px] font-semibold disabled:opacity-50 ${STATUS[st].chip}`}
            >
              {KIND[k].icon} {icon[st]} {STATUS[st].label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Services checklist · tick the status for each</div>
      <div className="space-y-1.5">
        {(["electricity", "water", "gas"] as const).map((k) => {
          const st = services[unit]?.[k] ?? "off";
          return (
            <div key={k} className="chip-3d flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-black/25 px-3 py-2">
              <span className="w-28 shrink-0 text-sm font-semibold text-[var(--ink-1)]">
                {KIND[k].icon} {KIND[k].label}
              </span>
              <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5">
                {(["in_use", "on_request", "off"] as const).map((s) => (
                  <label
                    key={s}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                      st === s ? STATUS[s].active : "border-white/10 text-[var(--ink-3)] hover:text-white"
                    } ${busy ? "opacity-50" : ""}`}
                  >
                    <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={st === s} disabled={busy || st === s} onChange={() => onSet(unit, k, s)} />
                    {STATUS[s].label}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--ink-3)]">On request = provided whenever a tenant needs it. Any service can be added to any unit at any time.</p>
    </div>
  );
}

/** Electricity + water latest-record cards for one unit. */
function ElecWater({ unit, utilities, services }: { unit: string; utilities: UtilitiesState; services: Services }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["electricity", "water"] as const).map((k) => {
        const e = latest(utilities.entries, unit, k);
        const st = services[unit]?.[k] ?? "in_use";
        const off = st === "off";
        return (
          <div key={k} className={`chip-3d rounded-xl border p-3 text-sm ${off ? "border-dashed border-white/15 bg-black/15" : "border-white/5 bg-black/25"}`}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: KIND[k].color }}>
              {KIND[k].icon} {KIND[k].label}
            </div>
            {st === "on_request" && <div className="mt-0.5 inline-block rounded-full border border-sky-400/40 bg-sky-500/15 px-2 text-[10px] font-semibold text-sky-200">◐ On request</div>}
            {off ? (
              <div className="mt-1 text-xs text-[var(--ink-3)]">Not in use now · can be added any time</div>
            ) : e ? (
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
  );
}

/** Unit page for a unit that does not use gas (available on request). */
function NoGasUnit({ unitId, utilities, services, onStart }: { unitId: string; utilities: UtilitiesState; services: Services; onStart: () => void }) {
  const onRequest = services[unitId]?.gas === "on_request";
  return (
    <div className="space-y-3">
      <div
        className={`chip-3d flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-3 text-sm ${
          onRequest ? "border-sky-400/40 bg-sky-500/5 text-sky-100/90" : "border-amber-400/30 bg-amber-400/5 text-amber-100/90"
        }`}
      >
        <span>
          {onRequest ? (
            <>
              🔥 <b>Gas: on request.</b> Provided whenever a tenant needs it. Record the cylinder when you give one and the tracker appears here.
            </>
          ) : (
            <>
              🔥 <b>Gas: not in use now.</b> Can be added any time: record the first cylinder and the tracker appears here.
            </>
          )}
        </span>
        <button onClick={onStart} className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-1.5 text-sm font-semibold text-white shadow hover:brightness-110">
          🔥 Start gas for this unit
        </button>
      </div>
      <ElecWater unit={unitId} utilities={utilities} services={services} />
    </div>
  );
}

/**
 * "New cylinder fitted" form: date, cost, customer, note.
 * Saves the cylinder change (restarts the gas tracker) AND a gas record
 * in the energy list covering the previous cylinder (From → To).
 */
function GasFittedForm({ g, customer, onClose, onSaved }: { g: GasState; customer: string; onClose: () => void; onSaved: () => void }) {
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const prev = g.changes.at(-1);
  const [f, setF] = useState({ date: iso(today), cost: "", customer, supplier: "Litro", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const fromDay = prev ? iso(new Date(prev)) : null;
  const lasted = prev ? Math.round((Date.parse(f.date) - new Date(fromDay + "T00:00:00").getTime()) / DAY) : null;

  const input = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-orange-400/50 focus:ring-2";
  const label = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]";

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            // 1) restart the tracker from the new cylinder's date
            await post("/api/gas", { unit: g.unit, action: "fitted", date: f.date + "T09:00:00" });
            // 2) add a gas record for the cylinder that just finished (or the new one if there is no history)
            const note = [f.supplier && `${f.supplier} ${g.sizeKg} kg`, f.note].filter(Boolean).join(" · ");
            await post("/api/utilities", {
              unit: g.unit,
              kind: "gas",
              from: fromDay && fromDay < f.date ? fromDay : f.date,
              to: f.date,
              amount: g.sizeKg,
              cost: f.cost === "" ? null : Number(f.cost),
              customer: f.customer,
              account: "",
              note: note || "New cylinder",
            });
            onSaved();
            onClose();
          } catch (x) {
            setErr(x instanceof Error ? x.message : "Could not save");
          } finally {
            setBusy(false);
          }
        }}
        className="card-3d w-full max-w-md rounded-2xl p-5 hover:!translate-y-0"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">🔥 New gas cylinder · {g.unitName}</h2>
          <button type="button" onClick={onClose} className="rounded-full px-2 text-xl text-[var(--ink-3)] hover:text-white" aria-label="Close">
            ×
          </button>
        </div>
        {prev && (
          <p className="mb-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-[var(--ink-2)]">
            Previous cylinder fitted <b className="text-white">{fmt(prev)}</b>
            {lasted != null && lasted > 0 && (
              <>
                {" "}
                · it lasted <b className="text-white">{lasted} days</b>
              </>
            )}
            . This is saved as a gas record (From → To).
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="gf-date">Date fitted</label>
            <input id="gf-date" type="date" required max={iso(today)} className={input} value={f.date} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="gf-cost">Cost (LKR)</label>
            <input id="gf-cost" type="number" min="0" step="any" inputMode="decimal" className={input} value={f.cost} onChange={(e) => set("cost", e.target.value)} placeholder="e.g. 4250" />
          </div>
          <div>
            <label className={label} htmlFor="gf-supplier">Supplier</label>
            <select id="gf-supplier" className={input} value={f.supplier} onChange={(e) => set("supplier", e.target.value)}>
              <option>Litro</option>
              <option>Laugfs</option>
              <option value="">Other</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="gf-customer">Customer</label>
            <input id="gf-customer" className={input} value={f.customer} onChange={(e) => set("customer", e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="gf-note">Note</label>
            <input id="gf-note" className={input} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. delivered by shop, receipt no." />
          </div>
        </div>
        {err && <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 text-sm text-[var(--ink-2)] hover:text-white">
            Cancel
          </button>
          <button disabled={busy} className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-lg hover:brightness-110 disabled:opacity-50">
            {busy ? "Saving…" : "Save new cylinder"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function UnitEnergy({
  g,
  utilities,
  services,
  now,
  busy,
  onFitted,
  onUndo,
}: {
  g: GasState;
  utilities: UtilitiesState;
  services: Services;
  now: number;
  busy: boolean;
  onFitted: () => void;
  onUndo: () => void;
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
            onClick={onFitted}
            className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-1.5 text-sm font-semibold text-white shadow hover:brightness-110 disabled:opacity-50"
          >
            New cylinder fitted
          </button>
          {g.source === "live" && (
            <button disabled={busy} onClick={onUndo} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[var(--ink-2)] hover:text-white">
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
      <ElecWater unit={g.unit} utilities={utilities} services={services} />
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
  services,
  onChanged,
}: {
  utilities: UtilitiesState;
  units: UnitData[];
  unitId: string | null;
  location: string;
  services: Services;
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
      {form && <EnergyForm units={units} services={services} defaultUnit={unit !== "all" ? unit : undefined} onClose={() => setForm(false)} onSaved={onChanged} />}
    </section>
  );
}
