import type { Currency } from "./format";
import type { CountryCode } from "./settings-store";

/** Données de démo. Chaque export sera remplacé par un appel API/Supabase à l'étape de branchement. */

export type Country = { code: CountryCode; name: string; domain: string; flag: string; currency: Currency };

export const COUNTRIES: Country[] = [
  { code: "fr", name: "France", domain: "ebay.fr", flag: "🇫🇷", currency: "EUR" },
  { code: "de", name: "Allemagne", domain: "ebay.de", flag: "🇩🇪", currency: "EUR" },
  { code: "uk", name: "Royaume-Uni", domain: "ebay.co.uk", flag: "🇬🇧", currency: "GBP" },
];

export const CATEGORIES = [
  "Beauté & santé",
  "Maison & cuisine",
  "Mode",
  "Sport & fitness",
  "Animaux",
  "Électronique",
  "Auto & moto",
  "Bébé & enfants",
];

export type CjProduct = {
  cjId: string;
  title: string;
  emoji: string;
  hue: number;
  category: string;
  cjCost: number;
  shipping: number;
  sold30d: number;
  sellers: number;
};

export const CJ_TRENDS: CjProduct[] = [
  { cjId: "CJ-1001", title: "Masseur lifting visage LED EMS", emoji: "💆", hue: 340, category: "Beauté & santé", cjCost: 9.99, shipping: 0, sold30d: 1240, sellers: 9 },
  { cjId: "CJ-1002", title: "Combinaison de sport côtelée femme", emoji: "🧘", hue: 270, category: "Mode", cjCost: 12.4, shipping: 1.2, sold30d: 860, sellers: 41 },
  { cjId: "CJ-1003", title: "Lampe frontale rechargeable USB", emoji: "🔦", hue: 45, category: "Sport & fitness", cjCost: 4.2, shipping: 0.8, sold30d: 640, sellers: 27 },
  { cjId: "CJ-1004", title: "Brosse animaux auto-nettoyante", emoji: "🐶", hue: 25, category: "Animaux", cjCost: 3.6, shipping: 0.9, sold30d: 920, sellers: 63 },
  { cjId: "CJ-1005", title: "Mini projecteur portable HD", emoji: "📽️", hue: 220, category: "Électronique", cjCost: 38.5, shipping: 3.5, sold30d: 210, sellers: 12 },
  { cjId: "CJ-1006", title: "Organisateur de tiroir rétractable", emoji: "🗄️", hue: 160, category: "Maison & cuisine", cjCost: 6.8, shipping: 1.1, sold30d: 380, sellers: 22 },
  { cjId: "CJ-1007", title: "Écouteurs sans fil Bluetooth 5.3", emoji: "🎧", hue: 200, category: "Électronique", cjCost: 14.9, shipping: 1.5, sold30d: 1500, sellers: 88 },
  { cjId: "CJ-1008", title: "Support téléphone voiture magnétique", emoji: "🚗", hue: 10, category: "Auto & moto", cjCost: 2.9, shipping: 0.7, sold30d: 1100, sellers: 120 },
  { cjId: "CJ-1009", title: "Tapis de yoga antidérapant", emoji: "🧘‍♀️", hue: 130, category: "Sport & fitness", cjCost: 17.5, shipping: 3.2, sold30d: 300, sellers: 35 },
  { cjId: "CJ-1010", title: "Montre connectée sport étanche", emoji: "⌚", hue: 250, category: "Électronique", cjCost: 24, shipping: 2, sold30d: 520, sellers: 70 },
  { cjId: "CJ-1011", title: "Chaussons bébé antidérapants", emoji: "🧦", hue: 320, category: "Bébé & enfants", cjCost: 4.9, shipping: 0.9, sold30d: 260, sellers: 14 },
  { cjId: "CJ-1012", title: "Nettoyeur à ultrasons bijoux", emoji: "💍", hue: 185, category: "Maison & cuisine", cjCost: 19.9, shipping: 2.4, sold30d: 190, sellers: 8 },
];

export type ListingStatus = "active" | "paused";

export type Listing = {
  ebayId: string;
  title: string;
  emoji?: string;
  hue?: number;
  /** Photo réelle (mode live). */
  image?: string;
  error?: string;
  market?: string;
  ebayPrice: number;
  cjCost: number;
  shipping: number;
  status: ListingStatus;
  pauseReason?: "stock" | "solde" | "policy" | "no_sale";
  /** Taux Promoted Listings réellement appliqué à cette annonce (%). Absent = pas encore mise en avant, marge estimée par défaut. */
  adRate?: number;
  /** false = le lien fournisseur demande une vérification (prix ou variante modifiés côté CJ). */
  supplierOk: boolean;
  cjId: string;
};

export const LISTINGS: Listing[] = [
  { ebayId: "336577407755", title: "Masseur Lifting Visage LED EMS Rechargeable", emoji: "💆", hue: 340, ebayPrice: 21.99, cjCost: 9.99, shipping: 0, status: "active", supplierOk: true, cjId: "CJ-1001" },
  { ebayId: "336575345705", title: "Women's Solid Ribbed Long Sleeve Jumpsuit Sport", emoji: "🧘", hue: 270, ebayPrice: 27.99, cjCost: 12.4, shipping: 1.2, status: "active", supplierOk: false, cjId: "CJ-1002" },
  { ebayId: "336571120984", title: "Lampe Frontale LED Rechargeable USB Puissante", emoji: "🔦", hue: 45, ebayPrice: 12.99, cjCost: 4.2, shipping: 0.8, status: "active", supplierOk: true, cjId: "CJ-1003" },
  { ebayId: "336570098213", title: "Brosse Auto-Nettoyante Chien Chat Poils", emoji: "🐶", hue: 25, ebayPrice: 9.99, cjCost: 3.6, shipping: 0.9, status: "active", supplierOk: true, cjId: "CJ-1004" },
  { ebayId: "336569981124", title: "Mini Projecteur Portable HD Wifi Home Cinéma", emoji: "📽️", hue: 220, ebayPrice: 64.99, cjCost: 38.5, shipping: 3.5, status: "paused", pauseReason: "stock", supplierOk: true, cjId: "CJ-1005" },
  { ebayId: "336568004417", title: "Organisateur de Tiroir Rétractable Cuisine", emoji: "🗄️", hue: 160, ebayPrice: 15.99, cjCost: 6.8, shipping: 1.1, status: "active", supplierOk: true, cjId: "CJ-1006" },
  { ebayId: "336566219003", title: "Écouteurs Sans Fil Bluetooth 5.3 Réduction de Bruit", emoji: "🎧", hue: 200, ebayPrice: 24.49, cjCost: 14.9, shipping: 1.5, status: "active", supplierOk: true, cjId: "CJ-1007" },
  { ebayId: "336565771830", title: "Support Téléphone Voiture Magnétique 360°", emoji: "🚗", hue: 10, ebayPrice: 8.99, cjCost: 2.9, shipping: 0.7, status: "active", supplierOk: true, cjId: "CJ-1008" },
  { ebayId: "336564330271", title: "Tapis de Yoga Antidérapant Épais TPE 6 mm", emoji: "🧘‍♀️", hue: 130, ebayPrice: 32.99, cjCost: 17.5, shipping: 3.2, status: "paused", supplierOk: true, cjId: "CJ-1009" },
  { ebayId: "336563108846", title: "Montre Connectée Sport Étanche Cardio Sommeil", emoji: "⌚", hue: 250, ebayPrice: 39.99, cjCost: 24, shipping: 2, status: "active", supplierOk: false, cjId: "CJ-1010" },
  { ebayId: "336561995520", title: "Chaussons Bébé Antidérapants Coton Doux", emoji: "🧦", hue: 320, ebayPrice: 11.99, cjCost: 4.9, shipping: 0.9, status: "active", supplierOk: true, cjId: "CJ-1011" },
  { ebayId: "336560847761", title: "Nettoyeur à Ultrasons Bijoux Lunettes 45 kHz", emoji: "💍", hue: 185, ebayPrice: 34.99, cjCost: 19.9, shipping: 2.4, status: "active", supplierOk: true, cjId: "CJ-1012" },
];

export type DayStats = { revenue: number; deltaPct: number; orders: number; netProfit: number; activeListings: number };

export const DASHBOARD: Record<CountryCode, DayStats> = {
  fr: { revenue: 412.8, deltaPct: 18, orders: 14, netProfit: 118.4, activeListings: 92 },
  de: { revenue: 286.5, deltaPct: 7, orders: 9, netProfit: 79.2, activeListings: 64 },
  uk: { revenue: 133.9, deltaPct: -12, orders: 5, netProfit: 34.6, activeListings: 41 },
};

export type Ranking = { keyword: string; sales: number; avgPrice: number; sellers: number; trendPct: number };

export const RANKINGS: Ranking[] = [
  { keyword: "écouteurs bluetooth sans fil", sales: 18420, avgPrice: 21.9, sellers: 312, trendPct: 9 },
  { keyword: "masseur visage led", sales: 12310, avgPrice: 24.5, sellers: 58, trendPct: 46 },
  { keyword: "support téléphone voiture", sales: 11870, avgPrice: 9.4, sellers: 204, trendPct: -3 },
  { keyword: "combinaison sport femme", sales: 9640, avgPrice: 29.9, sellers: 141, trendPct: 21 },
  { keyword: "lampe frontale rechargeable", sales: 8125, avgPrice: 13.5, sellers: 96, trendPct: 12 },
  { keyword: "brosse chien poils", sales: 7480, avgPrice: 10.2, sellers: 187, trendPct: 5 },
  { keyword: "montre connectée étanche", sales: 6990, avgPrice: 38.7, sellers: 233, trendPct: -8 },
  { keyword: "mini projecteur portable", sales: 5210, avgPrice: 62.0, sellers: 47, trendPct: 33 },
  { keyword: "organisateur tiroir cuisine", sales: 4380, avgPrice: 14.9, sellers: 73, trendPct: 17 },
  { keyword: "nettoyeur ultrasons bijoux", sales: 2950, avgPrice: 33.4, sellers: 19, trendPct: 61 },
];

/** Marketplace → liste utilisée par les formulaires. */
export const MARKETPLACES = [
  { value: "fr", label: "eBay France" },
  { value: "de", label: "eBay Allemagne" },
  { value: "uk", label: "eBay Royaume-Uni" },
];
