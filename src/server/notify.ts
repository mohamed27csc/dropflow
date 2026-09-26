import "server-only";
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase/server";
import { safeMsg } from "./http";

let vapidReady = false;
function ensureVapid(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:contact@dropflow.app", pub, priv);
    vapidReady = true;
  }
  return true;
}

export type NotifyInput = { userId: string; type: string; title: string; body?: string; url?: string };

/**
 * Enregistre la notification en base (source de vérité, toujours visible dans le centre de notifications de l'appli)
 * puis tente un envoi push navigateur en best-effort : une notification n'échoue JAMAIS à cause du push.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("notifications").insert({ user_id: input.userId, type: input.type, title: input.title, body: input.body ?? null, url: input.url ?? null });
  if (error) {
    console.error("[notify]", safeMsg(error));
    return;
  }

  if (!ensureVapid()) return;
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", input.userId);
  if (!subs?.length) return;

  const payload = JSON.stringify({ title: input.title, body: input.body ?? "", url: input.url ?? "/dashboard" });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", s.id); // abonnement expiré/révoqué
        else console.error("[push]", safeMsg(e));
      }
    }),
  );
}
