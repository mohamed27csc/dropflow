import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * État OAuth signé (HMAC-SHA256), lié à l'utilisateur et au marché, à usage unique, valable 10 min.
 * Le cookie contient `payload.signature` ; le paramètre `state` renvoyé par eBay doit égaler le nonce.
 * (eBay ne supporte pas PKCE sur ce flux « authorization code » : l'état signé + lié à la session en tient lieu.)
 */
type Payload = { n: string; u: string; m: string; e: number };

const b64 = (b: Buffer) => b.toString("base64url");

export function createState(userId: string, market: string, key: Buffer, now = Date.now()) {
  const payload: Payload = { n: b64(randomBytes(24)), u: userId, m: market, e: now + 10 * 60_000 };
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const sig = b64(createHmac("sha256", key).update(body).digest());
  return { nonce: payload.n, cookie: `${body}.${sig}` };
}

export function verifyState(cookie: string | undefined, stateParam: string | null, userId: string, key: Buffer, now = Date.now()): { market: string } | null {
  if (!cookie || !stateParam) return null;
  const [body, sig] = cookie.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let p: Payload;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const a = Buffer.from(p.n);
  const b = Buffer.from(stateParam);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (p.u !== userId || p.e < now) return null;
  return { market: p.m };
}
