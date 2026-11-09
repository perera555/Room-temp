/**
 * Property layout. Unit 1 is the main house; Units 2–5 share one building,
 * one unit per floor. Room names must match the names your sensors send.
 */
export type UnitDef = { id: string; name: string; note: string; rooms: string[] };

const FLAT_ROOMS = ["Bedroom 1", "Bedroom 2", "Bedroom 3", "Living room", "Kitchen", "Bathroom 1", "Bathroom 2"];

export const UNITS: UnitDef[] = [
  {
    id: "unit1",
    name: "Unit 1",
    note: "Main house",
    rooms: ["Bedroom 1", "Bedroom 2", "Bedroom 3", "Bedroom 4", "Living room", "Kitchen", "Bathroom"],
  },
  { id: "unit2", name: "Unit 2", note: "Building B · Floor 1", rooms: FLAT_ROOMS },
  { id: "unit3", name: "Unit 3", note: "Building B · Floor 2", rooms: FLAT_ROOMS },
  { id: "unit4", name: "Unit 4", note: "Building B · Floor 3", rooms: FLAT_ROOMS },
  { id: "unit5", name: "Unit 5", note: "Building B · Floor 4", rooms: FLAT_ROOMS },
];

/** "Unit 3", "unit3", "U3", "Flat 3" → "unit3" */
export function unitIdFrom(text: string | undefined | null): string | null {
  if (!text) return null;
  const m = text.match(/\b(?:unit|flat|apt|apartment|u)\s*#?\s*(\d+)\b/i);
  if (!m) return null;
  const id = `unit${Number(m[1])}`;
  return UNITS.some((u) => u.id === id) ? id : null;
}
