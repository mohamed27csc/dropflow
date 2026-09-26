import { emailAllowed } from "@/lib/access";
import { authSchemas } from "@/lib/schemas";
import { supabaseServer } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { emailKey, verifyTurnstile } from "@/server/auth-flow";
import { fail, json, parseBody, PublicError } from "@/server/http";
import { clientIp, hit, peek, rateLimit, reset } from "@/server/ratelimit";

const LOCK_WINDOW = 15 * 60;

/**
 * Connexion. Défenses : limite par IP, verrouillage temporaire par (email + IP) ET par email seul
 * (anti brute-force distribué), Turnstile, message d'échec identique quelle que soit la cause.
 */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const ipRl = await rateLimit(`auth-login:ip:${ip}`, 30, LOCK_WINDOW, { failClosed: true });
    if (!ipRl.ok) throw new PublicError("Trop de tentatives. Réessayez dans quelques minutes.", 429);

    const { email, password, captchaToken } = await parseBody(req, authSchemas.login);
    const k = emailKey(email);
    const pairKey = `login-fail:${k}:${ip}`;
    const emailOnlyKey = `login-fail-email:${k}`;
    if ((await peek(pairKey)) >= 5 || (await peek(emailOnlyKey)) >= 10) {
      await audit({ userId: null, action: "auth.login.locked", meta: { emailHash: k }, req });
      return json({ error: "Trop de tentatives. Réessayez dans 15 minutes." }, 429, { "Retry-After": String(LOCK_WINDOW) });
    }

    await verifyTurnstile(captchaToken, ip);

    const supabase = await supabaseServer();
    const allowed = emailAllowed(email);
    const { data, error } = allowed ? await supabase.auth.signInWithPassword({ email, password }) : { data: { user: null }, error: new Error("not-allowed") };
    if (error || !data.user) {
      await Promise.all([hit(pairKey, LOCK_WINDOW), hit(emailOnlyKey, LOCK_WINDOW)]);
      await audit({ userId: null, action: "auth.login.failure", meta: { emailHash: k }, req });
      return json({ error: "Identifiants incorrects, ou email non confirmé." }, 401);
    }

    await Promise.all([reset(pairKey), reset(emailOnlyKey)]);
    await audit({ userId: data.user.id, action: "auth.login.success", req });

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: f } = await supabase.auth.mfa.listFactors();
      return json({ mfaRequired: true, factorId: f?.totp?.[0]?.id });
    }
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
