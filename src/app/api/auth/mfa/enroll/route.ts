import { audit } from "@/server/audit";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";

/** Démarre l'inscription d'une appli TOTP (Google Authenticator, 1Password…). Le facteur n'est actif qu'après vérification d'un code. */
export const POST = secured({ name: "mfa-enroll", user: [5, 600] }, async ({ user, supabase, req }) => {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `DropFlow ${Date.now().toString(36)}` });
  if (error || !data) throw new PublicError("Impossible de démarrer l'activation.");
  await audit({ userId: user.id, action: "auth.mfa.enrolled", meta: { stage: "started" }, req });
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
});
