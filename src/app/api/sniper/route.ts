import { PLANS } from "@/lib/plans";
import { computePrice } from "@/lib/margin";
import { inPriceTier } from "@/lib/price-tiers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";
import { sniperInput } from "@/lib/schemas";
import { CANDIDATE, cjListProducts, isFreshCandidate, isReasonableCandidate, profitScore, type CjListItem } from "@/server/cj";
import { createListingFromCj, mapLimit, prepareRun, toMarketCurrency, type CreatedListing } from "@/server/pipeline";
import { consumeQuota, loadSettings } from "@/server/settings";

export const maxDuration = 300;

/** Nom de catégorie de l'interface → mot-clé de recherche CJ (le catalogue CJ est en anglais). */
const CATEGORY_KEYWORDS: Record<string, string> = {
  "Beauté & santé": "beauty",
  "Maison & cuisine": "kitchen",
  Mode: "fashion",
  "Sport & fitness": "fitness",
  Animaux: "pet",
  Électronique: "electronic",
  "Auto & moto": "car accessories",
  "Bébé & enfants": "baby",
};

export const POST = secured({ name: "sniper", schema: sniperInput, user: [10, 3600] }, async ({ user, input, req }) => {
  const market = input.market;
  const categories = input.categories.filter((c) => c in CATEGORY_KEYWORDS);

  const settings = await loadSettings(user.id, user.email ?? "");
  const quotas = PLANS[settings.plan].quotas;
  const count = Math.min(input.count, quotas.sniperProducts);

  // On valide la configuration eBay/CJ AVANT de consommer le quota du jour.
  const ctx = await prepareRun(user.id, market, settings);
  const q = await consumeQuota(user.id, settings.plan, "sniperRuns");
  if (!q.ok) throw new PublicError(`Quota atteint (${q.limit}/jour) — Premium`, 429);

  // Candidats CJ triés par popularité, sans ceux déjà listés sur ce marché (filtre .eq("user_id") : jamais les données d'un autre).
  const fresh = input.sort === "new";
  const keywords = categories.length ? categories.map((c) => CATEGORY_KEYWORDS[c]) : [undefined];
  const pages = await Promise.all(keywords.map((k) => cjListProducts(ctx.cjToken, { keyWord: k, page: fresh ? 1 + Math.floor(Math.random() * 4) : CANDIDATE.firstPage + Math.floor(Math.random() * CANDIDATE.pageSpan), size: 50, orderBy: fresh ? 3 : 1, startSellPrice: CANDIDATE.minPrice, endSellPrice: CANDIDATE.maxPrice })));
  const { data: existing } = await supabaseAdmin().from("listings").select("products!inner(cj_pid)").eq("user_id", user.id).eq("market", market);
  const owned = new Set((existing ?? []).map((r) => (r.products as unknown as { cj_pid: string }).cj_pid));
  const seen = new Set<string>();
  // Prix eBay ESTIMÉ (hors livraison, calculé comme dans Classements) : sert seulement à filtrer par tranche de prix
  // avant de tenter la publication. Le vrai prix, avec le port réel, est calculé au moment de la création de l'annonce.
  const estPrice = (p: CjListItem) => computePrice({ cjCost: toMarketCurrency(p.price, market, settings.fx), shipping: 0, signal: { sold30d: 0, sellers: p.listedNum } }, settings.pricing).price;
  const candidates: CjListItem[] = pages.flat()
    .filter((p) => (fresh ? isFreshCandidate(p) : isReasonableCandidate(p)) && !owned.has(p.pid) && !seen.has(p.pid) && seen.add(p.pid) && inPriceTier(estPrice(p), input.priceTier))
    .sort((a, b) => (fresh ? b.price - a.price : profitScore(b) - profitScore(a)));

  const created: CreatedListing[] = [];
  const failed: { name: string; error: string }[] = [];
  for (let i = 0; i < candidates.length && created.length < count && i < count * 3; i += 2) {
    const wave = candidates.slice(i, i + Math.min(2, count - created.length));
    const results = await mapLimit(wave, 2, (c) => createListingFromCj(ctx, c, input.targetMargin));
    results.forEach((r, j) => (r.ok ? created.push(r.value) : failed.push({ name: wave[j].name.slice(0, 80), error: r.error })));
  }
  await audit({ userId: user.id, action: "listing.created", meta: { market, count: created.length, via: "sniper", requested: count }, req });
  return { created, failed, requested: input.count, made: created.length, usage: q.usage };
});
