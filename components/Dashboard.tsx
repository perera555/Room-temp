"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DashboardData, Point, UnitData } from "@/lib/types";
import { LineChart, StackedBars, Legend, type LineSeries } from "./charts";
import { BookingCalendar, shortRoom } from "./BookingCalendar";
import { InstallButton } from "./InstallButton";
import { WeatherPanel, describe, compass } from "./Weather";
import {
  Agenda,
  AirbnbRooms,
  DAMP,
  Occupancy,
  OverbookingAlert,
  SERIES_COLORS,
  UnitCards,
  UnitHero,
  UnitTabs,
  airbnbRoomList,
  dayKey,
  findOverbookings,
  guestStatus,
} from "./Units";
import { EnergyRecords, UtilitiesPanel, lowestGas } from "./Utilities";
import { WallView } from "./WallView";
import { AlertAnnouncer, AlertBar, AlertsPanel, findTempAlerts } from "./Alerts";
import { MonthlyCosts, UnitsAccountsPanel } from "./UnitAccounts";
import { TelecomMapPanel } from "./BillScan";
import { flushOutbox, onOutboxChange, outboxCount } from "@/lib/outbox";

const OUTSIDE = "#9085e9";
const ELEC = "#3987e5";
const GAS = "#c98500";
const WEIGHT = "#d95926";
const REFRESH_MS = 5 * 60_000;
const VIEW_KEY = "rt:view";
const LAYOUT_KEY = "rt:layout";
const LAST_KEY = "rt:last-data"; // last good data, for offline use

/** Status bar: offline, can't reach server, or changes waiting to sync. Renders nothing when all is fine. */
function OfflineBar({
  online,
  error,
  pending,
  updated,
  syncMsg,
}: {
  online: boolean;
  error: string | null;
  pending: number;
  updated: string;
  syncMsg: string | null;
}) {
  if (online && !error && !pending && !syncMsg) return null;
  const offline = !online;
  return (
    <div
      role="status"
      className={`chip-3d flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-2 text-sm ${
        offline || error ? "border-amber-400/50 bg-amber-500/15 text-amber-100" : "border-sky-400/40 bg-sky-500/10 text-sky-100"
      }`}
    >
      {offline ? (
        <b>📴 Offline: showing data from {updated}</b>
      ) : error ? (
        <b>⚠ Can’t reach the server: showing data from {updated}</b>
      ) : null}
      {(offline || error) && <span className="opacity-80">Live temperatures, weather and bookings update when the connection returns.</span>}
      {pending > 0 && (
        <span className="rounded-full bg-black/30 px-2.5 py-0.5 font-semibold">
          ⏳ {pending} change{pending === 1 ? "" : "s"} saved on this device, will sync when online
        </span>
      )}
      {syncMsg && <span className="font-semibold">{syncMsg}</span>}
    </div>
  );
}

function Panel({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card-3d min-w-0 rounded-2xl p-4 hover:!translate-y-0 ${className}`}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">{title}</h2>
        {right && <div className="text-[11px] uppercase tracking-wider text-[var(--ink-3)]">{right}</div>}
      </header>
      {children}
    </section>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent: string }) {
  return (
    <div className="card-3d flex h-full min-h-[120px] min-w-0 flex-col overflow-hidden rounded-2xl p-4">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)]">{label}</div>
      <div className="mt-1 truncate text-2xl font-semibold tracking-tight text-[var(--ink-1)] sm:text-3xl">{value}</div>
      {sub && <div className="mt-1 text-xs text-[var(--ink-2)]">{sub}</div>}
    </div>
  );
}

function DemoBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300"
      title="Showing sample data — connect a data source (see the user guide)"
    >
      Sample data
    </span>
  );
}

function Skeleton() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_340px]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[520px] rounded-2xl border border-[var(--border)] bg-[var(--surface)]" />
      ))}
    </div>
  );
}

/**
 * Guards against older or cached API responses (e.g. from the offline cache
 * or a server mid-update) so a shape change can never crash the screen.
 */
function normalize(j: DashboardData): DashboardData {
  const gas = Array.isArray(j.gas) ? j.gas : [];
  return {
    ...j,
    units: Array.isArray(j.units) ? j.units.map((u) => ({ ...u, airbnbRooms: u.airbnbRooms ?? [], owner: u.owner ?? null, usage: u.usage ?? null })) : [],
    bookings: (Array.isArray(j.bookings) ? j.bookings : []).map((b) => ({
      ...b,
      room: b.room ?? null,
      checkInTime: b.checkInTime ?? null,
      checkOutTime: b.checkOutTime ?? null,
    })),
    gas: gas.filter((g) => g && Array.isArray(g.changes)),
    utilities: j.utilities && Array.isArray(j.utilities.entries) ? j.utilities : { source: "demo", canRecord: false, entries: [] },
    // older cached data used true/false; convert to the three statuses
    unitInfo: j.unitInfo && typeof j.unitInfo === "object" ? j.unitInfo : {},
    telecomMap: Array.isArray(j.telecomMap) ? j.telecomMap : [],
    billScan: Boolean(j.billScan),
    services: Object.fromEntries(
      Object.entries(j.services && typeof j.services === "object" ? j.services : {}).map(([u, kinds]) => [
        u,
        Object.fromEntries(
          Object.entries(kinds as Record<string, unknown>).map(([k, v]) => [k, v === true ? "in_use" : v === false ? "off" : v]),
        ),
      ]),
    ) as DashboardData["services"],
  };
}

/** Average several series into 30-minute buckets. */
function averageSeries(series: Point[][]): Point[] {
  const B = 30 * 60_000;
  const acc = new Map<number, { s: number; n: number }>();
  for (const pts of series)
    for (const p of pts) {
      const k = Math.round(p.t / B) * B;
      const a = acc.get(k) ?? { s: 0, n: 0 };
      a.s += p.v;
      a.n += 1;
      acc.set(k, a);
    }
  return [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([t, a]) => ({ t, v: Math.round((a.s / a.n) * 10) / 10 }));
}

function latestAvg(units: UnitData[]) {
  const temps = units.flatMap((u) => u.rooms.map((r) => r.temp.at(-1)?.v)).filter((v): v is number => v != null);
  return temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [view, setViewState] = useState("all");
  // "auto": wall view on big landscape screens; "wall"/"scroll" force one.
  const [layout, setLayoutState] = useState<"auto" | "wall" | "scroll">("auto");
  const [bigScreen, setBigScreen] = useState(false);
  // offline mode
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const setLayout = (v: "auto" | "wall" | "scroll") => {
    setLayoutState(v);
    try {
      localStorage.setItem(LAYOUT_KEY, v);
    } catch {}
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved === "wall" || saved === "scroll" || saved === "auto") setLayoutState(saved);
    } catch {}
    const mq = window.matchMedia("(min-width: 1200px) and (orientation: landscape)");
    const on = () => setBigScreen(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const setView = (v: string) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const j = await res.json();
      setData(normalize(j));
      setError(null);
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify(j)); // offline copy on this device
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data");
      // offline: fall back to the last copy saved on this device
      setData((cur) => {
        if (cur) return cur;
        try {
          const saved = localStorage.getItem(LAST_KEY);
          return saved ? normalize(JSON.parse(saved)) : null;
        } catch {
          return null;
        }
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved) setViewState(saved);
    } catch {}
    load();
    setNow(new Date());
    const a = setInterval(load, REFRESH_MS);
    const b = setInterval(() => setNow(new Date()), 15_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

    // offline / back online: send anything saved while offline, then refresh
    const sync = async () => {
      if (!outboxCount()) return load();
      setSyncMsg("Syncing saved changes…");
      const { sent, failed } = await flushOutbox();
      setSyncMsg(
        failed.length ? `Synced ${sent}, ${failed.length} not accepted: ${failed[0]}` : sent ? `✓ Synced ${sent} saved change${sent === 1 ? "" : "s"}` : null,
      );
      setTimeout(() => setSyncMsg(null), 6000);
      load();
    };
    const goOnline = () => {
      setOnline(true);
      sync();
    };
    const goOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    setPending(outboxCount());
    const offOutbox = onOutboxChange(() => setPending(outboxCount()));
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    if (navigator.onLine && outboxCount()) sync();
    return () => {
      clearInterval(a);
      clearInterval(b);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      offOutbox();
    };
  }, [load]);

  const updated = data ? new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--";
  const unit = data?.units.find((u) => u.id === view) ?? null;
  const wall = layout === "wall" || (layout === "auto" && bigScreen);

  const offlineBar = <OfflineBar online={online} error={error} pending={pending} updated={updated} syncMsg={syncMsg} />;
  // rooms that are too hot / too cold right now (real sensor data only)
  const tempAlerts = useMemo(() => (data ? findTempAlerts(data) : []), [data]);

  if (wall && data && now) {
    return (
      <>
        <AlertAnnouncer alerts={tempAlerts} />
        <WallView
          data={data}
          now={now}
          updated={updated}
          loading={loading}
          error={online ? error : "offline"}
          onReload={load}
          onDetailed={() => setLayout("scroll")}
          banner={
            <>
              <AlertBar alerts={tempAlerts} compact />
              {offlineBar}
            </>
          }
        />
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1900px] flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
      <AlertAnnouncer alerts={tempAlerts} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/icons/192" alt="" width={44} height={44} className="rounded-xl shadow-lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
              <span className="text-[var(--ink-1)]">{data?.location ?? "Home"}</span>{" "}
              <span className="bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-400 bg-clip-text text-transparent">Dashboard</span>
            </h1>
            <p className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full ${error ? "bg-red-400" : "animate-ping bg-emerald-400"} opacity-60`} />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${error ? "bg-red-400" : "bg-emerald-400"}`} />
              </span>
              <span className="font-semibold uppercase tracking-wider text-emerald-300/90">{error ? "Offline" : "Live"}</span>
              <span>· {now ? now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) : " "}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden text-3xl font-semibold tabular-nums tracking-tight text-[var(--ink-1)] sm:block">
            {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--"}
          </div>
          <button
            onClick={() => setLayout("wall")}
            className="hidden rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--ink-2)] hover:text-white lg:block"
            title="Show everything on one screen"
          >
            Wall view
          </button>
          <a
            href="/report"
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--ink-2)] hover:text-white"
            title="Print or save every record as PDF"
          >
            🖨 <span className="hidden sm:inline">Print report</span>
          </a>
          <button
            onClick={load}
            disabled={loading}
            title="Refresh now"
            aria-label="Refresh now"
            className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-2)] transition hover:text-white disabled:opacity-50"
          >
            <svg className={loading ? "animate-spin" : ""} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
            </svg>
          </button>
          <Link
            href="/guide"
            className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-sm font-bold text-[var(--ink-2)] hover:text-white"
            title="User guide"
            aria-label="User guide"
          >
            ?
          </Link>
          <InstallButton />
        </div>
      </header>

      {data && <UnitTabs units={data.units} value={unit ? unit.id : "all"} onChange={setView} />}

      <AlertBar alerts={tempAlerts} />
      {offlineBar}

      {!data || !now ? <Skeleton /> : <Body data={data} now={now} updated={updated} unit={unit} onOpen={setView} onReload={load} />}

      <footer className="pt-2 text-center text-[11px] text-[var(--ink-3)]">
        Updated {updated} · refreshes every 5 minutes ·{" "}
        <Link href="/guide" className="underline hover:text-white">
          User guide
        </Link>
      </footer>
    </div>
  );
}

function Body({
  data,
  now,
  updated,
  unit,
  onOpen,
  onReload,
}: {
  data: DashboardData;
  now: Date;
  updated: string;
  unit: UnitData | null;
  onOpen: (id: string) => void;
  onReload: () => void;
}) {
  const todayKey = dayKey(now);

  // Temperature series: unit view → each room; overview → each unit's average.
  const tempSeries: LineSeries[] = unit
    ? unit.rooms.map((r, i) => ({ key: r.key, label: r.label, color: SERIES_COLORS[i % SERIES_COLORS.length], points: r.temp }))
    : data.units.map((u, i) => ({ key: u.id, label: u.name, color: SERIES_COLORS[i % SERIES_COLORS.length], points: averageSeries(u.rooms.map((r) => r.temp)) }));
  const humSeries: LineSeries[] = [
    ...(unit
      ? unit.rooms.map((r, i) => ({ key: `h-${r.key}`, label: r.label, color: SERIES_COLORS[i % SERIES_COLORS.length], points: r.humidity }))
      : data.units.map((u, i) => ({ key: `h-${u.id}`, label: u.name, color: SERIES_COLORS[i % SERIES_COLORS.length], points: averageSeries(u.rooms.map((r) => r.humidity)) }))),
    { key: "h-out", label: "Outside", color: OUTSIDE, points: data.outside.humidity },
  ].filter((s) => s.points.length > 0);
  const tempSeriesReady = tempSeries.filter((s) => s.points.length > 0);

  const indoorAvg = latestAvg(unit ? [unit] : data.units);
  const outsideNow = data.outside.temp.at(-1)?.v;
  const f = data.forecast;

  const airbnbRooms = airbnbRoomList(data.units);
  const roomsBooked = airbnbRooms.filter(({ unit: u, room }) => guestStatus(data.bookings, u.id, todayKey, room).staying).length;
  const { next } = guestStatus(data.bookings, null, todayKey);
  const daysUntil = next ? Math.round((new Date(next.start + "T00:00:00").getTime() - new Date(todayKey + "T00:00:00").getTime()) / 86_400_000) : null;
  const showBookings = unit ? unit.airbnbRooms.length > 0 : airbnbRooms.length > 0;
  // gas tile: this unit's cylinder, or the emptiest one across units
  const gasPick = unit
    ? (() => {
        const g = data.gas.find((x) => x.unit === unit.id);
        return g ? lowestGas([g], now.getTime()) : undefined;
      })()
    : lowestGas(data.gas, now.getTime());
  const gas = gasPick?.s ?? { pct: 0, daysLeft: 0, emptyAt: now.getTime(), level: "ok" as const };
  const showEnergy = data.sources.energy === "live";
  const showWeight = data.sources.weight === "live";

  const latestWeight = data.weight.at(-1)?.v;
  const weightMonthAgo = data.weight.find((p) => p.t >= (data.weight.at(-1)?.t ?? 0) - 30 * 86_400_000)?.v;
  const fmtTime = (t: number) => new Date(t).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <>
      <OverbookingAlert conflicts={findOverbookings(data.bookings, todayKey)} />
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 ${unit ? "hidden" : ""}`}>
        <Tile
          label={unit ? `${unit.name} · indoor average` : "Indoor average · all units"}
          value={indoorAvg != null ? `${indoorAvg.toFixed(1)}°` : "—"}
          accent="linear-gradient(90deg,#3987e5,#199e70)"
          sub={unit ? `${unit.note} · ${unit.rooms.length} rooms` : `${data.units.length} units · ${data.units.reduce((a, u) => a + u.rooms.length, 0)} rooms`}
        />
        <Tile
          label="Outside now"
          value={outsideNow != null ? `${outsideNow.toFixed(1)}°` : "—"}
          accent={OUTSIDE}
          sub={`${describe(f.current.code)} · Wind ${Math.round(f.current.wind)} ${f.windUnit} ${compass(f.current.dir)} · Gusts ${Math.round(f.current.gust)}`}
        />
        <Tile
          label={`Gas · lowest: ${gasPick?.g.unitName ?? "—"}`}
          value={`${gas.pct}% left`}
          accent={gas.level === "critical" ? "#d03b3b" : gas.level === "low" ? "#fab219" : "linear-gradient(90deg,#f97316,#f59e0b)"}
          sub={`≈ ${gas.daysLeft} days left · empty around ${new Date(gas.emptyAt).toLocaleDateString([], { day: "numeric", month: "short" })}${
            gas.level !== "ok" ? " · order soon" : ""
          }`}
        />
        <Tile
          label="Airbnb rooms tonight"
          value={`${roomsBooked} / ${airbnbRooms.length} booked`}
          accent="linear-gradient(90deg,#ff385c,#10b981)"
          sub={
            next
              ? `Next arrival: ${next.guest}${next.room ? ` · ${shortRoom(next.room)}` : ""} · ${daysUntil === 0 ? "today" : `in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`}`
              : "No upcoming arrivals"
          }
        />
      </div>

      {unit ? (
        <UnitHero unit={unit} bookings={data.bookings} todayKey={todayKey} index={data.units.findIndex((u) => u.id === unit.id)} />
      ) : (
        <Occupancy units={data.units} bookings={data.bookings} now={now} />
      )}

      {unit && unit.airbnbRooms.length > 0 && <Occupancy units={[unit]} bookings={data.bookings} now={now} />}

      <WeatherPanel forecast={data.forecast} location={data.location} demo={data.sources.forecast === "demo"} />

      <div
        className={`grid flex-1 grid-cols-1 gap-4 ${
          showBookings ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px]" : "xl:grid-cols-2"
        }`}
      >
        <Panel
          title={unit ? `${unit.name} · temperatures` : "Temperatures · unit averages"}
          right={
            <span className="flex items-center gap-2">
              <DemoBadge show={data.sources.rooms === "demo"} /> Updated {updated}
            </span>
          }
        >
          <h3 className="mb-1 text-sm font-medium text-[var(--ink-1)]">{unit ? "Each room" : "Average per unit"} — last 24 hours</h3>
          {tempSeriesReady.length ? (
            <>
              <Legend items={tempSeriesReady.map((s) => ({ label: s.label, color: s.color }))} />
              <LineChart series={tempSeriesReady} unit="°" height={250} ariaLabel={`Indoor temperature ${unit ? "by room" : "by unit"} over the last 24 hours`} />
            </>
          ) : (
            <p className="py-10 text-center text-sm text-[var(--ink-3)]">No sensor readings for this unit yet.</p>
          )}

          <h3 className="mb-1 mt-5 text-sm font-medium text-[var(--ink-1)]">
            Outside temperature <span className="text-[var(--ink-3)]">· {data.location}</span>
          </h3>
          <LineChart series={[{ key: "out", label: "Outside", color: OUTSIDE, points: data.outside.temp }]} unit="°" area height={140} ariaLabel="Outside temperature over the last 24 hours" />

        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <UtilitiesPanel gas={data.gas} utilities={data.utilities} units={data.units} unitId={unit?.id ?? null} services={data.services} unitInfo={data.unitInfo} telecomMap={data.telecomMap} billScan={data.billScan} now={now.getTime()} onChanged={onReload} />

          <AlertsPanel data={data} />

          <Panel
            title="Humidity"
            right={
              <span className="flex items-center gap-2">
                <DemoBadge show={data.sources.rooms === "demo"} /> Updated {updated}
              </span>
            }
          >
            <h3 className="mb-1 text-sm font-medium text-[var(--ink-1)]">{unit ? "Each room" : "Average per unit"} — last 24 hours</h3>
            <Legend items={humSeries.map((s) => ({ label: s.label, color: s.color }))} />
            <LineChart series={humSeries} unit="%" decimals={0} height={220} ariaLabel="Relative humidity over the last 24 hours" />
            <p className="mt-2 text-xs text-[var(--ink-3)]">⚠ Above {DAMP}% for long periods risks mould: run fans or A/C dry mode.</p>
          </Panel>

          {showEnergy && (
          <Panel
            title="Energy"
            right={
              <span className="flex items-center gap-2">
                <DemoBadge show={data.sources.energy === "demo"} /> Updated {updated}
              </span>
            }
          >
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium text-[var(--ink-1)]">Daily use — last 30 days</h3>
              <span className="text-xs tabular-nums text-[var(--ink-2)]">
                {data.energy.totals.elec} kWh elec · {data.energy.totals.gas} kWh gas · £{data.energy.totals.cost.toFixed(2)}
              </span>
            </div>
            <Legend items={[{ label: "Electricity", color: ELEC }, { label: "Gas", color: GAS }]} />
            <StackedBars
              data={data.energy.daily.map((d) => ({ t: new Date(d.date + "T12:00:00").getTime(), values: { elec: d.elec, gas: d.gas } }))}
              keys={[{ key: "elec", label: "Electricity", color: ELEC }, { key: "gas", label: "Gas", color: GAS }]}
              height={190}
              ariaLabel="Daily electricity and gas use for the last 30 days, in kWh"
            />
            <div className="mb-1 mt-5 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium text-[var(--ink-1)]">Most recent 24h · half-hourly</h3>
              <span className="text-xs tabular-nums text-[var(--ink-2)]">
                {fmtTime(data.energy.lastDay.from)} – {fmtTime(data.energy.lastDay.to)} · {data.energy.lastDay.elec} kWh elec · {data.energy.lastDay.gas} kWh gas
              </span>
            </div>
            <StackedBars
              data={data.energy.halfHourly.map((s) => ({ t: s.t, values: { elec: s.elec, gas: s.gas } }))}
              keys={[{ key: "elec", label: "Electricity", color: ELEC }, { key: "gas", label: "Gas", color: GAS }]}
              height={160}
              xFormat="time"
              decimals={2}
              ariaLabel="Half-hourly electricity and gas use for the most recent 24 hours"
            />
          </Panel>
          )}

          {showWeight && (
          <Panel
            title="Weight"
            className="flex-1"
            right={
              <span className="flex items-center gap-2">
                <DemoBadge show={data.sources.weight === "demo"} />
                {latestWeight != null && (
                  <span className="normal-case tracking-normal text-[var(--ink-2)]">
                    <b className="text-[var(--ink-1)]">{latestWeight.toFixed(1)} kg</b>
                    {weightMonthAgo != null && ` · ${latestWeight - weightMonthAgo >= 0 ? "+" : ""}${(latestWeight - weightMonthAgo).toFixed(1)} kg / 30d`}
                  </span>
                )}
              </span>
            }
          >
            <LineChart
              series={[{ key: "w", label: "Weight", color: WEIGHT, points: data.weight }]}
              unit=" kg"
              area
              endLabels={false}
              xFormat="month"
              height={240}
              ariaLabel="Body weight over time in kilograms"
            />
          </Panel>
          )}
        </div>

        {showBookings && (
          <section className="min-w-0 rounded-2xl bg-gradient-to-b from-emerald-700 via-emerald-800 to-emerald-900 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-1 ring-emerald-400/20">
            <header className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100">
                {unit ? `${unit.name} · room bookings` : "Airbnb guests"}
              </h2>
              <DemoBadge show={data.sources.calendar === "demo"} />
            </header>
            {unit ? (
              <BookingCalendar bookings={data.bookings.filter((b) => b.unit === unit.id)} now={now} lanes={unit.airbnbRooms} />
            ) : (
              <Agenda units={data.units} bookings={data.bookings} todayKey={todayKey} />
            )}
          </section>
        )}
      </div>

      {!unit && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Units · live room temperatures</h2>
            <DemoBadge show={data.sources.rooms === "demo"} />
          </div>
          <UnitCards units={data.units} bookings={data.bookings} todayKey={todayKey} onOpen={onOpen} />
        </section>
      )}

      {!unit && <AirbnbRooms units={data.units} bookings={data.bookings} todayKey={todayKey} onOpen={onOpen} />}

      <EnergyRecords key={unit?.id ?? "all"} utilities={data.utilities} units={data.units} unitId={unit?.id ?? null} location={data.location} services={data.services} unitInfo={data.unitInfo} telecomMap={data.telecomMap} billScan={data.billScan} onChanged={onReload} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <MonthlyCosts key={`mc-${unit?.id ?? "all"}`} utilities={data.utilities} units={data.units} unitId={unit?.id ?? null} />
        {!unit && <UnitsAccountsPanel units={data.units} unitInfo={data.unitInfo} onSaved={onReload} />}
        {!unit && <TelecomMapPanel key={JSON.stringify(data.telecomMap)} units={data.units} telecomMap={data.telecomMap} onSaved={onReload} />}
      </div>
    </>
  );
}
