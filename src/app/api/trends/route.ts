import { z } from "zod";
import { CANDIDATE, cjListProducts, getCjToken, isReasonableCandidate } from "@/server/cj";
import { toMarketCurrency } from "@/server/pipeline";
import { secured } from "@/server/route";
import { loadSettings } from "@/server/settings";
import { loadRising } from "@/server/trends";

const cache = new Map<string, { at: number; body: unknown }>();

/** Produits populaires du catalogue CJ (tri par nombre de vendeurs qui les listent). Cache 10 min par utilisateur. */
export const GET = secured({ name: "trends", schema: z.object({ page: z.coerce.number().int().min(1).max(50).default(1) }), source: "query", user: [30, 60] }, async ({ user, input }) => {
  const key = `${user.id}:${input.page}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.body;
  // 1) Produits dont le nombre de boutiques grimpe (signal de tendance), dès qu'il y a 2 jours de relevés.
  const rising = await loadRising(6);
  if (input.page === 1 && rising.items.length >= 3) {
    const settings = await loadSettings(user.id, user.email ?? "");
    const body = { source: "rising", days: rising.days, trends: rising.items.map((p) => ({ cjId: p.pid, title: p.name, image: p.image.startsWith("https://") ? p.image : undefined, cjCost: toMarketCurrency(p.price, "fr", settings.fx), listedNum: p.to, growthPct: p.growthPct, from: p.from, sinceDays: p.days })) };
    cache.set(key, { at: Date.now(), body });
    return body;
  }
  const [token, settings] = await Promise.all([getCjToken(user.id), loadSettings(user.id, user.email ?? "")]);
  const items = (await cjListProducts(token, { page: CANDIDATE.firstPage + input.page, size: 50, orderBy: 1, startSellPrice: CANDIDATE.minPrice, endSellPrice: CANDIDATE.maxPrice })).filter(isReasonableCandidate).slice(0, 6);
  const body = { trends: items.map((p) => ({ cjId: p.pid, title: p.name, image: p.image.startsWith("https://") ? p.image : undefined, cjCost: toMarketCurrency(p.price, "fr", settings.fx), listedNum: p.listedNum, category: p.category })) };
  cache.set(key, { at: Date.now(), body });
  return body;
});
