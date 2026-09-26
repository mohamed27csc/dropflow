// `npm run keys` : lit vos clés Supabase depuis le PRESSE-PAPIERS (Cmd+C sur Supabase) et les écrit dans .env.local.
// Rien n'est affiché à l'écran ni envoyé nulle part. Détecte les erreurs classiques (mauvais texte collé, clés inversées).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline/promises";

export function jwtRole(v) {
  try {
    return JSON.parse(Buffer.from(v.split(".")[1], "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

export const STEPS = [
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    ask: "1/3  Sur Supabase, page d'accueil du projet : cliquez « Copy » à côté de l'adresse https://….supabase.co",
    check: (v) => (/^https:\/\/[a-z0-9]{15,25}\.supabase\.co\/?$/.test(v) ? null : "Ce n'est pas l'adresse du projet (https://xxxx.supabase.co)."),
    clean: (v) => v.replace(/\/$/, ""),
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ask: "2/3  Project Settings › API Keys : copiez la clé « anon » (ou « Publishable key »)",
    check: (v) => (v.startsWith("sb_publishable_") || jwtRole(v) === "anon" ? null : jwtRole(v) === "service_role" ? "C'est la clé SECRÈTE service_role : il faut ici la clé publique « anon »." : "Ce n'est pas la clé anon / publishable."),
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    ask: "3/3  Même page : copiez la clé « service_role » (ou « Secret key »). Ne la montrez à personne.",
    check: (v) => (v.startsWith("sb_secret_") || jwtRole(v) === "service_role" ? null : jwtRole(v) === "anon" ? "C'est la clé publique anon : il faut ici la clé secrète service_role." : "Ce n'est pas la clé service_role / secret."),
  },
];

const clip = () => execFileSync("pbpaste", { encoding: "utf8" }).trim();

if (process.argv[1]?.endsWith("set-keys.mjs")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let env = readFileSync(".env.local", "utf8");
  for (const s of STEPS) {
    for (;;) {
      await rl.question(`\n${s.ask}\n     Puis appuyez sur Entrée ici… `);
      const raw = clip();
      const err = raw.length > 2000 || /\n/.test(raw) ? "Le presse-papiers contient autre chose qu'une clé." : s.check(raw);
      if (err) {
        console.log(`  ✗ ${err} Recommencez.`);
        continue;
      }
      const v = s.clean ? s.clean(raw) : raw;
      env = env.replace(new RegExp(`^${s.key}=.*$`, "m"), () => `${s.key}=${v}`);
      console.log(`  ✓ ${s.key} enregistré (${v.length} caractères)`);
      break;
    }
  }
  writeFileSync(".env.local", env);
  rl.close();
  console.log("\nTerminé : .env.local est complet. Dites « c'est fait » à Claude. Videz ensuite votre presse-papiers (copiez un mot au hasard).");
}
