import { notificationsReadInput } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { secured } from "@/server/route";

/** Écriture via le serveur (revoke sur le rôle client), filtrée explicitement sur user_id : défense en profondeur anti-IDOR. */
export const POST = secured({ name: "notifications-read", schema: notificationsReadInput, user: [60, 60] }, async ({ user, input }) => {
  const db = supabaseAdmin();
  const q = db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  await (input.all ? q : q.in("id", input.ids ?? []));
  return { ok: true };
});
