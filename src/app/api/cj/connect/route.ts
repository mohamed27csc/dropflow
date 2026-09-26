import { cjConnectInput } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { saveCjAccount } from "@/server/cj";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";

/** La clé est vérifiée auprès de CJ puis stockée chiffrée (AES-256-GCM). Elle n'est jamais renvoyée ni journalisée. */
export const POST = secured({ name: "cj-connect", schema: cjConnectInput, user: [5, 600] }, async ({ user, input, req }) => {
  await saveCjAccount(user.id, input.apiKey);
  await audit({ userId: user.id, action: "cj.connected", req });
  return { ok: true, keyHint: input.apiKey.slice(-4) };
});

export const DELETE = secured({ name: "cj-disconnect", user: [10, 600] }, async ({ user, req }) => {
  const { error } = await supabaseAdmin().from("cj_accounts").delete().eq("user_id", user.id);
  if (error) throw new PublicError("Déconnexion impossible.", 500);
  await audit({ userId: user.id, action: "cj.disconnected", req });
  return { ok: true };
});
