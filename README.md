# Room Temp: home dashboard

An installable web app (PWA) for a wall screen, phone or computer. It shows:

- **Room temperatures & humidity** for the last 24 hours
- **Outside weather**: live temperature, a 7-day forecast, and wind speed, gusts and direction (Open-Meteo, free, no key)
- **Energy use**: 30 days of daily totals plus the most recent 24 hours, half-hourly, with £ cost (Octopus Energy API)
- **Weight** history
- **Airbnb guest bookings** from Google Calendar and/or Airbnb iCal links

Any source that is not connected yet shows **sample data** and a yellow "Sample data" badge.

The full user guide is inside the app at **`/guide`**.

## How it works

```
Browser / installed app ──every 5 min──▶ /api/dashboard (Vercel)
                                            ├─ Open-Meteo        → outside weather + forecast + wind
                                            ├─ Google/Airbnb iCal → guest bookings
                                            ├─ SENSOR_FEED_URL   → room temperatures
                                            ├─ Octopus API       → electricity & gas
                                            └─ WEIGHT_FEED_URL   → weight
```

There is no database and no admin account. All settings are environment variables (see `.env.example`).

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in what you have
npm run dev                  # http://localhost:3000
```

## Deploy

The project is linked to Vercel. Every push to GitHub `main` redeploys automatically.
Add settings in **Vercel → Project → Settings → Environment Variables**, then **Redeploy**.

## Install as an app

- **Windows / Mac / Android (Chrome, Edge):** click **Install app** in the dashboard header
- **iPhone / iPad:** Safari → Share → **Add to Home Screen**
- **Mac Safari:** File → **Add to Dock**
- **Raspberry Pi wall display:** `chromium-browser --kiosk https://<your-app>.vercel.app`
