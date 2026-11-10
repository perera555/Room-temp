"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { sendOrQueue } from "@/lib/outbox";
import type { GasState, ServiceStatus, Services, TelecomLink, UnitData, UnitInfo, UtilitiesState, UtilityEntry, UtilityKind } from "@/lib/types";
import { UnitDetailsCard, billMonth, monthName, monthlyCosts } from "./UnitAccounts";
import { BillScanButton } from "./BillScan";
import { billImageUrl, uploadBill } from "@/lib/billImage";

const DAY = 86_400_000;
const fmt = (t: number) => new Date(t).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
const fmtDay = (k: string) => new Date(k + "T12:00:00").toLocaleDateString([], { day: "numeric", month: "short", year: "2-digit" });
const lkr = (n: number | null) => (n == null ? "—" : `LKR ${Math.round(n).toLocaleString()}`);

export const KIND: Record<UtilityKind, { label: string; icon: string; unit: string; color: string }> = {
  electricity: { label: "Electricity", icon: "⚡", unit: "kWh", color: "#facc15" },
  water: { label: "Water", icon: "💧", unit: "units (m³)", color: "#38bdf8" },
  gas: { label: "Gas", icon: "🔥", unit: "kg", color: "#fb923c" },
  telecom: { label: "Home WiFi / phone", icon: "📶", unit: "GB", color: "#a78bfa" }, // fixed line D1/D2/D3: home WiFi data + home phone
  mobile: { label: "Mobile", icon: "📱", unit: "GB", color: "#f472b6" }, // personal mobile numbers: calls + data
};

type Tc = { data: string; calls: string; tax: string; other: string; connection: string };
const tcSumOf = (tc: Tc) => (["data", "calls", "tax", "other"] as const).reduce((a, k) => a + (Number(tc[k]) || 0), 0);

export const daysIn = (e: UtilityEntry) =>
  Math.max(1, Math.round((Date.parse(e.to + "T00:00:00Z") - Date.parse(e.from + "T00:00:00Z")) / DAY) + 1);

export function gasSummary(gas: GasState, now: number) {
  const last = gas.changes.at(-1) ?? now;
  const days = Math.max(0, (now - last) / DAY);
  // ⚖ a scale reading taken since this cylinder was fitted is better than the estimate
  const w = (gas.weighIns ?? []).filter((x) => x.t >= last).at(-1);
  if (w) {
    const kgLeft = Math.max(0, Math.min(gas.sizeKg, w.gross - w.tare));
    const usedDays = Math.max(1, (w.t - last) / DAY);
    const used = gas.sizeKg - kgLeft;
    // real usage per day since fitting; fall back to the usual cylinder life if too early to tell
    const perDay = used > 0.3 ? used / usedDays : gas.sizeKg / gas.typicalDays;
    const sinceWeigh = (now - w.t) / DAY;
    const kgNow = Math.max(0, kgLeft - perDay * sinceWeigh);
    const pct = Math.max(0, Math.min(100, Math.round((kgNow / gas.sizeKg) * 100)));
    const daysLeft = Math.max(0, Math.round(kgNow / perDay));
    const level = pct <= 10 ? "critical" : pct <= 25 ? "low" : "ok";
    return { last, days: Math.floor(days), pct, daysLeft, emptyAt: now + daysLeft * DAY, level, kgLeft: kgNow, weighed: w, perDay };
  }
  const pct = Math.max(0, Math.min(100, Math.round((1 - days / gas.typicalDays) * 100)));
  const daysLeft = Math.max(0, Math.round(gas.typicalDays - days));
  const emptyAt = last + gas.typicalDays * DAY;
  const level = pct <= 10 ? "critical" : pct <= 25 ? "low" : "ok";
  return { last, days: Math.floor(days), pct, daysLeft, emptyAt, level, kgLeft: (gas.sizeKg * pct) / 100, weighed: null, perDay: gas.sizeKg / gas.typicalDays };
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
  unitInfo = {},
  telecomMap = [],
  billScan = false,
  defaultUnit,
  onClose,
  onSaved,
}: {
  units: UnitData[];
  services: Services; // which services each unit uses
  unitInfo?: Record<string, UnitInfo>; // each unit's accounts, to pre-fill
  telecomMap?: TelecomLink[]; // for the "Scan a bill" shortcut
  billScan?: boolean;
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
    note: "",
  });
  // checklist: which services this record covers, each with its own amount + cost
  // nothing pre-ticked: only services the user ticks ask for an amount
  const [picked, setPicked] = useState<Record<UtilityKind, boolean>>({ electricity: false, water: false, gas: false, telecom: false, mobile: false });
  const [amount, setAmount] = useState<Record<UtilityKind, string>>({ electricity: "", water: "", gas: "12.5", telecom: "", mobile: "" });
  const [cost, setCost] = useState<Record<UtilityKind, string>>({ electricity: "", water: "", gas: "", telecom: "", mobile: "" });
  // "Status in this unit" field: In use / On request / Not in use now ("" = leave as it is)
  const [statusSel, setStatusSel] = useState<Record<UtilityKind, "" | ServiceStatus>>({ electricity: "", water: "", gas: "", telecom: "", mobile: "" });
  // each service has its own account no. (electricity / water supply), filled from the unit's details
  const accountsFor = (unitId: string): Record<UtilityKind, string> => ({
    electricity: unitInfo[unitId]?.elecAccount ?? "",
    water: unitInfo[unitId]?.waterAccount ?? "",
    gas: "",
    telecom: unitInfo[unitId]?.telecomAccount ?? "",
    mobile: "",
  });
  const [acct, setAcct] = useState<Record<UtilityKind, string>>(() => accountsFor(firstUnit?.id ?? ""));
  // bill month (YYYY-MM) - follows the "To" date unless changed by hand
  const [billM, setBillM] = useState<string>("");
  const monthOf = billM || f.to.slice(0, 7);
  // each service can have its own From / To (bills cover different periods); default = the dates at the top
  const [own, setOwn] = useState<Partial<Record<UtilityKind, { from: string; to: string }>>>({});
  const period = (k: UtilityKind) => own[k] ?? { from: f.from, to: f.to };
  const setPeriod = (k: UtilityKind, key: "from" | "to", v: string) => setOwn((p) => ({ ...p, [k]: { ...period(k), [key]: v } }));
  const daysOf = (k: UtilityKind) => {
    const d = period(k);
    return d.from && d.to ? Math.max(1, Math.round((Date.parse(d.to) - Date.parse(d.from)) / DAY) + 1) : null;
  };
  // telecom bill: separate charges and connection (D1 / D2 / D3)
  const blankTc: Tc = { data: "", calls: "", tax: "", other: "", connection: "" };
  const [tcs, setTcs] = useState<Record<"telecom" | "mobile", Tc>>({ telecom: blankTc, mobile: blankTc });
  const [photo, setPhoto] = useState<File | null>(null); // optional bill photo

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
            setErr("Switch on a service to add its bill, or choose a status (In use / On request / Not in use now)");
            return;
          }
          // telecom bills often don't show GB used, so a blank amount is fine there (saved as 0)
          const missing = chosen.filter((k) => k !== "telecom" && k !== "mobile" && amount[k].trim() === "");
          if (missing.length) {
            setErr(`Enter “Used” for ${missing.map((k) => KIND[k].label).join(" and ")}, or switch it off`);
            return;
          }
          setBusy(true);
          setErr(null);
          try {
            // bill photo (optional) is saved once and linked to each record
            let image: string | null = null;
            if (photo && chosen.length) {
              try {
                image = await uploadBill(photo);
              } catch {
                image = null;
              }
            }
            // one record per ticked service
            for (const k of chosen) {
              const tc = k === "telecom" || k === "mobile" ? tcs[k] : null;
              const tcSum = tc ? tcSumOf(tc) : 0;
              await post("/api/utilities", {
                ...f,
                ...period(k),
                kind: k,
                month: own[k] && !billM ? period(k).to.slice(0, 7) : monthOf,
                account: acct[k],
                amount: Number(amount[k]),
                cost: cost[k] === "" ? (tcSum ? tcSum : null) : Number(cost[k]),
                image: image ?? undefined,
                ...(tc ? { connection: tc.connection, charges: { data: tc.data, calls: tc.calls, tax: tc.tax, other: tc.other } } : {}),
              });
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
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Add energy record</h2>
          <div className="flex items-center gap-2">
            {/* shortcut: scan / upload the bill instead of typing it */}
            <BillScanButton
              units={units}
              unitInfo={unitInfo}
              telecomMap={telecomMap}
              enabled={billScan}
              defaultUnit={f.unit}
              label="📸 Scan a bill"
              onSaved={() => {
                onSaved();
                onClose();
              }}
            />
            <button type="button" onClick={onClose} className="rounded-full px-2 text-xl text-[var(--ink-3)] hover:text-white" aria-label="Close">
              ×
            </button>
          </div>
        </div>

        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]">Services · switch on one or more</div>
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
        <div className="status-panel mb-4 rounded-2xl p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">🏷 Status in this unit</div>
              <div className="text-[11px] text-[var(--ink-3)]">Optional · tap to change · tap again to clear</div>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px]">
              {(["in_use", "on_request", "off"] as const).map((s) => (
                <span key={s} className={`status-key status-key-${s}`}>
                  {s === "off" ? "Not in use" : STATUS[s].label}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {KINDS.map((k) => {
              const now = services[f.unit]?.[k] ?? "off";
              const next = statusSel[k];
              return (
              <div key={k} className={`status-row status-row-${next || now} grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3 rounded-xl px-3.5 py-3`}>
                <span className={`status-badge status-badge-${k}`} aria-hidden>
                  {KIND[k].icon}
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-semibold text-white">{KIND[k].label}</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--ink-3)]">
                    now: {STATUS_ICON[now]} {STATUS[now].short}
                    {next && next !== now ? <b className="text-white"> → {STATUS_ICON[next]} {STATUS[next].short}</b> : null}
                  </span>
                </span>
                <div className="seg seg-lg col-span-2" role="group" aria-label={`${KIND[k].label} status`}>
                  {(["in_use", "on_request", "off"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={statusSel[k] === s}
                      disabled={busy}
                      onClick={() => {
                        const v = statusSel[k] === s ? "" : s; // tap again to clear
                        setStatusSel((p) => ({ ...p, [k]: v }));
                        // not in use → no bill for it, so no "Used" amount is asked
                        if (v === "off") setPicked((p) => ({ ...p, [k]: false }));
                      }}
                      className={`seg-btn seg-${s}`}
                    >
                      {s === "off" ? "Not in use" : STATUS[s].label}
                    </button>
                  ))}
                </div>
              </div>
              );
            })}
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
                setAcct(accountsFor(e.target.value)); // this unit's own account numbers
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
            <label className={label} htmlFor="ef-from">From · all services</label>
            <input id="ef-from" type="date" required className={input} value={f.from} onChange={(e) => set("from", e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="ef-to">To · all services</label>
            <input id="ef-to" type="date" required min={f.from} className={input} value={f.to} onChange={(e) => set("to", e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="ef-month">Bill month (shows in monthly costs)</label>
            <input id="ef-month" type="month" className={input} value={monthOf} onChange={(e) => setBillM(e.target.value)} />
          </div>
          {chosen.length === 0 && (
            <p className="col-span-2 rounded-xl border border-dashed border-white/10 px-3 py-2 text-xs text-[var(--ink-3)]">
              Switch on ⚡ Electricity, 💧 Water, 🔥 Gas, 📶 Home WiFi / phone or 📱 Mobile above to enter a bill. To only mark a service as not used, choose “Not in use” and save.
            </p>
          )}
          {chosen.map((k) => (
            <div key={k} className="col-span-2 grid grid-cols-2 gap-3 rounded-xl border border-white/5 bg-black/20 p-2.5">
              <div className="col-span-2 -mb-1 text-xs font-semibold" style={{ color: KIND[k].color }}>
                {KIND[k].icon} {KIND[k].label}
                {daysOf(k) && Number(amount[k]) > 0 && (
                  <span className="ml-2 font-normal text-[var(--ink-3)]">
                    {(Number(amount[k]) / daysOf(k)!).toFixed(2)} {KIND[k].unit.split(" ")[0]}/day
                  </span>
                )}
              </div>
              <div>
                <label className={label} htmlFor={`ef-from-${k}`}>
                  {KIND[k].icon} From
                </label>
                <input id={`ef-from-${k}`} type="date" required className={input} value={period(k).from} onChange={(e) => setPeriod(k, "from", e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor={`ef-to-${k}`}>
                  {KIND[k].icon} To {daysOf(k) ? <span className="normal-case tracking-normal">· {daysOf(k)} days</span> : null}
                </label>
                <input id={`ef-to-${k}`} type="date" required min={period(k).from} className={input} value={period(k).to} onChange={(e) => setPeriod(k, "to", e.target.value)} />
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
              {(k === "telecom" || k === "mobile") &&
                (() => {
                  const tc = tcs[k];
                  const setTc = (fn: (p: Tc) => Tc) => setTcs((all) => ({ ...all, [k]: fn(all[k]) }));
                  const sum = tcSumOf(tc);
                  const mobiles = unitInfo[f.unit]?.mobiles ?? [];
                  const lines = telecomMap.filter((t) => t.units.includes(f.unit));
                  return (
                    <>
                      <div className="col-span-2">
                        <div className={label}>{k === "mobile" ? "📱 Which mobile number? · personal calls & data" : "☎ Which line? · home WiFi / home phone"}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {k === "mobile" &&
                            mobiles.map((m) => (
                              <button
                                key={m.number}
                                type="button"
                                aria-pressed={tc.connection === m.number}
                                onClick={() =>
                                  setTc((p) => ({
                                    ...p,
                                    connection: p.connection === m.number ? "" : m.number,
                                    data: p.data || (m.monthly != null ? String(m.monthly) : ""),
                                  }))
                                }
                                className={`line-chip line-${(m.provider || "other").toLowerCase().split(/[^a-z]/)[0]}`}
                              >
                                <span className="text-base">📱</span>
                                <span className="text-left leading-tight">
                                  <span className="block font-semibold">{m.number}</span>
                                  <span className="block text-[10px] opacity-80">
                                    {m.provider}
                                    {m.package ? ` · ${m.package}` : ""}
                                  </span>
                                </span>
                              </button>
                            ))}
                          {k === "telecom" &&
                            lines.map((t) => (
                              <button
                                key={t.code}
                                type="button"
                                aria-pressed={tc.connection === t.code}
                                onClick={() => setTc((p) => ({ ...p, connection: p.connection === t.code ? "" : t.code }))}
                                className="line-chip line-fixed"
                              >
                                <span className="text-base">☎</span>
                                <span className="text-left leading-tight">
                                  <span className="block font-semibold">{t.code}</span>
                                  <span className="block text-[10px] opacity-80">{t.units.length > 1 ? "shared · WiFi / phone" : "WiFi / phone"}</span>
                                </span>
                              </button>
                            ))}
                          {k === "mobile" && !mobiles.length && (
                            <span className="self-center text-[11px] text-[var(--ink-3)]">No mobile numbers for this unit yet: add them with ✎ Edit on the unit, or type one below.</span>
                          )}
                          {k === "telecom" && !lines.length && (
                            <span className="self-center text-[11px] text-[var(--ink-3)]">No home line for this unit: set it in “📶 Telecom bill connections”, or type one below.</span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 grid grid-cols-5 gap-2">
                        {(
                          [
                            ["connection", k === "mobile" ? "Number" : "Line", k === "mobile" ? "07…" : "D1"],
                            ["data", k === "mobile" ? "📲 Data" : "🌐 WiFi", ""],
                            ["calls", "📞 Calls", ""],
                            ["tax", "🧾 Tax", ""],
                            ["other", "Other", ""],
                          ] as const
                        ).map(([key, l, ph]) => (
                          <div key={key}>
                            <label className={label} htmlFor={`ef-${k}-${key}`}>
                              {l}
                            </label>
                            <input
                              id={`ef-${k}-${key}`}
                              className={input}
                              type={key === "connection" ? "text" : "number"}
                              step="any"
                              min="0"
                              inputMode={key === "connection" ? "text" : "decimal"}
                              value={tc[key]}
                              placeholder={ph || "LKR"}
                              list={key === "connection" ? `ef-${k}-lines` : undefined}
                              onChange={(e) => {
                                const v = e.target.value;
                                setTc((p) => ({ ...p, [key]: v }));
                                // typing a known mobile number fills in its usual monthly package cost
                                if (key === "connection" && k === "mobile") {
                                  const mb = mobiles.find((m) => m.number === v);
                                  if (mb?.monthly != null) setTc((p) => ({ ...p, data: p.data || String(mb.monthly) }));
                                }
                              }}
                            />
                          </div>
                        ))}
                        <datalist id={`ef-${k}-lines`}>
                          {k === "telecom"
                            ? lines.map((t) => (
                                <option key={t.code} value={t.code}>
                                  {t.units.length > 1 ? "shared" : "home line"}
                                </option>
                              ))
                            : mobiles.map((m) => (
                                <option key={m.number} value={m.number}>
                                  {`${m.provider} ${m.package}`.trim()}
                                </option>
                              ))}
                        </datalist>
                        {sum > 0 && cost[k] === "" && (
                          <p className="col-span-5 -mt-1 text-[11px] text-violet-200">Cost = data + calls + tax + other = LKR {Math.round(sum).toLocaleString()}</p>
                        )}
                      </div>
                    </>
                  );
                })()}
              <div className="col-span-2">
                <label className={label} htmlFor={`ef-acct-${k}`}>
                  {k === "electricity"
                    ? `Electricity account no. (${unitInfo[f.unit]?.elecProvider ?? "CEB"})`
                    : k === "water"
                      ? `Water supply account no. (${unitInfo[f.unit]?.waterProvider ?? "NWSDB"})`
                      : k === "telecom"
                        ? `Home WiFi / phone account no. (${unitInfo[f.unit]?.telecomProvider ?? "SLT-Mobitel"})`
                        : k === "mobile"
                          ? "Mobile account no. (optional)"
                        : `Gas receipt / ref. (${unitInfo[f.unit]?.gasSupplier ?? "Litro"})`}
                </label>
                <input
                  id={`ef-acct-${k}`}
                  className={input}
                  value={acct[k]}
                  onChange={(e) => setAcct((p) => ({ ...p, [k]: e.target.value }))}
                  placeholder={k === "gas" ? "optional" : "from the unit's details, or type it"}
                />
              </div>
            </div>
          ))}
          <div className="col-span-2">
            <label className={label} htmlFor="ef-customer">Customer</label>
            <input id="ef-customer" className={input} value={f.customer} onChange={(e) => set("customer", e.target.value)} placeholder="Name on the bill" />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="ef-photo">📎 Bill photo (optional)</label>
            <input
              id="ef-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="block w-full text-xs text-[var(--ink-2)] file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
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
  unitInfo = {},
  telecomMap = [],
  billScan = false,
  now,
  onChanged,
}: {
  gas: GasState[];
  utilities: UtilitiesState;
  units: UnitData[];
  unitId: string | null;
  services: Services;
  unitInfo?: Record<string, UnitInfo>;
  telecomMap?: TelecomLink[];
  billScan?: boolean;
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
    weighIns: [],
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
          <BillScanButton units={units} unitInfo={unitInfo} telecomMap={telecomMap} enabled={billScan} defaultUnit={unitId ?? undefined} onSaved={onChanged} />
          <button onClick={() => setForm(true)} className="rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:brightness-110">
            + Add record
          </button>
        </div>
      </header>

      <MonthTotals utilities={utilities} unitId={unitId} now={now} />

      {unitId && units.find((u) => u.id === unitId) && (
        <div className="mb-3">
          <UnitDetailsCard unit={units.find((u) => u.id === unitId)!} info={unitInfo[unitId]} onSaved={onChanged} />
        </div>
      )}
      {unitId && <ServiceSwitches unit={unitId} services={services} busy={busy} onSet={setStatus} />}

      {one ? (
        <UnitEnergy g={one} utilities={utilities} services={services} now={now} busy={busy} onFitted={() => setFitting(one)} onUndo={() => undoGas(one.unit)} onWeighed={onChanged} />
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
                    {(["electricity", "water", "telecom", "mobile"] as const).map((k) =>
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
      {form && <EnergyForm units={units} services={services} unitInfo={unitInfo} telecomMap={telecomMap} billScan={billScan} defaultUnit={unitId ?? undefined} onClose={() => setForm(false)} onSaved={onChanged} />}
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

/** One on/off switch: on = service in use, off = not in use (available on request). */
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
      title={on ? `${KIND[kind].label}: in use (switch off if not used)` : `${KIND[kind].label}: not in use, available on request (switch on when used)`}
    >
      <input type="checkbox" className="peer sr-only" checked={on} disabled={busy} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className={`switch-track ${compact ? "switch-sm" : ""} peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400`} data-on={on} />
      <span className="min-w-0">
        <span className={`block font-semibold text-[var(--ink-1)] ${compact ? "text-[11px]" : "text-sm"}`}>
          {KIND[kind].icon} {KIND[kind].label}
        </span>
        {!compact && <span className={`block text-[11px] ${on ? "text-emerald-300" : "text-[var(--ink-3)]"}`}>{on ? "In use" : "Not in use now"}</span>}
      </span>
    </label>
  );
}

const STATUS_ICON: Record<ServiceStatus, string> = { in_use: "●", on_request: "◐", off: "○" };

/**
 * Services checklist for one unit: each service is ● In use, ◐ On request
 * (provided whenever a tenant needs it) or ○ Not in use now.
 * A segmented picker per service (full size and compact).
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
  const icon = STATUS_ICON;
  if (compact) {
    return (
      <div className="space-y-1">
        {(["electricity", "water", "gas", "telecom", "mobile"] as const).map((k) => {
          const st = services[unit]?.[k] ?? "off";
          return (
            <div key={k} className="flex items-center gap-1.5" title={`${KIND[k].label}: ${STATUS[st].long}`}>
              <span className="w-5 shrink-0 text-center text-sm" aria-label={KIND[k].label}>
                {KIND[k].icon}
              </span>
              <div className="seg seg-sm min-w-0 flex-1" role="radiogroup" aria-label={`${KIND[k].label} status`}>
                {(["in_use", "on_request", "off"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={st === s}
                    aria-pressed={st === s}
                    disabled={busy}
                    onClick={() => st !== s && onSet(unit, k, s)}
                    className={`seg-btn seg-${s}`}
                  >
                    {s === "off" ? "Not in use" : STATUS[s].label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Services · choose the status for each</div>
      <div className="space-y-1.5">
        {(["electricity", "water", "gas", "telecom", "mobile"] as const).map((k) => {
          const st = services[unit]?.[k] ?? "off";
          return (
            <div key={k} className="chip-3d flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-black/25 px-3 py-2">
              <span className="w-28 shrink-0 text-sm font-semibold text-[var(--ink-1)]">
                {KIND[k].icon} {KIND[k].label}
              </span>
              <div className="seg min-w-0 flex-1" role="radiogroup" aria-label={`${KIND[k].label} status`}>
                {(["in_use", "on_request", "off"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={st === s}
                    aria-pressed={st === s}
                    disabled={busy}
                    onClick={() => st !== s && onSet(unit, k, s)}
                    className={`seg-btn seg-${s}`}
                  >
                    {s === "off" ? "Not in use" : STATUS[s].label}
                  </button>
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

/**
 * ⚖ Weigh the cylinder: put it on a scale, enter the weight shown and the empty
 * weight stamped on the cylinder ("TW", e.g. 15.0 kg). Gas left = scale − TW.
 */
function WeighButton({ g, onSaved }: { g: GasState; onSaved: () => void }) {
  const TARE_KEY = "rt:gas-tare";
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [tare, setTare] = useState(() => {
    try {
      return localStorage.getItem(TARE_KEY) ?? g.weighIns?.at(-1)?.tare?.toString() ?? "15.0";
    } catch {
      return "15.0";
    }
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const left = Number(weight) - Number(tare);
  const valid = Number(weight) > 0 && Number(tare) > 0;
  const input = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-lg font-semibold tabular-nums text-white outline-none ring-orange-400/50 focus:ring-2";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-orange-300/40 bg-orange-500/15 px-4 py-1.5 text-sm font-semibold text-orange-100 hover:bg-orange-500/25"
        title="Weigh the cylinder on a scale for the exact gas left"
      >
        ⚖ Weigh cylinder
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setErr(null);
                try {
                  try {
                    localStorage.setItem(TARE_KEY, tare);
                  } catch {}
                  await post("/api/gas", { unit: g.unit, action: "weigh", weight: Number(weight), tare: Number(tare) });
                  onSaved();
                  setOpen(false);
                } catch (x) {
                  setErr(x instanceof Error ? x.message : "Could not save");
                } finally {
                  setBusy(false);
                }
              }}
              className="card-3d w-full max-w-sm rounded-2xl p-5 hover:!translate-y-0"
            >
              <div className="-mx-5 -mt-5 mb-4 rounded-t-2xl bg-gradient-to-r from-orange-600/50 to-amber-500/30 px-5 py-4">
                <h2 className="text-lg font-semibold text-white">⚖ Weigh gas cylinder · {g.unitName}</h2>
                <p className="text-xs text-white/70">Put the cylinder on a bathroom or luggage scale</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]" htmlFor="gw-weight">
                    Scale shows (kg)
                  </label>
                  <input id="gw-weight" className={input} type="number" step="0.1" min="0" inputMode="decimal" autoFocus value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="21.4" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]" htmlFor="gw-tare">
                    Empty cylinder · TW (kg)
                  </label>
                  <input id="gw-tare" className={input} type="number" step="0.1" min="0" inputMode="decimal" value={tare} onChange={(e) => setTare(e.target.value)} />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-[var(--ink-3)]">TW (tare weight) is stamped on the cylinder’s collar. A full {g.sizeKg} kg cylinder weighs about TW + {g.sizeKg} kg.</p>
              {valid && (
                <div className={`chip-3d mt-3 rounded-xl px-3 py-2 text-center ${left <= g.sizeKg * 0.15 ? "bg-red-500/15 text-red-100" : "bg-emerald-500/15 text-emerald-100"}`}>
                  <div className="text-[10px] uppercase tracking-wider opacity-80">Gas left</div>
                  <div className="text-2xl font-semibold tabular-nums">{Math.max(0, left).toFixed(1)} kg</div>
                  <div className="text-xs opacity-80">{Math.round((Math.max(0, Math.min(left, g.sizeKg)) / g.sizeKg) * 100)}% of {g.sizeKg} kg</div>
                </div>
              )}
              {err && <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-white/10 px-4 py-2 text-sm text-[var(--ink-2)] hover:text-white">
                  Cancel
                </button>
                <button disabled={busy || !valid} className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? "Saving…" : "Save weight"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Total cost this month and last month (all services), for one unit or all units. */
function MonthTotals({ utilities, unitId, now }: { utilities: UtilitiesState; unitId: string | null; now: number }) {
  const d = new Date(now);
  const ym = (y: number, m: number) => {
    const x = new Date(y, m, 1);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
  };
  const thisM = ym(d.getFullYear(), d.getMonth());
  const lastM = ym(d.getFullYear(), d.getMonth() - 1);
  const rows = monthlyCosts(utilities, unitId ?? "all");
  const cur = rows.find((r) => r.month === thisM);
  const prev = rows.find((r) => r.month === lastM);
  const box = (title: string, r: (typeof rows)[number] | undefined, highlight: boolean) => (
    <div className={`chip-3d min-w-0 rounded-xl border px-3 py-2 ${highlight ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/5 bg-black/25"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">{title}</div>
      <div className="text-xl font-semibold tabular-nums text-white">{r ? lkr(r.total) : "LKR 0"}</div>
      <div className="flex flex-wrap gap-x-2 text-[11px] tabular-nums text-[var(--ink-2)]">
        {(Object.keys(KIND) as UtilityKind[]).map((k) =>
          r && r[k] ? (
            <span key={k}>
              {KIND[k].icon} {Math.round(r[k]).toLocaleString()}
            </span>
          ) : null,
        )}
        {!r && <span className="text-[var(--ink-3)]">no bills yet</span>}
      </div>
    </div>
  );
  return (
    <div className="mb-3 grid grid-cols-2 gap-2">
      {box(`This month · ${monthName(thisM)}`, cur, true)}
      {box(`Last month · ${monthName(lastM)}`, prev, false)}
    </div>
  );
}

/** Electricity + water latest-record cards for one unit. */
function ElecWater({ unit, utilities, services }: { unit: string; utilities: UtilitiesState; services: Services }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {(["electricity", "water", "telecom", "mobile"] as const).map((k) => {
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
  onWeighed,
}: {
  g: GasState;
  utilities: UtilitiesState;
  services: Services;
  now: number;
  busy: boolean;
  onFitted: () => void;
  onUndo: () => void;
  onWeighed: () => void;
}) {
  const s = gasSummary(g, now);
  const isoDay = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  // each cylinder: From (fitted) → To (replaced), days lasted, and its cost from the gas records
  const gasRecords = utilities.entries.filter((e) => e.unit === g.unit && e.kind === "gas");
  const history = g.changes
    .map((t, i) => {
      const next = i < g.changes.length - 1 ? g.changes[i + 1] : null;
      const rec = gasRecords.find((e) => e.from === isoDay(t)) ?? (next ? gasRecords.find((e) => e.to === isoDay(next)) : undefined);
      return { from: t, to: next, days: Math.round(((next ?? now) - t) / DAY), cost: rec?.cost ?? null };
    })
    .reverse()
    .slice(0, 5);
  return (
    <div className="space-y-3">
      <div className="chip-3d rounded-2xl border border-white/5 bg-black/25 p-3">
        <div className="mb-1 font-semibold text-[var(--ink-1)]">🔥 Gas cylinder · {g.sizeKg} kg LPG</div>
        <div className="flex flex-wrap items-center gap-3">
          <Ring pct={s.pct} level={s.level} />
          <div className="min-w-0 flex-1 space-y-2 text-sm text-[var(--ink-2)]">
            {/* current cylinder: From → To */}
            <div className="grid grid-cols-2 gap-2">
              <div className="chip-3d chip-in rounded-lg px-2.5 py-1.5">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-sky-300">From · fitted</div>
                <div className="font-semibold tabular-nums text-white">{fmt(s.last)}</div>
                <div className="text-[10px] text-white/60">{s.days} days ago</div>
              </div>
              <div className="chip-3d chip-out rounded-lg px-2.5 py-1.5">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-amber-300">To · expected empty</div>
                <div className="font-semibold tabular-nums text-white">{fmt(s.emptyAt)}</div>
                <div className="text-[10px] text-white/60">{s.daysLeft} days left</div>
              </div>
            </div>
            <div>
              {s.weighed ? "⚖" : "≈"} <b className="text-[var(--ink-1)]">{s.kgLeft.toFixed(1)} kg</b> left
              <span className="text-xs text-[var(--ink-3)]">
                {s.weighed
                  ? ` · weighed ${fmt(s.weighed.t)} (${s.weighed.gross} kg on scale − ${s.weighed.tare} kg empty) · using ${s.perDay.toFixed(2)} kg/day`
                  : ` · estimate: ${g.learned ? `usually lasts ${g.typicalDays} days` : `assuming ${g.typicalDays} days per cylinder`}`}
              </span>
            </div>
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
          <WeighButton g={g} onSaved={onWeighed} />
          {g.source === "live" && (
            <button disabled={busy} onClick={onUndo} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[var(--ink-2)] hover:text-white">
              Undo last
            </button>
          )}
        </div>
        {history.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-white/5">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-black/30 text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                <tr>
                  <th className="px-2.5 py-1.5 text-left">From</th>
                  <th className="px-2.5 py-1.5 text-left">To</th>
                  <th className="px-2.5 py-1.5 text-right">Days</th>
                  <th className="px-2.5 py-1.5 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.from} className={`border-t border-white/5 ${h.to == null ? "bg-emerald-500/10" : ""}`}>
                    <td className="px-2.5 py-1.5 text-[var(--ink-1)]">{fmt(h.from)}</td>
                    <td className="px-2.5 py-1.5">{h.to != null ? <span className="text-[var(--ink-1)]">{fmt(h.to)}</span> : <span className="font-semibold text-emerald-300">● in use</span>}</td>
                    <td className="px-2.5 py-1.5 text-right text-[var(--ink-2)]">{h.days}</td>
                    <td className="px-2.5 py-1.5 text-right text-[var(--ink-2)]">{lkr(h.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
  const header = ["Bill month", "Unit", "Type", "Connection", "From", "To", "Days", "Used", "Measure", "Per day", "Data (LKR)", "Calls (LKR)", "Tax (LKR)", "Other (LKR)", "Cost (LKR)", "Customer", "Account no", "Note"];
  const lines = rows.map((e) =>
    [billMonth(e), name(e.unit), KIND[e.kind].label, e.connection ?? "", e.from, e.to, daysIn(e), e.amount, KIND[e.kind].unit.split(" ")[0], (e.amount / daysIn(e)).toFixed(2), e.charges?.data ?? null, e.charges?.calls ?? null, e.charges?.tax ?? null, e.charges?.other ?? null, e.cost, e.customer, e.account, e.note]
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
  unitInfo = {},
  telecomMap = [],
  billScan = false,
  onChanged,
}: {
  utilities: UtilitiesState;
  units: UnitData[];
  unitId: string | null;
  location: string;
  services: Services;
  unitInfo?: Record<string, UnitInfo>;
  telecomMap?: TelecomLink[];
  billScan?: boolean;
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

  /** Attach a bill photo to a record that is already saved. */
  async function attach(e: UtilityEntry, file: File) {
    try {
      const image = await uploadBill(file);
      if (!image) return window.alert("No connection: try again when online.");
      await post("/api/utilities", { id: e.id, image }, "PATCH");
      onChanged();
    } catch (x) {
      window.alert(x instanceof Error ? x.message : "Could not attach the photo");
    }
  }

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
            className="btn-print rounded-full px-4 py-2 text-sm font-semibold text-white"
          >
            🖨 Print
          </button>
          <button
            onClick={() => downloadCsv(rows, name, `energy-records-${unit}-${kind}-${new Date().toISOString().slice(0, 10)}.csv`)}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            ⬇ Excel (CSV)
          </button>
          <BillScanButton units={units} unitInfo={unitInfo} telecomMap={telecomMap} enabled={billScan} defaultUnit={unit !== "all" ? unit : undefined} onSaved={onChanged} />
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
              <th className="px-3 py-2">Month</th>
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
                <td colSpan={13} className="px-3 py-6 text-center text-[var(--ink-3)]">
                  No records yet. Press + Add record.
                </td>
              </tr>
            )}
            {rows.map((e) => (
              <tr key={e.id} className="border-t border-white/5 odd:bg-white/[0.02] hover:bg-white/[0.05]">
                <td className="px-3 py-2 font-medium text-[var(--ink-1)]">{name(e.unit)}</td>
                <td className="px-3 py-2">
                  <span style={{ color: KIND[e.kind].color }}>{KIND[e.kind].icon}</span> {KIND[e.kind].label}
                  {e.connection && <span className="ml-1 rounded bg-violet-500/20 px-1 text-[10px] font-semibold text-violet-200">{e.connection}</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{monthName(billMonth(e))}</td>
                <td className="px-3 py-2">{fmtDay(e.from)}</td>
                <td className="px-3 py-2">{fmtDay(e.to)}</td>
                <td className="px-3 py-2 text-right">{daysIn(e)}</td>
                <td className="px-3 py-2 text-right text-[var(--ink-1)]">
                  {e.amount} <span className="text-xs text-[var(--ink-3)]">{KIND[e.kind].unit.split(" ")[0]}</span>
                </td>
                <td className="px-3 py-2 text-right">{(e.amount / daysIn(e)).toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-[var(--ink-1)]" title={e.charges ? `Data ${e.charges.data ?? 0} · Calls ${e.charges.calls ?? 0} · Tax ${e.charges.tax ?? 0} · Other ${e.charges.other ?? 0}` : undefined}>
                  {lkr(e.cost)}
                  {e.charges && (
                    <div className="text-[10px] text-[var(--ink-3)]">
                      {e.charges.data ? `📱${Math.round(e.charges.data)} ` : ""}
                      {e.charges.calls ? `📞${Math.round(e.charges.calls)} ` : ""}
                      {e.charges.tax ? `🧾${Math.round(e.charges.tax)}` : ""}
                    </div>
                  )}
                </td>
                <td className="max-w-40 truncate px-3 py-2">{e.customer || "—"}</td>
                <td className="px-3 py-2 text-[var(--ink-3)]">{e.account || "—"}</td>
                <td className="max-w-48 truncate px-3 py-2 text-[var(--ink-3)]" title={e.note}>
                  {e.note || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {e.image ? (
                    <a href={billImageUrl(e.image)} target="_blank" rel="noreferrer" className="rounded px-1.5 text-sky-300 hover:text-white" title="Open the bill photo">
                      📎
                    </a>
                  ) : (
                    utilities.source === "live" && (
                      <label className="cursor-pointer rounded px-1.5 text-[var(--ink-3)] hover:text-white" title="Attach a bill photo">
                        📎+
                        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(ev) => ev.target.files?.[0] && attach(e, ev.target.files[0])} />
                      </label>
                    )
                  )}
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
                <td colSpan={8} className="px-3 py-2 text-right text-[var(--ink-3)]">
                  Total cost ({rows.length} records)
                </td>
                <td className="px-3 py-2 text-right font-semibold text-[var(--ink-1)]">{lkr(total)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {form && <EnergyForm units={units} services={services} unitInfo={unitInfo} telecomMap={telecomMap} billScan={billScan} defaultUnit={unit !== "all" ? unit : undefined} onClose={() => setForm(false)} onSaved={onChanged} />}
    </section>
  );
}
