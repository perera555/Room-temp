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

/* ---------------- Gas cylinder changes ---------------- */
const GAS_KEY = "rt:gas:changes";

export async function loadGasChanges(): Promise<number[]> {
  const [res] = await pipeline([["LRANGE", GAS_KEY, 0, -1]]);
  return ((res?.result as string[]) ?? []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
}

export async function addGasChange(t: number) {
  await pipeline([
    ["RPUSH", GAS_KEY, String(t)],
    ["LTRIM", GAS_KEY, -24, -1], // keep the last 24 cylinders
  ]);
}

export async function removeLastGasChange() {
  await pipeline([["RPOP", GAS_KEY]]);
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
