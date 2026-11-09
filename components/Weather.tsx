"use client";

import type { Forecast } from "@/lib/types";
import { LineChart, Legend } from "./charts";

const WIND = "#3987e5";
const GUST = "#d95926";

export function describe(code: number) {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "—";
}

export function compass(deg: number) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

export function WeatherIcon({ code, isDay = true, size = 40 }: { code: number; isDay?: boolean; size?: number }) {
  const sun = (
    <g>
      <circle cx="24" cy="24" r="9" fill="#fbbf24" />
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1="24" y1="7" x2="24" y2="11" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" transform={`rotate(${i * 45} 24 24)`} />
      ))}
    </g>
  );
  const moon = <path d="M30 10a14 14 0 1 0 10 22A11 11 0 0 1 30 10Z" fill="#c7d2fe" />;
  const cloud = (fill = "#e2e8f0") => (
    <path d="M16 40h22a8 8 0 0 0 0-16 11 11 0 0 0-21-2 9 9 0 0 0-1 18Z" fill={fill} />
  );
  const drops = (
    <g stroke="#60a5fa" strokeWidth="3" strokeLinecap="round">
      <line x1="18" y1="43" x2="16" y2="47" />
      <line x1="26" y1="43" x2="24" y2="47" />
      <line x1="34" y1="43" x2="32" y2="47" />
    </g>
  );
  const flakes = (
    <g fill="#e0f2fe">
      <circle cx="17" cy="45" r="2" />
      <circle cx="25" cy="46" r="2" />
      <circle cx="33" cy="45" r="2" />
    </g>
  );
  let body;
  if (code === 0 || code === 1) body = isDay ? sun : moon;
  else if (code === 2)
    body = (
      <g>
        <g transform="translate(-6 -6) scale(0.85)">{isDay ? sun : moon}</g>
        <g transform="translate(4 2)">{cloud()}</g>
      </g>
    );
  else if (code === 3) body = <g transform="translate(0 -2)">{cloud("#cbd5e1")}</g>;
  else if (code === 45 || code === 48)
    body = (
      <g stroke="#cbd5e1" strokeWidth="3.5" strokeLinecap="round">
        <line x1="8" y1="18" x2="40" y2="18" />
        <line x1="12" y1="26" x2="36" y2="26" />
        <line x1="8" y1="34" x2="40" y2="34" />
      </g>
    );
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    body = (
      <g transform="translate(0 -6)">
        {cloud("#cbd5e1")}
        {flakes}
      </g>
    );
  else if (code >= 95)
    body = (
      <g transform="translate(0 -6)">
        {cloud("#94a3b8")}
        <path d="M26 40l-5 8h6l-3 7 9-10h-6l3-5Z" fill="#facc15" />
      </g>
    );
  else
    body = (
      <g transform="translate(0 -6)">
        {cloud("#cbd5e1")}
        {drops}
      </g>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={describe(code)}>
      {body}
    </svg>
  );
}

/** Arrow pointing the way the wind blows (meteorological direction is where it comes FROM). */
function WindArrow({ dir, size = 16 }: { dir: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: `rotate(${dir + 180}deg)` }} aria-hidden>
      <path d="M12 3l5 9h-3.5v9h-3v-9H7l5-9Z" fill="currentColor" />
    </svg>
  );
}

function Compass({ dir, speed, unit }: { dir: number; speed: number; unit: string }) {
  return (
    <div className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-black/30">
      {["N", "E", "S", "W"].map((l, i) => (
        <span
          key={l}
          className="absolute text-[10px] font-semibold text-[var(--ink-3)]"
          style={{
            top: i === 0 ? 4 : i === 2 ? undefined : "50%",
            bottom: i === 2 ? 4 : undefined,
            left: i === 3 ? 6 : i === 1 ? undefined : "50%",
            right: i === 1 ? 6 : undefined,
            transform: i % 2 === 0 ? "translateX(-50%)" : "translateY(-50%)",
          }}
        >
          {l}
        </span>
      ))}
      <div className="absolute inset-3 text-sky-400" style={{ transform: `rotate(${dir + 180}deg)` }}>
        <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden>
          <path d="M12 1.5l2.6 5H9.4l2.6-5Z" fill="currentColor" />
        </svg>
      </div>
      <div className="text-center leading-tight">
        <div className="text-2xl font-semibold tabular-nums text-[var(--ink-1)]">{Math.round(speed)}</div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">{unit}</div>
      </div>
    </div>
  );
}

export function WeatherPanel({ forecast, location, demo }: { forecast: Forecast; location: string; demo: boolean }) {
  const c = forecast.current;
  const today = forecast.daily[0];
  const fmtT = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const u = forecast.windUnit;

  return (
    <section className="min-w-0 rounded-2xl border border-[var(--border)] bg-gradient-to-br from-sky-950/60 via-[var(--surface)] to-[var(--surface)] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Weather forecast · {location}</h2>
        {demo && (
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            Sample data
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)] 2xl:grid-cols-[330px_minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Now */}
        <div className="flex items-center gap-4">
          <WeatherIcon code={c.code} isDay={c.isDay} size={72} />
          <div className="min-w-0 flex-1">
            <div className="text-5xl font-semibold tabular-nums tracking-tight text-[var(--ink-1)]">{c.temp.toFixed(0)}°</div>
            <div className="text-sm text-[var(--ink-1)]">{describe(c.code)}</div>
            <div className="mt-1 text-xs text-[var(--ink-2)]">
              Feels {c.feels.toFixed(0)}° · Humidity {c.humidity}%
            </div>
            {today && (
              <div className="mt-0.5 text-xs text-[var(--ink-3)]">
                ☀ {fmtT(today.sunrise)} – {fmtT(today.sunset)}
              </div>
            )}
          </div>
          <div className="flex flex-col items-center gap-1">
            <Compass dir={c.dir} speed={c.wind} unit={u} />
            <div className="text-[11px] text-[var(--ink-2)]">
              {compass(c.dir)} · gusts <b className="text-[var(--ink-1)]">{Math.round(c.gust)}</b>
            </div>
          </div>
        </div>

        {/* 7 days */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {forecast.daily.map((d, i) => {
            const label =
              i === 0
                ? "Today"
                : new Date(d.date + "T12:00:00").toLocaleDateString([], { weekday: "short" });
            return (
              <div
                key={d.date}
                className={`flex min-w-[78px] flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center ${
                  i === 0 ? "border-sky-400/40 bg-sky-400/10" : "border-[var(--border)] bg-black/20"
                }`}
                title={`${describe(d.code)} · wind ${Math.round(d.wind)} ${u} ${compass(d.dir)}, gusts ${Math.round(d.gust)} ${u}`}
              >
                <div className="text-xs font-semibold text-[var(--ink-1)]">{label}</div>
                <WeatherIcon code={d.code} size={34} />
                <div className="text-sm tabular-nums">
                  <b className="text-[var(--ink-1)]">{Math.round(d.max)}°</b>{" "}
                  <span className="text-[var(--ink-3)]">{Math.round(d.min)}°</span>
                </div>
                <div className="text-[11px] tabular-nums text-sky-300">💧 {d.rain}%</div>
                <div className="flex items-center gap-1 text-[11px] tabular-nums text-[var(--ink-2)]">
                  <WindArrow dir={d.dir} size={12} />
                  {Math.round(d.wind)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Wind next 24h */}
        <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-[var(--ink-1)]">Wind — next 24 hours</h3>
            <span className="text-xs text-[var(--ink-3)]">{u}</span>
          </div>
          <Legend items={[{ label: "Wind speed", color: WIND }, { label: "Gusts", color: GUST }]} />
          <LineChart
            series={[
              { key: "wind", label: "Wind", color: WIND, points: forecast.hourly.map((h) => ({ t: h.t, v: h.wind })) },
              { key: "gust", label: "Gusts", color: GUST, points: forecast.hourly.map((h) => ({ t: h.t, v: h.gust })) },
            ]}
            unit={` ${u}`}
            decimals={0}
            height={150}
            endLabels={false}
            ariaLabel={`Forecast wind speed and gusts for the next 24 hours in ${u}`}
          />
        </div>
      </div>
    </section>
  );
}
