"use client";

import { useEffect, useState } from "react";
import type { DashboardData, UtilityKind } from "@/lib/types";
import { findOverbookings } from "./Units";
import { KIND, daysIn, gasSummary } from "./Utilities";
import { describe } from "./Weather";
import { addressLine, monthName, monthlyCosts } from "./UnitAccounts";

const day = (k: string) => new Date(k + "T12:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const lkr = (n: number | null) => (n == null ? "—" : `LKR ${Math.round(n).toLocaleString()}`);
const nights = (s: string, e: string) => Math.round((Date.parse(e) - Date.parse(s)) / 86_400_000);

/** Printable report of everything in the app (white, A4-friendly). */
export function Report() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    fetch("/api/dashboard", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        const j = (await r.json()) as DashboardData;
        setData({
          ...j,
          gas: Array.isArray(j.gas) ? j.gas.filter((g) => g && Array.isArray(g.changes)) : [],
          utilities: j.utilities?.entries ? j.utilities : { source: "demo", canRecord: false, entries: [] },
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, []);

  if (error) return <p className="p-8 text-red-700">Could not load the report: {error}</p>;
  if (!data || !now) return <p className="p-8 text-slate-600">Preparing report…</p>;

  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const conflicts = findOverbookings(data.bookings, todayKey);
  const clash = new Set(conflicts.flatMap((c) => [c.a.id, c.b.id]));
  const unitName = (id: string | null) => data.units.find((u) => u.id === id)?.name ?? "—";
  const totalCost = data.utilities.entries.reduce((a, e) => a + (e.cost ?? 0), 0);
  const demo = Object.entries(data.sources).filter(([, v]) => v === "demo").map(([k]) => k);

  return (
    <div className="report mx-auto max-w-[1100px] bg-white p-8 text-[13px] text-slate-900">
      <style>{`
        html, body { background: #fff !important; color: #111 !important; }
        .report h2 { font-size: 15px; font-weight: 700; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #0f172a; break-after: avoid; }
        .report table { width: 100%; border-collapse: collapse; font-size: 11.5px; break-inside: auto; }
        .report th, .report td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
        .report th { background: #f1f5f9; font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; }
        .report tr { break-inside: avoid; }
        .report .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        @page { size: A4; margin: 12mm; }
        @media print { .no-print { display: none !important; } .report { padding: 0; max-width: none; } }
      `}</style>

      <div className="no-print mb-6 flex flex-wrap items-center gap-2">
        <button onClick={() => window.print()} className="rounded-xl bg-gradient-to-b from-sky-600 to-blue-800 px-5 py-2.5 text-base font-semibold text-white shadow-lg hover:brightness-110">
          🖨 Print
        </button>
        <button
          onClick={() => {
            const old = document.title;
            document.title = `${data.location} property report ${todayKey}`; // becomes the PDF file name
            window.print();
            setTimeout(() => (document.title = old), 1000);
          }}
          className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white"
        >
          📄 Save as PDF
        </button>
        <a href="/" className="rounded-lg border border-slate-300 px-4 py-2">
          ← Back to dashboard
        </a>
        <span className="text-xs text-slate-500">For PDF: in the print window choose “Save as PDF” (or “Microsoft Print to PDF”) as the printer.</span>
      </div>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{data.location} · Property report</h1>
          <p className="text-slate-600">
            Printed {now.toLocaleString()} · data updated {new Date(data.generatedAt).toLocaleString()}
          </p>
          {demo.length > 0 && <p className="mt-1 text-xs text-amber-700">Note: sample data shown for: {demo.join(", ")} (not yet connected).</p>}
        </div>
        <img src="/icons/192" alt="" width={56} height={56} className="rounded-xl" />
      </header>

      {conflicts.length > 0 && (
        <div className="mt-4 rounded-lg border-2 border-red-600 bg-red-50 p-3 text-red-800">
          <b>⚠ OVERBOOKING:</b>{" "}
          {conflicts.map((c, i) => (
            <span key={i}>
              {c.room}: {c.a.guest} &amp; {c.b.guest} ({day(c.from)} → {day(c.to)}){i < conflicts.length - 1 ? "; " : ""}
            </span>
          ))}
        </div>
      )}

      <h2>1. Units &amp; owners</h2>
      <table>
        <thead>
          <tr>
            <th>Unit</th>
            <th>Location</th>
            <th>Owner</th>
            <th>Use</th>
            <th>Rooms</th>
            <th className="n">Avg temp now</th>
          </tr>
        </thead>
        <tbody>
          {data.units.map((u) => {
            const t = u.rooms.map((r) => r.temp.at(-1)?.v).filter((v): v is number => v != null);
            return (
              <tr key={u.id}>
                <td><b>{u.name}</b></td>
                <td>{u.note}</td>
                <td>{u.owner ?? "—"}</td>
                <td>{u.usage ?? (u.airbnbRooms.length ? "Airbnb" : "—")}</td>
                <td>{u.rooms.map((r) => r.label).join(", ")}</td>
                <td className="n">{t.length ? `${(t.reduce((a, b) => a + b, 0) / t.length).toFixed(1)} °C` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>1b. Addresses &amp; utility accounts</h2>
      <table>
        <thead>
          <tr>
            <th>Unit</th>
            <th>Address</th>
            <th>Electricity account</th>
            <th>Water supply account</th>
            <th>Telecom / data</th>
            <th>Gas supplier</th>
          </tr>
        </thead>
        <tbody>
          {data.units.map((u) => {
            const i = data.unitInfo?.[u.id];
            return (
              <tr key={u.id}>
                <td><b>{u.name}</b></td>
                <td>{addressLine(i) || "—"}</td>
                <td>{i?.elecAccount ? `${i.elecProvider} ${i.elecAccount}` : "—"}</td>
                <td>{i?.waterAccount ? `${i.waterProvider} ${i.waterAccount}` : "—"}</td>
                <td>
                  {i?.telecomAccount ? `${i.telecomProvider} ${i.telecomAccount}` : "—"}
                  {(i?.mobiles ?? []).map((m) => (
                    <div key={m.number}>
                      📱 {m.provider} {m.number}
                      {m.package ? ` · ${m.package}` : ""}
                      {m.monthly != null ? ` · LKR ${Math.round(m.monthly).toLocaleString()}/mo` : ""}
                    </div>
                  ))}
                </td>
                <td>{i?.gasSupplier ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>2. Room temperature &amp; humidity (last 24 hours)</h2>
      <table>
        <thead>
          <tr>
            <th>Unit</th>
            <th>Room</th>
            <th className="n">Now</th>
            <th className="n">24h low</th>
            <th className="n">24h high</th>
            <th className="n">Humidity now</th>
          </tr>
        </thead>
        <tbody>
          {data.units.flatMap((u) =>
            u.rooms.map((r) => {
              const v = r.temp.map((p) => p.v);
              const h = r.humidity.at(-1)?.v;
              return (
                <tr key={r.key}>
                  <td>{u.name}</td>
                  <td>{r.label}</td>
                  <td className="n">{r.temp.at(-1)?.v.toFixed(1) ?? "—"} °C</td>
                  <td className="n">{v.length ? Math.min(...v).toFixed(1) : "—"} °C</td>
                  <td className="n">{v.length ? Math.max(...v).toFixed(1) : "—"} °C</td>
                  <td className="n">{h != null ? `${Math.round(h)}%${h >= 85 ? " ⚠" : ""}` : "—"}</td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>

      <h2>3. Guest bookings</h2>
      <table>
        <thead>
          <tr>
            <th>Guest</th>
            <th>Unit</th>
            <th>Room</th>
            <th>Check-in</th>
            <th>Check-out</th>
            <th className="n">Nights</th>
            <th>Status</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {data.bookings.length === 0 && (
            <tr>
              <td colSpan={8}>No bookings</td>
            </tr>
          )}
          {[...data.bookings]
            .sort((a, b) => a.start.localeCompare(b.start))
            .map((b) => {
              const status = b.end <= todayKey ? "Past" : b.start <= todayKey ? "Staying now" : "Upcoming";
              return (
                <tr key={b.id} style={clash.has(b.id) ? { background: "#fee2e2" } : undefined}>
                  <td><b>{b.guest}</b></td>
                  <td>{unitName(b.unit)}</td>
                  <td>{b.room ?? "Whole unit"}</td>
                  <td>{day(b.start)} {b.checkInTime}</td>
                  <td>{day(b.end)} {b.checkOutTime}</td>
                  <td className="n">{nights(b.start, b.end)}</td>
                  <td>{clash.has(b.id) ? "⚠ OVERBOOKED" : status}</td>
                  <td>{b.source}</td>
                </tr>
              );
            })}
        </tbody>
      </table>

      <h2>4. Gas cylinders</h2>
      <table>
        <thead>
          <tr>
            <th>Unit</th>
            <th>Cylinder</th>
            <th>Fitted</th>
            <th className="n">Days used</th>
            <th className="n">Est. left</th>
            <th>Likely empty</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.gas.map((g) => {
            const s = gasSummary(g, now.getTime());
            return (
              <tr key={g.unit}>
                <td>{g.unitName}</td>
                <td>{g.sizeKg} kg LPG</td>
                <td>{new Date(s.last).toLocaleDateString()}</td>
                <td className="n">{s.days}</td>
                <td className="n">
                  {s.pct}% (~{s.kgLeft.toFixed(1)} kg)
                </td>
                <td>{new Date(s.emptyAt).toLocaleDateString()}</td>
                <td>{s.level === "critical" ? "Order today" : s.level === "low" ? "Order soon" : "OK"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>5. Energy records (electricity, water, gas, telecom / data)</h2>
      <div className="mb-2 flex flex-wrap gap-4 text-xs">
        {(Object.keys(KIND) as UtilityKind[]).map((k) => {
          const r = data.utilities.entries.filter((e) => e.kind === k);
          return (
            <span key={k}>
              <b>{KIND[k].label}:</b> {r.reduce((a, e) => a + e.amount, 0).toLocaleString()} {KIND[k].unit.split(" ")[0]} · {lkr(r.reduce((a, e) => a + (e.cost ?? 0), 0))}
            </span>
          );
        })}
        <span>
          <b>Total:</b> {lkr(totalCost)}
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Unit</th>
            <th>Type</th>
            <th>From</th>
            <th>To</th>
            <th className="n">Days</th>
            <th className="n">Used</th>
            <th className="n">Per day</th>
            <th className="n">Cost</th>
            <th>Customer</th>
            <th>Account</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {data.utilities.entries.map((e) => (
            <tr key={e.id}>
              <td>{unitName(e.unit)}</td>
              <td>{KIND[e.kind].label}</td>
              <td>{e.from}</td>
              <td>{e.to}</td>
              <td className="n">{daysIn(e)}</td>
              <td className="n">
                {e.amount} {KIND[e.kind].unit.split(" ")[0]}
              </td>
              <td className="n">{(e.amount / daysIn(e)).toFixed(2)}</td>
              <td className="n">{lkr(e.cost)}</td>
              <td>{e.customer || "—"}</td>
              <td>{e.account || "—"}</td>
              <td>{e.note || "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7} className="n">
              <b>Total cost</b>
            </td>
            <td className="n">
              <b>{lkr(totalCost)}</b>
            </td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>

      <h2>5b. Monthly costs per unit (LKR)</h2>
      {[{ id: "all", name: "All units" }, ...data.units].map((u) => {
        const rows = monthlyCosts(data.utilities, u.id).slice(0, 12);
        if (!rows.length) return null;
        const tot = rows.reduce((a, r) => a + r.total, 0);
        return (
          <div key={u.id} style={{ breakInside: "avoid" }} className="mb-3">
            <div className="mb-1 mt-3 font-semibold">{u.name}</div>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="n">Electricity</th>
                  <th className="n">Water</th>
                  <th className="n">Gas</th>
                  <th className="n">Telecom</th>
                  <th className="n">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month}>
                    <td>{monthName(r.month)}</td>
                    <td className="n">{r.electricity ? lkr(r.electricity) : "–"}</td>
                    <td className="n">{r.water ? lkr(r.water) : "–"}</td>
                    <td className="n">{r.gas ? lkr(r.gas) : "–"}</td>
                    <td className="n">{r.telecom ? lkr(r.telecom) : "–"}</td>
                    <td className="n"><b>{lkr(r.total)}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="n"><b>Total ({rows.length} months) · average {lkr(tot / rows.length)} / month</b></td>
                  <td className="n"><b>{lkr(tot)}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}

      <h2>6. Weather</h2>
      <p>
        Now {Math.round(data.forecast.current.temp)} °C, {describe(data.forecast.current.code)}, humidity {data.forecast.current.humidity}%, wind{" "}
        {Math.round(data.forecast.current.wind)} {data.forecast.windUnit} (gusts {Math.round(data.forecast.current.gust)}).
      </p>
      <table className="mt-2">
        <thead>
          <tr>
            <th>Day</th>
            <th>Weather</th>
            <th className="n">High</th>
            <th className="n">Low</th>
            <th className="n">Rain chance</th>
            <th className="n">Max wind</th>
          </tr>
        </thead>
        <tbody>
          {data.forecast.daily.map((d) => (
            <tr key={d.date}>
              <td>{day(d.date)}</td>
              <td>{describe(d.code)}</td>
              <td className="n">{Math.round(d.max)} °C</td>
              <td className="n">{Math.round(d.min)} °C</td>
              <td className="n">{d.rain}%</td>
              <td className="n">
                {Math.round(d.wind)} {data.forecast.windUnit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-12 flex gap-16 text-xs">
        {["Prepared by", "Checked by", "Date"].map((s) => (
          <div key={s} className="w-56 border-t border-slate-800 pt-1">
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}
