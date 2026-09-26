import "server-only";
import { checkProduct } from "@/lib/product-safety";
import type { CountryCode, Settings } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { writeListingCopy } from "./ai";
import { ensurePrintfulLocation, publishListing, suggestCategory, withdrawOffer, type SellerSetup } from "./ebay";
import { generateProductImage } from "./image-gen";
import { PublicError, safeMsg } from "./http";

/** Quantité affichée fixe : contrairement à CJ, l'impression à la demande n'a pas de stock réel à épuiser. */
const PRINTFUL_QUANTITY = 20;

export type PrintfulListingInput = {
  userId: string;
  market: CountryCode;
  settings: Settings;
  ebayToken: string;
  setup: SellerSetup;
  /** Nom du produit catalogue Printful (ex. « Unisex Staple T-Shirt »), pour le titre et la génération du visuel. */
  catalogProductName: string;
  catalogVariantId: number;
  /** Thème/description du visuel voulu (ex. « renard minimaliste style aquarelle »). */
  designPrompt: string;
  /** Prix de vente final choisi par l'utilisateur (pas de calcul de marge automatique : pas de coût fournisseur vérifié). */
  retailPrice: number;
};

export type PrintfulCreatedListing = { title: string; price: number; ebayListingId: string; image: string };

/**
 * Publie une annonce eBay à partir d'un visuel généré par IA, appliqué sur une variante du catalogue Printful.
 * Coût réel à cet appel (génération d'image) : n'appeler que pour une publication réellement voulue.
 */
export async function createListingFromPrintful(input: PrintfulListingInput): Promise<PrintfulCreatedListing> {
  const risk = checkProduct(`${input.catalogProductName} ${input.designPrompt}`);
  if (!risk.safe) throw new PublicError(`Produit écarté : ${risk.reason}.`);
  if (input.retailPrice <= 0) throw new PublicError("Prix de vente invalide.");

  const db = supabaseAdmin();
  const designUrl = await generateProductImage(`${input.designPrompt}, print-ready graphic design for a ${input.catalogProductName}, centered, isolated on plain white background, no text, no watermark, no mockup`);

  const lang = input.market === "fr" ? "fr" : input.market === "de" ? "de" : "en";
  const copy = await writeListingCopy({ name: `${input.catalogProductName} — ${input.designPrompt}`, cjDescription: "", lang, requiredAspects: [] });
  if (!copy.ai) throw new PublicError("Clé IA manquante : impossible de rédiger un titre et une description optimisés.");

  const categoryId = await suggestCategory(input.market, input.catalogProductName);
  const locationKey = await ensurePrintfulLocation(input.ebayToken, input.market);
  const sku = `PF-${input.catalogVariantId}-${input.market}-${Date.now()}`;

  const { offerId, listingId } = await publishListing(input.ebayToken, {
    sku,
    market: input.market,
    title: copy.title,
    descriptionHtml: copy.html,
    images: [designUrl],
    price: input.retailPrice,
    quantity: PRINTFUL_QUANTITY,
    categoryId,
    setup: { ...input.setup, merchantLocationKey: locationKey },
    extraAspects: copy.aspects,
  });

  try {
    // Pas d'upsert : chaque visuel généré est un produit distinct, il n'existe aucune identité naturelle à faire correspondre (contrairement au cj_pid de CJ).
    const { data: product, error: pErr } = await db
      .from("products")
      .insert({ user_id: input.userId, supplier: "printful", title: copy.title, image_url: designUrl, printful_variant_id: input.catalogVariantId, printful_retail_price: input.retailPrice, design_url: designUrl })
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);

    const { error: lErr } = await db.from("listings").insert({ user_id: input.userId, product_id: product.id, market: input.market, sku, ebay_offer_id: offerId, ebay_listing_id: listingId, title: copy.title, ebay_price: input.retailPrice, status: "active", last_sync_at: new Date().toISOString() });
    if (lErr) throw new Error(lErr.message);
  } catch (e) {
    await withdrawOffer(input.ebayToken, input.market, offerId).catch(() => {});
    throw new PublicError(`Enregistrement impossible, annonce retirée d'eBay par sécurité : ${safeMsg(e)}`);
  }

  return { title: copy.title, price: input.retailPrice, ebayListingId: listingId, image: designUrl };
}
