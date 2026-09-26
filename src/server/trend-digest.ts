import "server-only";
import { computePrice } from "@/lib/margin";
import { inPriceTier } from "@/lib/price-tiers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toMarketCurrency } from "./pipeline";
import { loadSettings } from "./settings";
import { loadRising } from "./trends";
import { notify } from "./notify";

const DIGEST_EVERY_DAYS = 5;
const MARKET = "fr" as const; // marché de référence pour l'estimation de prix (le classement produit est commun à tous les marchés)

/**
 * Tous les DIGEST_EVERY_DAYS jours : les 5 produits tendance (progression la plus rapide) dont le prix eBay
 * estimé tombe entre 0 et 30 €. Notification uniquement (pas de publication automatique).
 */
export async function maybeSendTrendDigest(userId: string, email: string): Promise<boolean> {
  const db = supabaseAdmin();
  const { data: meta } = await db.from("settings").select("last_trend_digest_at").eq("user_id", userId).maybeSingle();
  const last = meta?.last_trend_digest_at ? new Date(meta.last_trend_digest_at).getTime() : 0;
  if (Date.now() - last < DIGEST_EVERY_DAYS * 86_400_000) return false;

  const settings = await loadSettings(userId, email);
  const { items } = await loadRising(30);
  const top5 = items
    .filter((p) => inPriceTier(computePrice({ cjCost: toMarketCurrency(p.price, MARKET, settings.fx), shipping: 0, signal: { sold30d: 0, sellers: 0 } }, settings.pricing).price, "low"))
    .slice(0, 5);

  await db.from("settings").upsert({ user_id: userId, last_trend_digest_at: new Date().toISOString() });
  if (!top5.length) return false;

  await notify({
    userId,
    type: "trend_digest",
    title: `${top5.length} produit${top5.length > 1 ? "s" : ""} tendance (0-30 €)`,
    body: top5.map((p) => p.name.slice(0, 50)).join(" · "),
    url: "/classements",
  });
  return true;
}
