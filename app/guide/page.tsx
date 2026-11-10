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
          ["energy", "Energy & printing"],
          ["overbooking", "Overbooking"],
          ["alerts", "Hot/cold alerts"],
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
          <li><b>Gas cylinder</b>: estimated from the day you fit a new 12.5 kg cylinder (one button press). Electricity and water can be added later.</li>
        </ul>
        <p>
          Until a source is connected, its panel shows <b>sample data</b> marked with a yellow <b>“Sample data”</b> badge, so you can
          see how it will look. Nothing needs to be installed on a server, and you don’t need a database or an admin account.
          All settings are stored as <b>Environment Variables</b> in your Vercel project.
        </p>
        <p>
          <b>Your property:</b> the top tabs switch between <b>All units</b> and <b>Unit 1–5</b>.
        </p>
        <ul>
          <li><b>Unit 1</b>: main house (4 bedrooms, living room, kitchen, bathroom). Owner P.R. Perera &amp; H.M.S. Mallika.</li>
          <li><b>Unit 2</b>: Building B, floor 1 (3 bedrooms, 2 bathrooms, kitchen, living room). Owner Dhanushka Perera.</li>
          <li><b>Unit 3</b> <span className="text-[#ff8fa3]">(Airbnb)</span>: Building B, floor 2. Its <b>3 double bedrooms are let individually to Airbnb guests</b>. Owner Sasika Sasnka.</li>
          <li><b>Unit 4</b>: Building B, floor 3 (3 bedrooms, 2 bathrooms, kitchen, living room). Owner Sachithra Madushan.</li>
          <li><b>Unit 5</b>: Building B, floor 4. <b>Business hall</b>, one room and a bathroom.</li>
        </ul>
        <p>
          Only <b>Unit 3</b> shows bookings and guests. The other units show temperatures only. “All units” starts with Unit 3’s three
          guest rooms (who is in each room tonight, check-ins and check-outs), then a 3-week room occupancy chart, weather, charts,
          and at the bottom every unit’s live room temperatures. A <b>⚠ humidity</b> warning appears when a room reaches 70% or more
          (ventilate to avoid damp). Owner names and rooms are set in <code>lib/units.ts</code>.
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
          Bookings are for <b>Unit 3’s three double bedrooms</b>, each its own Airbnb listing. Add a Vercel environment variable called
          <code>CALENDAR_ICAL_URLS</code> with each room’s link after a <b>room label</b> and a <code>|</code>, separated by commas:
        </p>
        <p className="break-all"><code>Bedroom 1|https://…room1.ics, Bedroom 2|https://…room2.ics, Bedroom 3|https://…room3.ics</code></p>
        <p>
          <b>Using one Google Calendar for all three rooms?</b> That works too. Put the room in the event title, for example
          <code>Faye – Bed 1</code> or <code>Alberto (Bedroom 3)</code>. The app shows “Faye” in Bedroom 1. Bookings with no room are
          shown across all three rooms.
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
        <p><b>Easiest sensor: Shelly H&amp;T</b> (Wi-Fi, battery, no coding, one per room you want to watch; sold online and by Sri Lankan smart-home shops):</p>
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

      <Section id="energy" n={5} title="Utilities: gas cylinder, electricity, water">
        <p>
          <b>Gas cylinder (12.5 kg LPG):</b> there is no meter for a cylinder, so the app <b>estimates</b> how much is left from the date
          it was fitted. When you change the cylinder, open the dashboard and press <b>New cylinder fitted</b>. The app shows days used,
          about how many kg and days are left, and the likely empty date. It warns you (⚠ at 25%, ⛔ at 10%) so you can order the next one.
        </p>
        <ul>
          <li>It starts by assuming one cylinder lasts <b>about 3 months (90 days)</b>. After two or more changes it learns how long yours really last.</li>
          <li>Pressed it by mistake? Use <b>Undo last</b>.</li>
          <li>The button needs the free Upstash database (step 4). Without it, set <code>GAS_LAST_CHANGED</code> (e.g. <code>2026-11-02</code>) in Vercel instead.</li>
        </ul>
        <p>
          <b>Energy records (per unit):</b> open <b>Detailed view</b> → <b>Energy</b> panel or the <b>Energy records</b> list →
          <b>+ Add record</b>. Choose Electricity, Water or Gas, the <b>unit</b>, the <b>From</b> and <b>To</b> dates, how much was used
          (kWh, water units, or kg), the <b>cost in LKR</b>, the <b>customer</b> name and the bill <b>account no.</b> The app works out
          days and usage per day. Filter the list by unit or type, and delete wrong entries with 🗑.
        </p>
        <p>
          <b>Each unit separately: address &amp; accounts.</b> On a unit’s page (or in the “Units · addresses &amp; utility accounts”
          list) press <b>✎ Edit</b> and enter address line 1, line 2 and city, the <b>⚡ electricity account</b> (CEB / LECO), the
          <b> 💧 water supply account</b> (NWSDB / council), the <b>📶 telecom / data account</b> (SLT-Mobitel, Dialog, Hutch, Airtel)
          , the gas supplier, and every <b>📱 mobile number / data SIM</b> (Mobitel, Dialog, Hutch, Airtel) with its data package and
          monthly cost. <b>+ Add record</b> then fills in the right account number automatically, and mobile bills go to the right unit
          by phone number.
        </p>
        <p>
          <b>📶 Telecom / data bills</b> work exactly like electricity and water: From → To, data used (GB), cost in LKR.
          <b> Monthly costs:</b> the Energy panel shows <b>this month’s and last month’s total</b>, and the “Monthly costs (LKR)” table
          shows every month per unit (⚡ 💧 🔥 📶 and total). A bill counts in the month of its “To” date. Both are also in the
          printed report.
        </p>
        <p>
          <b>📷 Import a paid bill (reads the photo for you):</b> press <b>📷 Import bill</b>, take a photo of the bill (or choose a
          PDF). The app reads the provider, account, period, bill month and every charge (data, calls, tax…), then shows it for you to
          check. Press <b>Save</b> and the records are added to Energy, with the bill photo attached (📎 in the records list).
          Telecom lines are sent to units by connection: <b>D1 → Unit 2, D2 → Unit 3, D3 → Unit 3 + Unit 4</b> (shared, split
          equally). Change this in “📶 Telecom bill connections”. Other bills are matched by account number.
        </p>
        <p className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-3 text-sm">
          <b>Setup for bill reading:</b> create an API key at <b>console.anthropic.com</b> → API Keys (pay as you go; one bill costs only a
          few rupees). In Vercel add <code>ANTHROPIC_API_KEY</code> = that key, then Redeploy. Photos are saved in the Upstash database.
          You can also attach a photo to any record later with <b>📎+</b>, and pick <b>From month → To month</b> in “Monthly costs” to
          print or download (Excel) any range.
        </p>
        <p>
          <b>Services checklist:</b> each unit has checkboxes ☑ Electricity ☑ Water ☐ Gas. Ticked = in use. Unticked = “Not in use now ·
          available on request”. By default only <b>Unit 1</b> uses gas. When another unit starts using gas, press <b>🔥 Start gas</b>
          (or tick Gas) and record its first cylinder. In <b>+ Add record</b> you can tick several services at once (each with its
          own amount and cost), or tick <b>Not in use now</b> to mark a service as unused. Adding a record turns that service on.
        </p>
        <p>
          <b>Print / PDF:</b> the <b>🖨 Print report</b> button (top of the dashboard) opens a full report of everything: units and
          owners, room temperatures, all guest bookings with check-in and check-out times, gas cylinders, energy records with totals,
          and the weather. Press <b>Print</b>, or <b>Save as PDF</b> and choose “Save as PDF” as the printer. The Energy records list
          also has its own <b>🖨 Print</b> and <b>⬇ Excel (CSV)</b> buttons for just the filtered records.
        </p>
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          Saving records, gas changes and sensor readings needs the free <b>Upstash Redis</b> database connected in Vercel (step 4).
          Until then the panels show sample data.
        </p>
      </Section>

      <Section id="alerts" n={6} title="Too hot / too cold alerts (voice and phone messages)">
        <p>
          When a room reaches <b>32°C or more</b> (too hot) or <b>20°C or less</b> (too cold), the dashboard shows a red or blue
          <b> TOO HOT / TOO COLD</b> bar. It can also <b>speak the warning</b> and send a <b>message to your phone</b>. Alerts only
          come from real sensors, never from sample data. Change the limits with <code>ALERT_HOT</code> and <code>ALERT_COLD</code>.
        </p>
        <p>
          <b>Voice on the wall screen:</b> tap <b>🔇</b> in the top bar (or tick “Voice &amp; beep” in the Alerts panel) so it shows
          <b> 🔊</b>. Browsers only allow sound after one tap, so tap it once after the screen starts. On a Raspberry Pi kiosk you can
          start Chromium with <code>--autoplay-policy=no-user-gesture-required</code>. The warning repeats every 15 minutes while the
          room is still out of range.
        </p>
        <p><b>Phone messages (works even when the app is closed). Choose one or more:</b></p>
        <ol>
          <li>
            <b>ntfy (easiest, free, no account):</b> install the <b>ntfy</b> app (Android / iPhone) → <b>+</b> → subscribe to a secret
            topic name you invent, e.g. <code>roomtemp-perera-7731</code>. In Vercel add <code>NTFY_TOPIC</code> = that name.
          </li>
          <li>
            <b>WhatsApp (free via CallMeBot):</b> open <b>callmebot.com</b> → WhatsApp API and save the number shown there (it can
            change) in your phone, send it the WhatsApp message
            <code>I allow callmebot to send me messages</code>. You get an API key back. In Vercel add
            <code>CALLMEBOT_WHATSAPP</code> = <code>+9477xxxxxxx:APIKEY</code> (several numbers: separate with commas).
          </li>
          <li>
            <b>Telegram:</b> create a bot with <b>@BotFather</b> (gives <code>TELEGRAM_BOT_TOKEN</code>), send your bot a message, then
            get your chat id (e.g. from <b>@userinfobot</b>) for <code>TELEGRAM_CHAT_ID</code>.
          </li>
        </ol>
        <p>
          After adding a setting, <b>Redeploy</b> and press <b>🔔 Test alert</b> in the Alerts panel. You get one message when a room
          goes out of range, a reminder every hour (<code>ALERT_REPEAT_MIN</code>) while it lasts, and “✅ back to normal” when it
          recovers. Phone messages need the Upstash database (step 4) so the app remembers what it already sent.
        </p>
      </Section>

      <Section id="overbooking" n={7} title="Avoiding overbooking">
        <p>
          The dashboard checks every booking. If two bookings overlap for the same bedroom, a red <b>⚠ OVERBOOKING</b> bar appears with
          both guests and the dates, and the clash turns red in the occupancy chart. Cancel or move one of them.
        </p>
        <p>
          <b>To stop it happening:</b> keep every calendar in sync both ways. In Airbnb → Calendar → Availability →{" "}
          <b>Import calendar</b>, add your Google Calendar’s iCal link, so dates you book elsewhere are blocked on Airbnb. In Google
          Calendar add the Airbnb link (Other calendars → From URL). Note that Airbnb refreshes imported calendars every few hours,
          so block last-minute bookings by hand.
        </p>
      </Section>

      <Section id="password" n={8} title="Password protection (recommended)">
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
            ["LOCATION_NAME", "Name shown in the header and weather (default Sri Lanka)", "Negombo"],
            ["LATITUDE / LONGITUDE", "Your town for weather (default Colombo). Find it on Google Maps: right-click → copy numbers", "7.2083 / 79.8358"],
            ["WIND_UNIT", "Wind speed unit: kmh (default), mph, ms or kn", "kmh"],
            ["GAS_CYLINDER_KG", "Gas cylinder size (default 12.5)", "12.5"],
            ["GAS_CYLINDER_DAYS", "How long a cylinder lasts until the app learns it (default 90)", "90"],
            ["GAS_LAST_CHANGED", "Date the current cylinder was fitted (only if not using the button)", "2026-11-02"],
            ["CALENDAR_ICAL_URLS", "Google/Airbnb iCal links for Unit 3's rooms, comma separated", "Bedroom 1|https://…, Bedroom 2|https://…"],
            ["AIRBNB_UNITS", "Which unit(s) are let on Airbnb (default 3)", "3"],
            ["SENSOR_API_KEY", "Secret word sensors use to send readings", "blue-river-7731"],
            ["KV_REST_API_URL / KV_REST_API_TOKEN", "Added automatically when you connect Upstash Redis", "(automatic)"],
            ["SENSOR_FEED_URL", "Alternative: one JSON file with all readings", "https://pi.example.com/rooms.json"],
            ["SENSOR_FEED_TOKEN", "Optional token for the feed", "abc123"],
          ]}
        />
      </section>

      <Section id="faq" n={9} title="FAQ">
        <ul>
          <li><b>Do I need an admin account?</b> No. Only your Vercel login to change settings. Optional password for viewers.</li>
          <li><b>Does it cost anything?</b> The app itself is free: Vercel’s free Hobby plan, Open-Meteo weather and Upstash’s free plan are enough. You only pay for sensors.</li>
          <li><b>How do I update the app?</b> Push changes to GitHub — Vercel redeploys automatically. Installed apps update on next open.</li>
          <li>
            <b>Offline?</b> The installed app still opens and shows the last loaded data with a “📴 Offline” bar. Records, gas cylinders and
            checklist changes made offline are kept on the device (“⏳ waiting to sync”) and sent automatically when the internet returns.
            Live temperatures, weather and new bookings need the internet. Open the app once online on each device first.
          </li>
          <li><b>A panel says “Sample data”.</b> That source isn’t connected yet, or its link failed. Check the setting and redeploy.</li>
        </ul>
      </Section>
    </main>
  );
}
