import "server-only";
import { isDisputeLike } from "@/lib/dispute-detector";
import type { CountryCode } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { draftBuyerReply } from "./ai";
import { audit } from "./audit";
import { unansweredBuyerMessages, replyToBuyer, type BuyerQuestion } from "./ebay-trading";
import { notify } from "./notify";
import { safeMsg } from "./http";

const LANG = { fr: "fr", de: "de", uk: "en" } as const;

export type MessagingReport = { checked: number; autoReplied: number; escalated: number; errors: string[] };

/**
 * Répond automatiquement aux questions des acheteurs sur les annonces DropFlow (jamais sur le reste de l'activité
 * eBay du vendeur : seuls les articles présents dans `listings` sont concernés). Une question qui ressemble à un
 * litige n'est JAMAIS traitée par l'IA : elle est escaladée par notification pour une réponse manuelle.
 */
export async function pollAndReplyBuyerMessages(userId: string, market: CountryCode, ebayToken: string): Promise<MessagingReport> {
  const db = supabaseAdmin();
  const report: MessagingReport = { checked: 0, autoReplied: 0, escalated: 0, errors: [] };

  let questions: BuyerQuestion[];
  try {
    questions = await unansweredBuyerMessages(ebayToken, market);
  } catch (e) {
    report.errors.push(safeMsg(e));
    return report;
  }
  if (!questions.length) return report;

  const { data: listingRows } = await db
    .from("listings")
    .select("ebay_listing_id, title")
    .eq("user_id", userId)
    .eq("market", market)
    .in(
      "ebay_listing_id",
      questions.map((q) => q.itemId),
    );
  const dropflowItems = new Map((listingRows ?? []).map((r) => [r.ebay_listing_id as string, r.title as string]));
  const relevant = questions.filter((q) => dropflowItems.has(q.itemId));
  if (!relevant.length) return report;

  const { data: known } = await db
    .from("buyer_messages")
    .select("ebay_message_id")
    .eq("user_id", userId)
    .in(
      "ebay_message_id",
      relevant.map((q) => q.messageId),
    );
  const seen = new Set((known ?? []).map((r) => r.ebay_message_id as string));
  const fresh = relevant.filter((q) => !seen.has(q.messageId));

  for (const q of fresh) {
    report.checked++;
    const itemTitle = dropflowItems.get(q.itemId) ?? q.itemTitle;

    if (isDisputeLike(q.question)) {
      await db.from("buyer_messages").insert({ user_id: userId, market, ebay_message_id: q.messageId, item_id: q.itemId, item_title: itemTitle, buyer: q.buyer, question: q.question, status: "escalated" });
      await notify({ userId, type: "buyer_dispute", title: "Message à traiter vous-même", body: `${q.buyer} — ${itemTitle.slice(0, 60)} : « ${q.question.slice(0, 120)} »`, url: "/messages" });
      report.escalated++;
      continue;
    }

    const reply = await draftBuyerReply({ question: q.question, itemTitle, lang: LANG[market] });
    if (!reply) {
      // Pas de clé IA configurée, ou échec de rédaction : on n'envoie jamais un message vide ou générique.
      await db.from("buyer_messages").insert({ user_id: userId, market, ebay_message_id: q.messageId, item_id: q.itemId, item_title: itemTitle, buyer: q.buyer, question: q.question, status: "escalated" });
      await notify({ userId, type: "buyer_dispute", title: "Nouveau message acheteur", body: `${q.buyer} — ${itemTitle.slice(0, 60)} : « ${q.question.slice(0, 120)} »`, url: "/messages" });
      report.escalated++;
      continue;
    }

    try {
      await replyToBuyer(ebayToken, market, { itemId: q.itemId, buyer: q.buyer }, reply);
      await db.from("buyer_messages").insert({ user_id: userId, market, ebay_message_id: q.messageId, item_id: q.itemId, item_title: itemTitle, buyer: q.buyer, question: q.question, reply, status: "auto_replied" });
      await audit({ userId, action: "message.auto_replied", entity: "buyer_message", entityId: q.messageId, meta: { market, itemId: q.itemId } });
      report.autoReplied++;
    } catch (e) {
      await db.from("buyer_messages").insert({ user_id: userId, market, ebay_message_id: q.messageId, item_id: q.itemId, item_title: itemTitle, buyer: q.buyer, question: q.question, status: "escalated" });
      await notify({ userId, type: "buyer_dispute", title: "Réponse automatique impossible", body: `${itemTitle.slice(0, 60)} : ${safeMsg(e)}`, url: "/messages" });
      report.escalated++;
      report.errors.push(safeMsg(e));
    }
  }

  return report;
}
