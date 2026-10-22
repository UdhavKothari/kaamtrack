// Everything lives in Upstash Redis, called over its REST API with plain fetch.
// ponytail: lots are one JSON value per token and status updates read-modify-write, fine for one tap at a time;
// move each lot to its own Redis hash (one field per value) if two writers ever race.
import { isToken, rowsToLots, type Lot } from "./lots.ts";
import type { Msg, NewMsg } from "./inbound.ts";

// Production and local runs use the "kaamtrack" keys; Vercel preview deployments get their own, so testing a
// preview never touches real lots.
const NS = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production" ? "kaamtrack" : `kaamtrack-${process.env.VERCEL_ENV}`;
const HASH = `${NS}:lots`;
const WORKERS = `${NS}:workers`;
const MSG_INDEX = `${NS}:msgidx`; // outbound message id -> lot token, so delivery receipts find their lot
const msgsKey = (token: string) => `${NS}:msgs:${token}`;

async function redis(...command: string[]): Promise<unknown> {
  // Vercel's Upstash integration names these KV_REST_API_*; Upstash's own dashboard names them UPSTASH_REDIS_REST_*.
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis URL and token are not set");

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Redis ${res.status}: ${data.error ?? "request failed"}`);
  return data.result;
}

export async function listLots(): Promise<Lot[]> {
  const rows = (await redis("HVALS", HASH)) as string[];
  return rowsToLots(rows.map((r) => JSON.parse(r)));
}

export async function getLot(token: string): Promise<Lot | null> {
  if (!isToken(token)) return null;
  const raw = (await redis("HGET", HASH, token)) as string | null;
  return raw ? (rowsToLots([JSON.parse(raw)])[0] ?? null) : null;
}

export async function saveLot(lot: Lot): Promise<void> {
  await redis("HSET", HASH, lot.token, JSON.stringify(lot));
}

// Job workers' numbers are remembered by lowercase name, so staff type each number once.
export async function rememberWorker(name: string, phone: string): Promise<void> {
  await redis("HSET", WORKERS, name.trim().toLowerCase(), phone);
}

export async function workerPhone(name: string): Promise<string> {
  const phone = await redis("HGET", WORKERS, name.trim().toLowerCase());
  return typeof phone === "string" ? phone : "";
}

export async function markReminded(token: string, at: string): Promise<Lot | null> {
  const lot = await getLot(token);
  if (!lot) return null;
  const next = { ...lot, last_reminded_at: at };
  await saveLot(next);
  return next;
}

export async function setStatus(token: string, status: string, at: string): Promise<Lot | null> {
  const lot = await getLot(token);
  if (!lot) return null;
  const next = { ...lot, status, status_updated_at: at };
  await saveLot(next);
  return next;
}

// ---- WhatsApp conversation log: newest 50 messages per lot ----

export async function logMessage(token: string, m: NewMsg): Promise<Msg> {
  const full: Msg = { ...m, id: m.id ?? `m_${crypto.randomUUID().slice(0, 12)}`, at: m.at ?? new Date().toISOString() };
  await redis("LPUSH", msgsKey(token), JSON.stringify(full));
  await redis("LTRIM", msgsKey(token), "0", "49");
  if (full.dir === "out") await redis("HSET", MSG_INDEX, full.id, token);
  return full;
}

export async function lotMessages(token: string): Promise<Msg[]> {
  if (!isToken(token)) return [];
  const rows = (await redis("LRANGE", msgsKey(token), "0", "49")) as string[];
  return rows.map((r) => JSON.parse(r) as Msg).reverse(); // stored newest first; the timeline reads oldest first
}

// Delivery receipt from Meta: update the tick on the message it refers to.
export async function setMessageState(id: string, state: NonNullable<Msg["state"]>, error?: string): Promise<boolean> {
  const token = await redis("HGET", MSG_INDEX, id);
  if (typeof token !== "string") return false;
  const rows = (await redis("LRANGE", msgsKey(token), "0", "49")) as string[];
  const i = rows.findIndex((r) => (JSON.parse(r) as Msg).id === id);
  if (i < 0) return false;
  const m = { ...(JSON.parse(rows[i]) as Msg), state, ...(error ? { error } : {}) };
  await redis("LSET", msgsKey(token), String(i), JSON.stringify(m));
  return true;
}

// Meta may deliver the same message twice; true only the first time we see an id.
export async function claimMessage(id: string): Promise<boolean> {
  return (await redis("SET", `${NS}:seen:${id}`, "1", "NX", "EX", "86400")) === "OK";
}
