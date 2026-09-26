import type { CountryCode } from "@/lib/settings";
import { messageReplyInput } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { getEbayToken } from "@/server/ebay";
import { replyToBuyer } from "@/server/ebay-trading";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";

/** Réponse manuelle à un message acheteur (toujours possible, y compris pour un message déjà répondu par l'IA). */
export const POST = secured({ name: "messages-reply", schema: messageReplyInput, user: [30, 60] }, async ({ user, input, req }) => {
  const db = supabaseAdmin();
  const { data: msg } = await db.from("buyer_messages").select("id, market, item_id, buyer").eq("id", input.id).eq("user_id", user.id).maybeSingle();
  if (!msg) throw new PublicError("Message introuvable.", 404);

  const market = msg.market as CountryCode;
  const ebayToken = await getEbayToken(user.id, market);
  await replyToBuyer(ebayToken, market, { itemId: msg.item_id, buyer: msg.buyer }, input.text);

  await db.from("buyer_messages").update({ status: "manual_replied", reply: input.text }).eq("id", msg.id).eq("user_id", user.id);
  await audit({ userId: user.id, action: "message.manual_replied", entity: "buyer_message", entityId: msg.id, meta: { market }, req });
  return { ok: true };
});
