import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { json } from "@/server/http";
import { secured } from "@/server/route";

/** Export des données personnelles (RGPD art. 15/20). Aucun secret : les jetons eBay et la clé CJ ne sont jamais exportés. */
export const GET = secured({ name: "account-export", user: [3, 3600] }, async ({ user, req }) => {
  const db = supabaseAdmin();
  const own = (t: string, cols: string) => db.from(t).select(cols).eq("user_id", user.id);
  const [profile, settings, listings, products, orders, ebay, cj, log] = await Promise.all([
    db.from("profiles").select("pseudo, plan, role, created_at").eq("id", user.id).maybeSingle(),
    db.from("settings").select("data, usage, updated_at").eq("user_id", user.id).maybeSingle(),
    own("listings", "market, sku, title, ebay_price, status, created_at"),
    own("products", "cj_pid, title, cj_cost, shipping, created_at"),
    own("orders", "market, ebay_order_id, status, total, currency, tracking_number, created_at"),
    own("ebay_accounts", "market, ebay_username, created_at"),
    own("cj_accounts", "key_hint, created_at"),
    db.from("audit_log").select("action, entity, entity_id, meta, ip, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000),
  ]);
  await audit({ userId: user.id, action: "account.exported", req });
  return json(
    { exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email, createdAt: user.created_at }, profile: profile.data, settings: settings.data, listings: listings.data, products: products.data, orders: orders.data, ebayAccounts: ebay.data, cjAccount: cj.data, auditLog: log.data },
    200,
    { "Content-Disposition": 'attachment; filename="dropflow-donnees.json"' },
  );
});
