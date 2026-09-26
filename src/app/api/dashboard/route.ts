import { profitAt } from "@/lib/margin";
import type { CountryCode } from "@/lib/settings";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";
import { toMarketCurrency } from "@/server/pipeline";
import { loadSettings } from "@/server/settings";

type OrderRow = {
  market: CountryCode;
  total: number | null;
  status: string;
  error: string | null;
  created_at: string;
  line_items: { quantity: number }[] | null;
  listings: { ad_rate: number | null; products: { cj_cost: number; shipping: number } } | null;
};

/** Lectures via le client de l'utilisateur : la RLS limite chaque requête à SES lignes (défense en profondeur anti-IDOR). */
export const GET = secured({ name: "dashboard", user: [60, 60] }, async ({ user, supabase }) => {
  const db = supabase;
  const settings = await loadSettings(user.id, user.email ?? "");
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(start.getTime() - 86400_000);

  const [{ data: orders, error: e1 }, { data: listings, error: e2 }] = await Promise.all([
    db.from("orders").select("market, total, status, error, created_at, line_items, listings(ad_rate, products(cj_cost, shipping))").eq("user_id", user.id).gte("created_at", yesterday.toISOString()),
    db.from("listings").select("market, status, pause_reason").eq("user_id", user.id),
  ]);
  if (e1 || e2) throw new PublicError("Lecture impossible.", 500);

  const stats = Object.fromEntries((["fr", "de", "uk"] as const).map((m) => [m, { revenue: 0, deltaPct: 0, orders: 0, netProfit: 0, activeListings: 0, prev: 0 }])) as Record<CountryCode, { revenue: number; deltaPct: number; orders: number; netProfit: number; activeListings: number; prev: number }>;

  for (const o of (orders ?? []) as unknown as OrderRow[]) {
    const s = stats[o.market];
    if (!s || o.status === "error" || o.status === "blocked") continue;
    const total = Number(o.total ?? 0);
    if (new Date(o.created_at) < start) {
      s.prev += total;
      continue;
    }
    s.revenue += total;
    s.orders++;
    const p = o.listings?.products;
    if (p) {
      const qty = o.line_items?.[0]?.quantity ?? 1;
      const cost = (toMarketCurrency(Number(p.cj_cost), o.market, settings.fx) + toMarketCurrency(Number(p.shipping), o.market, settings.fx) + settings.pricing.fixedFee) * qty;
      const adRatePct = o.listings?.ad_rate ?? settings.pricing.adRatePct; // taux réel de la pub si connu, sinon estimation par défaut
      s.netProfit += profitAt(total, cost, { ...settings.pricing, adRatePct }).netProfit;
    }
  }
  for (const l of listings ?? []) if (l.status === "active") stats[l.market as CountryCode].activeListings++;
  for (const s of Object.values(stats)) s.deltaPct = s.prev > 0 ? Math.round(((s.revenue - s.prev) / s.prev) * 100) : 0;

  const { data: errs } = await db.from("orders").select("ebay_order_id, error, status").eq("user_id", user.id).in("status", ["error", "blocked", "awaiting_payment"]).order("created_at", { ascending: false }).limit(5);
  return {
    stats,
    orderErrors: (errs ?? []).map((e) => ({ id: e.ebay_order_id, error: e.status === "awaiting_payment" ? `À valider et payer dans CJ : ${e.error ?? ""}` : e.error })),
    pausedForStock: (listings ?? []).filter((l) => l.pause_reason === "stock").length,
    pausedForBalance: (listings ?? []).filter((l) => l.pause_reason === "solde").length,
    pausedForPolicy: (listings ?? []).filter((l) => l.pause_reason === "policy").length,
  };
});
