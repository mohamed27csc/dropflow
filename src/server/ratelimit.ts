import "server-only";

/**
 * Limitation de débit à fenêtre fixe.
 * - Production : Upstash Redis (REST), partagé entre toutes les instances serverless.
 * - Sans Upstash : compteur en mémoire (par instance : protection partielle, à ne pas considérer suffisante en production).
 */

type Counter = { count: number; retryAfter: number };
const mem = new Map<string, { n: number; exp: number }>();
let warned = false;

async function upstash(cmds: unknown[][]): Promise<{ result: number }[] | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(`${url}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmds), cache: "no-store", signal: AbortSignal.timeout(1500) });
  if (!res.ok) throw new Error("rate-limit backend indisponible");
  return (await res.json()) as { result: number }[];
}

function memHit(key: string, windowSec: number): Counter {
  const now = Date.now();
  if (mem.size > 10_000) for (const [k, v] of mem) if (v.exp < now) mem.delete(k);
  const cur = mem.get(key);
  if (!cur || cur.exp < now) {
    mem.set(key, { n: 1, exp: now + windowSec * 1000 });
    return { count: 1, retryAfter: windowSec };
  }
  cur.n++;
  return { count: cur.n, retryAfter: Math.ceil((cur.exp - now) / 1000) };
}

export async function hit(key: string, windowSec: number): Promise<Counter> {
  const k = `rl:${key}`;
  const r = await upstash([["INCR", k], ["EXPIRE", k, windowSec, "NX"], ["TTL", k]]);
  if (r) return { count: r[0].result, retryAfter: Math.max(1, r[2].result) };
  if (!warned && process.env.NODE_ENV === "production") {
    warned = true;
    console.warn("[security] UPSTASH_REDIS_REST_URL absent : limitation de débit en mémoire seulement (insuffisant en production).");
  }
  return memHit(k, windowSec);
}

export async function peek(key: string): Promise<number> {
  const k = `rl:${key}`;
  const r = await upstash([["GET", k]]);
  if (r) return Number(r[0].result ?? 0);
  const cur = mem.get(k);
  return cur && cur.exp > Date.now() ? cur.n : 0;
}

export async function reset(key: string): Promise<void> {
  const k = `rl:${key}`;
  if (!(await upstash([["DEL", k]]))) mem.delete(k);
}

/**
 * `failClosed` : si le backend de limitation est en panne, refuse (routes d'authentification) au lieu de laisser passer.
 */
export async function rateLimit(key: string, limit: number, windowSec: number, opts: { failClosed?: boolean } = {}) {
  try {
    const { count, retryAfter } = await hit(key, windowSec);
    return { ok: count <= limit, count, retryAfter };
  } catch {
    return { ok: !opts.failClosed, count: 0, retryAfter: windowSec };
  }
}

/** IP client : en-têtes posés par la plateforme (Vercel), jamais une valeur libre du client en premier choix. */
export function clientIp(req: Request): string {
  const h = req.headers;
  return h.get("x-vercel-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}
