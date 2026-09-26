import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";

/** Erreur dont le message peut être montré à l'utilisateur. Toute autre erreur devient un message générique. */
export class PublicError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Retire tout ce qui ressemble à un secret (jeton, clé) avant de journaliser. */
const scrub = (s: string) => s.replace(/[A-Za-z0-9_\-.~+/=]{32,}/g, "[masqué]").slice(0, 300);

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Erreur → réponse. Détail interne uniquement dans les logs serveur, jamais dans la réponse. */
export function fail(e: unknown, statusOverride?: number) {
  if (e instanceof PublicError) return json({ error: e.message.slice(0, 300) }, statusOverride ?? e.status);
  const ref = crypto.randomUUID().slice(0, 8);
  console.error(`[api-error ${ref}]`, e instanceof Error ? `${e.name}: ${scrub(e.message)}` : "erreur inconnue");
  return json({ error: "Erreur interne. Réessayez plus tard.", ref }, 500);
}

const MAX_BODY = 64 * 1024;

/** Lit et valide le corps JSON (taille bornée, schéma strict). */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) throw new PublicError("Requête trop volumineuse.", 413);
  const text = await req.text();
  if (text.length > MAX_BODY) throw new PublicError("Requête trop volumineuse.", 413);
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new PublicError("JSON invalide.");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new PublicError(`Données invalides : ${[...new Set(r.error.issues.map((i) => i.path.join(".") || "corps"))].slice(0, 5).join(", ")}.`);
  return r.data;
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const r = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!r.success) throw new PublicError("Paramètres invalides.");
  return r.data;
}

/** Message montrable à l'utilisateur pour une erreur capturée (stockée en base ou renvoyée dans un rapport). */
export function safeMsg(e: unknown): string {
  return e instanceof PublicError ? e.message.slice(0, 300) : "Erreur interne";
}
