import "server-only";
import { computePrice } from "@/lib/margin";
import { inPriceTier } from "@/lib/price-tiers";
import type { CountryCode } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "./audit";
import { CANDIDATE, cjListProducts, getCjToken, isReasonableCandidate, profitScore, type CjListItem } from "./cj";
import { createListingFromCj, mapLimit, prepareRun, toMarketCurrency, type CreatedListing } from "./pipeline";
import { loadSettings } from "./settings";
import { safeMsg } from "./http";

const DAILY_TARGET = 2;

/**
 * Publication automatique quotidienne : DAILY_TARGET annonces neuves par marché connecté, uniquement dans la
 * tranche 0-30 € (estimation eBay hors livraison), en réutilisant exactement les mêmes garde-fous que le Sniper
 * manuel (marge minimale, filtre produits à risque, plafond de publication eBay, retrait automatique en cas
 * d'échec d'enregistrement).
 */
export async function autoPublishDaily(userId: string, email: string): Promise<{ market: CountryCode; created: number; errors: string[] }[]> {
  const db = supabaseAdmin();
  const { data: accounts } = await db.from("ebay_accounts").select("market").eq("user_id", userId);
  const settings = await loadSettings(userId, email);
  const cjToken = await getCjToken(userId);
  const out: { market: CountryCode; created: number; errors: string[] }[] = [];

  for (const { market } of accounts ?? []) {
    const mkt = market as CountryCode;
    const report = { market: mkt, created: 0, errors: [] as string[] };
    try {
      const ctx = await prepareRun(userId, mkt, settings);
      const estPrice = (p: CjListItem) => computePrice({ cjCost: toMarketCurrency(p.price, mkt, settings.fx), shipping: 0, signal: { sold30d: 0, sellers: p.listedNum } }, settings.pricing).price;

      const pages = await Promise.all(
        [CANDIDATE.firstPage + Math.floor(Math.random() * CANDIDATE.pageSpan), CANDIDATE.firstPage + Math.floor(Math.random() * CANDIDATE.pageSpan)].map((page) =>
          cjListProducts(cjToken, { page, size: 50, orderBy: 1, startSellPrice: CANDIDATE.minPrice, endSellPrice: 30 }),
        ),
      );
      const { data: existing } = await db.from("listings").select("products!inner(cj_pid)").eq("user_id", userId).eq("market", mkt);
      const owned = new Set((existing ?? []).map((r) => (r.products as unknown as { cj_pid: string }).cj_pid));
      const seen = new Set<string>();
      const candidates = pages
        .flat()
        .filter((p) => isReasonableCandidate(p) && !owned.has(p.pid) && !seen.has(p.pid) && seen.add(p.pid) && inPriceTier(estPrice(p), "low"))
        .sort((a, b) => profitScore(b) - profitScore(a));

      const created: CreatedListing[] = [];
      for (let i = 0; i < candidates.length && created.length < DAILY_TARGET && i < DAILY_TARGET * 4; i += 2) {
        const wave = candidates.slice(i, i + Math.min(2, DAILY_TARGET - created.length));
        const results = await mapLimit(wave, 2, (c) => createListingFromCj(ctx, c, 0));
        results.forEach((r) => {
          if (r.ok) created.push(r.value);
          else report.errors.push(r.error);
        });
      }
      report.created = created.length;
      if (created.length) await audit({ userId, action: "listing.created", meta: { market: mkt, count: created.length, via: "autopublish" } });
    } catch (e) {
      report.errors.push(safeMsg(e));
    }
    out.push(report);
  }
  return out;
}
