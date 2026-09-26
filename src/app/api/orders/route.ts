import { PublicError } from "@/server/http";
import { secured } from "@/server/route";

/** Lecture via le client de l'utilisateur : la RLS garantit qu'il ne voit QUE ses commandes. */
export const GET = secured({ name: "orders-get", user: [60, 60] }, async ({ user, supabase }) => {
  const { data, error } = await supabase
    .from("orders")
    .select("id, market, ebay_order_id, status, tracking_number, tracking_carrier, buyer_username, total, currency, error, created_at, listings(title)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new PublicError("Lecture impossible.", 500);
  return {
    orders: (data ?? []).map((o) => ({
      id: o.id,
      market: o.market,
      ebayOrderId: o.ebay_order_id,
      title: (o.listings as unknown as { title: string } | null)?.title ?? null,
      status: o.status,
      trackingNumber: o.tracking_number,
      trackingCarrier: o.tracking_carrier,
      buyer: o.buyer_username,
      total: o.total === null ? null : Number(o.total),
      currency: o.currency,
      error: o.error,
      createdAt: o.created_at,
    })),
  };
});
