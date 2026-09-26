import { generateInput } from "@/lib/schemas";
import { aiDescription, aiTitles, aiVintedListing } from "@/server/ai";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";
import { consumeQuota, loadSettings } from "@/server/settings";

// Débit resserré : chaque appel facture de vrais tokens IA (Claude), contrairement aux autres routes.
// Complète le quota quotidien (voir plans.ts) en cassant aussi une rafale rapide dans la même journée.
export const POST = secured({ name: "generate", schema: generateInput, user: [10, 600] }, async ({ user, input }) => {
  const { plan } = await loadSettings(user.id, user.email ?? "");
  const q = await consumeQuota(user.id, plan, "generations");
  if (!q.ok) throw new PublicError(`Quota atteint (${q.limit}/jour) — Premium`, 429);
  if (input.kind === "title") return { ...(await aiTitles({ product: input.product, keywords: input.keywords, brand: input.brand, lang: input.lang })), usage: q.usage };
  if (input.kind === "vinted") return { ...(await aiVintedListing({ product: input.product, details: input.details, condition: input.condition, lang: input.lang })), usage: q.usage };
  return { ...(await aiDescription({ product: input.product, features: input.features, tone: input.tone, lang: input.lang })), usage: q.usage };
});
