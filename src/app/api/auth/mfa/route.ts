import { authSchemas } from "@/lib/schemas";
import { audit } from "@/server/audit";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";

/** État du 2e facteur (TOTP). */
export const GET = secured({ name: "mfa-list", mfa: false }, async ({ supabase }) => {
  const { data } = await supabase.auth.mfa.listFactors();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { factors: (data?.totp ?? []).map((f) => ({ id: f.id, status: f.status })), level: aal?.currentLevel ?? "aal1" };
});

/** Retrait du facteur : exige une session déjà validée en 2 étapes (aal2), pas seulement le mot de passe. */
export const DELETE = secured({ name: "mfa-remove", schema: authSchemas.mfaFactor, user: [5, 600] }, async ({ user, supabase, input, req }) => {
  const { error } = await supabase.auth.mfa.unenroll({ factorId: input.factorId });
  if (error) throw new PublicError("Impossible de retirer le facteur.");
  await audit({ userId: user.id, action: "auth.mfa.removed", req });
  return { ok: true };
});
