import { DEFAULT_PRICING, type PricingSettings } from "./margin";
import type { PlanId } from "./plans";

/** Types et valeurs par défaut des réglages, partagés entre le navigateur et le serveur. */

export type Usage = { sniperRuns: number; analyses: number; generations: number };

export type CountryCode = "fr" | "de" | "uk";

export type Settings = {
  pseudo: string;
  email: string;
  plan: PlanId;
  pricing: PricingSettings;
  ebay: Record<CountryCode, { connected: boolean; shop: string }>;
  /** Seuls les 4 derniers caractères sont gardés pour l'affichage. */
  cj: { connected: boolean; keyHint: string };
  printful: { connected: boolean; keyHint: string };
  /** Clé enregistrée mais jamais vérifiée auprès de Vinted (pas d'API publique). */
  vinted: { connected: boolean; keyHint: string };
  sync: { everyHours: number; syncPrices: boolean; syncStock: boolean; autoPause: boolean };
  autoOrder: { enabled: boolean; maxPerDay: number; /** Plafond de dépense CJ/jour, en €. */ maxDailySpend: number; /** Au-dessus, la commande CJ est créée mais pas payée (validation manuelle), en €. */ approveAbove: number; mode: "api" | "manual"; notifyOrder: boolean; notifyError: boolean };
  usage: Usage;
  /** Taux de change : CJ facture en USD, eBay vend en EUR/GBP. */
  fx: { usdEur: number; eurGbp: number };
};

export const DEFAULT_SETTINGS: Settings = {
  pseudo: "Dadino",
  email: "dadino77270@outlook.com",
  plan: "free",
  pricing: DEFAULT_PRICING,
  ebay: {
    fr: { connected: true, shop: "Ma Boutique" },
    de: { connected: true, shop: "Ma Boutique" },
    uk: { connected: true, shop: "Ma Boutique" },
  },
  cj: { connected: false, keyHint: "" },
  printful: { connected: false, keyHint: "" },
  vinted: { connected: false, keyHint: "" },
  sync: { everyHours: 6, syncPrices: true, syncStock: true, autoPause: true },
  autoOrder: { enabled: true, maxPerDay: 50, maxDailySpend: 300, approveAbove: 100, mode: "api", notifyOrder: true, notifyError: true },
  usage: { sniperRuns: 0, analyses: 0, generations: 0 },
  fx: { usdEur: 0.92, eurGbp: 0.85 },
};

