import { emailAllowed } from "@/lib/access";
import { authSchemas } from "@/lib/schemas";
import { supabaseServer } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { emailKey, siteUrl, verifyTurnstile } from "@/server/auth-flow";
import { fail, json, parseBody, PublicError } from "@/server/http";
import { clientIp, rateLimit } from "@/server/ratelimit";

/** Demande de réinitialisation. Réponse toujours identique (anti-énumération). */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const rl = await rateLimit(`auth-reset:ip:${ip}`, 5, 3600, { failClosed: true });
    if (!rl.ok) throw new PublicError("Trop de demandes. Réessayez plus tard.", 429);
    const { email, captchaToken } = await parseBody(req, authSchemas.reset);
    const per = await rateLimit(`auth-reset:email:${emailKey(email)}`, 3, 3600, { failClosed: true });
    await verifyTurnstile(captchaToken, ip);
    if (per.ok && emailAllowed(email)) {
      const supabase = await supabaseServer();
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl(req)}/auth/callback?next=/reset` });
      await audit({ userId: null, action: "auth.password.reset_requested", meta: { emailHash: emailKey(email) }, req });
    }
    return json({ ok: true, message: "Si un compte existe, un email de réinitialisation vient d'être envoyé." });
  } catch (e) {
    return fail(e);
  }
}
