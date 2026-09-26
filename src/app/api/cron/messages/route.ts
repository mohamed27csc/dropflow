import { NextResponse } from "next/server";
import type { CountryCode } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cronAllowed } from "@/server/auth";
import { getEbayToken } from "@/server/ebay";
import { fail, safeMsg } from "@/server/http";
import { pollAndReplyBuyerMessages } from "@/server/messaging";
import { notifyBuyersOfStockDelay } from "@/server/stock-delay";

export const maxDuration = 120;

/**
 * Réservé au cron (Bearer CRON_SECRET). Passage horaire : réponse quasi immédiate aux messages acheteur
 * (annonces DropFlow uniquement), séparé du cron quotidien des commandes pour rester réactif sans dépendre
 * de la fréquence journalière de celui-ci.
 */
export async function GET(req: Request) {
  if (!cronAllowed(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const { data: accounts } = await supabaseAdmin().from("ebay_accounts").select("user_id, market");
    let checked = 0;
    let autoReplied = 0;
    let escalated = 0;
    let stockDelayNotices = 0;
    const stockDelayDone = new Set<string>();
    for (const { user_id, market } of accounts ?? []) {
      try {
        const ebayToken = await getEbayToken(user_id, market as CountryCode);
        const r = await pollAndReplyBuyerMessages(user_id, market as CountryCode, ebayToken);
        checked += r.checked;
        autoReplied += r.autoReplied;
        escalated += r.escalated;
      } catch (e) {
        console.error("[cron-messages]", safeMsg(e));
      }
      // Prévenir l'acheteur d'un retard si le solde CJ est toujours insuffisant 10 h après la vente (une fois par utilisateur, tous marchés confondus).
      if (!stockDelayDone.has(user_id)) {
        stockDelayDone.add(user_id);
        try {
          stockDelayNotices += await notifyBuyersOfStockDelay(user_id);
        } catch (e) {
          console.error("[cron-messages/stock-delay]", safeMsg(e));
        }
      }
    }
    return NextResponse.json({ checked, autoReplied, escalated, stockDelayNotices });
  } catch (e) {
    return fail(e);
  }
}
