import { authSchemas } from "@/lib/schemas";
import { audit } from "@/server/audit";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";

/** Vérifie un code TOTP : active le facteur (première fois) ou élève la session en aal2 (connexion). 5 essais / 5 min. */
export const POST = secured({ name: "mfa-verify", schema: authSchemas.mfaVerify, mfa: false, user: [5, 300] }, async ({ user, supabase, input, req }) => {
  const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId: input.factorId });
  if (e1 || !ch) throw new PublicError("Code invalide.", 400);
  const { error: e2 } = await supabase.auth.mfa.verify({ factorId: input.factorId, challengeId: ch.id, code: input.code });
  if (e2) throw new PublicError("Code invalide.", 400);
  await audit({ userId: user.id, action: "auth.mfa.verified", req });
  return { ok: true };
});
