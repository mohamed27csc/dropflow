import { settingsPatch } from "@/lib/schemas";
import { audit } from "@/server/audit";
import { isAdmin } from "@/server/auth";
import { secured } from "@/server/route";
import { loadSettings, saveSettings } from "@/server/settings";

/** Variables d'environnement manquantes : visibles des administrateurs uniquement (ne pas révéler la configuration aux autres). */
function serverChecklist() {
  const need: [string, string][] = [
    ["SUPABASE_SERVICE_ROLE_KEY", "Supabase (clé service-role)"],
    ["ENCRYPTION_KEY", "Chiffrement des clés"],
    ["EBAY_CLIENT_ID", "eBay (App ID)"],
    ["EBAY_CLIENT_SECRET", "eBay (Cert ID)"],
    ["EBAY_RUNAME", "eBay (RuName)"],
    ["CRON_SECRET", "Automatisations (cron)"],
    ["UPSTASH_REDIS_REST_URL", "Limitation de débit (Upstash)"],
    ["NEXT_PUBLIC_SITE_URL", "URL publique du site"],
  ];
  return { missing: need.filter(([k]) => !process.env[k]).map(([, label]) => label), ai: Boolean(process.env.ANTHROPIC_API_KEY) };
}

export const GET = secured({ name: "settings-get", user: [120, 60] }, async ({ user }) => {
  const [settings, admin] = await Promise.all([loadSettings(user.id, user.email ?? ""), isAdmin(user.id)]);
  const server = serverChecklist();
  return { settings, server: admin ? server : { missing: [], ai: server.ai }, admin };
});

export const PUT = secured({ name: "settings-put", schema: settingsPatch, user: [30, 60] }, async ({ user, input, req }) => {
  await saveSettings(user.id, input);
  await audit({ userId: user.id, action: "settings.updated", meta: { keys: Object.keys(input).join(",") }, req });
  return { ok: true };
});
