# DropFlow

Web app mobile-first (Next.js 16 + TypeScript + Tailwind + Supabase) qui relie eBay et CJ Dropshipping :
produits CJ populaires → annonces eBay avec marge automatique → commandes CJ automatiques → suivi renvoyé à eBay.

Le nom est provisoire : `src/lib/brand.ts`.

## Deux modes

| Mode | Quand | Ce qui se passe |
|---|---|---|
| **Démo** | variables Supabase absentes | aucune connexion, données factices, réglages dans le navigateur |
| **Live** | `NEXT_PUBLIC_SUPABASE_URL` + `..._ANON_KEY` présentes | connexion obligatoire (email + mot de passe), vraies API CJ et eBay |

`npm run doctor` liste précisément ce qui manque.

## Accès privé : un lien réservé à vous seul

Avec `OWNER_EMAILS=votre@email` :
- **seule cette adresse** peut créer un compte et se connecter (inscription fermée aux autres, réponses identiques pour ne rien révéler) ;
- le site est **non indexé** (`robots.txt`, `X-Robots-Tag`) ; toutes les pages et API exigent la connexion ;
- ajoutez la **2FA** (Mon Profil › Sécurité) : même votre mot de passe ne suffit plus.

Un lien secret seul ne protège pas (il fuit par l'historique, un partage d'écran…) : c'est la connexion + 2FA qui protège.

## Mise en route (≈ 30 min, une seule fois : ce sont VOS comptes, je ne peux pas les créer à votre place)

1. **Supabase** : projet gratuit → *SQL Editor* : collez `supabase/schema.sql`, puis `supabase/rls-tests.sql` (doit afficher « OK »). Copiez les 3 clés (*Settings › API*).
   Réglages Auth à faire ensuite : voir la checklist de [SECURITY.md](SECURITY.md) (confirmation email **ON**, inscriptions **désactivées** après création de votre compte).
2. **Vercel** : `npx vercel login` puis `npx vercel --prod`. Ajoutez les variables de `.env.example` (*Settings › Environment Variables*), notamment `OWNER_EMAILS` et `NEXT_PUBLIC_SITE_URL`. `npm run doctor` liste ce qui manque.
3. **eBay** (developer.ebay.com, clés *Production*) : App ID / Cert ID, un **RuName** dont l'Accept URL est `https://VOTRE-DOMAINE/api/ebay/callback`, et le webhook « Marketplace account deletion » vers `https://VOTRE-DOMAINE/api/webhooks/ebay/account-deletion`. Sur votre compte vendeur : **Business policies** (expédition, paiement, retour) et un lieu d'expédition.
4. Ouvrez l'URL sur l'iPhone → *Créer un compte* avec votre email → confirmez le mail → **Paramètres › Connexions** : *Connecter avec eBay* (OAuth officiel), puis collez votre **clé API CJ** (CJ › Compte › API).
5. iPhone : Safari › Partager › **Sur l'écran d'accueil** : l'app s'ouvre en plein écran.
6. Votre compte admin : `update profiles set role = 'admin' where id = '<votre uuid>';` (et `plan = 'pro'` si souhaité, Stripe n'étant pas branché).

Avant d'activer l'automatique : réglez **Plafond de dépense/jour** et **Validation manuelle au-dessus de** (Paramètres › Auto-Order) et commencez avec 2-3 produits.

## Sécurité

Audit complet, correctifs, tests et checklist de mise en production : **[SECURITY.md](SECURITY.md)**.
`npm test` (logique métier + sécurité) et `npm run test:security` (attaques contre un serveur en marche).

## Automatisations

`vercel.json` déclare deux crons **quotidiens** (compatibles offre gratuite Vercel) :
- `/api/cron/sync` : prix et stocks CJ → eBay, pause auto si rupture, reprise au retour du stock, refus des prix aberrants
- `/api/cron/orders` : nouvelle vente eBay → commande CJ **sous garde-fous** (marge négative bloquée, plafonds, validation manuelle), puis suivi CJ → eBay. Une vente ne peut jamais déclencher deux commandes (réservation atomique en base).

Pour des passages plus fréquents (commandes toutes les 15 min) : Vercel Pro, ou un cron externe (cron-job.org) qui appelle l'URL avec l'en-tête `Authorization: Bearer <CRON_SECRET>` (le secret n'est **jamais** accepté dans l'URL).

## Logique de marge (`src/lib/margin.ts`, testée)

```
prix = (coût CJ + livraison + frais fixes) × (1 + marge) / (1 − frais eBay %)
```

La marge (paliers, marge cible, seuil d'alerte) est une marge nette **sur le coût** (9,99 € → 21,99 € = 120 %) :
une marge de 150 % ne peut pas être une part du prix de vente. Arrondi au x,99 supérieur, ajustement selon la concurrence, alerte sous seuil.
CJ facture en USD : taux de change réglables dans Paramètres › Marges.

## Limites connues

- **Non testé contre les API réelles** : le code suit les documentations CJ v2.0 et eBay, mais n'a pas encore tourné avec vos clés.
  Les premières erreurs éventuelles s'affichent telles quelles (message CJ/eBay) dans l'interface.
- Annonces eBay : une seule variante CJ (la moins chère en stock) ; l'aspect « Marque » est rempli en « Sans marque » ;
  certaines catégories exigent d'autres caractéristiques et eBay refusera alors la publication (l'erreur est affichée).
- Sniper : CJ n'expose pas les ventes ; « popularité » = nombre de vendeurs qui listent le produit. Analytics : l'API publique eBay
  donne prix, concurrence et mots-clés, pas les volumes de ventes. Classements : données de démonstration.
- Notifications (commande / erreur) : les erreurs et commandes à valider s'affichent sur le Dashboard ; pas de notification push.
- Paiement Stripe non branché.
