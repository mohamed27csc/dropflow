import "server-only";
import { createHash } from "node:crypto";
import { PublicError } from "./http";

/** Cloudflare Turnstile : actif seulement si TURNSTILE_SECRET_KEY est défini. Le jeton est à usage unique. */
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (!token) throw new PublicError("Vérification anti-robot requise.", 400);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(4000),
    });
    const j = (await res.json()) as { success?: boolean };
    if (j.success) return;
  } catch {
    /* échec fermé ci-dessous */
  }
  throw new PublicError("Vérification anti-robot échouée. Rechargez la page.", 400);
}

/** Mot de passe présent dans une fuite connue (Have I Been Pwned, k-anonymat : seuls 5 caractères du SHA-1 quittent le serveur). Échec ouvert si le service est indisponible. */
export async function isPwned(password: string): Promise<boolean> {
  const sha = createHash("sha1").update(password).digest("hex").toUpperCase();
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${sha.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(2500) });
    if (!res.ok) return false;
    const suffix = sha.slice(5);
    return (await res.text()).split("\n").some((l) => l.startsWith(suffix) && Number(l.split(":")[1]) > 0);
  } catch {
    return false;
  }
}

/** URL publique de l'app (jamais dérivée d'un en-tête Host contrôlable en production). */
export function siteUrl(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") throw new PublicError("Configuration du site incomplète.", 503);
  return new URL(req.url).origin;
}

export const emailKey = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 24);
