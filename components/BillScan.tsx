"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { TelecomLink, UnitData, UnitInfo, UtilityKind } from "@/lib/types";
import { sendOrQueue } from "@/lib/outbox";
import { uploadBill } from "@/lib/billImage";

/** Shape returned by /api/bill-scan (see app/api/bill-scan/route.ts). */
type ScannedLine = {
  connection: string;
  description: string;
  usage: number;
  usage_unit: string;
  data_charge: number;
  call_charge: number;
  tax: number;
  other_charge: number;
  total: number;
};
type ScannedBill = {
  kind: UtilityKind | "other";
  provider: string;
  account_number: string;
  customer_name: string;
  address: string;
  bill_date: string;
  period_from: string;
  period_to: string;
  bill_month: string;
  total_amount: number;
  previous_balance: number;
  lines: ScannedLine[];
  confidence_notes: string;
};

type Row = ScannedLine & { units: string[] };

const KINDS: { k: UtilityKind; label: string }[] = [
  { k: "electricity", label: "⚡ Electricity" },
  { k: "water", label: "💧 Water" },
  { k: "telecom", label: "📶 Telecom / data" },
  { k: "gas", label: "🔥 Gas" },
];
const clean = (s: string) => s.replace(/[^0-9a-z]/gi, "").toLowerCase();
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Bill import: photo/PDF → Claude reads it → you check and edit → one record per
 * unit is saved. Telecom connections (D1, D2, D3) go to their units; a shared
 * connection is split equally between its units.
 */
export function BillScanButton({
  units,
  unitInfo,
  telecomMap,
  enabled,
  defaultUnit,
  label = "📷 Import bill",
  onSaved,
}: {
  units: UnitData[];
  unitInfo: Record<string, UnitInfo>;
  telecomMap: TelecomLink[];
  enabled: boolean;
  defaultUnit?: string;
  label?: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={enabled ? "Photograph or upload a bill and it is filled in for you" : "Needs ANTHROPIC_API_KEY in Vercel (see guide)"}
        className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:brightness-110"
      >
        {label}
      </button>
      {open && <BillScanDialog units={units} unitInfo={unitInfo} telecomMap={telecomMap} enabled={enabled} defaultUnit={defaultUnit} onClose={() => setOpen(false)} onSaved={onSaved} />}
    </>
  );
}

function BillScanDialog({
  units,
  unitInfo,
  telecomMap,
  enabled,
  defaultUnit,
  onClose,
  onSaved,
}: {
  units: UnitData[];
  unitInfo: Record<string, UnitInfo>;
  telecomMap: TelecomLink[];
  enabled: boolean;
  defaultUnit?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [stage, setStage] = useState<"pick" | "reading" | "review">("pick");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [head, setHead] = useState({ kind: "electricity" as UtilityKind, provider: "", account: "", customer: "", from: "", to: "", month: "", notes: "" });
  const [rows, setRows] = useState<Row[]>([]);
  const [file, setFile] = useState<File | null>(null); // the bill photo, saved with the records

  /** Which unit(s) a bill line belongs to: telecom connection map, then account number, then the current unit. */
  function unitsFor(line: ScannedLine, bill: ScannedBill): string[] {
    if (line.connection) {
      const m = telecomMap.find((t) => clean(t.code) === clean(line.connection));
      if (m) return m.units;
    }
    const acc = clean(bill.account_number);
    if (acc) {
      const hit = units.find((u) => {
        const i = unitInfo[u.id];
        return i && [i.elecAccount, i.waterAccount, i.telecomAccount].some((a) => a && clean(a) === acc);
      });
      if (hit) return [hit.id];
    }
    return defaultUnit ? [defaultUnit] : [];
  }

  async function read(file: File) {
    setErr(null);
    setFile(file);
    setStage("reading");
    if (file.type.startsWith("image/")) setPreview(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/bill-scan", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
      const bill = j.bill as ScannedBill;
      const kind: UtilityKind = bill.kind === "other" ? "electricity" : bill.kind;
      const month = /^\d{4}-\d{2}$/.test(bill.bill_month) ? bill.bill_month : (bill.period_to || "").slice(0, 7);
      setHead({
        kind,
        provider: bill.provider,
        account: bill.account_number,
        customer: bill.customer_name,
        from: bill.period_from,
        to: bill.period_to,
        month,
        notes: bill.confidence_notes,
      });
      const lines = bill.lines.length
        ? bill.lines
        : [{ connection: "", description: "", usage: 0, usage_unit: "", data_charge: 0, call_charge: 0, tax: 0, other_charge: 0, total: bill.total_amount }];
      setRows(lines.map((l) => ({ ...l, units: unitsFor(l, bill) })));
      setStage("review");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not read the bill");
      setStage("pick");
    }
  }

  /** Type a bill in by hand: same form as a scanned bill, starting empty (telecom starts with D1/D2/D3 lines). */
  function manual(kind: UtilityKind) {
    setErr(null);
    setPreview(null);
    const d = new Date();
    const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    const from = iso(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    const to = iso(new Date(d.getFullYear(), d.getMonth(), 0));
    const providers: Record<UtilityKind, string> = { electricity: "CEB", water: "NWSDB", telecom: "SLT-Mobitel", gas: "Litro" };
    setHead({ kind, provider: providers[kind], account: "", customer: "", from, to, month: to.slice(0, 7), notes: "" });
    const blank = (connection: string, units: string[]): Row => ({
      connection,
      description: "",
      usage: 0,
      usage_unit: kind === "electricity" ? "kWh" : kind === "water" ? "units" : kind === "gas" ? "kg" : "GB",
      data_charge: 0,
      call_charge: 0,
      tax: 0,
      other_charge: 0,
      total: 0,
      units,
    });
    setRows(kind === "telecom" && telecomMap.length ? telecomMap.map((t) => blank(t.code, t.units)) : [blank("", defaultUnit ? [defaultUnit] : [])]);
    setStage("review");
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const toggleUnit = (i: number, u: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, units: r.units.includes(u) ? r.units.filter((x) => x !== u) : [...r.units, u] } : r)));
  const recordCount = rows.reduce((a, r) => a + r.units.length, 0);
  const grand = rows.reduce((a, r) => a + (Number(r.total) || 0), 0);

  async function save() {
    setErr(null);
    if (!isDay(head.from) || !isDay(head.to)) return setErr("Check the From and To dates (YYYY-MM-DD).");
    if (rows.some((r) => !r.units.length)) return setErr("Choose a unit for every line.");
    setBusy(true);
    try {
      // save the bill photo once and link it to every record from this bill
      let image: string | null = null;
      if (file) {
        try {
          image = await uploadBill(file);
        } catch {
          image = null; // the records still save without the photo
        }
      }
      for (const r of rows) {
        const n = r.units.length;
        const split = (v: number) => Math.round(((Number(v) || 0) / n) * 100) / 100;
        for (const unit of r.units) {
          await sendOrQueue("/api/utilities", "POST", {
            unit,
            kind: head.kind,
            from: head.from,
            to: head.to,
            month: head.month,
            amount: split(r.usage),
            cost: split(r.total),
            customer: head.customer,
            account: head.account,
            connection: r.connection,
            charges: { data: split(r.data_charge), calls: split(r.call_charge), tax: split(r.tax), other: split(r.other_charge) },
            note: [`${head.provider} bill`, r.connection, r.description, n > 1 ? `shared 1/${n}` : ""].filter(Boolean).join(" · "),
            image: image ?? undefined,
          });
        }
      }
      onSaved();
      onClose();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none ring-violet-400/50 focus:ring-2";
  const num = "w-full rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-right text-xs tabular-nums text-white outline-none focus:ring-2 ring-violet-400/50";
  const label = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]";

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card-3d max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl p-5 hover:!translate-y-0">
        <div className="-mx-5 -mt-5 mb-4 flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-violet-600/50 via-fuchsia-600/30 to-sky-600/40 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">📷 Import a bill</h2>
            <p className="text-xs text-white/70">
              {stage === "pick" ? "Scan, upload or type a paid bill" : stage === "reading" ? "Reading your bill…" : "Check the details, then save"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full px-2 text-xl text-[var(--ink-3)] hover:text-white" aria-label="Close">
            ×
          </button>
        </div>

        {stage === "pick" && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--ink-2)]">
              Take a photo of the paid bill (electricity, water, telecom / data or gas) or choose a PDF. The app reads it and fills in the
              records for you to check.
            </p>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-[var(--ink-2)]">
              Telecom connections:{" "}
              {telecomMap.map((t) => (
                <span key={t.code} className="mr-3">
                  <b className="text-white">{t.code}</b> → {t.units.map((u) => units.find((x) => x.id === u)?.name ?? u).join(" + ")}
                  {t.units.length > 1 ? " (shared)" : ""}
                </span>
              ))}
            </div>
            {!enabled && (
              <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
                Bill reading is not set up yet. Add <code>ANTHROPIC_API_KEY</code> in Vercel → Settings → Environment Variables and Redeploy
                (see the guide). You can still use “+ Add record” by hand.
              </p>
            )}
            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${enabled ? "" : "pointer-events-none opacity-50"}`}>
              {/* camera: on a phone this opens the camera straight away */}
              <label className="chip-3d group flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-violet-300/40 bg-gradient-to-br from-violet-600/40 via-fuchsia-600/25 to-sky-600/30 px-4 py-6 text-center transition hover:brightness-110">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/15 text-4xl shadow-lg ring-1 ring-white/20 transition group-hover:scale-105">📸</span>
                <span className="text-base font-semibold text-white">Scan with camera</span>
                <span className="text-xs text-white/70">Hold the phone over the bill, flat and well lit</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  disabled={!enabled}
                  onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
                />
              </label>
              {/* gallery / files: photos already taken, screenshots, e-bill PDFs */}
              <label className="chip-3d group flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-600/30 via-cyan-600/20 to-emerald-600/25 px-4 py-6 text-center transition hover:brightness-110">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/15 text-4xl shadow-lg ring-1 ring-white/20 transition group-hover:scale-105">📁</span>
                <span className="text-base font-semibold text-white">Choose photo / PDF</span>
                <span className="text-xs text-white/70">From gallery, WhatsApp, e-mail e-bill… (max 15 MB)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="sr-only"
                  disabled={!enabled}
                  onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
                />
              </label>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 text-sm font-semibold text-white">✍ Or enter the bill by hand</div>
              <div className="flex flex-wrap gap-2">
                {KINDS.map((k) => (
                  <button key={k.k} onClick={() => manual(k.k)} className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10">
                    {k.label}
                  </button>
                ))}
              </div>
              <label className="mt-2 block text-[11px] text-[var(--ink-3)]">
                📎 Attach the bill photo to keep it (optional):
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="mt-1 block w-full text-xs file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>
        )}

        {stage === "reading" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            {preview && <img src={preview} alt="Bill" className="max-h-56 rounded-lg opacity-70" />}
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-400 border-t-transparent" />
            <p className="text-sm text-[var(--ink-2)]">Reading the bill… this takes 10–40 seconds.</p>
          </div>
        )}

        {stage === "review" && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--ink-2)]">Check everything below against the bill, correct anything wrong, then save.</p>
            {head.notes && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-100">⚠ {head.notes}</p>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className={label} htmlFor="bs-kind">Type</label>
                <select id="bs-kind" className={input} value={head.kind} onChange={(e) => setHead({ ...head, kind: e.target.value as UtilityKind })}>
                  {KINDS.map((k) => (
                    <option key={k.k} value={k.k}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="bs-provider">Provider</label>
                <input id="bs-provider" className={input} value={head.provider} onChange={(e) => setHead({ ...head, provider: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor="bs-acc">Account no.</label>
                <input id="bs-acc" className={input} value={head.account} onChange={(e) => setHead({ ...head, account: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor="bs-cust">Customer</label>
                <input id="bs-cust" className={input} value={head.customer} onChange={(e) => setHead({ ...head, customer: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor="bs-from">From</label>
                <input id="bs-from" type="date" className={input} value={head.from} onChange={(e) => setHead({ ...head, from: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor="bs-to">To</label>
                <input id="bs-to" type="date" className={input} value={head.to} onChange={(e) => setHead({ ...head, to: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor="bs-month">Bill month</label>
                <input id="bs-month" type="month" className={input} value={head.month} onChange={(e) => setHead({ ...head, month: e.target.value })} />
              </div>
              <div className="flex items-end">
                <div className="w-full rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2 py-1.5 text-right">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-200">Bill total</div>
                  <div className="font-semibold tabular-nums text-white">LKR {Math.round(grand).toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/5">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-black/30 text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                  <tr>
                    <th className="px-2 py-2">Line</th>
                    <th className="px-2 py-2">Unit(s)</th>
                    <th className="px-2 py-2 text-right">Used</th>
                    <th className="px-2 py-2 text-right">📱 Data</th>
                    <th className="px-2 py-2 text-right">📞 Calls</th>
                    <th className="px-2 py-2 text-right">🧾 Tax</th>
                    <th className="px-2 py-2 text-right">Other</th>
                    <th className="px-2 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-white/5 align-top">
                      <td className="px-2 py-2">
                        <input className={`${input} w-20 text-xs`} value={r.connection} placeholder="—" onChange={(e) => setRow(i, { connection: e.target.value })} />
                        <div className="mt-1 max-w-32 truncate text-[10px] text-[var(--ink-3)]" title={r.description}>
                          {r.description}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex max-w-56 flex-wrap gap-1">
                          {units.map((u) => (
                            <label
                              key={u.id}
                              className={`cursor-pointer rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                                r.units.includes(u.id) ? "border-violet-400/60 bg-violet-500/25 text-white" : "border-white/10 text-[var(--ink-3)]"
                              }`}
                            >
                              <input type="checkbox" className="sr-only" checked={r.units.includes(u.id)} onChange={() => toggleUnit(i, u.id)} />
                              {r.units.includes(u.id) ? "☑" : "☐"} {u.name.replace("Unit ", "U")}
                            </label>
                          ))}
                        </div>
                        {r.units.length > 1 && <div className="mt-1 text-[10px] text-violet-200">split ÷{r.units.length}</div>}
                      </td>
                      <td className="px-2 py-2">
                        <input className={num} type="number" step="any" value={r.usage} onChange={(e) => setRow(i, { usage: Number(e.target.value) })} />
                        <div className="mt-0.5 text-right text-[10px] text-[var(--ink-3)]">{r.usage_unit}</div>
                      </td>
                      {(["data_charge", "call_charge", "tax", "other_charge", "total"] as const).map((k) => (
                        <td key={k} className="px-2 py-2">
                          <input className={num} type="number" step="any" value={r[k]} onChange={(e) => setRow(i, { [k]: Number(e.target.value) } as Partial<Row>)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={() =>
                setRows((rs) => [
                  ...rs,
                  { connection: "", description: "", usage: 0, usage_unit: rs[0]?.usage_unit ?? "", data_charge: 0, call_charge: 0, tax: 0, other_charge: 0, total: 0, units: defaultUnit ? [defaultUnit] : [] },
                ])
              }
              className="rounded-full border border-white/15 px-3 py-1 text-xs text-white hover:bg-white/10"
            >
              + Add line
            </button>
            {file && <p className="text-[11px] text-sky-200">📎 Bill photo will be saved with these records: {file.name}</p>}
            <p className="text-[11px] text-[var(--ink-3)]">
              Lines are matched to units by connection (D1/D2/D3) or account number. A line with two units is split equally between them.
            </p>
            {err && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
            <div className="flex justify-between gap-2">
              <button onClick={() => setStage("pick")} className="rounded-full border border-white/10 px-4 py-2 text-sm text-[var(--ink-2)] hover:text-white">
                ← Another bill
              </button>
              <button
                disabled={busy || recordCount === 0}
                onClick={save}
                className="rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-lg hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "Saving…" : `Save ${recordCount} record${recordCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}
        {stage === "pick" && err && <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
      </div>
    </div>,
    document.body,
  );
}

/** Edit which units each telecom connection (D1, D2, D3…) belongs to. */
export function TelecomMapPanel({ units, telecomMap, onSaved }: { units: UnitData[]; telecomMap: TelecomLink[]; onSaved: () => void }) {
  const [map, setMap] = useState<TelecomLink[]>(telecomMap);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (i: number, u: string) =>
    setMap((m) => m.map((t, j) => (j === i ? { ...t, units: t.units.includes(u) ? t.units.filter((x) => x !== u) : [...t.units, u] } : t)));
  return (
    <section className="card-3d min-w-0 rounded-2xl p-4 hover:!translate-y-0">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">📶 Telecom bill connections</h2>
        <button onClick={() => setMap((m) => [...m, { code: `D${m.length + 1}`, units: [] }])} className="rounded-full border border-white/15 px-3 py-1 text-xs text-white hover:bg-white/10">
          + Add connection
        </button>
      </header>
      <div className="space-y-2">
        {map.map((t, i) => (
          <div key={i} className="chip-3d flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-black/25 px-3 py-2">
            <input
              aria-label="Connection code"
              className="w-16 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm font-semibold text-white"
              value={t.code}
              onChange={(e) => setMap((m) => m.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)))}
            />
            <span className="text-[var(--ink-3)]">→</span>
            {units.map((u) => (
              <label key={u.id} className={`cursor-pointer rounded-md border px-2 py-0.5 text-xs font-semibold ${t.units.includes(u.id) ? "border-violet-400/60 bg-violet-500/25 text-white" : "border-white/10 text-[var(--ink-3)]"}`}>
                <input type="checkbox" className="sr-only" checked={t.units.includes(u.id)} onChange={() => toggle(i, u.id)} />
                {t.units.includes(u.id) ? "☑" : "☐"} {u.name}
              </label>
            ))}
            {t.units.length > 1 && <span className="text-[11px] text-violet-200">shared · split ÷{t.units.length}</span>}
            <button onClick={() => setMap((m) => m.filter((_, j) => j !== i))} className="ml-auto text-[var(--ink-3)] hover:text-red-300" aria-label="Remove">
              🗑
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await sendOrQueue("/api/telecom-map", "POST", { map });
              setMsg("Saved ✓");
              onSaved();
            } catch (x) {
              setMsg(x instanceof Error ? x.message : "Could not save");
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Save connections
        </button>
        {msg && <span className="text-xs text-[var(--ink-2)]">{msg}</span>}
      </div>
    </section>
  );
}
