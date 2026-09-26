export type PlanId = "free" | "pro" | "owner";

export type Quotas = {
  /** Lancements du Product Sniper par jour. */
  sniperRuns: number;
  /** Produits max par lancement. */
  sniperProducts: number;
  /** Analyses de mots-clés par jour. */
  analyses: number;
  /** Générations IA (titres + descriptions) par jour. */
  generations: number;
};

export const PLANS: Record<PlanId, { name: string; price: string; quotas: Quotas }> = {
  free: {
    name: "Free",
    price: "0 €",
    quotas: { sniperRuns: 2, sniperProducts: 5, analyses: 3, generations: 10 },
  },
  /**
   * Réservé au rôle « admin » (posé en base, jamais modifiable depuis le navigateur). Limites très hautes, pas
   * d'infini pour rester borné — SAUF `generations` : chaque appel coûte de vrais euros (API Claude), contrairement
   * aux autres quotas ; plafonné à un vrai chiffre raisonnable, pas à un million, pour ne jamais dépasser le budget
   * même en cas d'abus (session compromise, boucle cliente en erreur) sur ce point d'entrée précis.
   */
  owner: {
    name: "Illimité",
    price: "0 €",
    quotas: { sniperRuns: 1_000_000, sniperProducts: 100, analyses: 1_000_000, generations: 200 },
  },
  pro: {
    name: "Pro",
    price: "19 €/mois",
    quotas: { sniperRuns: 20, sniperProducts: 50, analyses: 100, generations: 300 },
  },
};
