import { printfulConnectInput } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { savePrintfulAccount } from "@/server/printful";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";

/** Le jeton est vérifié auprès de Printful puis stocké chiffré (AES-256-GCM). Jamais renvoyé ni journalisé. */
export const POST = secured({ name: "printful-connect", schema: printfulConnectInput, user: [5, 600] }, async ({ user, input, req }) => {
  await savePrintfulAccount(user.id, input.apiToken);
  await audit({ userId: user.id, action: "printful.connected", req });
  return { ok: true, keyHint: input.apiToken.slice(-4) };
});

export const DELETE = secured({ name: "printful-disconnect", user: [10, 600] }, async ({ user, req }) => {
  const { error } = await supabaseAdmin().from("printful_accounts").delete().eq("user_id", user.id);
  if (error) throw new PublicError("Déconnexion impossible.", 500);
  await audit({ userId: user.id, action: "printful.disconnected", req });
  return { ok: true };
});
