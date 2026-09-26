import { computePrice } from "@/lib/margin";
import { CANDIDATE, cjListProducts, getCjToken, isReasonableCandidate, profitScore } from "@/server/cj";
import { toMarketCurrency } from "@/server/pipeline";
import { secured } from "@/server/route";
import { loadSettings } from "@/server/settings";
import { loadRising } from "@/server/trends";

const cache = new Map<string, { at: number; body: unknown }>();

/**
 * Meilleurs produits à publier :
 * 1) ceux dont le nombre de boutiques CJ grimpe (relevés nocturnes), quand il y a assez de recul ;
 * 2) sinon les produits populaires mais pas saturés, classés par gain potentiel.
 * Le prix eBay affiché est une ESTIMATION hors livraison ; le vrai prix est calculé à la publication.
 */
export const GET = secured({ name: "rankings", user: [20, 60] }, async ({ user }) => {
  const hit = cache.get(user.id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.body;
  const settings = await loadSettings(user.id, user.email ?? "");
  const est = (usd: number, listed: number) => computePrice({ cjCost: toMarketCurrency(usd, "fr", settings.fx), shipping: 0, signal: { sold30d: 0, sellers: listed } }, settings.pricing);

  const rising = await loadRising(20);
  let items: { cjId: string; title: string; image?: string; cjCost: number; listedNum: number; growthPct?: number; sinceDays?: number; estPrice: number; estProfit: number }[];
  let source: "rising" | "popular" = "popular";
  if (rising.items.length >= 5) {
    source = "rising";
    items = rising.items.map((p) => {
      const q = est(p.price, p.to);
      return { cjId: p.pid, title: p.name, image: p.image.startsWith("https://") ? p.image : undefined, cjCost: toMarketCurrency(p.price, "fr", settings.fx), listedNum: p.to, growthPct: p.growthPct, sinceDays: p.days, estPrice: q.price, estProfit: q.netProfit };
    });
  } else {
    const token = await getCjToken(user.id);
    const list = await cjListProducts(token, { page: CANDIDATE.firstPage + Math.floor(Math.random() * 6), size: 50, orderBy: 1, startSellPrice: CANDIDATE.minPrice, endSellPrice: CANDIDATE.maxPrice });
    items = list
      .filter(isReasonableCandidate)
      .sort((a, b) => profitScore(b) - profitScore(a))
      .slice(0, 20)
      .map((p) => {
        const q = est(p.price, p.listedNum);
        return { cjId: p.pid, title: p.name, image: p.image.startsWith("https://") ? p.image : undefined, cjCost: toMarketCurrency(p.price, "fr", settings.fx), listedNum: p.listedNum, estPrice: q.price, estProfit: q.netProfit };
      });
  }
  const body = { source, days: rising.days, items };
  cache.set(user.id, { at: Date.now(), body });
  return body;
});
