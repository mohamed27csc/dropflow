import "server-only";
import { stockDelayMessage } from "@/lib/thank-you-message";
import type { CountryCode } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getEbayToken } from "./ebay";
import { replyToBuyer } from "./ebay-trading";
import { safeMsg } from "./http";

const NOTICE_DELAY_MS = 10 * 3600_000;

/**
 * Si une vente est toujours bloquée par un solde CJ insuffisant 10 h après la première tentative, l'acheteur est
 * prévenu honnêtement d'un retard d'approvisionnement (sans révéler la cause interne). Une seule fois par commande.
 */
export async function notifyBuyersOfStockDelay(userId: string): Promise<number> {
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - NOTICE_DELAY_MS).toISOString();

  const { data: orders } = await db
    .from("orders")
    .select("id, market, buyer_username, listings(ebay_listing_id)")
    .eq("user_id", userId)
    .eq("status", "error")
    .is("cj_order_id", null)
    .is("stock_notice_sent_at", null)
    .not("balance_issue_since", "is", null)
    .lt("balance_issue_since", cutoff);

  let sent = 0;
  for (const o of orders ?? []) {
    const itemId = (o.listings as unknown as { ebay_listing_id: string | null } | null)?.ebay_listing_id;
    if (!itemId || !o.buyer_username) continue;
    try {
      const market = o.market as CountryCode;
      const token = await getEbayToken(userId, market);
      await replyToBuyer(token, market, { itemId, buyer: o.buyer_username }, stockDelayMessage(market));
      await db.from("orders").update({ stock_notice_sent_at: new Date().toISOString() }).eq("id", o.id).eq("user_id", userId);
      sent++;
    } catch (e) {
      console.error("[stock-delay]", safeMsg(e));
    }
  }
  return sent;
}
