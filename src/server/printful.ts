import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { decrypt, encrypt } from "./crypto";
import { PublicError } from "./http";

/**
 * Client Printful (impression à la demande) : jeton privé simple (Bearer), généré par le vendeur dans son propre
 * compte Printful (Réglages › API). Pas d'échange OAuth ni d'expiration à gérer, contrairement à CJ/eBay.
 *
 * Deux versions d'API coexistent, vérifiées en conditions réelles le 24/09/2026 :
 * - v1 (`api.printful.com/...`) : catalogue produits et infos de boutique, accepte le jeton privé simple.
 * - v2 (`api.printful.com/v2/...`) : commandes/expéditions, accepte aussi le jeton privé simple — SAUF le
 *   catalogue v2 (`/v2/catalog-products`), qui renvoie « This endpoint requires Oauth authentication! » même
 *   avec un jeton valide. D'où l'usage du catalogue v1 ci-dessous, pas de la v2.
 */

const V1 = "https://api.printful.com";
const V2 = "https://api.printful.com/v2";

export class PrintfulError extends PublicError {
  constructor(message: string) {
    super(message, 502);
  }
}

async function fetchJson<T = unknown>(url: string, token: string, method: string, body?: unknown, storeId?: string): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(storeId ? { "X-PF-Store-Id": storeId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = (json as { error?: { message?: string }; message?: string }).error?.message ?? (json as { message?: string }).message ?? `HTTP ${res.status}`;
    throw new PrintfulError(`Printful ${res.status} : ${String(msg).slice(0, 250)}`);
  }
  return json as T;
}

const v1Fetch = <T = unknown>(token: string, method: string, path: string, body?: unknown) => fetchJson<T>(`${V1}${path}`, token, method, body);
const v2Fetch = <T = unknown>(token: string, method: string, path: string, body?: unknown, storeId?: string) => fetchJson<T>(`${V2}${path}`, token, method, body, storeId);

export async function savePrintfulAccount(userId: string, apiToken: string): Promise<void> {
  const stores = await v1Fetch<{ result?: { id: number }[] }>(apiToken, "GET", "/store").catch(() => {
    throw new PublicError("Jeton Printful refusé. Vérifiez-le dans Printful › Réglages › API.", 400);
  });
  const storeId = stores.result?.[0]?.id;

  const { error } = await supabaseAdmin().from("printful_accounts").upsert({
    user_id: userId,
    api_token_enc: encrypt(apiToken, `printful-key:${userId}`),
    key_hint: apiToken.slice(-4),
    store_id: storeId ? String(storeId) : null,
  });
  if (error) throw new Error(error.message);
}

type PrintfulAuth = { token: string; storeId?: string };

export async function getPrintfulAuth(userId: string): Promise<PrintfulAuth> {
  const { data } = await supabaseAdmin().from("printful_accounts").select("api_token_enc, store_id").eq("user_id", userId).maybeSingle();
  if (!data) throw new PrintfulError("Printful n'est pas connecté : ajoutez votre jeton API dans Paramètres.");
  return { token: decrypt(data.api_token_enc, `printful-key:${userId}`), storeId: data.store_id ?? undefined };
}

/* ───────── Catalogue (v1 : le catalogue v2 exige OAuth, pas un simple jeton) ───────── */

export type PrintfulCatalogProduct = { id: number; name: string; type: string };

export async function printfulCatalogProducts(token: string, limit = 50): Promise<PrintfulCatalogProduct[]> {
  const r = await v1Fetch<{ result?: { id: number; title: string; type_name: string }[] }>(token, "GET", `/products?limit=${limit}`);
  return (r.result ?? []).map((p) => ({ id: p.id, name: p.title, type: p.type_name }));
}

export type PrintfulVariant = { id: number; name: string; size?: string; color?: string };

export async function printfulCatalogVariants(token: string, productId: number): Promise<PrintfulVariant[]> {
  const r = await v1Fetch<{ result?: { variants?: { id: number; name: string; size?: string; color?: string }[] } }>(token, "GET", `/products/${productId}`);
  return r.result?.variants ?? [];
}

/* ───────── Commandes (v2) ───────── */

export type PrintfulOrderStatus = { id: number; status: string };

export async function printfulOrderStatus(token: string, orderId: string, storeId?: string): Promise<PrintfulOrderStatus> {
  const r = await v2Fetch<{ data: PrintfulOrderStatus }>(token, "GET", `/orders/${orderId}`, undefined, storeId);
  return r.data;
}

export async function printfulShipments(token: string, orderId: string, storeId?: string): Promise<{ trackingNumber?: string; carrier?: string; trackingUrl?: string }[]> {
  const r = await v2Fetch<{ data?: { tracking_number?: string; carrier?: string; tracking_url?: string }[] }>(token, "GET", `/shipments?order_id=${orderId}`, undefined, storeId);
  return (r.data ?? []).map((s) => ({ trackingNumber: s.tracking_number, carrier: s.carrier, trackingUrl: s.tracking_url }));
}

export type PrintfulShipTo = { name: string; address1: string; address2?: string; city: string; stateCode?: string; countryCode: string; zip: string; phone?: string; email?: string };

/**
 * Crée une commande Printful (brouillon) pour une vente eBay : un seul article, avec son visuel généré par IA
 * appliqué sur la variante catalogue choisie à la création de l'annonce. `confirmPrintfulOrder` doit suivre pour
 * déclencher réellement l'impression et l'expédition (sinon la commande reste en brouillon, jamais honorée).
 */
export async function createPrintfulOrder(auth: PrintfulAuth, o: { externalId: string; ship: PrintfulShipTo; catalogVariantId: number; designUrl: string; quantity: number }): Promise<string> {
  const r = await v2Fetch<{ data: { id: number | string } }>(
    auth.token,
    "POST",
    "/orders",
    {
      external_id: o.externalId,
      recipient: { name: o.ship.name, address1: o.ship.address1, address2: o.ship.address2, city: o.ship.city, state_code: o.ship.stateCode, country_code: o.ship.countryCode, zip: o.ship.zip, phone: o.ship.phone, email: o.ship.email },
      order_items: [{ source: "catalog", catalog_variant_id: o.catalogVariantId, quantity: o.quantity, placements: [{ placement: "default", technique: "dtg", layers: [{ type: "file", url: o.designUrl }] }] }],
    },
    auth.storeId,
  );
  return String(r.data.id);
}

export async function confirmPrintfulOrder(auth: PrintfulAuth, orderId: string): Promise<void> {
  await v2Fetch(auth.token, "POST", `/orders/${orderId}/confirm`, undefined, auth.storeId);
}
