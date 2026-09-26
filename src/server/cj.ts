import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { decrypt, encrypt } from "./crypto";
import { PublicError } from "./http";
import { extractImages, parsePrice } from "@/lib/cj-utils";
import { checkProduct } from "@/lib/product-safety";
import { createThrottle } from "@/lib/throttle";

export { parseCjPid, parsePrice, extractImages } from "@/lib/cj-utils";

/**
 * Client CJ Dropshipping API v2.0.
 * Docs : https://developers.cjdropshipping.com/en/api/api2/
 * CJ facture en USD : la conversion vers EUR/GBP se fait dans le pipeline (settings.fx).
 */

const BASE = "https://developers.cjdropshipping.com/api2.0/v1";

export class CjError extends PublicError {
  /** Code d'erreur CJ brut (ex. 1604000 = solde insuffisant), pour que l'appelant distingue les cas sans parser le message. */
  constructor(message: string, public code?: number) {
    super(message, 502);
  }
}

type CjEnvelope<T> = { code: number; result?: boolean; success?: boolean; message?: string; data: T };

/** CJ limite à 1 requête par seconde (code 1600200) : tous les appels sortants sont espacés, même lancés en parallèle (Promise.all). */
const cjThrottle = createThrottle(1100);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RATE_LIMIT_CODE = 1600200;

async function cjFetch<T>(path: string, opts: { token?: string; method?: "GET" | "POST"; query?: Record<string, string | number | undefined>; body?: unknown; retry?: boolean } = {}): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  // Réessais réseau (délai dépassé, coupure) : jamais pour une écriture (createOrder), sauf demande explicite.
  const networkAttempts = (opts.method ?? "GET") === "GET" || opts.retry ? 2 : 1;

  for (let rateAttempt = 0; rateAttempt < 3; rateAttempt++) {
    await cjThrottle();
    let res: Response | null = null;
    for (let i = 0; i < networkAttempts && !res; i++) {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: { "Content-Type": "application/json", ...(opts.token ? { "CJ-Access-Token": opts.token } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(25_000), // CJ peut être lent (le 1er appel surtout) : jamais de fonction serveur suspendue
      }).catch(() => null);
    }
    if (!res) throw new CjError("CJ ne répond pas (délai dépassé). Réessayez dans un instant.");
    const json = (await res.json().catch(() => null)) as CjEnvelope<T> | null;
    if (!json) throw new CjError(`CJ a répondu HTTP ${res.status} sans JSON`);
    if (json.code === RATE_LIMIT_CODE) {
      // Requête rejetée AVANT traitement par CJ (jamais exécutée) : un nouvel essai est toujours sûr, même pour une commande.
      if (rateAttempt < 2) {
        await sleep(1200);
        continue;
      }
    }
    if (json.code !== 200 || json.result === false || json.success === false) throw new CjError(`CJ : ${json.message ?? "erreur"} (code ${json.code})`, json.code);
    return json.data;
  }
  throw new CjError("CJ limite le débit des requêtes. Réessayez dans un instant.");
}

/* ───────── Authentification ───────── */

type TokenData = { accessToken: string; accessTokenExpiryDate: string; refreshToken: string };

export async function cjAuthenticate(apiKey: string) {
  const d = await cjFetch<TokenData>("/authentication/getAccessToken", { method: "POST", body: { apiKey } });
  return { accessToken: d.accessToken, expiresAt: new Date(d.accessTokenExpiryDate) };
}

export async function saveCjAccount(userId: string, apiKey: string) {
  const auth = await cjAuthenticate(apiKey).catch(() => {
    throw new PublicError("Clé API CJ refusée. Vérifiez-la dans CJ › Compte › API.", 400);
  });
  const { accessToken, expiresAt } = auth;
  const { error } = await supabaseAdmin().from("cj_accounts").upsert({
    user_id: userId,
    api_key_enc: encrypt(apiKey, `cj-key:${userId}`),
    key_hint: apiKey.slice(-4),
    access_token_enc: encrypt(accessToken, `cj-token:${userId}`),
    access_expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** Jeton d'accès valide (rafraîchi à partir de la clé API si besoin). CJ limite getAccessToken : on met en cache en base. */
export async function getCjToken(userId: string): Promise<string> {
  const db = supabaseAdmin();
  const { data } = await db.from("cj_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (!data) throw new CjError("CJ n'est pas connecté : ajoutez votre clé API dans Paramètres.");
  if (data.access_token_enc && data.access_expires_at && new Date(data.access_expires_at).getTime() - Date.now() > 24 * 3600 * 1000) {
    return decrypt(data.access_token_enc, `cj-token:${userId}`);
  }
  const { accessToken, expiresAt } = await cjAuthenticate(decrypt(data.api_key_enc, `cj-key:${userId}`));
  await db.from("cj_accounts").update({ access_token_enc: encrypt(accessToken, `cj-token:${userId}`), access_expires_at: expiresAt.toISOString() }).eq("user_id", userId);
  return accessToken;
}

/* ───────── Produits ───────── */

export type CjListItem = { pid: string; name: string; image: string; price: number; listedNum: number; category?: string };

type RawListItem = { id?: string; pid?: string; nameEn?: string; productNameEn?: string; bigImage?: string; productImage?: string; sellPrice?: string | number; nowPrice?: string | number; listedNum?: number; threeCategoryName?: string; categoryName?: string };

/** Produits « vendables » : ni gadgets à moins de 3 $ (marge absolue trop faible), ni articles vendus par des dizaines de milliers de boutiques. */
export const CANDIDATE = {
  minPrice: 8,
  maxPrice: 60,
  minSellers: 20,
  maxSellers: 5000,
  /** Le tri « nombre de boutiques » de CJ met tout en haut (30 000+ vendeurs) : on démarre plus bas, où l'on trouve 300 à 3 000 vendeurs. */
  firstPage: 10,
  pageSpan: 40,
};

/**
 * Priorité aux produits qui rapportent le plus en valeur absolue : un article à 5 $ ne fait jamais gagner beaucoup, même avec 150 % de marge.
 * Le score monte avec le prix (plafonné : au-delà de 40 $ les acheteurs comparent davantage) et baisse avec la concurrence.
 */
export function profitScore(p: Pick<CjListItem, "price" | "listedNum">): number {
  return Math.min(p.price, 40) / Math.log10(p.listedNum + 10);
}

export function isReasonableCandidate(p: Pick<CjListItem, "price" | "listedNum" | "name">): boolean {
  return p.price >= CANDIDATE.minPrice && p.price <= CANDIDATE.maxPrice && p.listedNum >= CANDIDATE.minSellers && p.listedNum <= CANDIDATE.maxSellers && checkProduct(p.name).safe;
}

/** Nouveautés : produits récents que presque aucune boutique ne vend encore (0 à 500). Non éprouvés : la demande reste à vérifier. */
export function isFreshCandidate(p: Pick<CjListItem, "price" | "listedNum" | "name">): boolean {
  return p.price >= CANDIDATE.minPrice && p.price <= CANDIDATE.maxPrice && p.listedNum <= 500 && checkProduct(p.name).safe;
}

export async function cjListProducts(token: string, q: { keyWord?: string; categoryId?: string; page?: number; size?: number; orderBy?: number; countryCode?: string; startSellPrice?: number; endSellPrice?: number }): Promise<CjListItem[]> {
  const data = await cjFetch<{ content?: { productList?: RawListItem[] }[]; list?: RawListItem[] }>("/product/listV2", {
    token,
    query: { keyWord: q.keyWord, categoryId: q.categoryId, page: q.page ?? 1, size: q.size ?? 20, orderBy: q.orderBy ?? 1, sort: "desc", countryCode: q.countryCode, startSellPrice: q.startSellPrice, endSellPrice: q.endSellPrice },
  });
  const raw = data.content?.flatMap((c) => c.productList ?? []) ?? data.list ?? [];
  return raw
    .map((p) => ({
      pid: String(p.id ?? p.pid ?? ""),
      name: p.nameEn ?? p.productNameEn ?? "",
      image: p.bigImage ?? p.productImage ?? "",
      price: parsePrice(p.nowPrice ?? p.sellPrice),
      listedNum: Number(p.listedNum ?? 0),
      category: p.threeCategoryName ?? p.categoryName,
    }))
    .filter((p) => p.pid && p.name);
}

export type CjVariant = { vid: string; sku?: string; price: number; key?: string };
export type CjDetail = { pid: string; name: string; images: string[]; description: string; category?: string; variants: CjVariant[] };

type RawDetail = {
  pid: string;
  productNameEn?: string;
  productName?: string;
  productImage?: string;
  productImageSet?: string[];
  bigImage?: string;
  description?: string;
  categoryName?: string;
  variants?: { vid: string; variantSku?: string; variantSellPrice?: number | string; variantKey?: string }[];
};

export async function cjProductDetail(token: string, pid: string): Promise<CjDetail> {
  const d = await cjFetch<RawDetail>("/product/query", { token, query: { pid } });
  return {
    pid: d.pid ?? pid,
    name: d.productNameEn ?? d.productName ?? "",
    images: extractImages(d),
    description: d.description ?? "",
    category: d.categoryName,
    variants: (d.variants ?? []).map((v) => ({ vid: v.vid, sku: v.variantSku, price: parsePrice(v.variantSellPrice), key: v.variantKey })),
  };
}

type RawStock = { vid?: string; storageNum?: number; totalInventory?: number; countryCode?: string };

/** Stock total d'une variante, tous entrepôts confondus. */
export async function cjVariantStock(token: string, vid: string): Promise<number> {
  const rows = await cjFetch<RawStock[]>("/product/stock/queryByVid", { token, query: { vid } });
  return (rows ?? []).reduce((sum, r) => sum + Number(r.storageNum ?? r.totalInventory ?? 0), 0);
}

/** Solde du portefeuille CJ (utilisé pour payer les commandes en mode API). Endpoint vérifié contre le vrai compte. */
export type CjBalance = { amount: number; noWithdrawalAmount: number; freezeAmount: number };

export async function cjBalance(token: string): Promise<CjBalance> {
  const d = await cjFetch<{ amount?: number; noWithdrawalAmount?: number; freezeAmount?: number }>("/shopping/pay/getBalance", { token });
  return { amount: Number(d.amount ?? 0), noWithdrawalAmount: Number(d.noWithdrawalAmount ?? 0), freezeAmount: Number(d.freezeAmount ?? 0) };
}

/* ───────── Livraison ───────── */

export type CjFreight = { name: string; price: number; aging: string };

/**
 * Tarif de livraison. `items` accepte PLUSIEURS produits (colis combiné) : indispensable pour une commande eBay
 * qui contient plusieurs articles DropFlow différents, sinon le service retenu peut ne pas exister pour tous les articles
 * et CJ refuse la commande. Un seul objet reste le cas courant.
 */
export async function cjFreight(token: string, q: { from?: string; to: string; items: { vid: string; quantity: number }[] }): Promise<CjFreight[]> {
  const rows = await cjFetch<{ logisticName: string; logisticPrice: number | string; logisticAging?: string }[]>("/logistic/freightCalculate", {
    token,
    method: "POST",
    retry: true, // simple calcul de tarif : sans effet de bord
    body: { startCountryCode: q.from ?? "CN", endCountryCode: q.to, products: q.items.map((i) => ({ quantity: i.quantity, vid: i.vid })) },
  });
  return (rows ?? []).map((r) => ({ name: r.logisticName, price: parsePrice(r.logisticPrice), aging: r.logisticAging ?? "" })).sort((a, b) => a.price - b.price);
}

/* ───────── Commandes ───────── */

export type CjOrderInput = {
  orderNumber: string;
  products: { vid: string; quantity: number }[];
  logisticName: string;
  fromCountryCode: string;
  ship: { name: string; countryCode: string; country: string; province: string; city: string; address: string; address2?: string; zip?: string; phone?: string; email?: string };
  /** 2 = payer avec le solde CJ, 3 = créer seulement (paiement manuel dans CJ). */
  payType: 2 | 3;
};

export async function cjCreateOrder(token: string, o: CjOrderInput) {
  return cjFetch<{ orderId: string; orderStatus?: string }>("/shopping/order/createOrderV2", {
    token,
    method: "POST",
    body: {
      orderNumber: o.orderNumber,
      shippingCountryCode: o.ship.countryCode,
      shippingCountry: o.ship.country,
      shippingProvince: o.ship.province || o.ship.city,
      shippingCity: o.ship.city,
      shippingAddress: o.ship.address,
      shippingAddress2: o.ship.address2,
      shippingCustomerName: o.ship.name,
      shippingZip: o.ship.zip,
      shippingPhone: o.ship.phone,
      email: o.ship.email,
      logisticName: o.logisticName,
      fromCountryCode: o.fromCountryCode,
      payType: o.payType,
      products: o.products,
    },
  });
}

export type CjOrderDetail = { orderId: string; status: string; trackNumber?: string; trackingProvider?: string };

export async function cjOrderDetail(token: string, orderId: string): Promise<CjOrderDetail> {
  const d = await cjFetch<{ orderId: string; orderStatus: string; trackNumber?: string; trackingProvider?: string }>("/shopping/order/getOrderDetail", { token, query: { orderId } });
  return { orderId: d.orderId, status: d.orderStatus, trackNumber: d.trackNumber || undefined, trackingProvider: d.trackingProvider || undefined };
}
