import { PublicError } from "@/server/http";
import { secured } from "@/server/route";

/** Lecture via le client de l'utilisateur : la RLS garantit qu'il ne voit QUE ses notifications. */
export const GET = secured({ name: "notifications-get", user: [60, 60] }, async ({ user, supabase }) => {
  const { data, error } = await supabase.from("notifications").select("id, type, title, body, url, read_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  if (error) throw new PublicError("Lecture impossible.", 500);
  return { notifications: data ?? [], unread: (data ?? []).filter((n) => !n.read_at).length };
});
