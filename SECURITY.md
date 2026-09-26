# Sécurité de DropFlow : audit, correctifs, tests, checklist

Audit du code (Next.js 16 + TypeScript + Supabase + Vercel) selon l'OWASP Top 10 et l'OWASP API Security Top 10.
**Périmètre de vérification : le code et un serveur réel sans compte.** Rien n'a encore tourné contre un vrai projet Supabase, ni contre eBay/CJ (voir « Risques restants »).

## 1. Failles trouvées (état avant audit), par gravité

| # | Gravité | Faille | Référence OWASP | Correctif |
|---|---|---|---|---|
| 1 | **Critique** | **Double commande CJ possible** : la ligne « pending » était écrite par *upsert* (écrasable) après lecture ; deux exécutions cron simultanées ou un rejeu pouvaient commander deux fois la même vente eBay | API6 (flux métier sensibles) | Réservation **atomique** avant tout appel CJ (`INSERT` sous contrainte d'unicité, ou `UPDATE … WHERE status='error' AND cj_order_id IS NULL`). Seul l'exécutant qui gagne la réservation commande. Le renvoi de suivi est réservé de la même façon. |
| 2 | **Haute** | Aucun plafond de dépense, aucun blocage de marge négative, aucune validation manuelle : un prix CJ aberrant ou un bug pouvait vider le solde CJ | API6 | `evaluateOrderRisk` : blocage si marge négative, report si plafond commandes/jour ou dépense/jour atteint, commande **créée mais non payée** au-dessus d'un seuil (validation dans CJ). Réglable dans Paramètres › Auto-Order. |
| 3 | **Haute** | Secret cron accepté dans l'URL (`?secret=`, donc dans les logs) et comparé avec `===` | A07, API2 | En-tête `Authorization: Bearer` uniquement, comparaison en temps constant, secret ≥ 24 caractères. |
| 4 | **Haute** | Aucune limitation de débit ni verrouillage sur connexion, Sniper, sync, IA, analytics | API4, A07 | Limite par IP **et** par utilisateur sur toutes les routes (Upstash Redis), verrouillage 15 min après 5 échecs (email+IP) ou 10 (email seul, attaque distribuée), Turnstile. |
| 5 | **Haute** | Cookies de session lisibles par JavaScript (client Supabase navigateur) : une XSS aurait volé la session | A02, A07 | Toute l'authentification passe par nos routes serveur ; cookies **httpOnly, Secure, SameSite=Lax** ; le navigateur n'utilise plus Supabase. Déconnexion = révocation globale. |
| 6 | Moyenne | Mot de passe 8 caractères, email non vérifié imposé côté app | A07 | 12+ caractères avec 4 classes, liste de mots de passe triviaux, refus si contient l'email, contrôle des fuites (HIBP, k-anonymat), email confirmé exigé par `requireUser` même si le réglage Supabase est désactivé, 2FA TOTP, durée de session absolue 14 j. |
| 7 | Moyenne | Aucun en-tête de sécurité, aucune CSP | A05 | CSP stricte à nonce + `strict-dynamic` (sans `unsafe-inline`/`unsafe-eval` pour les scripts), HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP, `noindex`. |
| 8 | Moyenne | Pas de protection CSRF explicite | A01 | Contrôle `Origin` / `Sec-Fetch-Site` sur toute écriture `/api` (refus si absent), en plus de SameSite=Lax. Pas de CORS. |
| 9 | Moyenne | Messages d'erreur renvoyaient `e.message` (Supabase, chemins, noms de variables) | A05, API8 | `PublicError` (message montrable) vs erreur interne → « Erreur interne » + référence ; détail uniquement dans les logs serveur, secrets masqués. |
| 10 | Moyenne | Validation manuelle et incomplète des entrées ; corps non borné | A03, API3 | Schémas **Zod stricts** (champs inconnus rejetés = anti mass-assignment) pour tout body/query, corps limité à 64 Ko, pas de coercition de type. |
| 11 | Moyenne | Chiffrement : clé = SHA-256 d'une phrase, chiffrés non liés à leur ligne, pas de rotation | A02 | HKDF-SHA256 (clés distinctes par usage), **AAD** = contexte (`cj-key:<user>`…) : un chiffré copié vers un autre utilisateur ne se déchiffre pas ; rotation via `ENCRYPTION_KEY_PREVIOUS`. |
| 12 | Moyenne | État OAuth eBay : cookie non signé, non lié à l'utilisateur, `path=/` | A07 | État signé HMAC, lié à l'utilisateur + marché, 10 min, usage unique, cookie limité à `/api/ebay/callback`. |
| 13 | Moyenne | HTML généré par IA/fournisseur envoyé tel quel à eBay | A03 (XSS/injection) | Assainisseur par liste blanche (balises de mise en forme sans attribut). Aucun `dangerouslySetInnerHTML` dans l'app. |
| 14 | Moyenne | Suppression de compte sans ré-authentification récente ; pas d'export RGPD | A04, RGPD | Connexion < 30 min exigée, suppression réelle en cascade, export JSON. |
| 15 | Moyenne | Un prix fournisseur aberrant (glitch CJ) était répercuté sur eBay | API6 | Variation > 2× ou < 0,5× refusée et journalisée. |
| 16 | Moyenne | Aucun journal d'audit ; webhook eBay « suppression de compte » absent (obligatoire en production) | A09 | Table `audit_log` (connexions, comptes, prix, commandes, réglages, suppressions), webhook eBay avec challenge + **signature ECDSA vérifiée** (échec fermé). |
| 17 | Basse | Liste des variables d'environnement manquantes visible de tout utilisateur | API8 | Réservée au rôle admin (lu en base). |
| 18 | Info | `.gitignore` ignorait aussi `.env.example` | A05 | `!.env.example`. |

**Non-faille par conception (à connaître) :** l'API n'a **aucune route qui accepte un identifiant de ressource** (pas de `/listings/:id`) : chaque requête est calculée depuis l'identité de session. L'IDOR classique n'a donc pas de surface ; la RLS Postgres double cette protection pour les lectures (`listings`, `dashboard` utilisent le client de l'utilisateur).

## 2. Ce qui est en place, par thème de ta demande

1. **Secrets** : aucune clé côté client (`server-only`), tout par variables d'environnement, jetons eBay + clé CJ chiffrés AES-256-GCM avec clé séparée, `.env*` ignoré, secrets masqués dans les logs et jamais dans les réponses.
2. **Authentification** : Supabase Auth via routes serveur, email vérifié obligatoire, mot de passe fort + contrôle de fuite, 2FA TOTP (Profil › Sécurité), cookies httpOnly/Secure/Lax, session 14 j max, anti brute-force + Turnstile, réponses anti-énumération.
3. **Autorisation** : RLS sur **toutes** les tables ; aucune écriture possible depuis le navigateur (`REVOKE` : ni quotas, ni plan, ni rôle, ni journal) ; tables à secrets inaccessibles à tout rôle client ; rôle `admin` lu en base ; quotas Free/Pro appliqués côté serveur.
4. **OAuth eBay** : `state` signé et lié à la session ; redirect URI = RuName enregistré chez eBay (eBay refuse toute autre valeur) ; jetons rafraîchis côté serveur ; déconnexion = **suppression** des jetons. *Limites eBay : PKCE non supporté sur ce flux, pas d'API de révocation de jeton utilisateur (le jeton d'accès expire en 2 h ; retirez l'app dans eBay › Autorisations pour révoquer aussi côté eBay).*
5. **Validation / web** : Zod partout, requêtes paramétrées uniquement (client Supabase/PostgREST, aucune concaténation SQL), CSP, CSRF, CORS fermé, redirections internes seulement.
6. **Débit / abus** : IP + utilisateur, Upstash Redis, quotas serveur.
7. **Automatisations** : cron par secret, webhook eBay signé, **idempotence garantie par la base**, plafonds, validation manuelle, blocage marge négative, audit.
8. **Infra / données** : `npm audit` + Dependabot + lockfile + CI (`.github/`), RGPD : minimisation (adresse acheteur non conservée), export, suppression réelle, politique de confidentialité, information cookies.

## 3. Tests de sécurité

| Commande | Ce qu'elle prouve |
|---|---|
| `npm test` (21 tests) | XSS (10 payloads dont contournements `<scr<script>`), CSRF (origines sosies), open redirect, OAuth state (falsifié / autre utilisateur / expiré / nonce rejoué), Zod (mass-assignment, injections SQL en texte, bornes, types), garde-fous de commande, chiffrement (altération, mauvais contexte, mauvaise clé, rotation), mots de passe, mode privé |
| `npm run test:security` (≈ 85 contrôles) | Contre un **serveur réel** (build de production, sans compte) : en-têtes/CSP/nonce, 23 routes refusées sans session, CSRF, CORS, cron (sans secret, dans l'URL, tronqué, mauvais), **brute-force** (verrouillage à 5 échecs, attaque distribuée multi-IP, message identique), 7 injections, JSON invalide, corps 100 Ko, open redirect, fichiers sensibles, webhook eBay (sans signature, `kid` piégé) |
| `supabase/rls-tests.sql` | **À exécuter par vous** dans le SQL Editor (annulé à la fin) : l'utilisateur A ne lit ni ne modifie rien de B, ne lit jamais `cj_accounts`/`ebay_accounts`, ne peut s'attribuer ni plan Pro ni rôle admin, ni remettre ses quotas à zéro, ni écrire dans le journal |

Tests **non automatisables ici** (comptes réels requis) : IDOR bout en bout avec deux vrais comptes (inutile par conception, voir plus haut), flux email de confirmation, TOTP, Turnstile.

## 4. Checklist avant mise en production

**Supabase (Dashboard)**
- [ ] `supabase/schema.sql` exécuté, puis `supabase/rls-tests.sql` : le message « OK » s'affiche
- [ ] *Auth › Providers › Email* : **Confirm email = ON**
- [ ] *Auth › Sign In / Providers* : **désactiver « Allow new users to sign up »** (mode privé : ton compte est créé une fois, puis les inscriptions restent fermées ; `OWNER_EMAILS` protège aussi côté app)
- [ ] *Auth › Attack Protection* : « CAPTCHA protection » **OFF** (Turnstile est vérifié par l'app ; les deux à la fois invalideraient le jeton), « Leaked password protection » ON si offre Pro
- [ ] *Auth › Multi-Factor* : TOTP activé
- [ ] *Auth › URL Configuration* : Site URL = ton domaine ; Redirect URLs = `https://<domaine>/auth/callback` uniquement
- [ ] *Auth › Sessions* : JWT expiry 3600 s, **refresh token rotation + reuse detection ON**
- [ ] SMTP personnalisé (l'envoi par défaut est limité et non fiable en production)
- [ ] **Sauvegardes** : l'offre gratuite n'en a **pas** ; passer Pro (sauvegardes quotidiennes, PITR en option) ou planifier un `pg_dump` chiffré
- [ ] Ton compte : `update profiles set role = 'admin' where id = '<ton uuid>';`

**Vercel / secrets**
- [ ] Variables de `.env.example` renseignées ; `npm run doctor` sans ✗ ; **`ENCRYPTION_KEY` ≠ `CRON_SECRET`**, chacune `openssl rand -hex 32`
- [ ] `OWNER_EMAILS` = ton email ; `NEXT_PUBLIC_SITE_URL` = URL exacte en `https://`
- [ ] Upstash Redis connecté (sinon limitation en mémoire seulement) ; Turnstile activé
- [ ] Domaine en HTTPS uniquement ; aucune variable `NEXT_PUBLIC_*` autre que Supabase URL/anon, site, Turnstile

**eBay / CJ**
- [ ] RuName : Accept URL = `https://<domaine>/api/ebay/callback`
- [ ] Notification « Marketplace account deletion » : endpoint = `https://<domaine>/api/webhooks/ebay/account-deletion` + token de vérification identique à `EBAY_VERIFICATION_TOKEN`
- [ ] Business policies eBay créées ; **plafonds Auto-Order réglés** (dépense/jour, seuil de validation) avant d'activer l'automatique
- [ ] Solde CJ limité au montant que tu acceptes de risquer

**Dépôt**
- [ ] Dépôt Git privé, GitHub Dependabot + Actions actifs (`.github/`), *Secret scanning* activé

**Premier jour**
- [ ] Activer la 2FA (Profil › Sécurité), lancer `npm run test:security` contre l'URL de production, vérifier le journal `audit_log`

## 5. Risques restants (honnêtes)

1. **Jamais exécuté contre de vrais services** : Supabase (RLS réelle, MFA, emails), eBay et CJ. Les formats d'API suivent les documentations mais peuvent différer ; les premiers essais doivent se faire avec **peu de produits et des plafonds bas**.
2. **La clé service-role contourne la RLS** : le serveur filtre toujours par `user_id` (relu route par route), mais une future route mal écrite pourrait fuiter. Toute nouvelle route doit passer par `secured()`.
3. **Sans Upstash**, la limitation de débit est en mémoire par instance : contournable sur Vercel. Fail-closed uniquement si Upstash est configuré mais en panne.
4. **Verrouillage par email** : un attaquant peut volontairement verrouiller ton compte 15 min (déni de service ciblé). Compromis assumé face au brute-force ; Turnstile + 2FA limitent le risque.
5. **CSP** : `style-src-attr 'unsafe-inline'` (styles en attribut de React) et `img-src https:` (photos CJ de domaines variés) restent larges. Les scripts sont, eux, strictement contrôlés.
6. **HIBP en échec ouvert** (service indisponible = mot de passe accepté) ; IP client fiable seulement derrière Vercel (`x-vercel-forwarded-for`).
7. **eBay** : pas de PKCE ni de révocation de jeton par API. **CJ** : pas de webhook signé (on interroge CJ, donc aucune surface entrante).
8. Variété de produits : une seule variante CJ, catégories eBay exigeant des caractéristiques supplémentaires → publication refusée (erreur visible).
9. Les textes légaux (`/confidentialite`) sont un **modèle** à compléter (éditeur, durées, transferts hors UE) et à faire relire.
10. Stripe non branché : le plan Pro se donne par la base (`/api/admin/plan` ou SQL) ; aucun paiement ne peut être contourné depuis le navigateur.
