/**
 * Tiny reading store on Upstash Redis (REST API, no SDK).
 * Connect it in Vercel → Storage → Upstash (Redis); Vercel then adds
 * KV_REST_API_URL and KV_REST_API_TOKEN automatically.
 */
const KEEP_MS = 26 * 3_600_000;

function cfg() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export const storeEnabled = () => cfg() !== null;

async function pipeline(commands: (string | number)[][]) {
  const c = cfg();
  if (!c) throw new Error("Reading store not configured");
  const res = await fetch(`${c.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  return (await res.json()) as { result?: unknown; error?: string }[];
}

export type StoredReading = { t: number; temp?: number; humidity?: number };

const roomKey = (unit: string, room: string) => `rt:r:${unit}:${room}`;

export async function saveReadings(rows: { unit: string; room: string; r: StoredReading }[]) {
  const cutoff = Date.now() - KEEP_MS;
  const cmds: (string | number)[][] = [];
  for (const { unit, room, r } of rows) {
    const key = roomKey(unit, room);
    cmds.push(["ZADD", key, r.t, JSON.stringify(r)]);
    cmds.push(["ZREMRANGEBYSCORE", key, 0, cutoff]);
    cmds.push(["SADD", "rt:rooms", `${unit}|${room}`]);
  }
  await pipeline(cmds);
}

/* ---------------- Utility entries (electricity / water / gas) ---------------- */
const UTIL_KEY = "rt:util:entries";

export async function loadUtilityEntries<T>(): Promise<T[]> {
  const [res] = await pipeline([["LRANGE", UTIL_KEY, 0, -1]]);
  return ((res?.result as string[]) ?? []).map((s) => JSON.parse(s) as T);
}

export async function addUtilityEntry(entry: object) {
  await pipeline([
    ["LPUSH", UTIL_KEY, JSON.stringify(entry)],
    ["LTRIM", UTIL_KEY, 0, 499],
  ]);
}

export async function deleteUtilityEntry(id: string) {
  const [res] = await pipeline([["LRANGE", UTIL_KEY, 0, -1]]);
  const match = ((res?.result as string[]) ?? []).find((s) => {
    try {
      return JSON.parse(s).id === id;
    } catch {
      return false;
    }
  });
  if (match) await pipeline([["LREM", UTIL_KEY, 1, match]]);
  return Boolean(match);
}

/* ---------------- Temperature alert state (one key per room) ---------------- */
export type AlertMemory = { kind: "hot" | "cold"; sentAt: number };

export async function getAlertMemory(key: string): Promise<AlertMemory | null> {
  const [res] = await pipeline([["GET", key]]);
  try {
    return res?.result ? (JSON.parse(res.result as string) as AlertMemory) : null;
  } catch {
    return null;
  }
}

export async function setAlertMemory(key: string, m: AlertMemory) {
  await pipeline([["SET", key, JSON.stringify(m), "EX", 3 * 24 * 3600]]);
}

export async function clearAlertMemory(key: string) {
  await pipeline([["DEL", key]]);
}

/* ---------------- Services in use per unit ---------------- */
const SERVICES_KEY = "rt:services";

type StoredStatus = "in_use" | "on_request" | "off";

/** Stored overrides: { unit2: { gas: "on_request" }, … } (missing = default). Old true/false values still read. */
export async function loadServiceOverrides(): Promise<Record<string, Record<string, StoredStatus>>> {
  const [res] = await pipeline([["GET", SERVICES_KEY]]);
  try {
    const raw: Record<string, Record<string, unknown>> = res?.result ? JSON.parse(res.result as string) : {};
    const norm = (v: unknown): StoredStatus | undefined =>
      v === true ? "in_use" : v === false ? "off" : v === "in_use" || v === "on_request" || v === "off" ? v : undefined;
    return Object.fromEntries(
      Object.entries(raw).map(([u, kinds]) => [
        u,
        Object.fromEntries(Object.entries(kinds).flatMap(([k, v]) => (norm(v) ? [[k, norm(v)!]] : []))),
      ]),
    );
  } catch {
    return {};
  }
}

export async function setService(unit: string, kind: string, status: StoredStatus) {
  const all = await loadServiceOverrides();
  all[unit] = { ...(all[unit] ?? {}), [kind]: status };
  await pipeline([["SET", SERVICES_KEY, JSON.stringify(all)]]);
}

/** A new record/cylinder means the service is used: switch "off" to "in_use", but keep "on_request". */
export async function markServiceUsed(unit: string, kind: string) {
  const all = await loadServiceOverrides();
  if (all[unit]?.[kind] === "on_request" || all[unit]?.[kind] === "in_use") return;
  await setService(unit, kind, "in_use");
}

/* ---------------- Gas cylinder changes ---------------- */
const gasKey = (unit: string) => `rt:gas:changes:${unit}`;

/** Cylinder-change timestamps for several units at once, oldest first. */
export async function loadGasChanges(units: string[]): Promise<Record<string, number[]>> {
  const res = await pipeline(units.map((u) => ["LRANGE", gasKey(u), 0, -1]));
  return Object.fromEntries(
    units.map((u, i) => [u, ((res[i]?.result as string[]) ?? []).map(Number).filter(Number.isFinite).sort((a, b) => a - b)]),
  );
}

export async function addGasChange(unit: string, t: number) {
  await pipeline([
    ["RPUSH", gasKey(unit), String(t)],
    ["LTRIM", gasKey(unit), -24, -1], // keep the last 24 cylinders
  ]);
}

export async function removeLastGasChange(unit: string) {
  await pipeline([["RPOP", gasKey(unit)]]);
}

export async function loadReadings(since: number) {
  const [rooms] = await pipeline([["SMEMBERS", "rt:rooms"]]);
  const list = ((rooms?.result as string[]) ?? []).map((s) => {
    const [unit, ...rest] = s.split("|");
    return { unit, room: rest.join("|") };
  });
  if (!list.length) return [];
  const res = await pipeline(list.map(({ unit, room }) => ["ZRANGEBYSCORE", roomKey(unit, room), since, "+inf"]));
  return list.map((r, i) => ({
    ...r,
    readings: ((res[i]?.result as string[]) ?? []).map((s) => JSON.parse(s) as StoredReading),
  }));
}
