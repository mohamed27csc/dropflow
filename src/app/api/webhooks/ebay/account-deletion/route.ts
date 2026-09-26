import { createHash, verify } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { ebayApi, getAppToken } from "@/server/ebay";
import { clientIp, rateLimit } from "@/server/ratelimit";

/**
 * Webhook eBay « Marketplace account deletion » (obligatoire pour les clés de production).
 * - GET  ?challenge_code=… : validation du endpoint (SHA-256 de challengeCode + verificationToken + endpoint).
 * - POST : notification SIGNÉE. La signature ECDSA (en-tête X-EBAY-SIGNATURE) est vérifiée sur le corps brut avec la clé
 *   publique eBay (récupérée par `kid`, mise en cache 1 h). Toute notification non vérifiée est rejetée (échec fermé).
 * Aucun webhook CJ n'est exposé : les statuts CJ sont lus par appel sortant (polling), donc pas de surface entrante non authentifiée.
 */

const keyCache = new Map<string, { pem: string; digest: string; exp: number }>();

/** eBay renvoie parfois « BEGIN PUBLIC KEY-----<base64>-----END PUBLIC KEY » SANS retours à la ligne : format PEM invalide pour Node. On reconstruit toujours proprement à partir du seul contenu base64. */
function toPem(raw: string): string {
  const b64 = raw.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

async function publicKey(kid: string) {
  const hit = keyCache.get(kid);
  if (hit && hit.exp > Date.now()) return hit;
  const r = await ebayApi<{ key: string; digest?: string }>(await getAppToken(), "fr", "GET", `/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`);
  const entry = { pem: toPem(r.key), digest: (r.digest ?? "SHA1").replace("-", "").toLowerCase(), exp: Date.now() + 3600_000 };
  keyCache.set(kid, entry);
  return entry;
}

export async function GET(req: Request) {
  const token = process.env.EBAY_VERIFICATION_TOKEN;
  const endpoint = process.env.EBAY_WEBHOOK_ENDPOINT;
  const code = new URL(req.url).searchParams.get("challenge_code");
  if (!token || !endpoint || !code || code.length > 200) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  const challengeResponse = createHash("sha256").update(code).update(token).update(endpoint).digest("hex");
  return NextResponse.json({ challengeResponse }, { headers: { "Content-Type": "application/json" } });
}

const payload = z.object({ notification: z.object({ data: z.object({ username: z.string().max(100).optional(), userId: z.string().max(100).optional() }) }) });
const sigHeader = z.object({ kid: z.string().regex(/^[\w-]{1,100}$/), signature: z.string().max(2048) });

export async function POST(req: Request) {
  const rl = await rateLimit(`webhook-ebay:${clientIp(req)}`, 60, 60);
  if (!rl.ok) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });

  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length > 64 * 1024) return NextResponse.json({ error: "Trop volumineux" }, { status: 413 });

  try {
    const rawHeader = req.headers.get("x-ebay-signature");
    console.log("[ebay-webhook] en-tête présent :", Boolean(rawHeader), "| longueur :", rawHeader?.length ?? 0);
    const header = sigHeader.parse(JSON.parse(Buffer.from(rawHeader ?? "", "base64").toString("utf8")));
    console.log("[ebay-webhook] kid :", header.kid);
    const key = await publicKey(header.kid);
    console.log("[ebay-webhook] clé publique obtenue, digest :", key.digest, "| pem valide :", key.pem.includes("BEGIN"));
    const ok = verify(key.digest, raw, key.pem, Buffer.from(header.signature, "base64"));
    console.log("[ebay-webhook] résultat de la vérification :", ok);
    if (!ok) throw new Error("bad-signature");
  } catch (e) {
    console.error("[ebay-webhook] ÉCHEC :", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    return NextResponse.json({ error: "Signature invalide" }, { status: 412 });
  }

  const body = payload.safeParse(JSON.parse(raw.toString("utf8")));
  if (!body.success) return NextResponse.json({ error: "Charge invalide" }, { status: 400 });
  const { username } = body.data.notification.data;
  if (username) {
    // Compte eBay supprimé : on détruit les jetons associés (et donc toute action possible sur ce compte).
    const { data } = await supabaseAdmin().from("ebay_accounts").delete().eq("ebay_username", username).select("user_id, market");
    for (const row of data ?? []) await audit({ userId: row.user_id, action: "webhook.ebay.account_deletion", meta: { market: row.market } });
  }
  return new NextResponse(null, { status: 200 });
}
