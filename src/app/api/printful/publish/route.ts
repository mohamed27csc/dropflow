import { printfulPublishInput } from "@/lib/schemas";
import { audit } from "@/server/audit";
import { getEbayToken, getSellerSetup, getSellingLimit } from "@/server/ebay";
import { PublicError } from "@/server/http";
import { createListingFromPrintful } from "@/server/printful-pipeline";
import { secured } from "@/server/route";
import { loadSettings } from "@/server/settings";

export const maxDuration = 60;

export const POST = secured({ name: "printful-publish", schema: printfulPublishInput, user: [10, 600] }, async ({ user, input, req }) => {
  const settings = await loadSettings(user.id, user.email ?? "");
  const ebayToken = await getEbayToken(user.id, input.market);
  const [setup, limit] = await Promise.all([getSellerSetup(ebayToken, input.market), getSellingLimit(ebayToken, input.market).catch(() => ({ quantity: Infinity, amount: Infinity, currency: "EUR" }))]);
  if (limit.quantity <= 0) throw new PublicError(`Limite de publication eBay atteinte (${limit.quantity} annonces actives).`, 429);

  const result = await createListingFromPrintful({ userId: user.id, market: input.market, settings, ebayToken, setup, catalogProductName: input.catalogProductName, catalogVariantId: input.catalogVariantId, designPrompt: input.designPrompt, retailPrice: input.retailPrice });
  await audit({ userId: user.id, action: "listing.created", meta: { market: input.market, via: "printful" }, req });
  return result;
});
