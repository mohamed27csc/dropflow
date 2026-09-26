import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPassword } from "./password.ts";
import { sanitizeHtml } from "./sanitize-html.ts";
import { evaluateOrderRisk, type RiskInput } from "./order-risk.ts";
import { originAllowed, safeNext } from "./origin.ts";
import { createState, verifyState } from "./oauth-state.ts";
import { authSchemas, settingsPatch, sniperInput, generateInput } from "./schemas.ts";

/* ───────── Mots de passe ───────── */
test("mot de passe : refuse court, trivial, contenant l'email ; accepte un fort", () => {
  assert.ok(checkPassword("Ab1!"));
  assert.ok(checkPassword("motdepasse-Long1!"));
  assert.ok(checkPassword("Azerty123456!"));
  assert.ok(checkPassword("dadino77270Xy!Zk", "dadino77270@outlook.com"));
  assert.ok(checkPassword("alllowercaseletters"));
  assert.equal(checkPassword("Tr0ub4dor&3-cheval-Zx", "a@b.fr"), null);
});

/* ───────── XSS ───────── */
test("sanitizeHtml : neutralise scripts, handlers, iframes, javascript:, SVG", () => {
  const evil = [
    `<script>alert(1)</script><p>ok</p>`,
    `<p onclick="steal()">x</p>`,
    `<img src=x onerror=alert(1)>`,
    `<a href="javascript:alert(1)">clic</a>`,
    `<iframe src="https://evil"></iframe>`,
    `<svg><script>alert(1)</script></svg>`,
    `<p>a</p><scr<script>ipt>alert(1)</scr</script>ipt>`,
    `<style>*{background:url(javascript:1)}</style>`,
    `<!-- <script>x</script> -->`,
    `<<script>script>alert(1)<</script>/script>`,
  ];
  for (const e of evil) {
    const out = sanitizeHtml(e);
    assert.ok(!/<\s*(script|iframe|img|a|svg|style)\b/i.test(out), `balise dangereuse conservée : ${out}`);
    assert.ok(!/\son\w+\s*=/i.test(out), `handler conservé : ${out}`);
    assert.ok(!/<[^>]*\s(href|src)\s*=/i.test(out), `attribut conservé : ${out}`);
  }
  assert.equal(sanitizeHtml(`<h2>Titre</h2><p class="x" style="color:red">Texte &amp; plus</p><ul><li>a</li></ul>`), `<h2>Titre</h2><p>Texte &amp; plus</p><ul><li>a</li></ul>`);
  assert.equal(sanitizeHtml("1 < 2 & 3 > 2"), "1 &lt; 2 &amp; 3 &gt; 2");
});

/* ───────── Commandes : garde-fous ───────── */
const base: RiskInput = { revenue: 30, ebayFeePct: 13, estCost: 10, ordersToday: 0, spentToday: 0, limits: { maxPerDay: 50, maxDailySpend: 300, approveAbove: 100, mode: "api" } };
test("commande : cas nominal, marge négative, plafonds, validation manuelle", () => {
  assert.equal(evaluateOrderRisk(base).action, "order_auto");
  assert.equal(evaluateOrderRisk({ ...base, estCost: 30 }).action, "block", "marge négative");
  assert.equal(evaluateOrderRisk({ ...base, ordersToday: 50 }).action, "defer");
  assert.equal(evaluateOrderRisk({ ...base, spentToday: 295 }).action, "defer");
  assert.equal(evaluateOrderRisk({ ...base, revenue: 300, estCost: 150 }).action, "order_manual");
  assert.equal(evaluateOrderRisk({ ...base, limits: { ...base.limits, mode: "manual" } }).action, "order_manual");
  assert.equal(evaluateOrderRisk({ ...base, estCost: NaN }).action, "block");
  assert.equal(evaluateOrderRisk({ ...base, estCost: 0 }).action, "block");
  assert.equal(evaluateOrderRisk({ ...base, estCost: -5 }).action, "block");
});

/* ───────── CSRF / open redirect ───────── */
test("CSRF : origine étrangère refusée sur POST, acceptée sur GET", () => {
  const ok = { method: "POST", host: "app.example.com", secFetchSite: null };
  assert.equal(originAllowed({ ...ok, origin: "https://app.example.com" }), true);
  assert.equal(originAllowed({ ...ok, origin: "https://evil.com" }), false);
  assert.equal(originAllowed({ ...ok, origin: "https://app.example.com.evil.com" }), false);
  assert.equal(originAllowed({ ...ok, origin: "null" }), false);
  assert.equal(originAllowed({ ...ok, origin: null }), false, "ni Origin ni Sec-Fetch-Site : refusé");
  assert.equal(originAllowed({ ...ok, origin: null, secFetchSite: "cross-site" }), false);
  assert.equal(originAllowed({ ...ok, origin: null, secFetchSite: "same-origin" }), true);
  assert.equal(originAllowed({ ...ok, method: "GET", origin: "https://evil.com" }), true);
});
test("open redirect : seuls les chemins internes passent", () => {
  assert.equal(safeNext("/parametres#connexions"), "/parametres#connexions");
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined]) assert.equal(safeNext(bad as string), "/dashboard");
});

/* ───────── OAuth state ───────── */
test("OAuth state : valide, falsifié, autre utilisateur, expiré, rejoué avec un autre nonce", () => {
  const key = Buffer.alloc(32, 7);
  const { nonce, cookie } = createState("user-1", "fr", key, 1000);
  assert.deepEqual(verifyState(cookie, nonce, "user-1", key, 2000), { market: "fr" });
  assert.equal(verifyState(cookie, nonce, "user-2", key, 2000), null, "autre utilisateur");
  assert.equal(verifyState(cookie, "autre", "user-1", key, 2000), null, "nonce différent");
  assert.equal(verifyState(cookie, nonce, "user-1", key, 1000 + 11 * 60_000), null, "expiré");
  const [body, sig] = cookie.split(".");
  const forged = Buffer.from(JSON.stringify({ n: nonce, u: "user-1", m: "de", e: 9e15 })).toString("base64url");
  assert.equal(verifyState(`${forged}.${sig}`, nonce, "user-1", key, 2000), null, "payload modifié");
  assert.equal(verifyState(`${body}.${sig}`, nonce, "user-1", Buffer.alloc(32, 8), 2000), null, "mauvaise clé");
  assert.equal(verifyState(undefined, nonce, "user-1", key), null);
});

/* ───────── Validation Zod (injection / mass assignment) ───────── */
test("Zod : champs inconnus, types, bornes et payloads d'injection rejetés", () => {
  assert.equal(settingsPatch.safeParse({ plan: "pro" }).success, false, "plan non modifiable");
  assert.equal(settingsPatch.safeParse({ role: "admin" }).success, false);
  assert.equal(settingsPatch.safeParse({ pseudo: "x'; DROP TABLE listings;--" }).success, true, "texte libre accepté : la protection SQL vient des requêtes paramétrées");
  assert.equal(settingsPatch.safeParse({ autoOrder: { enabled: true, maxPerDay: -1, maxDailySpend: 1, approveAbove: 1, mode: "api", notifyOrder: true, notifyError: true } }).success, false);
  assert.equal(settingsPatch.safeParse({ pricing: { tiers: [{ upTo: null, marginPct: 1e9 }], ebayFeePct: 13, fixedFee: 0, alertThresholdPct: 1, autoAdjust: true } }).success, false);
  assert.equal(sniperInput.safeParse({ count: 1000, market: "fr" }).success, false);
  assert.equal(sniperInput.safeParse({ count: 5, market: "../../etc/passwd" }).success, false);
  assert.equal(sniperInput.safeParse({ count: "5", market: "fr" }).success, false, "pas de coercition de type");
  assert.equal(authSchemas.login.safeParse({ email: "a@b.fr", password: "x", admin: true }).success, false);
  assert.equal(authSchemas.login.safeParse({ email: "pas-un-email", password: "x" }).success, false);
  assert.equal(authSchemas.mfaVerify.safeParse({ factorId: "not-a-uuid", code: "123456" }).success, false);
  assert.equal(authSchemas.mfaVerify.safeParse({ factorId: crypto.randomUUID(), code: "12345a" }).success, false);
  assert.equal(generateInput.safeParse({ kind: "title", product: "x" }).success, false);
  assert.equal(generateInput.safeParse({ kind: "title", product: "Lampe LED", keywords: ["a"] }).success, true);
});

/* ───────── Mode privé ───────── */
import { emailAllowed, isPrivateMode } from "./access.ts";
test("mode privé : seules les adresses listées passent (insensible à la casse), ouvert si vide", () => {
  delete process.env.OWNER_EMAILS;
  assert.equal(isPrivateMode(), false);
  assert.equal(emailAllowed("n-importe@qui.fr"), true);
  process.env.OWNER_EMAILS = " Dadino77270@Outlook.com , autre@x.fr ";
  assert.equal(isPrivateMode(), true);
  assert.equal(emailAllowed("dadino77270@outlook.com"), true);
  assert.equal(emailAllowed("DADINO77270@OUTLOOK.COM"), true);
  assert.equal(emailAllowed("intrus@evil.com"), false);
  assert.equal(emailAllowed("dadino77270@outlook.com.evil.com"), false);
  assert.equal(emailAllowed(""), false);
  assert.equal(emailAllowed(null), false);
  delete process.env.OWNER_EMAILS;
});
