import { accountDeleteInput } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { emailKey } from "@/server/auth-flow";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";

/**
 * Suppression RÉELLE du compte (RGPD art. 17). Exige une connexion de moins de 30 min et une confirmation saisie.
 * `auth.users` est supprimé ; toutes les tables liées (profil, réglages, jetons chiffrés, annonces, commandes, journal d'audit)
 * le sont en cascade (ON DELETE CASCADE). Seule une trace anonyme (empreinte de l'email) est conservée dans le journal.
 */
export const DELETE = secured({ name: "account-delete", schema: accountDeleteInput, user: [3, 3600] }, async ({ user, supabase, req }) => {
  const last = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
  if (Date.now() - last > 30 * 60_000) throw new PublicError("Par sécurité, reconnectez-vous avant de supprimer votre compte.", 403);
  await audit({ userId: null, action: "account.deleted", meta: { emailHash: emailKey(user.email ?? user.id) }, req });
  const { error } = await supabaseAdmin().auth.admin.deleteUser(user.id);
  if (error) throw new PublicError("Suppression impossible. Contactez le support.", 500);
  await supabase.auth.signOut();
  return { ok: true };
});
