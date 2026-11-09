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

export type DashboardData = {
  generatedAt: string;
  location: string;
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
