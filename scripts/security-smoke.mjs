// Tests d'attaque contre un serveur DropFlow en marche (mode live).
// Usage : BASE_URL=http://localhost:3201 node scripts/security-smoke.mjs
// Ne nécessite aucun compte : vérifie ce qu'un attaquant NON connecté peut (ne pas) faire.
const BASE = process.env.BASE_URL ?? "http://localhost:3201";
const origin = new URL(BASE).origin;
let failed = 0;
const ok = (cond, name, detail = "") => {
  console.log(`${cond ? "✓" : "✗ ÉCHEC"} ${name}${!cond && detail ? `  → ${detail}` : ""}`);
  if (!cond) failed++;
};
const req = (path, init = {}) => fetch(BASE + path, { redirect: "manual", ...init });
const post = (path, body, headers = {}) => req(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

// ── 1. En-têtes de sécurité
{
  const r = await req("/login");
  const h = r.headers;
  const csp = h.get("content-security-policy") ?? "";
  ok(/script-src[^;]*'nonce-[\w+/=]+'/.test(csp) && csp.includes("'strict-dynamic'"), "CSP avec nonce et strict-dynamic");
  ok(!/script-src[^;]*'unsafe-inline'/.test(csp) && !/'unsafe-eval'/.test(csp), "CSP : ni unsafe-inline ni unsafe-eval pour les scripts");
  ok(csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'") && csp.includes("base-uri 'self'"), "CSP : frame-ancestors, object-src, base-uri");
  ok((h.get("strict-transport-security") ?? "").includes("max-age=63072000"), "HSTS");
  ok(h.get("x-frame-options") === "DENY", "X-Frame-Options: DENY");
  ok(h.get("x-content-type-options") === "nosniff", "X-Content-Type-Options: nosniff");
  ok(!!h.get("referrer-policy"), "Referrer-Policy");
  ok((h.get("permissions-policy") ?? "").includes("camera=()"), "Permissions-Policy");
  ok(!h.get("x-powered-by"), "X-Powered-By absent");
  const n1 = /nonce-([\w+/=]+)/.exec(csp)?.[1];
  const n2 = /nonce-([\w+/=]+)/.exec((await req("/login")).headers.get("content-security-policy") ?? "")?.[1];
  ok(n1 && n2 && n1 !== n2, "Nonce différent à chaque requête");
}

// ── 2. Accès non authentifié : tout est refusé
{
  const priv = [
    ["GET", "/api/settings"], ["PUT", "/api/settings"], ["GET", "/api/listings"], ["POST", "/api/listings/add"], ["POST", "/api/sniper"],
    ["POST", "/api/sync"], ["POST", "/api/generate"], ["POST", "/api/analytics"], ["GET", "/api/trends"], ["GET", "/api/dashboard"],
    ["POST", "/api/cj/connect"], ["DELETE", "/api/cj/connect"], ["GET", "/api/ebay/connect?market=fr"], ["GET", "/api/ebay/callback?code=x&state=y"],
    ["POST", "/api/ebay/disconnect"], ["DELETE", "/api/account"], ["GET", "/api/account/export"], ["POST", "/api/admin/plan"],
    ["GET", "/api/auth/mfa"], ["POST", "/api/auth/mfa/enroll"], ["POST", "/api/auth/mfa/verify"], ["POST", "/api/auth/password"], ["POST", "/api/auth/logout"],
  ];
  for (const [m, p] of priv) {
    const r = await req(p, { method: m, headers: { Origin: origin, "Content-Type": "application/json" }, body: m === "GET" ? undefined : "{}" });
    ok(r.status === 401, `${m} ${p.split("?")[0]} sans session → 401`, `reçu ${r.status}`);
  }
  for (const p of ["/dashboard", "/listings", "/parametres", "/profil", "/sniper"]) {
    const r = await req(p);
    ok(r.status === 307 && (r.headers.get("location") ?? "").endsWith("/login"), `page ${p} sans session → redirection /login`, `reçu ${r.status}`);
  }
}

// ── 3. CSRF
{
  const evil = await post("/api/auth/login", { email: "a@b.fr", password: "x" }, { Origin: "https://evil.example" });
  ok(evil.status === 403, "POST avec Origin étranger → 403", `reçu ${evil.status}`);
  const lookalike = await post("/api/auth/login", { email: "a@b.fr", password: "x" }, { Origin: origin + ".evil.example" });
  ok(lookalike.status === 403, "POST avec Origin sosie (domaine.evil) → 403", `reçu ${lookalike.status}`);
  const none = await req("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  ok(none.status === 403, "POST sans Origin ni Sec-Fetch-Site → 403", `reçu ${none.status}`);
  const cross = await req("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" }, body: "{}" });
  ok(cross.status === 403, "POST Sec-Fetch-Site: cross-site → 403", `reçu ${cross.status}`);
  const pre = await req("/api/settings", { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "PUT" } });
  ok(!pre.headers.get("access-control-allow-origin"), "Aucun en-tête CORS permissif (préflight étranger)");
}

// ── 4. Cron : secret obligatoire, en-tête seulement, jamais dans l'URL
{
  const secret = process.env.CRON_SECRET ?? "test-secret-123456-abcdefghij";
  for (const p of ["/api/cron/sync", "/api/cron/orders"]) {
    ok((await req(p)).status === 401, `${p} sans secret → 401`);
    ok((await req(`${p}?secret=${secret}`)).status === 401, `${p}?secret=… (secret dans l'URL) → 401`);
    ok((await req(p, { headers: { Authorization: "Bearer mauvais" } })).status === 401, `${p} mauvais secret → 401`);
    ok((await req(p, { headers: { Authorization: `Bearer ${secret.slice(0, -1)}` } })).status === 401, `${p} secret tronqué → 401`);
    const good = await req(p, { headers: { Authorization: `Bearer ${secret}` } });
    const body = await good.text();
    ok(good.status !== 401, `${p} avec le bon secret est accepté`, `reçu ${good.status}`);
    ok(!/SERVICE_ROLE|stack|at\s+\S+\s+\(|node_modules|supabase/i.test(body), `${p} : réponse d'erreur sans détail interne`, body.slice(0, 120));
  }
}

// ── 5. Brute force : verrouillage
{
  const email = `victime-${Date.now()}@example.com`;
  const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await post("/api/auth/login", { email, password: `essai-${i}` }, { "x-forwarded-for": "203.0.113.9" })).status);
  const firstLock = codes.indexOf(429);
  ok(firstLock !== -1 && firstLock <= 6, "Verrouillage après ≤ 5 échecs (email + IP)", `statuts : ${codes.join(",")}`);
  ok(codes.slice(0, firstLock).every((c) => c === 401), "Avant verrouillage : 401 avec message identique");
  // Attaque distribuée : 5 IP différentes, 3 essais chacune sur le MÊME compte → le compte se verrouille (seuil : 10 échecs).
  const victim = `distribue-${Date.now()}@example.com`;
  const dist = [];
  for (let ip = 1; ip <= 5; ip++) for (let i = 0; i < 3; i++) dist.push((await post("/api/auth/login", { email: victim, password: `x${i}` }, { "x-forwarded-for": `198.51.100.${ip}` })).status);
  const late = await post("/api/auth/login", { email: victim, password: "encore" }, { "x-forwarded-for": "198.51.100.99" });
  ok(dist.includes(429) && late.status === 429, "Verrouillage du compte ciblé par une attaque distribuée (plusieurs IP)", `statuts : ${dist.join(",")} puis ${late.status}`);
  const msgs = new Set();
  for (const e of ["inconnu-1@example.com", "inconnu-2@example.com"]) msgs.add(JSON.stringify(await (await post("/api/auth/login", { email: e, password: "x" })).json()));
  ok(msgs.size === 1, "Message d'échec identique pour deux comptes inexistants (pas d'énumération)");
}

// ── 6. Injections et entrées hostiles
{
  const payloads = ["' OR 1=1--", "admin'--", "\"; DROP TABLE listings;--", "<script>alert(1)</script>", "../../etc/passwd", "${7*7}", "{{7*7}}"];
  for (const pl of payloads) {
    const r = await post("/api/auth/login", { email: pl, password: pl });
    const t = await r.text();
    ok(r.status === 400 && !/syntax|postgres|sql|stack/i.test(t), `Injection « ${pl.slice(0, 22)} » dans email → 400 sans fuite`, `${r.status} ${t.slice(0, 80)}`);
  }
  ok((await post("/api/auth/login", { email: "a@b.fr", password: "x", role: "admin" })).status === 400, "Champ inconnu (mass-assignment) → 400");
  ok((await post("/api/auth/login", "{pas du json")).status === 400, "JSON invalide → 400");
  ok((await post("/api/auth/login", { email: "a@b.fr", password: "x".repeat(200) })).status === 400, "Mot de passe > 128 caractères → 400");
  const big = await post("/api/auth/login", JSON.stringify({ email: "a@b.fr", password: "x", pad: "y".repeat(100_000) }));
  ok(big.status === 413 || big.status === 400, "Corps de 100 Ko refusé", `reçu ${big.status}`);
  ok((await post("/api/auth/signup", { email: "a@b.fr", password: "court" })).status === 400, "Inscription : mot de passe faible refusé");
  const weak = await (await post("/api/auth/signup", { email: "z@example.com", password: "Motdepasse123!" })).json();
  ok(/faible|courant|trop/i.test(weak.error ?? ""), "Inscription : mot de passe courant refusé", JSON.stringify(weak));
}

// ── 7. Open redirect, fichiers sensibles, webhook
{
  const r = await req("/auth/callback?code=x&next=https://evil.example/phish");
  ok(!(r.headers.get("location") ?? "").includes("evil.example"), "Open redirect via ?next= impossible", r.headers.get("location") ?? "");
  for (const p of ["/.env", "/.env.local", "/.git/config", "/supabase/schema.sql", "/src/server/crypto.ts", "/package.json"]) {
    const s = (await req(p)).status;
    ok(s === 404 || s === 307 || s === 401, `${p} non exposé`, `reçu ${s}`);
  }
  ok((await req("/api/webhooks/ebay/account-deletion", { method: "POST", body: "{}" })).status === 412, "Webhook eBay sans signature → 412");
  ok((await req("/api/webhooks/ebay/account-deletion", { method: "POST", headers: { "x-ebay-signature": Buffer.from('{"kid":"../../x","signature":"AA"}').toString("base64") }, body: "{}" })).status === 412, "Webhook eBay : kid piégé → 412");
  ok((await req("/api/webhooks/ebay/account-deletion?challenge_code=abc")).status === 400, "Webhook eBay : challenge refusé si non configuré");
}

console.log(failed ? `\n${failed} test(s) en échec` : "\nTous les tests de sécurité passent.");
process.exit(failed ? 1 : 0);
