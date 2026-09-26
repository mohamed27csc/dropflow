import { analyticsInput } from "@/lib/schemas";
import { PublicError } from "@/server/http";
import { browseSearch } from "@/server/ebay";
import { secured } from "@/server/route";
import { consumeQuota, loadSettings } from "@/server/settings";

const STOP = new Set(["de", "la", "le", "les", "des", "du", "et", "pour", "avec", "en", "un", "une", "the", "and", "for", "with", "von", "und", "mit", "fur", "für", "neuf", "new", "neu"]);

/** Analyse d'un mot-clé via l'API Browse d'eBay (annonces actuelles : prix, concurrence, mots-clés ; pas de volumes de ventes). */
export const POST = secured({ name: "analytics", schema: analyticsInput, user: [20, 600] }, async ({ user, input }) => {
  const { plan } = await loadSettings(user.id, user.email ?? "");
  const q = await consumeQuota(user.id, plan, "analyses");
  if (!q.ok) throw new PublicError(`Quota atteint (${q.limit}/jour) — Premium`, 429);

  const exclude = input.exclude.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, 20);
  const r = await browseSearch(input.market, input.keyword, 50);
  const items = (r.itemSummaries ?? []).filter((i) => !exclude.some((w) => i.title.toLowerCase().includes(w)));
  const prices = items.map((i) => Number(i.price?.value)).filter((n) => Number.isFinite(n));
  const counts = new Map<string, number>();
  for (const i of items) for (const w of new Set(i.title.toLowerCase().split(/[^\p{L}\p{N}]+/u))) if (w.length > 2 && !STOP.has(w) && !input.keyword.toLowerCase().includes(w)) counts.set(w, (counts.get(w) ?? 0) + 1);

  return {
    keyword: input.keyword,
    total: r.total ?? items.length,
    avgPrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
    sellers: new Set(items.map((i) => i.seller?.username).filter(Boolean)).size,
    items: items.slice(0, 6).map((i) => ({ title: i.title, price: Number(i.price?.value) || 0 })),
    words: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w),
    usage: q.usage,
  };
});
