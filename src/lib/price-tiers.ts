/** Tranches de prix eBay utilisées dans Classements et le Sniper (filtre sur le prix, pas le coût). */
export type PriceTier = "all" | "low" | "mid" | "high";

export const PRICE_TIER_LABELS: Record<PriceTier, string> = { all: "Tous", low: "0-30 €", mid: "30-50 €", high: "50 € +" };

export function inPriceTier(price: number, tier: PriceTier): boolean {
  switch (tier) {
    case "low":
      return price < 30;
    case "mid":
      return price >= 30 && price < 50;
    case "high":
      return price >= 50;
    default:
      return true;
  }
}
