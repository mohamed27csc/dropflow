/**
 * Cœur du site : calcul du prix de vente eBay à partir du coût CJ.
 *
 * Fichier volontairement sans dépendance : il est utilisé tel quel côté client
 * (démo, simulateur) et le sera côté serveur (Sniper, synchro cron).
 *
 * Convention : la « marge » (paliers, marge cible, seuil d'alerte) est une marge NETTE
 * exprimée SUR LE COÛT, comme dans les captures d'écran (9,99 € → 21,99 € = 120 %).
 * Une marge de 150 % ne peut pas être une part du prix de vente (dénominateur négatif),
 * donc :
 *
 *   prix = coûtTotal × (1 + marge) / (1 − fraisEbay%)
 *
 * C'est la formule d'origine (coûtTotal / (1 − fraisEbay − margeNette)) avec la marge
 * ramenée au prix : margeNette = marge × coûtTotal / prix.
 */

export type MarginTier = {
  /** Borne haute exclusive du coût CJ, en €. null = pas de limite. */
  upTo: number | null;
  /** Marge nette visée, en % du coût. */
  marginPct: number;
};

export type PricingSettings = {
  tiers: MarginTier[];
  /** Commission eBay sur le prix de vente, en %. */
  ebayFeePct: number;
  /** Frais fixes par commande (frais eBay fixes, emballage…), en €. */
  fixedFee: number;
  /** Alerte si la marge nette passe sous ce seuil, en % du coût. */
  alertThresholdPct: number;
  /** Ajuste la marge selon demande / concurrence. */
  autoAdjust: boolean;
  /** Taux Promoted Listings (coût à la vente, % du prix), déduit comme un frais eBay classique. Doit rester égal à AD_RATE (src/server/ebay.ts). */
  adRatePct: number;
};

export const DEFAULT_TIERS: MarginTier[] = [
  { upTo: 5, marginPct: 150 },
  { upTo: 15, marginPct: 100 },
  { upTo: 30, marginPct: 60 },
  { upTo: 80, marginPct: 40 },
  { upTo: null, marginPct: 25 },
];

/** Promoted Listings désactivé par choix (zéro frais de pub, marge maximale). Remettre à ~8 si jamais réactivé. */
export const DEFAULT_AD_RATE_PCT = 0;

export const DEFAULT_PRICING: PricingSettings = {
  tiers: DEFAULT_TIERS,
  ebayFeePct: 13,
  fixedFee: 0.35,
  alertThresholdPct: 20,
  autoAdjust: true,
  adRatePct: DEFAULT_AD_RATE_PCT,
};

export type MarketSignal = {
  /** Ventes sur 30 jours pour ce type de produit sur eBay. */
  sold30d: number;
  /** Nombre de vendeurs concurrents. */
  sellers: number;
};

export type Adjustment = { factor: number; reason: string };

export const DEMAND_HIGH = 300;
export const SELLERS_LOW = 15;
export const SELLERS_HIGH = 60;

/** Facteur multiplicatif appliqué à la marge de base. */
export function marketAdjustment(signal?: MarketSignal): Adjustment {
  if (!signal) return { factor: 1, reason: "Aucune donnée de marché" };
  const highDemand = signal.sold30d >= DEMAND_HIGH;
  const fewSellers = signal.sellers <= SELLERS_LOW;
  const manySellers = signal.sellers >= SELLERS_HIGH;

  if (highDemand && fewSellers) return { factor: 1.25, reason: "Forte demande, peu de concurrence" };
  if (manySellers && highDemand) return { factor: 0.9, reason: "Forte demande mais marché saturé" };
  if (manySellers) return { factor: 0.8, reason: "Beaucoup de vendeurs" };
  if (highDemand || fewSellers) return { factor: 1.1, reason: highDemand ? "Forte demande" : "Peu de concurrence" };
  return { factor: 1, reason: "Marché standard" };
}

export function tierMarginPct(cjCost: number, tiers: MarginTier[]): number {
  const sorted = [...tiers].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  const tier = sorted.find((t) => t.upTo === null || cjCost < t.upTo) ?? sorted[sorted.length - 1];
  return tier.marginPct;
}

/** Plus petit prix en x,99 supérieur ou égal à `price`. */
export function roundTo99(price: number): number {
  const cents = Math.round(price * 100) / 100;
  return Math.ceil(cents - 0.99 - 1e-9) + 0.99;
}

export type PriceInput = {
  cjCost: number;
  shipping: number;
  signal?: MarketSignal;
  /** Marge plancher demandée (ex. « marge cible » du Sniper), en % du coût. */
  minMarginPct?: number;
};

export type PriceResult = {
  totalCost: number;
  baseMarginPct: number;
  adjustment: Adjustment;
  appliedMarginPct: number;
  price: number;
  ebayFee: number;
  netProfit: number;
  /** Marge nette réelle après arrondi, en % du coût. */
  netMarginPct: number;
  belowThreshold: boolean;
};

export function computePrice(input: PriceInput, s: PricingSettings): PriceResult {
  const totalCost = input.cjCost + input.shipping + s.fixedFee;
  const baseMarginPct = tierMarginPct(input.cjCost, s.tiers);
  const adjustment = s.autoAdjust ? marketAdjustment(input.signal) : { factor: 1, reason: "Ajustement désactivé" };
  const appliedMarginPct = Math.max(baseMarginPct * adjustment.factor, input.minMarginPct ?? 0);

  const fee = (s.ebayFeePct + s.adRatePct) / 100;
  const raw = (totalCost * (1 + appliedMarginPct / 100)) / (1 - fee);
  const price = roundTo99(raw);

  return { totalCost, baseMarginPct, adjustment, appliedMarginPct, price, ...profitAt(price, totalCost, s) };
}

/**
 * Marge réelle d'une annonce existante (prix eBay et coûts connus). Inclut le coût Promoted Listings :
 * quasiment toutes les annonces DropFlow sont mises en avant automatiquement (coût uniquement à la vente),
 * l'ignorer surestimerait systématiquement la marge affichée.
 */
export function profitAt(price: number, totalCost: number, s: Pick<PricingSettings, "ebayFeePct" | "alertThresholdPct" | "adRatePct">) {
  const ebayFee = (price * (s.ebayFeePct + s.adRatePct)) / 100;
  const netProfit = price - ebayFee - totalCost;
  const netMarginPct = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;
  return { ebayFee, netProfit, netMarginPct, belowThreshold: netMarginPct < s.alertThresholdPct };
}
