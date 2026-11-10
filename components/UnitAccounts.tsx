"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { UnitData, UnitInfo, UtilitiesState, UtilityKind } from "@/lib/types";
import { sendOrQueue } from "@/lib/outbox";

const lkr = (n: number) => `LKR ${Math.round(n).toLocaleString()}`;

/** One-line address, e.g. "12 Temple Rd, Floor 2, Negombo". */
export const addressLine = (i?: UnitInfo) => [i?.address1, i?.address2, i?.city].filter(Boolean).join(", ");

/* ------------------------------------------------------------------ */
/* Edit form: address + accounts for one unit                          */
/* ------------------------------------------------------------------ */
export function UnitInfoForm({ unit, info, onClose, onSaved }: { unit: UnitData; info: UnitInfo; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<UnitInfo>({ ...info });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof UnitInfo, v: string) => setF((p) => ({ ...p, [k]: v }));
  const input = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-sky-500/50 focus:ring-2";
  const label = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]";
  const field = (k: keyof UnitInfo, l: string, ph = "", span2 = false) => (
    <div className={span2 ? "col-span-2" : ""}>
      <label className={label} htmlFor={`ui-${k}`}>{l}</label>
      <input id={`ui-${k}`} className={input} value={f[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            await sendOrQueue("/api/unit-info", "POST", { unit: unit.id, ...f });
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
          <h2 className="text-lg font-semibold text-white">🏠 {unit.name} · address &amp; accounts</h2>
          <button type="button" onClick={onClose} className="rounded-full px-2 text-xl text-[var(--ink-3)] hover:text-white" aria-label="Close">
            ×
          </button>
        </div>

        <div className="mb-1.5 text-xs font-semibold text-sky-300">Address</div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          {field("address1", "Address line 1", "No. 12, Temple Road", true)}
          {field("address2", "Address line 2", "Floor 2 / Building B", true)}
          {field("city", "City / town", "Negombo", true)}
        </div>

        <div className="mb-1.5 text-xs font-semibold" style={{ color: "#facc15" }}>⚡ Electricity account</div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="ui-elecProvider">Provider</label>
            <select id="ui-elecProvider" className={input} value={f.elecProvider} onChange={(e) => set("elecProvider", e.target.value)}>
              <option>CEB</option>
              <option>LECO</option>
              <option>Other</option>
            </select>
          </div>
          {field("elecAccount", "Account no.", "e.g. 1234567890")}
        </div>

        <div className="mb-1.5 text-xs font-semibold" style={{ color: "#38bdf8" }}>💧 Water supply account</div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="ui-waterProvider">Provider</label>
            <select id="ui-waterProvider" className={input} value={f.waterProvider} onChange={(e) => set("waterProvider", e.target.value)}>
              <option value="NWSDB">NWSDB (Water Board)</option>
              <option value="Local council">Local council</option>
              <option value="Private / well">Private / well</option>
              <option value="Other">Other</option>
            </select>
          </div>
          {field("waterAccount", "Account no.", "e.g. 12/34/567/890")}
        </div>

        <div className="mb-1.5 text-xs font-semibold" style={{ color: "#a78bfa" }}>📶 Telecom / data account (internet, phone)</div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="ui-telecomProvider">Provider</label>
            <select id="ui-telecomProvider" className={input} value={f.telecomProvider} onChange={(e) => set("telecomProvider", e.target.value)}>
              <option>SLT-Mobitel</option>
              <option>Dialog</option>
              <option>Hutch</option>
              <option>Airtel</option>
              <option>Other</option>
            </select>
          </div>
          {field("telecomAccount", "Account / phone no.", "e.g. 0112 345678")}
        </div>

        <div className="mb-1.5 text-xs font-semibold" style={{ color: "#fb923c" }}>🔥 Gas</div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="ui-gasSupplier">Supplier</label>
            <select id="ui-gasSupplier" className={input} value={f.gasSupplier} onChange={(e) => set("gasSupplier", e.target.value)}>
              <option>Litro</option>
              <option>Laugfs</option>
              <option>Other</option>
            </select>
          </div>
          {field("notes", "Notes", "e.g. meter location")}
        </div>

        {err && <p className="mb-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 text-sm text-[var(--ink-2)] hover:text-white">
            Cancel
          </button>
          <button disabled={busy} className="rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-lg hover:brightness-110 disabled:opacity-50">
            {busy ? "Saving…" : "Save details"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Card: one unit's address + accounts                                 */
/* ------------------------------------------------------------------ */
export function UnitDetailsCard({ unit, info, onSaved, compact = false }: { unit: UnitData; info?: UnitInfo; onSaved: () => void; compact?: boolean }) {
  const [edit, setEdit] = useState(false);
  const i = info ?? {
    address1: "",
    address2: "",
    city: "",
    elecProvider: "CEB",
    elecAccount: "",
    waterProvider: "NWSDB",
    waterAccount: "",
    gasSupplier: "Litro",
    telecomProvider: "SLT-Mobitel",
    telecomAccount: "",
    notes: "",
  };
  const addr = addressLine(i);
  const missing = <span className="text-[var(--ink-3)]">not set</span>;
  return (
    <div className={`chip-3d rounded-xl border border-white/5 bg-black/25 ${compact ? "px-3 py-2" : "p-3"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-1)]">
            {compact && <span>{unit.name}</span>}
            {!compact && <span>🏠 Address &amp; accounts</span>}
          </div>
          <div className="text-xs text-[var(--ink-2)]">{addr ? `📍 ${addr}` : <span className="text-[var(--ink-3)]">📍 address not set</span>}</div>
        </div>
        <button onClick={() => setEdit(true)} className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10">
          ✎ Edit
        </button>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
        <div className="truncate">
          <span style={{ color: "#facc15" }}>⚡ {i.elecProvider}</span> <span className="tabular-nums text-[var(--ink-1)]">{i.elecAccount || missing}</span>
        </div>
        <div className="truncate">
          <span style={{ color: "#38bdf8" }}>💧 {i.waterProvider}</span> <span className="tabular-nums text-[var(--ink-1)]">{i.waterAccount || missing}</span>
        </div>
        <div className="truncate">
          <span style={{ color: "#a78bfa" }}>📶 {i.telecomProvider}</span> <span className="tabular-nums text-[var(--ink-1)]">{i.telecomAccount || missing}</span>
        </div>
        <div className="truncate">
          <span style={{ color: "#fb923c" }}>🔥 {i.gasSupplier}</span>
          {i.notes && <span className="text-[var(--ink-3)]"> · {i.notes}</span>}
        </div>
      </div>
      {edit && <UnitInfoForm unit={unit} info={i} onClose={() => setEdit(false)} onSaved={onSaved} />}
    </div>
  );
}

/** All units' addresses and accounts (overview). */
export function UnitsAccountsPanel({ units, unitInfo, onSaved }: { units: UnitData[]; unitInfo: Record<string, UnitInfo>; onSaved: () => void }) {
  return (
    <section className="card-3d min-w-0 rounded-2xl p-4 hover:!translate-y-0">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Units · addresses &amp; utility accounts</h2>
        <span className="text-[11px] text-[var(--ink-3)]">each unit separately · tap ✎ Edit</span>
      </header>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {units.map((u) => (
          <UnitDetailsCard key={u.id} unit={u} info={unitInfo[u.id]} onSaved={onSaved} compact />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Monthly costs                                                       */
/* ------------------------------------------------------------------ */
const KINDS: UtilityKind[] = ["electricity", "water", "gas", "telecom"];
const ICON: Record<UtilityKind, string> = { electricity: "⚡", water: "💧", gas: "🔥", telecom: "📶" };

const unitLabel = (units: UnitData[], unit: string) => (unit === "all" ? "All units" : units.find((u) => u.id === unit)?.name ?? unit);
const LABEL: Record<UtilityKind, string> = { electricity: "Electricity", water: "Water", gas: "Gas", telecom: "Telecom / data" };

/** Download every record in the chosen months (one row per bill, with the breakdown) as a CSV that opens in Excel. */
function downloadMonthsCsv(utilities: UtilitiesState, units: UnitData[], unit: string, months: string[]) {
  const set = new Set(months);
  const rows = utilities.entries
    .filter((e) => (unit === "all" || e.unit === unit) && set.has(billMonth(e)))
    .sort((a, b) => billMonth(a).localeCompare(billMonth(b)) || a.unit.localeCompare(b.unit));
  const q = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Bill month", "Unit", "Type", "Connection", "From", "To", "Used", "Data (LKR)", "Calls (LKR)", "Tax (LKR)", "Other (LKR)", "Total (LKR)", "Customer", "Account no", "Note"];
  const lines = rows.map((e) =>
    [
      billMonth(e),
      units.find((u) => u.id === e.unit)?.name ?? e.unit,
      LABEL[e.kind],
      e.connection ?? "",
      e.from,
      e.to,
      e.amount,
      e.charges?.data ?? "",
      e.charges?.calls ?? "",
      e.charges?.tax ?? "",
      e.charges?.other ?? "",
      e.cost ?? "",
      e.customer,
      e.account,
      e.note,
    ]
      .map(q)
      .join(","),
  );
  const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `monthly-bills-${unit}-${months.at(-1) ?? ""}-to-${months[0] ?? ""}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Printable monthly summary (choose "Save as PDF" in the print window for a PDF). */
function printMonths(units: UnitData[], unit: string, rows: ReturnType<typeof monthlyCosts>) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return window.alert("Please allow pop-ups for this site to print.");
  const money = (n: number) => (n ? `LKR ${Math.round(n).toLocaleString()}` : "–");
  const tot = (k: UtilityKind | "total") => rows.reduce((a, r) => a + r[k], 0);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Monthly costs – ${unitLabel(units, unit)}</title>
  <style>body{font-family:system-ui,Segoe UI,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}p{color:#555;font-size:12px;margin:0 0 14px}
  table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbb;padding:6px 8px}th{background:#eee;text-align:left}td.n,th.n{text-align:right}
  tfoot td{font-weight:700;background:#f6f6f6}button{margin-bottom:12px;padding:8px 14px}@media print{button{display:none}}</style></head><body>
  <button onclick="window.print()">🖨 Print / Save as PDF</button>
  <h1>Monthly costs – ${unitLabel(units, unit)}</h1><p>${rows.length} months · printed ${new Date().toLocaleString()}</p>
  <table><thead><tr><th>Month</th><th class="n">Electricity</th><th class="n">Water</th><th class="n">Gas</th><th class="n">Telecom / data</th><th class="n">Total</th></tr></thead><tbody>
  ${rows.map((r) => `<tr><td>${monthName(r.month)}</td><td class="n">${money(r.electricity)}</td><td class="n">${money(r.water)}</td><td class="n">${money(r.gas)}</td><td class="n">${money(r.telecom)}</td><td class="n"><b>${money(r.total)}</b></td></tr>`).join("")}
  </tbody><tfoot><tr><td>Total</td><td class="n">${money(tot("electricity"))}</td><td class="n">${money(tot("water"))}</td><td class="n">${money(tot("gas"))}</td><td class="n">${money(tot("telecom"))}</td><td class="n">${money(tot("total"))}</td></tr></tfoot></table>
  <script>setTimeout(function(){window.print()},300)</script></body></html>`);
  w.document.close();
}

/** The month a record belongs to: its bill month, else the month of its "To" date. */
export const billMonth = (e: { month?: string; to: string }) => (e.month && /^\d{4}-\d{2}$/.test(e.month) ? e.month : e.to.slice(0, 7));

/** Sum record costs by bill month. */
export function monthlyCosts(utilities: UtilitiesState, unit: string | "all") {
  const map = new Map<string, Record<UtilityKind, number>>();
  for (const e of utilities.entries) {
    if (unit !== "all" && e.unit !== unit) continue;
    if (e.cost == null) continue;
    const m = billMonth(e); // YYYY-MM
    const row = map.get(m) ?? { electricity: 0, water: 0, gas: 0, telecom: 0 };
    row[e.kind] += e.cost;
    map.set(m, row);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, v]) => ({ month, ...v, total: v.electricity + v.water + v.gas + v.telecom }));
}

export const monthName = (ym: string) => new Date(ym + "-15T12:00:00").toLocaleDateString([], { month: "long", year: "numeric" });

export function MonthlyCosts({ utilities, units, unitId }: { utilities: UtilitiesState; units: UnitData[]; unitId: string | null }) {
  const [unit, setUnit] = useState<string>(unitId ?? "all");
  const all = useMemo(() => monthlyCosts(utilities, unit), [utilities, unit]);
  // From month → To month (defaults: the last 12 months that have bills)
  const [fromM, setFromM] = useState("");
  const [toM, setToM] = useState("");
  const rows = useMemo(() => {
    const r = all.filter((x) => (!fromM || x.month >= fromM) && (!toM || x.month <= toM));
    return fromM || toM ? r : r.slice(0, 12);
  }, [all, fromM, toM]);
  const sum = rows.reduce((a, r) => ({ electricity: a.electricity + r.electricity, water: a.water + r.water, gas: a.gas + r.gas, telecom: a.telecom + r.telecom, total: a.total + r.total }), {
    electricity: 0,
    water: 0,
    gas: 0,
    telecom: 0,
    total: 0,
  });
  const avg = rows.length ? sum.total / rows.length : 0;

  return (
    <section className="card-3d min-w-0 rounded-2xl p-4 hover:!translate-y-0">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Monthly costs (LKR)</h2>
        <div className="flex items-center gap-2">
          {utilities.source === "demo" && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">Sample data</span>
          )}
          <select aria-label="Unit" className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="all">All units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </header>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-[var(--ink-3)]">
          From month
          <input type="month" className="mt-0.5 block rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white" value={fromM} onChange={(e) => setFromM(e.target.value)} />
        </label>
        <label className="text-[11px] text-[var(--ink-3)]">
          To month
          <input type="month" className="mt-0.5 block rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white" value={toM} onChange={(e) => setToM(e.target.value)} />
        </label>
        {(fromM || toM) && (
          <button onClick={() => (setFromM(""), setToM(""))} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[var(--ink-2)] hover:text-white">
            Last 12 months
          </button>
        )}
        <span className="flex-1" />
        <button
          disabled={!rows.length}
          onClick={() => downloadMonthsCsv(utilities, units, unit, rows.map((r) => r.month))}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-40"
        >
          ⬇ Download (Excel)
        </button>
        <button
          disabled={!rows.length}
          onClick={() => printMonths(units, unit, rows)}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-40"
        >
          🖨 Print / PDF
        </button>
      </div>
      {rows.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {KINDS.map((k) => (
            <div key={k} className="chip-3d rounded-xl border border-white/5 bg-black/25 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                {ICON[k]} {k} · {rows.length} mo
              </div>
              <div className="text-base font-semibold tabular-nums text-[var(--ink-1)]">{lkr(sum[k])}</div>
            </div>
          ))}
          <div className="chip-3d rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-emerald-200">Average / month</div>
            <div className="text-base font-semibold tabular-nums text-white">{lkr(avg)}</div>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-black/30 text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
            <tr>
              <th className="px-3 py-2">Month</th>
              <th className="px-3 py-2 text-right">⚡ Electricity</th>
              <th className="px-3 py-2 text-right">💧 Water</th>
              <th className="px-3 py-2 text-right">🔥 Gas</th>
              <th className="px-3 py-2 text-right">📶 Telecom</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[var(--ink-3)]">
                  No costs yet. Add records with a cost (LKR).
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.month} className="border-t border-white/5 odd:bg-white/[0.02]">
                <td className="px-3 py-2 font-medium text-[var(--ink-1)]">{monthName(r.month)}</td>
                {KINDS.map((k) => (
                  <td key={k} className="px-3 py-2 text-right">
                    {r[k] ? lkr(r[k]) : <span className="text-[var(--ink-3)]">–</span>}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold text-[var(--ink-1)]">{lkr(r.total)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 1 && (
            <tfoot className="border-t border-white/10 bg-black/30 font-semibold tabular-nums">
              <tr>
                <td className="px-3 py-2 text-[var(--ink-2)]">Total</td>
                {KINDS.map((k) => (
                  <td key={k} className="px-3 py-2 text-right">
                    {lkr(sum[k])}
                  </td>
                ))}
                <td className="px-3 py-2 text-right text-white">{lkr(sum.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-2 text-[11px] text-[var(--ink-3)]">Each bill counts in its bill month (or the month of its “To” date). Pick From / To month to see any range.</p>
    </section>
  );
}
