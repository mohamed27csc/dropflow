import { PublicError } from "@/server/http";
import { secured } from "@/server/route";

/** Lecture via le client de l'utilisateur : la RLS garantit qu'il ne voit QUE ses messages acheteur. */
export const GET = secured({ name: "messages-get", user: [60, 60] }, async ({ user, supabase }) => {
  const { data, error } = await supabase
    .from("buyer_messages")
    .select("id, market, item_id, item_title, buyer, question, reply, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new PublicError("Lecture impossible.", 500);
  return { messages: data ?? [] };
});
