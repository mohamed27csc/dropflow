import { z } from "zod";
import { getPrintfulAuth, printfulCatalogProducts, printfulCatalogVariants } from "@/server/printful";
import { secured } from "@/server/route";

const query = z.object({ productId: z.coerce.number().int().positive().optional() }).strict();

/** Sans productId : liste des produits catalogue. Avec productId : ses variantes (taille/couleur). */
export const GET = secured({ name: "printful-catalog", schema: query, source: "query", user: [30, 60] }, async ({ user, input }) => {
  const auth = await getPrintfulAuth(user.id);
  if (input.productId) return { variants: await printfulCatalogVariants(auth.token, input.productId) };
  return { products: await printfulCatalogProducts(auth.token, 100) };
});
