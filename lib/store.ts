// Lots live in one Redis hash (token -> lot as JSON) on Upstash, called over its REST API with plain fetch.
// ponytail: read-modify-write on status updates, fine for one tap at a time; use a Lua script if two writers race.
import { isToken, rowsToLots, type Lot } from "./lots.ts";

const HASH = "kaamtrack:lots";

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
const WORKERS = "kaamtrack:workers";

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
