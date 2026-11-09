import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "User guide — Room Temp" };

function Section({ id, n, title, children }: { id: string; n: number; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 className="mb-3 flex items-center gap-3 text-lg font-semibold">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 text-sm">{n}</span>
        {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-[var(--ink-2)] [&_b]:text-[var(--ink-1)] [&_code]:rounded [&_code]:bg-black/40 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:text-sky-200 [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ul]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

function EnvTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-black/30 text-xs uppercase tracking-wider text-[var(--ink-3)]">
          <tr>
            <th className="px-3 py-2">Setting name</th>
            <th className="px-3 py-2">What it does</th>
            <th className="px-3 py-2">Example</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, d, e]) => (
            <tr key={k} className="border-t border-[var(--border)] align-top">
              <td className="px-3 py-2"><code>{k}</code></td>
              <td className="px-3 py-2">{d}</td>
              <td className="break-all px-3 py-2 text-xs text-[var(--ink-3)]">{e}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GuidePage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src="/icons/192" alt="" width={48} height={48} className="rounded-xl" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">User guide</h1>
            <p className="text-sm text-[var(--ink-3)]">How Room Temp works and how to set it up</p>
          </div>
        </div>
        <Link href="/" className="rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 px-4 py-2 text-sm font-semibold text-white">
          ← Dashboard
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm">
        {[
          ["how", "How it works"],
          ["install", "Install the app"],
          ["calendar", "Guest calendar"],
          ["sensors", "Room sensors"],
          ["energy", "Energy"],
          ["password", "Password"],
          ["faq", "FAQ"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--ink-2)] hover:text-white">
            {label}
          </a>
        ))}
      </nav>

      <Section id="how" n={1} title="How it works">
        <p>
          Room Temp is a website that runs on <b>Vercel</b> (free hosting). Every 5 minutes the dashboard asks the server for fresh
          data. The server collects it from each source and sends it back in one bundle:
        </p>
        <ul>
          <li><b>Outside weather, 7-day forecast and wind</b> (speed, gusts, direction) come from Open-Meteo, a free weather service. This works straight away. Just set your location.</li>
          <li><b>Guest bookings</b> are read from your Google Calendar and/or Airbnb calendar links (iCal).</li>
          <li><b>Room temperatures</b> come from small sensors in each room that send their readings to the app (see step 4).</li>
          <li><b>Energy</b> comes from your Octopus Energy smart meter data.</li>
          <li><b>Weight</b> comes from any JSON link with your weigh-ins.</li>
        </ul>
        <p>
          Until a source is connected, its panel shows <b>sample data</b> marked with a yellow <b>“Sample data”</b> badge, so you can
          see how it will look. Nothing needs to be installed on a server, and you don’t need a database or an admin account.
          All settings are stored as <b>Environment Variables</b> in your Vercel project.
        </p>
        <p>
          <b>Your property:</b> the top tabs switch between <b>All units</b> and <b>Unit 1–5</b>. Unit 1 is the main house (4 bedrooms,
          living room, kitchen, bathroom). Units 2–5 are the four floors of the second building (each 3 bedrooms, 2 bathrooms, kitchen,
          living room). “All units” shows every room’s live temperature, who is staying in each unit, and a 3-week occupancy chart.
          Tap a unit card to open that unit. A <b>⚠ humidity</b> warning appears when a room reaches 70% or more (ventilate to avoid damp).
        </p>
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
          <b>Does it need outside help?</b> No. The app runs by itself on Vercel. Weather works with no setup. Bookings need only your
          calendar link. Room temperatures need sensors in the rooms, because the app can’t measure temperature by itself.
          Until then those panels show sample data.
        </p>
        <p className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
          To change a setting: Vercel → your project → <b>Settings → Environment Variables</b> → add the name and value → Save →
          then <b>Deployments → ⋯ → Redeploy</b>. Changes appear after the redeploy finishes (about 1 minute).
        </p>
      </Section>

      <Section id="install" n={2} title="Install the app on any device">
        <p>It’s a Progressive Web App (PWA): you install it from the browser, and it opens full-screen with its own icon, like a normal app.</p>
        <ul>
          <li><b>Windows / Mac / Linux (Chrome or Edge):</b> open the site, then click <b>Install app</b> at the top right of the dashboard (or the install icon in the address bar).</li>
          <li><b>Mac (Safari):</b> menu <b>File → Add to Dock</b>.</li>
          <li><b>Android:</b> Chrome menu ⋮ → <b>Install app</b> / <b>Add to Home screen</b>.</li>
          <li><b>iPhone / iPad:</b> open in <b>Safari</b> → tap <b>Share</b> → <b>Add to Home Screen</b>.</li>
        </ul>
        <p>
          <b>Wall display (Raspberry Pi / spare monitor):</b> open the site in Chromium in kiosk mode, e.g.{" "}
          <code>chromium-browser --kiosk https://your-app.vercel.app</code>. The dashboard refreshes itself every 5 minutes.
        </p>
      </Section>

      <Section id="calendar" n={3} title="Connect the guest calendar (Google Calendar / Airbnb)">
        <p><b>Google Calendar:</b></p>
        <ol>
          <li>Open Google Calendar on a computer → ⚙ <b>Settings</b> → click the calendar with the bookings on the left.</li>
          <li>Scroll to <b>Integrate calendar</b> → copy the <b>Secret address in iCal format</b> (ends in <code>.ics</code>).</li>
        </ol>
        <p><b>Airbnb:</b></p>
        <ol>
          <li>Airbnb → <b>Calendar</b> → choose the listing → <b>Availability</b> → <b>Connect to another website / Export calendar</b>.</li>
          <li>Copy the link.</li>
        </ol>
        <p>
          Then add a Vercel environment variable called <code>CALENDAR_ICAL_URLS</code>. Put each link after a <b>unit label</b> and a
          <code>|</code>, separated by commas, so the app knows which unit each booking belongs to:
        </p>
        <p className="break-all"><code>Unit 1|https://…unit1.ics, Unit 2|https://…unit2.ics, Unit 3|https://…unit3.ics, Unit 4|https://…unit4.ics, Unit 5|https://…unit5.ics</code></p>
        <p>
          <b>Using one Google Calendar for everything?</b> That works too. Put the unit in the event title, for example
          <code>Faye – Unit 2</code>. The app shows “Faye” in Unit 2.
        </p>
        <p>
          <b>No admin account is needed.</b> You paste the link once. After that the app re-reads the calendar automatically every
          few minutes, so new bookings appear on their own. The secret link is read-only: the app can’t change your calendar.
          Keep the link private.
        </p>
        <p>
          The <b>event title</b> becomes the guest name on the card. Airbnb links only say “Reserved” and hide guest names. A tip:
          import each Airbnb link into Google Calendar (Other calendars → + → From URL), then rename events there if you want names.
          The same booking found in two calendars is shown once, and “Not available” blocks are hidden.
        </p>
      </Section>

      <Section id="sensors" n={4} title="Room temperature sensors">
        <p>
          The app can’t measure temperature by itself. Each room needs a small Wi-Fi sensor. You <b>don’t</b> need to build a server:
          sensors send readings straight to the app at <code>/api/readings</code>.
        </p>
        <p><b>One-time setup (about 5 minutes):</b></p>
        <ol>
          <li>Vercel → your project → <b>Storage</b> → <b>Create / Connect</b> → <b>Upstash (Redis)</b> → free plan → connect to this project. Vercel adds the database keys for you.</li>
          <li>In <b>Settings → Environment Variables</b> add <code>SENSOR_API_KEY</code> = any long secret word (e.g. <code>blue-river-7731</code>). Redeploy.</li>
        </ol>
        <p><b>Easiest sensor: Shelly H&amp;T</b> (Wi-Fi, battery, no coding, about £25 each, 35 needed for every room):</p>
        <ol>
          <li>Set it up with the Shelly app and join it to the unit’s Wi-Fi.</li>
          <li>Open the sensor’s settings → <b>Actions / Report URL</b> (“Sensor report”) and paste, changing unit and room:
            <br /><code className="break-all">https://YOUR-APP.vercel.app/api/readings?key=YOUR_SENSOR_API_KEY&amp;unit=2&amp;room=Bedroom%201</code>
            <br />The Shelly adds the temperature and humidity itself.
          </li>
          <li>Room names should match the dashboard: <code>Bedroom 1</code>…<code>Bedroom 4</code>, <code>Living room</code>,
            <code>Kitchen</code>, <code>Bathroom</code> (Unit 1) or <code>Bathroom 1</code>/<code>Bathroom 2</code> (Units 2–5). Use
            <code>%20</code> for spaces.</li>
        </ol>
        <p><b>Other sensors</b> (ESP32, Raspberry Pi, Home Assistant, anything that can call a web address) send:</p>
        <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-sky-100">{`POST https://YOUR-APP.vercel.app/api/readings?key=YOUR_SENSOR_API_KEY
Content-Type: application/json

{ "unit": 2, "room": "Kitchen", "temp": 20.4, "humidity": 55 }`}</pre>
        <p>
          Every 10–15 minutes per room is plenty. The dashboard keeps the last 24 hours. Rooms appear as soon as their first reading
          arrives.
        </p>
        <p>
          <b>Already have a system</b> that publishes all readings as one JSON file? Set <code>SENSOR_FEED_URL</code> instead
          (format: <code>{`{"units":[{"name":"Unit 1","rooms":[{"name":"Kitchen","readings":[{"t":"…","temp":20.1,"humidity":52}]}]}]}`}</code>).
        </p>
        <p>
          Set <code>LATITUDE</code>, <code>LONGITUDE</code> and <code>LOCATION_NAME</code> so the weather is for your town.
        </p>
      </Section>

      <Section id="energy" n={5} title="Energy (Octopus Energy smart meter)">
        <ol>
          <li>Log in at octopus.energy → <b>Account</b> → <b>Personal details</b> → <b>Developer settings</b> (API access).</li>
          <li>Copy your <b>API key</b>, electricity <b>MPAN</b> + <b>meter serial</b>, and gas <b>MPRN</b> + <b>meter serial</b>.</li>
          <li>Add them in Vercel (table below). Set your unit prices so the £ cost is right.</li>
        </ol>
        <p>Smart meter data usually arrives a day late — that’s why “most recent 24h” can show yesterday.</p>
      </Section>

      <Section id="password" n={6} title="Password protection (recommended)">
        <p>
          No admin account is needed. To keep guest names private, add <code>DASHBOARD_PASSWORD</code> in Vercel. Each device asks
          for the password once and stays signed in for a year. Remove the variable to turn the lock off.
        </p>
      </Section>

      <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="text-lg font-semibold">All settings</h2>
        <EnvTable
          rows={[
            ["DASHBOARD_PASSWORD", "Optional password lock", "my-secret-pin"],
            ["LOCATION_NAME", "Name shown in the header", "Brighton"],
            ["LATITUDE / LONGITUDE", "Location for outside weather & forecast", "50.82 / -0.14"],
            ["WIND_UNIT", "Wind speed unit: mph, kmh, ms or kn", "mph"],
            ["CALENDAR_ICAL_URLS", "Google/Airbnb iCal links with unit labels, comma separated", "Unit 1|https://…/basic.ics, Unit 2|https://…"],
            ["SENSOR_API_KEY", "Secret word sensors use to send readings", "blue-river-7731"],
            ["KV_REST_API_URL / KV_REST_API_TOKEN", "Added automatically when you connect Upstash Redis", "(automatic)"],
            ["SENSOR_FEED_URL", "Alternative: one JSON file with all readings", "https://pi.example.com/rooms.json"],
            ["SENSOR_FEED_TOKEN", "Optional token for the feed", "abc123"],
            ["OCTOPUS_API_KEY", "Octopus Energy API key", "sk_live_…"],
            ["OCTOPUS_ELEC_MPAN / OCTOPUS_ELEC_SERIAL", "Electricity meter", "1200012345678 / 21L1234567"],
            ["OCTOPUS_GAS_MPRN / OCTOPUS_GAS_SERIAL", "Gas meter", "1234567890 / E6S12345678901"],
            ["OCTOPUS_GAS_UNITS", "Set to kwh if gas is already in kWh (default m³)", "kwh"],
            ["ELEC_RATE_PENCE / GAS_RATE_PENCE", "Unit prices for cost estimate", "24.5 / 6.3"],
            ["WEIGHT_FEED_URL", "JSON list of {date, kg}", "https://…/weight.json"],
          ]}
        />
      </section>

      <Section id="faq" n={7} title="FAQ">
        <ul>
          <li><b>Do I need an admin account?</b> No. Only your Vercel login to change settings. Optional password for viewers.</li>
          <li><b>Does it cost anything?</b> Vercel’s free Hobby plan is enough. Open-Meteo is free. Octopus API is free.</li>
          <li><b>How do I update the app?</b> Push changes to GitHub — Vercel redeploys automatically. Installed apps update on next open.</li>
          <li><b>Offline?</b> The last loaded dashboard stays visible and refreshes when the connection returns.</li>
          <li><b>A panel says “Sample data”.</b> That source isn’t connected yet, or its link failed. Check the setting and redeploy.</li>
        </ul>
      </Section>
    </main>
  );
}
