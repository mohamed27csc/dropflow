import { vintedConnectInput } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";
import { saveVintedAccount } from "@/server/vinted";

/** La clé est stockée chiffrée (AES-256-GCM), jamais renvoyée ni journalisée. Non vérifiée auprès de Vinted (voir server/vinted.ts). */
export const POST = secured({ name: "vinted-connect", schema: vintedConnectInput, user: [5, 600] }, async ({ user, input, req }) => {
  await saveVintedAccount(user.id, input.apiKey);
  await audit({ userId: user.id, action: "vinted.connected", req });
  return { ok: true, keyHint: input.apiKey.slice(-4) };
});

export const DELETE = secured({ name: "vinted-disconnect", user: [10, 600] }, async ({ user, req }) => {
  const { error } = await supabaseAdmin().from("vinted_accounts").delete().eq("user_id", user.id);
  if (error) throw new PublicError("Déconnexion impossible.", 500);
  await audit({ userId: user.id, action: "vinted.disconnected", req });
  return { ok: true };
});
