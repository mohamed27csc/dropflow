import { pushSubscribeInput, pushUnsubscribeInput } from "@/lib/schemas";
import { parseBody, PublicError } from "@/server/http";
import { supabaseAdmin } from "@/lib/supabase/server";
import { secured } from "@/server/route";

export const POST = secured({ name: "push-subscribe", schema: pushSubscribeInput, user: [20, 60] }, async ({ user, input }) => {
  const db = supabaseAdmin();
  const { error } = await db.from("push_subscriptions").upsert({ user_id: user.id, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth }, { onConflict: "endpoint" });
  if (error) throw new PublicError("Abonnement impossible.", 500);
  return { ok: true };
});

export const DELETE = secured({ name: "push-unsubscribe", user: [20, 60] }, async ({ user, req }) => {
  const input = await parseBody(req, pushUnsubscribeInput);
  const db = supabaseAdmin();
  await db.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", input.endpoint);
  return { ok: true };
});
