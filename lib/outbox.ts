"use client";

/**
 * Offline outbox: saves made without internet (energy records, gas cylinders,
 * service checklist) are kept on this device and sent when the connection returns.
 */
type Item = { id: string; url: string; method: string; body: string | null; at: number };
const KEY = "rt:outbox";
const EVENT = "rt-outbox-change";

function read(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
function write(items: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export const outboxCount = () => (typeof window === "undefined" ? 0 : read().length);
export const onOutboxChange = (fn: () => void) => {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
};

/**
 * Send a write request; if the device is offline (or the network fails),
 * queue it and resolve with { queued: true } instead of failing.
 */
export async function sendOrQueue(url: string, method: string, body: object | null): Promise<{ queued?: boolean } & Record<string, unknown>> {
  const payload = body ? JSON.stringify(body) : null;
  const queue = () => {
    write([...read(), { id: crypto.randomUUID(), url, method, body: payload, at: Date.now() }]);
    return { queued: true };
  };
  if (typeof navigator !== "undefined" && !navigator.onLine) return queue();
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: payload ?? undefined });
  } catch {
    return queue(); // network error: no connection
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error ?? `Error ${res.status}`);
  return j as Record<string, unknown>;
}

/** Send everything waiting, oldest first. Stops at the first network failure. */
export async function flushOutbox(): Promise<{ sent: number; failed: string[] }> {
  const items = read();
  let sent = 0;
  const failed: string[] = [];
  const left: Item[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      const res = await fetch(it.url, { method: it.method, headers: { "Content-Type": "application/json" }, body: it.body ?? undefined });
      if (res.ok) sent++;
      else {
        // the server refused it (e.g. invalid): drop it but report
        const j = await res.json().catch(() => ({}));
        failed.push((j as { error?: string }).error ?? `Error ${res.status}`);
      }
    } catch {
      left.push(...items.slice(i)); // still offline: keep the rest
      break;
    }
  }
  write(left);
  return { sent, failed };
}
