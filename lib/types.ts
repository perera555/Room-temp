export type Point = { t: number; v: number };

export type RoomSeries = {
  key: string;
  label: string;
  temp: Point[];
  humidity: Point[];
};

export type UnitData = {
  id: string;
  name: string;
  note: string;
  owner: string | null;
  usage: string | null;
  airbnbRooms: string[]; // bedrooms let on Airbnb (empty = not an Airbnb unit)
  rooms: RoomSeries[];
};

export type EnergyDay = { date: string; elec: number; gas: number };
export type EnergySlot = { t: number; elec: number; gas: number };

export type Booking = {
  id: string;
  guest: string;
  start: string; // YYYY-MM-DD (check-in)
  end: string; // YYYY-MM-DD (check-out, exclusive)
  source: string;
  unit: string | null; // unit id, e.g. "unit2"
  room: string | null; // e.g. "Bedroom 1" (null = whole unit)
  checkInTime: string | null; // "14:00"
  checkOutTime: string | null; // "11:00"
};

export type SourceState = "live" | "demo";

export type Forecast = {
  windUnit: string;
  current: {
    temp: number;
    feels: number;
    humidity: number;
    wind: number;
    gust: number;
    dir: number;
    code: number;
    isDay: boolean;
  };
  hourly: { t: number; temp: number; wind: number; gust: number; rain: number; code: number }[];
  daily: {
    date: string;
    code: number;
    max: number;
    min: number;
    rain: number;
    wind: number;
    gust: number;
    dir: number;
    sunrise: number;
    sunset: number;
  }[];
};

export type GasState = {
  unit: string; // unit id
  unitName: string;
  source: "live" | "settings" | "demo";
  canRecord: boolean; // true when the app can save button presses
  sizeKg: number;
  changes: number[]; // timestamps a new cylinder was fitted, oldest first
  typicalDays: number; // how long a cylinder usually lasts
  learned: boolean; // typicalDays came from real history
};

export type UtilityKind = "electricity" | "water" | "gas" | "telecom"; // telecom = internet / phone / data bill

/** One utility reading / bill: usage between two dates. */
export type UtilityEntry = {
  id: string;
  unit: string; // unit id, e.g. "unit3"
  kind: UtilityKind;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  amount: number; // kWh (electricity), units m³ (water), kg (gas), GB (telecom data)
  cost: number | null; // LKR
  customer: string; // customer / tenant name the bill is for
  account: string; // bill account number (CEB / LECO / water board)
  note: string;
  month?: string; // bill month YYYY-MM (defaults to the "To" date's month)
  charges?: { data?: number; calls?: number; tax?: number; other?: number }; // LKR breakdown (telecom etc.)
  connection?: string; // e.g. "D1" on a multi-line telecom bill
  image?: string; // id of the saved bill photo (open with /api/bill-image?id=…)
};

/** Telecom bill connection → unit(s), e.g. D3 shared by Unit 3 and Unit 4. */
export type TelecomLink = { code: string; units: string[] };

/**
 * Service status per unit:
 *  in_use     – the unit always uses it
 *  on_request – provided only when a tenant/guest asks (temporary)
 *  off        – not in use now (available on request)
 */
export type ServiceStatus = "in_use" | "on_request" | "off";
export type Services = Record<string, Record<UtilityKind, ServiceStatus>>;

export type UtilitiesState = {
  source: "live" | "demo";
  canRecord: boolean;
  entries: UtilityEntry[]; // newest first
};

/** A mobile number or data SIM with its package. */
export type MobileLine = {
  number: string; // e.g. 0771234567
  provider: string; // Mobitel / Dialog / Hutch / Airtel
  package: string; // data package / plan name, e.g. "Unlimited 1490"
  monthly: number | null; // usual monthly cost in LKR
};

/** Each unit's own address and utility accounts (editable in the app). */
export type UnitInfo = {
  address1: string;
  address2: string;
  city: string;
  elecProvider: string; // CEB / LECO
  elecAccount: string;
  waterProvider: string; // NWSDB (water board) / local council
  waterAccount: string;
  gasSupplier: string; // Litro / Laugfs
  telecomProvider: string; // SLT-Mobitel / Dialog / Hutch / Airtel
  telecomAccount: string;
  /** Mobile numbers / data SIMs used in this unit (Mobitel, Dialog, Hutch, Airtel). */
  mobiles: MobileLine[];
  notes: string;
};

export type DashboardData = {
  unitInfo: Record<string, UnitInfo>;
  telecomMap: TelecomLink[];
  billScan: boolean; // true when bill photo reading (ANTHROPIC_API_KEY) is set up
  alerts: {
    hot: number; // too hot at or above °C
    cold: number; // too cold at or below °C
    repeatMin: number;
    channels: { ntfy: boolean; whatsapp: boolean; telegram: boolean };
  };
  utilities: UtilitiesState;
  services: Services;
  generatedAt: string;
  location: string;
  gas: GasState[]; // one per unit with a kitchen
  sources: {
    rooms: SourceState;
    outside: SourceState;
    forecast: SourceState;
    energy: SourceState;
    weight: SourceState;
    calendar: SourceState;
  };
  units: UnitData[];
  outside: { temp: Point[]; humidity: Point[] };
  forecast: Forecast;
  energy: {
    daily: EnergyDay[];
    halfHourly: EnergySlot[];
    totals: { elec: number; gas: number; cost: number };
    lastDay: { elec: number; gas: number; from: number; to: number };
  };
  weight: Point[];
  bookings: Booking[];
};
