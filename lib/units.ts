/**
 * Property layout. Unit 1 is the main house; Units 2–5 share one building,
 * one unit per floor. Room names must match the names your sensors send.
 */
export type UnitDef = {
  id: string;
  name: string;
  note: string;
  owner: string | null; // shown as "Owner: …"
  usage: string | null; // e.g. "Business rooms"
  rooms: string[];
};

const FLAT_ROOMS = ["Bedroom 1", "Bedroom 2", "Bedroom 3", "Living room", "Kitchen", "Bathroom 1", "Bathroom 2"];

export const UNITS: UnitDef[] = [
  {
    id: "unit1",
    name: "Unit 1",
    note: "Main house",
    owner: "P.R. Perera & H.M.S. Mallika",
    usage: null,
    rooms: ["Bedroom 1", "Bedroom 2", "Bedroom 3", "Bedroom 4", "Living room", "Kitchen", "Bathroom"],
  },
  { id: "unit2", name: "Unit 2", note: "Building B · Floor 1", owner: "Dhanushka Perera", usage: null, rooms: FLAT_ROOMS },
  { id: "unit3", name: "Unit 3", note: "Building B · Floor 2", owner: "Sasika Sasnka", usage: "Airbnb guest rooms", rooms: FLAT_ROOMS },
  { id: "unit4", name: "Unit 4", note: "Building B · Floor 3", owner: "Sachithra Madushan", usage: null, rooms: FLAT_ROOMS },
  { id: "unit5", name: "Unit 5", note: "Building B · Floor 4", owner: null, usage: "Business hall", rooms: ["Business hall", "Room", "Bathroom"] },
];

/**
 * Units let to Airbnb guests. Only these show bookings & guests.
 * Default: Unit 3 only. Override with AIRBNB_UNITS="3" or "2,3".
 */
export function airbnbUnitIds(): string[] {
  const raw = process.env.AIRBNB_UNITS ?? "3";
  return raw
    .split(",")
    .map((s) => unitIdFrom(/^\s*\d+\s*$/.test(s) ? `unit ${s.trim()}` : s))
    .filter((v): v is string => Boolean(v));
}

/** Rooms let individually on Airbnb: the bedrooms of each Airbnb unit. */
export function airbnbRoomsFor(unitId: string): string[] {
  if (!airbnbUnitIds().includes(unitId)) return [];
  return UNITS.find((u) => u.id === unitId)?.rooms.filter((r) => /^bedroom/i.test(r)) ?? [];
}

const ROOM_RE = /\b(?:bed(?:room)?|room|rm)\s*#?\s*(\d+)\b/i;

/** "Bed 1", "Bedroom 1", "Room 1", "Rm1" → "Bedroom 1" */
export function roomFrom(text: string | undefined | null): string | null {
  const m = text?.match(ROOM_RE);
  return m ? `Bedroom ${Number(m[1])}` : null;
}

/** Removes "Unit 2" / "Bed 1" tags from an event title, leaving the guest name. */
export function stripTags(title: string) {
  return (
    title
      .replace(/\(?\b(?:unit|flat|apt|apartment|u)\s*#?\s*\d+\b\)?/gi, "")
      .replace(new RegExp(`\\(?${ROOM_RE.source}\\)?`, "gi"), "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s\-–—:|,/]+|[\s\-–—:|,/]+$/g, "")
      .trim() || "Guest"
  );
}

/** "Unit 3", "unit3", "U3", "Flat 3" → "unit3" */
export function unitIdFrom(text: string | undefined | null): string | null {
  if (!text) return null;
  const m = text.match(/\b(?:unit|flat|apt|apartment|u)\s*#?\s*(\d+)\b/i);
  if (!m) return null;
  const id = `unit${Number(m[1])}`;
  return UNITS.some((u) => u.id === id) ? id : null;
}
