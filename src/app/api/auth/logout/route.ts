import { audit } from "@/server/audit";
import { secured } from "@/server/route";

/** Déconnexion : révoque toutes les sessions (refresh tokens inclus) et efface les cookies. */
export const POST = secured({ name: "auth-logout", mfa: false }, async ({ user, supabase, req }) => {
  await supabase.auth.signOut({ scope: "global" });
  await audit({ userId: user.id, action: "auth.logout", req });
  return { ok: true };
});
