import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: "Politique de confidentialité" };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-2 mt-8 text-xl font-extrabold">{children}</h2>;

/**
 * Modèle de politique de confidentialité. Les champs entre crochets sont à compléter par l'éditeur du site ;
 * faites relire ce texte par un juriste avant ouverture au public.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 pb-[calc(3rem+env(safe-area-inset-bottom))] text-[16px] leading-relaxed">
      <Link href="/dashboard" className="text-sm font-semibold text-brand-600">
        ← Retour
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Politique de confidentialité</h1>
      <p className="mt-2 text-muted">Dernière mise à jour : [date]</p>

      <H>Qui est responsable de vos données ?</H>
      <p>
        {APP_NAME} est édité par [Nom / raison sociale, adresse, email de contact]. Pour toute question sur vos données : [email de contact].
      </p>

      <H>Quelles données, pourquoi ?</H>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Compte</strong> : adresse email et mot de passe (stocké sous forme de hash par Supabase Auth), pseudo : pour vous connecter (exécution du contrat).</li>
        <li><strong>Connexions eBay et CJ</strong> : jetons eBay et clé API CJ, chiffrés (AES-256-GCM) : pour publier vos annonces et passer vos commandes.</li>
        <li><strong>Annonces, produits, réglages de marge</strong> : pour faire fonctionner le service.</li>
        <li><strong>Commandes</strong> : identifiant de commande eBay, montant, statut, suivi. L&apos;adresse de livraison de vos acheteurs est transmise à CJ pour l&apos;expédition, elle n&apos;est <em>pas</em> conservée par {APP_NAME}.</li>
        <li><strong>Journal de sécurité</strong> : connexions, changements de prix, commandes, avec adresse IP et navigateur : pour la sécurité et la détection de fraude (intérêt légitime).</li>
      </ul>
      <p className="mt-2">Nous ne collectons que ce qui est nécessaire. Aucune vente ni cession de données, aucun profilage publicitaire.</p>

      <H>Cookies</H>
      <p>Seuls des cookies strictement nécessaires sont utilisés (session de connexion, protégés httpOnly et Secure). Pas de cookie publicitaire ni d&apos;analyse d&apos;audience, donc pas de consentement à recueillir. Le navigateur conserve aussi un réglage local (fermeture du bandeau d&apos;information).</p>

      <H>Sous-traitants</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>Supabase (base de données, authentification) ; Vercel (hébergement) ; Upstash (limitation de requêtes) ; Cloudflare Turnstile (anti-robot) [si activé].</li>
        <li>eBay et CJ Dropshipping : APIs que vous autorisez vous-même.</li>
        <li>Anthropic (génération de textes) [si activé] : reçoit uniquement le texte du produit, jamais de donnée personnelle.</li>
      </ul>
      <p className="mt-2">Certains sous-traitants sont situés hors de l&apos;Union européenne : [préciser régions choisies et garanties : clauses contractuelles types].</p>

      <H>Durée de conservation</H>
      <p>Données de compte : jusqu&apos;à la suppression de votre compte. Journal de sécurité : [12] mois maximum, puis effacé. À la suppression du compte, toutes vos données sont effacées immédiatement, hors sauvegardes chiffrées purgées sous [30] jours.</p>

      <H>Vos droits</H>
      <p>
        Accès et portabilité : bouton « Exporter mes données » dans Mon Profil. Effacement : Paramètres › Zone sensible › Supprimer le compte. Rectification : Mon Profil. Opposition, limitation, réclamation auprès de la CNIL (cnil.fr) : [email de contact].
      </p>

      <H>Sécurité</H>
      <p>Chiffrement en transit (HTTPS/HSTS) et au repos, isolation des données par utilisateur (Row Level Security), vérification en deux étapes optionnelle, limitation des tentatives de connexion, journal d&apos;audit.</p>
    </main>
  );
}
