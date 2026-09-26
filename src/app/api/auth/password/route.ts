import { checkPassword } from "@/lib/password";
import { authSchemas } from "@/lib/schemas";
import { audit } from "@/server/audit";
import { isPwned } from "@/server/auth-flow";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";

/** Nouveau mot de passe (mfa:false : la session du lien de réinitialisation est « email » seulement ; la 2FA reste exigée pour tout le reste du site) (après le lien de réinitialisation ou depuis le profil). Révoque les autres sessions. */
export const POST = secured({ name: "auth-password", schema: authSchemas.newPassword, mfa: false, user: [5, 900] }, async ({ user, supabase, input, req }) => {
  const weak = checkPassword(input.password, user.email ?? "");
  if (weak) throw new PublicError(`Mot de passe trop faible : ${weak}`);
  if (await isPwned(input.password)) throw new PublicError("Ce mot de passe apparaît dans une fuite de données connue.");
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) throw new PublicError("Impossible de changer le mot de passe.");
  await supabase.auth.signOut({ scope: "others" });
  await audit({ userId: user.id, action: "auth.password.changed", req });
  return { ok: true };
});
