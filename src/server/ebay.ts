import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toEbayCarrierCode } from "@/lib/carrier-code";
import { DEFAULT_AD_RATE_PCT } from "@/lib/margin";
import type { CountryCode } from "@/lib/settings";
import { decrypt, encrypt } from "./crypto";
import { PublicError } from "./http";

/**
 * Client eBay (production) : OAuth « authorization code », Inventory, Account, Fulfillment, Taxonomy.
 * Jetons utilisateur chiffrés en base, rafraîchis automatiquement.
 */

export const MARKETS: Record<
  CountryCode,
  { id: string; currency: "EUR" | "GBP"; tree: string; locale: string; country: string; aspectBrand: [string, string]; shipping: { code: string; carrier: string }; policyName: string }
> = {
  // shipping.code vérifié en direct (POST /fulfillment_policy) : chaque site eBay a sa propre liste fermée de codes, non devinable.
  fr: { id: "EBAY_FR", currency: "EUR", tree: "71", locale: "fr-FR", country: "FR", aspectBrand: ["Marque", "Sans marque"], shipping: { code: "FR_Autre", carrier: "Other" }, policyName: "DropFlow CJ" },
  de: { id: "EBAY_DE", currency: "EUR", tree: "77", locale: "de-DE", country: "DE", aspectBrand: ["Marke", "Markenlos"], shipping: { code: "DE_DHLPaket", carrier: "DHL" }, policyName: "Livraison standard" },
  uk: { id: "EBAY_GB", currency: "GBP", tree: "3", locale: "en-GB", country: "GB", aspectBrand: ["Brand", "Unbranded"], shipping: { code: "UK_RoyalMail24", carrier: "Royal Mail" }, policyName: "Standard delivery" },
};

const SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.marketing",
];

const API = "https://api.ebay.com";

export class EbayError extends PublicError {
  constructor(message: string) {
    super(message, 502);
  }
}

function creds() {
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  const ruName = process.env.EBAY_RUNAME;
  if (!id || !secret || !ruName) throw new PublicError("Intégration eBay non configurée côté serveur.", 503);
  return { id, secret, ruName, basic: Buffer.from(`${id}:${secret}`).toString("base64") };
}

/* ───────── OAuth ───────── */

export function authorizeUrl(state: string) {
  const c = creds();
  const u = new URL("https://auth.ebay.com/oauth2/authorize");
  u.searchParams.set("client_id", c.id);
  u.searchParams.set("redirect_uri", c.ruName); // eBay attend le RuName, pas l'URL
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; refresh_token_expires_in?: number };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const c = creds();
  const res = await fetch(`${API}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${c.basic}` },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new EbayError(`eBay OAuth : ${json.error_description ?? json.error ?? res.status}`);
  return json as TokenResponse;
}

export async function saveEbayAccount(userId: string, market: CountryCode, code: string) {
  const c = creds();
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: c.ruName });
  if (!t.refresh_token) throw new EbayError("eBay n'a pas renvoyé de refresh token.");
  const now = Date.now();
  const username = await fetchUsername(t.access_token).catch(() => null);
  const { error } = await supabaseAdmin().from("ebay_accounts").upsert(
    {
      user_id: userId,
      market,
      ebay_username: username,
      access_token_enc: encrypt(t.access_token, `ebay-access:${userId}:${market}`),
      refresh_token_enc: encrypt(t.refresh_token, `ebay-refresh:${userId}:${market}`),
      access_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
      refresh_expires_at: t.refresh_token_expires_in ? new Date(now + t.refresh_token_expires_in * 1000).toISOString() : null,
    },
    { onConflict: "user_id,market" },
  );
  if (error) throw new Error(error.message);
}

async function fetchUsername(accessToken: string): Promise<string | null> {
  const res = await fetch("https://apiz.ebay.com/commerce/identity/v1/user/", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) return null;
  return ((await res.json()) as { username?: string }).username ?? null;
}

export async function getEbayToken(userId: string, market: CountryCode): Promise<string> {
  const db = supabaseAdmin();
  const { data } = await db.from("ebay_accounts").select("*").eq("user_id", userId).eq("market", market).maybeSingle();
  if (!data) throw new EbayError(`eBay ${market.toUpperCase()} n'est pas connecté : connectez-le dans Paramètres.`);
  if (new Date(data.access_expires_at).getTime() - Date.now() > 120_000) return decrypt(data.access_token_enc, `ebay-access:${userId}:${market}`);
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(data.refresh_token_enc, `ebay-refresh:${userId}:${market}`), scope: SCOPES.join(" ") });
  await db
    .from("ebay_accounts")
    .update({ access_token_enc: encrypt(t.access_token, `ebay-access:${userId}:${market}`), access_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() })
    .eq("id", data.id);
  return t.access_token;
}

let appToken: { value: string; exp: number } | null = null;
/** Jeton « application » (sans utilisateur) pour Taxonomy et Browse. */
export async function getAppToken(): Promise<string> {
  if (appToken && appToken.exp > Date.now() + 60_000) return appToken.value;
  const t = await tokenRequest({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" });
  appToken = { value: t.access_token, exp: Date.now() + t.expires_in * 1000 };
  return appToken.value;
}

/* ───────── Appels REST ───────── */

export async function ebayApi<T = unknown>(token: string, market: CountryCode, method: string, path: string, body?: unknown): Promise<T> {
  const m = MARKETS[market];
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Language": m.locale,
      "Accept-Language": m.locale,
      "X-EBAY-C-MARKETPLACE-ID": m.id,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = (json.errors as { message?: string; longMessage?: string }[] | undefined)?.[0];
    throw new EbayError(`eBay ${res.status} : ${(e?.longMessage ?? e?.message ?? "requête refusée").slice(0, 250)}`);
  }
  return json as T;
}

/* ───────── Promoted Listings (Marketing API + Recommendation API) ───────── */

// Bornes volontaires : sous 2 %, eBay ignore le taux (minimum plateforme) ; au-delà de 15 %, la pub mange trop de marge
// même si eBay suggère plus haut pour certaines catégories très concurrentielles.
const AD_RATE_MIN = 2;
const AD_RATE_MAX = 15;

/** Récupère la campagne « DropFlow Auto » du marché, ou la crée si elle n'existe pas encore (une seule, réutilisée). */
async function getOrCreateAdCampaign(token: string, market: CountryCode): Promise<string> {
  // La liste renvoyée par eBay n'est PAS filtrée par marketplace malgré l'en-tête envoyé : il faut comparer marketplaceId
  // soi-même, sinon les 3 marchés se retrouvent à tort à partager la même campagne (constaté en conditions réelles).
  const list = await ebayApi<{ campaigns?: { campaignId: string; campaignName: string; campaignStatus: string; marketplaceId: string }[] }>(token, market, "GET", "/sell/marketing/v1/ad_campaign?limit=100");
  const existing = list.campaigns?.find((c) => c.campaignName === "DropFlow Auto" && c.campaignStatus !== "ENDED" && c.marketplaceId === MARKETS[market].id);
  if (existing) return existing.campaignId;

  const res = await fetch(`${API}/sell/marketing/v1/ad_campaign`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Language": MARKETS[market].locale },
    body: JSON.stringify({ campaignName: "DropFlow Auto", startDate: new Date().toISOString(), fundingStrategy: { fundingModel: "COST_PER_SALE", bidPercentage: String(DEFAULT_AD_RATE_PCT) }, marketplaceId: MARKETS[market].id }),
  });
  const location = res.headers.get("Location");
  if (!res.ok || !location) throw new EbayError(`Création de la campagne publicitaire impossible (${res.status}).`);
  return location.split("/").pop()!;
}

/** Taux conseillé par eBay pour CETTE annonce précise (Recommendation API) : varie selon la catégorie et la concurrence réelle. */
async function suggestedBidPercentage(token: string, market: CountryCode, ebayListingId: string): Promise<number | null> {
  try {
    const r = await ebayApi<{ listingRecommendations?: { marketing?: { ad?: { bidPercentages?: { basis: string; value: string }[] } } }[] }>(
      token,
      market,
      "POST",
      "/sell/recommendation/v1/find?filter=recommendationTypes:%7BAD%7D",
      { listingIds: [ebayListingId] },
    );
    const bids = r.listingRecommendations?.[0]?.marketing?.ad?.bidPercentages;
    const value = bids?.find((b) => b.basis === "ITEM")?.value ?? bids?.find((b) => b.basis === "TRENDING")?.value;
    return value ? Number(value) : null;
  } catch {
    return null; // best-effort : un repli sur le taux par défaut ne doit jamais bloquer la mise en avant
  }
}

/**
 * Met en avant une annonce (Promoted Listings, coût uniquement à la vente) au taux conseillé par eBay pour cette
 * catégorie précise plutôt qu'un taux fixe. Best-effort à l'appelant : ne doit jamais faire échouer la création
 * de l'annonce elle-même. Renvoie le taux réellement appliqué (à enregistrer pour un calcul de marge exact).
 */
export async function promoteListing(token: string, market: CountryCode, ebayListingId: string): Promise<number> {
  const campaignId = await getOrCreateAdCampaign(token, market);
  const suggested = await suggestedBidPercentage(token, market, ebayListingId);
  const rate = Math.min(AD_RATE_MAX, Math.max(AD_RATE_MIN, suggested ?? DEFAULT_AD_RATE_PCT));
  await ebayApi(token, market, "POST", `/sell/marketing/v1/ad_campaign/${campaignId}/bulk_create_ads_by_listing_id`, { requests: [{ listingId: ebayListingId, bidPercentage: rate.toFixed(1) }] });
  return rate;
}

/* ───────── Prérequis de vente (politiques, lieu, catégorie) ───────── */

export type SellerSetup = { fulfillmentPolicyId: string; paymentPolicyId: string; returnPolicyId: string; merchantLocationKey: string };

/** Plafond global de vente eBay (nombre d'articles actifs autorisés). Vérifié en direct sur un vrai compte. */
export async function getSellingLimit(token: string, market: CountryCode): Promise<{ quantity: number; amount: number; currency: string }> {
  const r = await ebayApi<{ sellingLimit?: { quantity?: number; amount?: { value?: string; currency?: string } } }>(token, market, "GET", "/sell/account/v1/privilege");
  return { quantity: r.sellingLimit?.quantity ?? Infinity, amount: Number(r.sellingLimit?.amount?.value ?? Infinity), currency: r.sellingLimit?.amount?.currency ?? MARKETS[market].currency };
}

/** Lieu d'expédition DropFlow : l'objet part de l'entrepôt CJ (Chine), jamais de chez le vendeur. Pas de retrait en personne. */
const LOCATION_KEY = "dropflowcj";

const CATEGORY_TYPES = [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }];

/** Crée une politique d'expédition sans retrait en personne. Délai de préparation généreux (10 j) : l'objet part réellement de l'entrepôt CJ en Chine, jamais du vendeur. */
async function createFulfillmentPolicy(token: string, market: CountryCode): Promise<string> {
  const m = MARKETS[market];
  const r = await ebayApi<{ fulfillmentPolicyId: string }>(token, market, "POST", "/sell/account/v1/fulfillment_policy", {
    name: m.policyName,
    marketplaceId: m.id,
    categoryTypes: CATEGORY_TYPES,
    handlingTime: { value: 10, unit: "DAY" },
    globalShipping: false,
    pickupDropOff: false,
    shippingOptions: [
      { optionType: "DOMESTIC", costType: "FLAT_RATE", shippingServices: [{ sortOrder: 1, shippingCarrierCode: m.shipping.carrier, shippingServiceCode: m.shipping.code, shippingCost: { value: "0.00", currency: m.currency }, freeShipping: true }] },
    ],
  });
  return r.fulfillmentPolicyId;
}

async function createPaymentPolicy(token: string, market: CountryCode): Promise<string> {
  const m = MARKETS[market];
  const r = await ebayApi<{ paymentPolicyId: string }>(token, market, "POST", "/sell/account/v1/payment_policy", { name: m.policyName, marketplaceId: m.id, categoryTypes: CATEGORY_TYPES, immediatePay: true });
  return r.paymentPolicyId;
}

async function createReturnPolicy(token: string, market: CountryCode): Promise<string> {
  const m = MARKETS[market];
  const r = await ebayApi<{ returnPolicyId: string }>(token, market, "POST", "/sell/account/v1/return_policy", {
    name: m.policyName,
    marketplaceId: m.id,
    categoryTypes: CATEGORY_TYPES,
    returnsAccepted: true,
    returnPeriod: { value: 30, unit: "DAY" },
    returnShippingCostPayer: "BUYER",
  });
  return r.returnPolicyId;
}

/**
 * Prérequis de vente : politiques (expédition/paiement/retour) et lieu d'expédition. Créés automatiquement s'ils
 * n'existent pas encore — l'utilisateur n'a plus besoin de les configurer à la main dans eBay avant sa première annonce.
 */
export async function getSellerSetup(token: string, market: CountryCode): Promise<SellerSetup> {
  const id = MARKETS[market].id;
  const [f, p, r, l] = await Promise.all([
    ebayApi<{ fulfillmentPolicies?: { fulfillmentPolicyId: string }[] }>(token, market, "GET", `/sell/account/v1/fulfillment_policy?marketplace_id=${id}`),
    ebayApi<{ paymentPolicies?: { paymentPolicyId: string }[] }>(token, market, "GET", `/sell/account/v1/payment_policy?marketplace_id=${id}`),
    ebayApi<{ returnPolicies?: { returnPolicyId: string }[] }>(token, market, "GET", `/sell/account/v1/return_policy?marketplace_id=${id}`),
    ebayApi<{ locations?: { merchantLocationKey: string }[] }>(token, market, "GET", "/sell/inventory/v1/location"),
  ]);

  let fulfillmentPolicyId = f.fulfillmentPolicies?.[0]?.fulfillmentPolicyId;
  let paymentPolicyId = p.paymentPolicies?.[0]?.paymentPolicyId;
  let returnPolicyId = r.returnPolicies?.[0]?.returnPolicyId;
  try {
    if (!fulfillmentPolicyId) fulfillmentPolicyId = await createFulfillmentPolicy(token, market);
    if (!paymentPolicyId) paymentPolicyId = await createPaymentPolicy(token, market);
    if (!returnPolicyId) returnPolicyId = await createReturnPolicy(token, market);
  } catch (e) {
    throw new EbayError(`Compte eBay ${market.toUpperCase()} incomplet : impossible de créer automatiquement les politiques de vente (${e instanceof Error ? e.message : "erreur"}). Créez-les manuellement dans eBay (Business policies), puis relancez.`);
  }

  // Le lieu d'expédition est créé automatiquement (entrepôt CJ, Chine) s'il n'existe pas déjà.
  if (!l.locations?.some((x) => x.merchantLocationKey === LOCATION_KEY)) {
    await ebayApi(token, market, "POST", `/sell/inventory/v1/location/${LOCATION_KEY}`, {
      location: { address: { country: "CN", stateOrProvince: "Guangdong", city: "Shenzhen", postalCode: "518000" } },
      name: "CJ Dropshipping (entrepôt)",
      merchantLocationStatus: "ENABLED",
      locationTypes: ["WAREHOUSE"],
    });
  }
  return { fulfillmentPolicyId, paymentPolicyId, returnPolicyId, merchantLocationKey: LOCATION_KEY };
}

const PRINTFUL_LOCATION_KEY = "dropflowprintful";

/**
 * Lieu d'expédition dédié aux annonces Printful : contrairement à CJ, l'objet part d'un atelier d'impression
 * réel (États-Unis), jamais de Chine — indiquer le mauvais pays tromperait l'acheteur sur le délai réel.
 * Réutilise les politiques (paiement/retour/expédition) déjà en place pour ce marché, créées par getSellerSetup.
 */
export async function ensurePrintfulLocation(token: string, market: CountryCode): Promise<string> {
  const l = await ebayApi<{ locations?: { merchantLocationKey: string }[] }>(token, market, "GET", "/sell/inventory/v1/location");
  if (!l.locations?.some((x) => x.merchantLocationKey === PRINTFUL_LOCATION_KEY)) {
    await ebayApi(token, market, "POST", `/sell/inventory/v1/location/${PRINTFUL_LOCATION_KEY}`, {
      location: { address: { country: "US", stateOrProvince: "NC", city: "Charlotte", postalCode: "28206" } },
      name: "Printful (atelier d'impression)",
      merchantLocationStatus: "ENABLED",
      locationTypes: ["WAREHOUSE"],
    });
  }
  return PRINTFUL_LOCATION_KEY;
}

export type RequiredAspectSpec = { name: string; mode: string; allowedValues: string[] };

/** Caractéristiques que CETTE catégorie eBay exige (ex. « Type » pour beaucoup de catégories maison/beauté). */
export async function requiredAspects(market: CountryCode, categoryId: string): Promise<RequiredAspectSpec[]> {
  const app = await getAppToken();
  const r = await ebayApi<{ aspects?: { localizedAspectName: string; aspectConstraint?: { aspectRequired?: boolean; aspectMode?: string }; aspectValues?: { localizedValue: string }[] }[] }>(
    app,
    market,
    "GET",
    `/commerce/taxonomy/v1/category_tree/${MARKETS[market].tree}/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`,
  );
  return (r.aspects ?? [])
    .filter((a) => a.aspectConstraint?.aspectRequired)
    .map((a) => ({ name: a.localizedAspectName, mode: a.aspectConstraint?.aspectMode ?? "FREE_TEXT", allowedValues: (a.aspectValues ?? []).map((v) => v.localizedValue).slice(0, 40) }));
}

export async function suggestCategory(market: CountryCode, query: string): Promise<string> {
  const app = await getAppToken();
  const q = encodeURIComponent(query.slice(0, 350));
  const r = await ebayApi<{ categorySuggestions?: { category: { categoryId: string } }[] }>(app, market, "GET", `/commerce/taxonomy/v1/category_tree/${MARKETS[market].tree}/get_category_suggestions?q=${q}`);
  const id = r.categorySuggestions?.[0]?.category.categoryId;
  if (!id) throw new EbayError("Aucune catégorie eBay trouvée pour ce produit.");
  return id;
}

/* ───────── Annonces (Inventory API) ───────── */

export type PublishInput = {
  sku: string;
  market: CountryCode;
  title: string;
  descriptionHtml: string;
  images: string[];
  price: number;
  quantity: number;
  categoryId: string;
  setup: SellerSetup;
  /** Caractéristiques obligatoires déjà résolues (ex. { Type: ["Masseur"] }), fusionnées avec la marque. */
  extraAspects?: Record<string, string[]>;
};

export async function publishListing(token: string, p: PublishInput): Promise<{ offerId: string; listingId: string }> {
  const m = MARKETS[p.market];
  await ebayApi(token, p.market, "PUT", `/sell/inventory/v1/inventory_item/${encodeURIComponent(p.sku)}`, {
    product: { title: p.title, description: p.descriptionHtml, imageUrls: p.images, aspects: { ...p.extraAspects, [m.aspectBrand[0]]: [m.aspectBrand[1]] } }, // la marque garantie écrase toujours une éventuelle suggestion de l'IA
    condition: "NEW",
    availability: { shipToLocationAvailability: { quantity: p.quantity } },
  });
  const offer = await ebayApi<{ offerId: string }>(token, p.market, "POST", "/sell/inventory/v1/offer", {
    sku: p.sku,
    marketplaceId: m.id,
    format: "FIXED_PRICE",
    availableQuantity: p.quantity,
    categoryId: p.categoryId,
    listingDescription: p.descriptionHtml,
    listingPolicies: { fulfillmentPolicyId: p.setup.fulfillmentPolicyId, paymentPolicyId: p.setup.paymentPolicyId, returnPolicyId: p.setup.returnPolicyId },
    merchantLocationKey: p.setup.merchantLocationKey,
    pricingSummary: { price: { value: p.price.toFixed(2), currency: m.currency } },
  });
  const pub = await ebayApi<{ listingId: string }>(token, p.market, "POST", `/sell/inventory/v1/offer/${offer.offerId}/publish`);
  return { offerId: offer.offerId, listingId: pub.listingId };
}

/**
 * Retire une annonce publiée (fin de vente). Utilisé en filet de sécurité : si l'écriture en base échoue APRÈS
 * une publication réussie, l'annonce resterait vivante sur eBay sans que DropFlow la connaisse — invendable
 * correctement puisqu'aucune commande ne pourrait jamais lui être associée. Mieux vaut la retirer tout de suite.
 */
export async function withdrawOffer(token: string, market: CountryCode, offerId: string): Promise<void> {
  await ebayApi(token, market, "POST", `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/withdraw`);
}

export type PriceQtyUpdate = { sku: string; offerId: string; price: number; quantity: number };

/** Met à jour prix et stock de 25 annonces max par appel. */
export async function bulkUpdatePriceQuantity(token: string, market: CountryCode, updates: PriceQtyUpdate[]) {
  const currency = MARKETS[market].currency;
  for (let i = 0; i < updates.length; i += 25) {
    await ebayApi(token, market, "POST", "/sell/inventory/v1/bulk_update_price_quantity", {
      requests: updates.slice(i, i + 25).map((u) => ({
        sku: u.sku,
        shipToLocationAvailability: { quantity: u.quantity },
        offers: [{ offerId: u.offerId, availableQuantity: u.quantity, price: { value: u.price.toFixed(2), currency } }],
      })),
    });
  }
}

/* ───────── Commandes (Fulfillment API) ───────── */

export type EbayOrder = {
  orderId: string;
  creationDate: string;
  total: { value: string; currency: string };
  lineItems: { lineItemId: string; sku?: string; quantity: number }[];
  shipTo?: { name: string; countryCode: string; province: string; city: string; address: string; address2?: string; zip?: string; phone?: string; email?: string };
  buyer?: string;
};

type RawOrder = {
  orderId: string;
  creationDate: string;
  pricingSummary?: { total?: { value: string; currency: string } };
  lineItems: { lineItemId: string; sku?: string; quantity: number }[];
  buyer?: { username?: string };
  fulfillmentStartInstructions?: {
    shippingStep?: {
      shipTo?: {
        fullName?: string;
        email?: string;
        primaryPhone?: { phoneNumber?: string };
        contactAddress?: { addressLine1?: string; addressLine2?: string; city?: string; stateOrProvince?: string; postalCode?: string; countryCode?: string };
      };
    };
  }[];
};

export async function listOpenOrders(token: string, market: CountryCode): Promise<EbayOrder[]> {
  const r = await ebayApi<{ orders?: RawOrder[] }>(token, market, "GET", "/sell/fulfillment/v1/order?filter=orderfulfillmentstatus:%7BNOT_STARTED%7CIN_PROGRESS%7D&limit=50");
  return (r.orders ?? []).map((o) => {
    const s = o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo;
    const a = s?.contactAddress;
    return {
      orderId: o.orderId,
      creationDate: o.creationDate,
      total: o.pricingSummary?.total ?? { value: "0", currency: MARKETS[market].currency },
      lineItems: o.lineItems,
      shipTo: s && a ? { name: s.fullName ?? "", countryCode: a.countryCode ?? "", province: a.stateOrProvince ?? "", city: a.city ?? "", address: a.addressLine1 ?? "", address2: a.addressLine2, zip: a.postalCode, phone: s.primaryPhone?.phoneNumber, email: s.email } : undefined,
      buyer: o.buyer?.username,
    };
  });
}

export async function sendTracking(token: string, market: CountryCode, o: { orderId: string; lineItems: { lineItemId: string; quantity: number }[]; trackingNumber: string; carrier: string }) {
  await ebayApi(token, market, "POST", `/sell/fulfillment/v1/order/${encodeURIComponent(o.orderId)}/shipping_fulfillment`, {
    lineItems: o.lineItems,
    shippedDate: new Date().toISOString(),
    shippingCarrierCode: toEbayCarrierCode(o.carrier), // le nom CJ brut (YunExpress, CJPacket…) n'est pas un code accepté par eBay
    trackingNumber: o.trackingNumber,
  });
}

/* ───────── Recherche publique (Browse API) pour Analytics ───────── */

export async function browseSearch(market: CountryCode, q: string, limit = 50) {
  const app = await getAppToken();
  return ebayApi<{ total?: number; itemSummaries?: { title: string; price?: { value: string }; seller?: { username?: string } }[] }>(
    app,
    market,
    "GET",
    `/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
}
