import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { encrypt } from "./crypto";

/**
 * Vinted n'a pas d'API publique : aucun endpoint connu pour valider une clé. On la stocke donc chiffrée SANS la
 * vérifier, et l'interface le dit (« non vérifiée »). À compléter avec la vraie vérification dès que la
 * documentation officielle Vinted est disponible.
 */
export async function saveVintedAccount(userId: string, apiKey: string): Promise<void> {
  const { error } = await supabaseAdmin().from("vinted_accounts").upsert({
    user_id: userId,
    api_key_enc: encrypt(apiKey, `vinted-key:${userId}`),
    key_hint: apiKey.slice(-4),
  });
  if (error) throw new Error(error.message);
}
