import "server-only";
import { buildRequiredAspectsMap } from "@/lib/aspects";
import { computePrice } from "@/lib/margin";
import type { CountryCode, Settings } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { writeListingCopy } from "./ai";
import { cjFreight, cjProductDetail, cjVariantStock, type CjListItem } from "./cj";
import { getEbayToken, getSellerSetup, getSellingLimit, MARKETS, publishListing, requiredAspects, suggestCategory, withdrawOffer, type SellerSetup } from "./ebay";
import { getCjToken } from "./cj";
import { PublicError, safeMsg } from "./http";
import { checkProduct } from "@/lib/product-safety";

/** Quantité mise en vente au maximum, pour ne pas survendre un stock CJ qui bouge. */
export const STOCK_CAP = 10;
/** Gain net minimal par vente : en dessous, un remboursement ou un retard efface le bénéfice de plusieurs ventes. */
export const MIN_NET_PROFIT = 3;
/** Sous ce stock CJ, on ne liste pas. */
const MIN_STOCK = 3;

export type RunContext = {
  userId: string;
  market: CountryCode;
  settings: Settings;
  cjToken: string;
  ebayToken: string;
  setup: SellerSetup;
  /** Places restantes avant le plafond de vente eBay (décompté au fil des publications de ce run, jamais négatif). */
  remainingSlots: { current: number; limit: number };
};

export async function prepareRun(userId: string, market: CountryCode, settings: Settings): Promise<RunContext> {
  const [cjToken, ebayToken] = await Promise.all([getCjToken(userId), getEbayToken(userId, market)]);
  const [setup, limit, activeCount] = await Promise.all([
    getSellerSetup(ebayToken, market),
    getSellingLimit(ebayToken, market).catch(() => ({ quantity: Infinity, amount: Infinity, currency: "EUR" })), // non bloquant : sans lecture possible, on ne bride pas
    supabaseAdmin().from("listings").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("market", market).eq("status", "active").then((r) => r.count ?? 0),
  ]);
  return { userId, market, settings, cjToken, ebayToken, setup, remainingSlots: { current: Math.max(0, limit.quantity - activeCount), limit: limit.quantity } };
}

/** USD (CJ) → devise du marché. */
export function toMarketCurrency(usd: number, market: CountryCode, fx: Settings["fx"]) {
  const eur = usd * fx.usdEur;
  return MARKETS[market].currency === "GBP" ? eur * fx.eurGbp : eur;
}

export type CreatedListing = { title: string; price: number; netMarginPct: number; netProfit: number; ebayListingId: string; image: string };

/**
 * Réserve une place sous le plafond de vente eBay, jamais dépassé même avec plusieurs publications en parallèle
 * (vérification + décompte synchrones, sans await entre les deux). La place n'est gardée qu'en cas de succès complet :
 * toute erreur, y compris une annonce retirée après coup (voir plus bas), la restitue pour le reste du lancement.
 */
export async function createListingFromCj(ctx: RunContext, item: Pick<CjListItem, "pid" | "listedNum">, minMarginPct?: number): Promise<CreatedListing> {
  if (ctx.remainingSlots.current <= 0) throw new PublicError(`Limite de publication eBay atteinte (${ctx.remainingSlots.limit} annonces actives). Supprimez des annonces inactives ou attendez qu'eBay relève votre plafond.`);
  ctx.remainingSlots.current--;
  try {
    return await createListingFromCjInner(ctx, item, minMarginPct);
  } catch (e) {
    ctx.remainingSlots.current++;
    throw e;
  }
}

async function createListingFromCjInner(ctx: RunContext, item: Pick<CjListItem, "pid" | "listedNum">, minMarginPct?: number): Promise<CreatedListing> {
  const { userId, market, settings } = ctx;
  const detail = await cjProductDetail(ctx.cjToken, item.pid);
  const risk = checkProduct(detail.name, detail.description);
  if (!risk.safe) throw new PublicError(`Produit écarté : ${risk.reason}.`);
  if (!detail.variants.length) throw new PublicError("Produit CJ sans variante.");
  if (!detail.images.length) throw new PublicError("Produit CJ sans image publique.");

  // Variante la moins chère qui a du stock (3 essais max pour limiter les appels).
  const variants = [...detail.variants].sort((a, b) => a.price - b.price).slice(0, 3);
  let chosen: { vid: string; price: number; stock: number } | null = null;
  for (const v of variants) {
    const stock = await cjVariantStock(ctx.cjToken, v.vid);
    if (stock >= MIN_STOCK) {
      chosen = { vid: v.vid, price: v.price, stock };
      break;
    }
  }
  if (!chosen) throw new PublicError("Rupture de stock chez CJ.");

  const sku = `CJ-${chosen.vid}-${market}`;
  const db = supabaseAdmin();
  const { data: existing } = await db.from("listings").select("id").eq("user_id", userId).eq("sku", sku).maybeSingle();
  if (existing) throw new PublicError("Déjà listé sur ce marché.");

  const freight = await cjFreight(ctx.cjToken, { to: MARKETS[market].country, items: [{ vid: chosen.vid, quantity: 1 }] });
  if (!freight.length) throw new PublicError(`CJ ne livre pas vers ${MARKETS[market].country}.`);
  const shippingUsd = freight[0].price;

  const quote = computePrice(
    {
      cjCost: toMarketCurrency(chosen.price, market, settings.fx),
      shipping: toMarketCurrency(shippingUsd, market, settings.fx),
      signal: { sold30d: 0, sellers: item.listedNum }, // ventes inconnues : seule la concurrence (nb de vendeurs CJ) ajuste la marge
      minMarginPct,
    },
    settings.pricing,
  );

  if (quote.netProfit < MIN_NET_PROFIT) throw new PublicError(`Gain net trop faible (${quote.netProfit.toFixed(2)} € par vente, minimum ${MIN_NET_PROFIT} €).`);

  const lang = market === "fr" ? "fr" : market === "de" ? "de" : "en";
  // Catégorie déterminée AVANT la rédaction : ses caractéristiques obligatoires (ex. « Type ») sont transmises à l'IA,
  // qui leur donne une vraie valeur au lieu de laisser eBay refuser la publication (400 : « caractéristique manquante »).
  const categoryId = await suggestCategory(market, detail.name);
  const aspectSpecs = (await requiredAspects(market, categoryId).catch(() => [])).filter((a) => a.name !== MARKETS[market].aspectBrand[0]); // « Marque » déjà gérée (jamais inventée) ; le reste, non bloquant
  const copy = await writeListingCopy({ name: detail.name, cjDescription: detail.description, lang, requiredAspects: aspectSpecs });
  if (!copy.ai) throw new PublicError("Clé IA manquante : impossible de rédiger un titre et une description optimisés. Ajoutez ANTHROPIC_API_KEY sur Vercel.");
  const quantity = Math.min(chosen.stock, STOCK_CAP);

  // Deuxième passe de catégorie : le titre final (localisé, écrit par l'IA) est souvent plus précis que le nom
  // anglais brut du fournisseur pour deviner la bonne catégorie eBay (ex. « Automatic Hair Curler USB » classé à
  // tort dans « Chargeurs »). Si elle change, on refait les caractéristiques obligatoires pour la nouvelle catégorie.
  let finalCategoryId = categoryId;
  let finalAspects = copy.aspects;
  const refinedCategoryId = await suggestCategory(market, copy.title).catch(() => categoryId);
  if (refinedCategoryId !== categoryId) {
    const newSpecs = (await requiredAspects(market, refinedCategoryId).catch(() => [])).filter((a) => a.name !== MARKETS[market].aspectBrand[0]);
    finalCategoryId = refinedCategoryId;
    finalAspects = buildRequiredAspectsMap(newSpecs, undefined);
  }

  const { offerId, listingId } = await publishListing(ctx.ebayToken, {
    sku,
    market,
    title: copy.title,
    descriptionHtml: copy.html,
    images: detail.images.slice(0, 12), // limite eBay (Inventory API) : au-delà, la publication échoue entièrement
    price: quote.price,
    quantity,
    categoryId: finalCategoryId,
    setup: ctx.setup,
    extraAspects: finalAspects,
  });

  // L'annonce est déjà VIVANTE sur eBay à ce stade. Si l'écriture en base échoue, elle deviendrait invisible pour
  // DropFlow : jamais reconnue lors d'une vente, donc jamais honorée. Par sécurité, on la retire aussitôt plutôt
  // que de laisser une annonce fantôme, invendable correctement, trainer sur le compte.
  try {
    const { data: product, error: pErr } = await db
      .from("products")
      .upsert(
        { user_id: userId, cj_pid: detail.pid, cj_vid: chosen.vid, title: detail.name, image_url: detail.images[0], category: detail.category, cj_cost: chosen.price, shipping: shippingUsd, cj_stock: chosen.stock, listed_num: item.listedNum },
        { onConflict: "user_id,cj_pid" },
      )
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);

    const { error: lErr } = await db.from("listings").insert({
      user_id: userId,
      product_id: product.id,
      market,
      sku,
      ebay_offer_id: offerId,
      ebay_listing_id: listingId,
      title: copy.title,
      ebay_price: quote.price,
      status: "active",
      last_sync_at: new Date().toISOString(),
    });
    if (lErr) throw new Error(lErr.message);
  } catch (e) {
    await withdrawOffer(ctx.ebayToken, market, offerId).catch(() => {}); // best effort : ne masque jamais l'erreur d'origine
    throw new PublicError(`Enregistrement impossible, annonce retirée d'eBay par sécurité : ${safeMsg(e)}`);
  }

  // Promoted Listings volontairement désactivé (choix explicite : zéro frais de pub, marge maximale par vente).
  // Code de mise en avant conservé dans ./ebay (promoteListing) si jamais réactivé plus tard.

  return { title: copy.title, price: quote.price, netMarginPct: quote.netMarginPct, netProfit: quote.netProfit, ebayListingId: listingId, image: detail.images[0] };
}

/** Exécute `fn` sur chaque élément avec au plus `n` appels simultanés ; ne lève jamais (erreurs collectées). */
export async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<({ ok: true; value: R } | { ok: false; error: string })[]> {
  const out: ({ ok: true; value: R } | { ok: false; error: string })[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          out[i] = { ok: true, value: await fn(items[i]) };
        } catch (e) {
          out[i] = { ok: false, error: safeMsg(e) };
        }
      }
    }),
  );
  return out;
}
