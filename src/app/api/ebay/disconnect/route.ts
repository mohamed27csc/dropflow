import { marketInput } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";

/**
 * Déconnexion : les jetons chiffrés (accès + refresh) sont SUPPRIMÉS de la base : DropFlow ne peut plus agir sur ce compte.
 * eBay n'expose pas d'API de révocation de jeton utilisateur : pour invalider aussi côté eBay,
 * retirez l'application dans eBay › Compte › Autorisations (le jeton actuel expire de toute façon en 2 h).
 */
export const POST = secured({ name: "ebay-disconnect", schema: marketInput, user: [10, 600] }, async ({ user, input, req }) => {
  const { error } = await supabaseAdmin().from("ebay_accounts").delete().eq("user_id", user.id).eq("market", input.market);
  if (error) throw new PublicError("Déconnexion impossible.", 500);
  await audit({ userId: user.id, action: "ebay.disconnected", meta: { market: input.market }, req });
  return { ok: true };
});
