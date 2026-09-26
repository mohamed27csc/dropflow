// Rotation de la clé de chiffrement : relit chaque secret avec l'ancienne clé (ENCRYPTION_KEY_PREVIOUS) et le réécrit avec la nouvelle.
import { supabaseAdmin } from "@/lib/supabase/server";
import { decrypt, encrypt } from "@/server/crypto";

async function main() {
  const db = supabaseAdmin();
  let n = 0;
  const { data: cj } = await db.from("cj_accounts").select("*");
  for (const r of cj ?? []) {
    const patch: Record<string, string> = { api_key_enc: encrypt(decrypt(r.api_key_enc, `cj-key:${r.user_id}`), `cj-key:${r.user_id}`) };
    if (r.access_token_enc) patch.access_token_enc = encrypt(decrypt(r.access_token_enc, `cj-token:${r.user_id}`), `cj-token:${r.user_id}`);
    const { error } = await db.from("cj_accounts").update(patch).eq("user_id", r.user_id);
    if (error) throw new Error(error.message);
    n++;
  }
  const { data: eb } = await db.from("ebay_accounts").select("*");
  for (const r of eb ?? []) {
    const a = `ebay-access:${r.user_id}:${r.market}`, f = `ebay-refresh:${r.user_id}:${r.market}`;
    const { error } = await db.from("ebay_accounts").update({ access_token_enc: encrypt(decrypt(r.access_token_enc, a), a), refresh_token_enc: encrypt(decrypt(r.refresh_token_enc, f), f) }).eq("id", r.id);
    if (error) throw new Error(error.message);
    n++;
  }
  console.log(`✓ ${n} compte(s) rechiffré(s) avec la nouvelle clé`);
}
main().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });
