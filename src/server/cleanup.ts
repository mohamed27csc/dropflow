import "server-only";
import type { CountryCode } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "./audit";
import { getEbayToken, withdrawOffer } from "./ebay";
import { safeMsg } from "./http";
import { notify } from "./notify";

const DEAD_STOCK_DAYS = 15;

/**
 * Retire les annonces actives depuis plus de DEAD_STOCK_DAYS jours et qui n'ont jamais généré la moindre vente :
 * du stock mort qui prend la place d'un produit qui pourrait vendre. La publication automatique quotidienne
 * (autopublish) comble naturellement la place, sans logique de remplacement dédiée.
 */
export async function cleanupDeadStock(userId: string): Promise<{ market: CountryCode; ended: number }[]> {
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - DEAD_STOCK_DAYS * 86_400_000).toISOString();

  const { data: candidates } = await db.from("listings").select("id, market, ebay_offer_id, title").eq("user_id", userId).eq("status", "active").lt("created_at", cutoff).not("ebay_offer_id", "is", null);
  if (!candidates?.length) return [];

  const { data: sold } = await db.from("orders").select("listing_id").eq("user_id", userId).not("listing_id", "is", null).in(
    "listing_id",
    candidates.map((c) => c.id),
  );
  const soldIds = new Set((sold ?? []).map((o) => o.listing_id as string));
  const dead = candidates.filter((c) => !soldIds.has(c.id));
  if (!dead.length) return [];

  const byMarket = new Map<CountryCode, typeof dead>();
  for (const d of dead) byMarket.set(d.market as CountryCode, [...(byMarket.get(d.market as CountryCode) ?? []), d]);

  const out: { market: CountryCode; ended: number }[] = [];
  for (const [market, list] of byMarket) {
    let ended = 0;
    try {
      const token = await getEbayToken(userId, market);
      for (const l of list) {
        try {
          await withdrawOffer(token, market, l.ebay_offer_id!);
          await db.from("listings").update({ status: "ended", pause_reason: "no_sale" }).eq("id", l.id).eq("user_id", userId);
          ended++;
        } catch (e) {
          console.error("[cleanup]", market, l.title, safeMsg(e));
        }
      }
    } catch (e) {
      console.error("[cleanup]", market, safeMsg(e));
    }
    if (ended) out.push({ market, ended });
  }

  const total = out.reduce((s, r) => s + r.ended, 0);
  if (total) {
    await audit({ userId, action: "listing.ended", meta: { reason: "dead_stock", count: total } });
    await notify({
      userId,
      type: "cleanup",
      title: `${total} annonce${total > 1 ? "s" : ""} retirée${total > 1 ? "s" : ""} (aucune vente en ${DEAD_STOCK_DAYS} jours)`,
      body: out.map((r) => `${r.market.toUpperCase()} : ${r.ended}`).join(" · "),
      url: "/listings",
    });
  }
  return out;
}
