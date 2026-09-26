// `npm run doctor` : dit exactement ce qu'il manque pour passer du mode démo au mode live.
import { existsSync, readFileSync } from "node:fs";

const env = { ...process.env };
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const groups = [
  ["1. Supabase (compte + base de données)", ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"], "supabase.com → New project → Settings → API. Puis SQL Editor : collez supabase/schema.sql."],
  ["2. Accès privé et secrets", ["OWNER_EMAILS", "NEXT_PUBLIC_SITE_URL", "ENCRYPTION_KEY", "CRON_SECRET"], "OWNER_EMAILS = votre email (site réservé à vous). ENCRYPTION_KEY et CRON_SECRET : deux chaînes DIFFÉRENTES, `openssl rand -hex 32` chacune."],
  ["3. eBay (OAuth officiel)", ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_RUNAME", "EBAY_VERIFICATION_TOKEN", "EBAY_WEBHOOK_ENDPOINT"], "developer.ebay.com → Application Keys (Production) + User Tokens → RuName. Accept URL = https://VOTRE-DOMAINE/api/ebay/callback"],
  ["4. Anti brute-force (Upstash, recommandé)", ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"], "upstash.com → Redis gratuit → REST API. Sans lui : limitation en mémoire seulement (insuffisant en production)."],
  ["5. IA (optionnel : Title/Description Builder + textes des annonces)", ["ANTHROPIC_API_KEY"], "console.anthropic.com → API keys. Sans elle, des gabarits locaux sont utilisés."],
];

let missing = 0;
for (const [title, keys, help] of groups) {
  const lacking = keys.filter((k) => !env[k]);
  console.log(`${lacking.length ? "✗" : "✓"} ${title}`);
  if (lacking.length) {
    missing += title.includes("optionnel") || title.includes("recommandé") ? 0 : lacking.length;
    console.log(`    manque : ${lacking.join(", ")}\n    → ${help}`);
  }
}
console.log(missing ? `\nMode DÉMO tant que le bloc 1 est incomplet. ${missing} variable(s) obligatoire(s) manquante(s).` : "\nTout est configuré : mode LIVE.");
console.log("La clé CJ n'est PAS une variable d'environnement : elle se saisit dans Paramètres › Connexions.");

if (env.ENCRYPTION_KEY && env.CRON_SECRET && env.ENCRYPTION_KEY === env.CRON_SECRET) console.log("✗ ENCRYPTION_KEY et CRON_SECRET sont identiques : utilisez deux valeurs différentes.");
if (env.ENCRYPTION_KEY && env.ENCRYPTION_KEY.length < 32) console.log("✗ ENCRYPTION_KEY trop courte (32 caractères minimum).");
if (env.CRON_SECRET && env.CRON_SECRET.length < 24) console.log("✗ CRON_SECRET trop court (24 caractères minimum).");
