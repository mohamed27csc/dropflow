import { toMarketCurrency } from "@/server/pipeline";
import { secured } from "@/server/route";
import { loadSettings } from "@/server/settings";
import { PublicError } from "@/server/http";

/** Lecture via le client de l'utilisateur : la RLS Postgres garantit qu'il ne peut lire QUE ses annonces (défense en profondeur anti-IDOR). */
export const GET = secured({ name: "listings-get", user: [60, 60] }, async ({ user, supabase }) => {
  const settings = await loadSettings(user.id, user.email ?? "");
  const { data, error } = await supabase
    .from("listings")
    .select("id, market, title, ebay_listing_id, ebay_price, status, pause_reason, supplier_ok, ad_rate, error, products!inner(cj_pid, image_url, cj_cost, shipping)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new PublicError("Lecture impossible.", 500);
  return {
    listings: (data ?? []).map((l) => {
      const p = l.products as unknown as { cj_pid: string; image_url: string | null; cj_cost: number; shipping: number };
      return {
        ebayId: l.ebay_listing_id ?? l.id,
        market: l.market,
        title: l.title,
        image: p.image_url?.startsWith("https://") ? p.image_url : undefined,
        ebayPrice: Number(l.ebay_price),
        cjCost: toMarketCurrency(Number(p.cj_cost), l.market, settings.fx),
        shipping: toMarketCurrency(Number(p.shipping), l.market, settings.fx),
        status: l.status === "active" ? "active" : "paused",
        pauseReason: l.pause_reason === "stock" || l.pause_reason === "solde" || l.pause_reason === "policy" || l.pause_reason === "no_sale" ? l.pause_reason : undefined,
        adRate: l.ad_rate === null ? undefined : Number(l.ad_rate),
        supplierOk: l.supplier_ok,
        cjId: p.cj_pid,
        error: l.error ?? undefined,
      };
    }),
  };
});
