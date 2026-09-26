import "server-only";
import { computePrice } from "@/lib/margin";
import type { CountryCode } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cjProductDetail, cjVariantStock, getCjToken } from "./cj";
import { bulkUpdatePriceQuantity, getEbayToken, type PriceQtyUpdate } from "./ebay";
import { auditMany } from "./audit";
import { safeMsg } from "./http";
import { mapLimit, STOCK_CAP, toMarketCurrency } from "./pipeline";
import { loadSettings } from "./settings";

type Row = {
  id: string;
  market: CountryCode;
  sku: string;
  ebay_offer_id: string;
  ebay_price: number;
  status: string;
  pause_reason: string | null;
  zero_stock_since: string | null;
  products: { id: string; cj_pid: string; cj_vid: string; cj_cost: number; shipping: number; listed_num: number };
};

/** Délai avant d'afficher une rupture de stock CJ : absorbe les glitches ou lenteurs de réappro passagères sans alerter inutilement. */
const STOCK_GRACE_MS = 15 * 3600_000;

export type SyncReport = { checked: number; repriced: number; paused: number; resumed: number; flagged: number; errors: string[]; skipped?: string };

/** Synchronise prix et stocks CJ → eBay pour un utilisateur. Sans `force`, respecte la fréquence choisie. */
export async function syncUser(userId: string, email: string, force = false): Promise<SyncReport> {
  const db = supabaseAdmin();
  const report: SyncReport = { checked: 0, repriced: 0, paused: 0, resumed: 0, flagged: 0, errors: [] };
  const settings = await loadSettings(userId, email);

  const { data: meta } = await db.from("settings").select("last_sync_at").eq("user_id", userId).maybeSingle();
  if (!force && meta?.last_sync_at && Date.now() - new Date(meta.last_sync_at).getTime() < settings.sync.everyHours * 3600_000 - 60_000) {
    return { ...report, skipped: "Pas encore l'heure (fréquence de synchro)." };
  }

  const { data } = await db
    .from("listings")
    .select("id, market, sku, ebay_offer_id, ebay_price, status, pause_reason, zero_stock_since, products!inner(id, cj_pid, cj_vid, cj_cost, shipping, listed_num)")
    .eq("user_id", userId)
    .in("status", ["active", "paused"])
    .not("ebay_offer_id", "is", null);
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return report;

  const cjToken = await getCjToken(userId);

  // Un appel CJ par produit (pas par annonce).
  const byPid = new Map<string, Row["products"]>();
  rows.forEach((r) => byPid.set(r.products.cj_pid, r.products));
  const live = new Map<string, { stock: number; price: number | null }>();
  const results = await mapLimit([...byPid.values()], 4, async (p) => {
    const [stock, detail] = await Promise.all([cjVariantStock(cjToken, p.cj_vid), cjProductDetail(cjToken, p.cj_pid)]);
    return { pid: p.cj_pid, stock, price: detail.variants.find((v) => v.vid === p.cj_vid)?.price ?? null };
  });
  const pids = [...byPid.keys()];
  results.forEach((r, i) => (r.ok ? live.set(pids[i], { stock: r.value.stock, price: r.value.price }) : report.errors.push(`CJ ${pids[i]} : ${r.error}`)));

  const updates = new Map<CountryCode, PriceQtyUpdate[]>();
  const dbWrites: { market: CountryCode; run: () => PromiseLike<unknown> }[] = [];
  const now = new Date().toISOString();
  const audits: Parameters<typeof auditMany>[0] = [];

  for (const r of rows) {
    const l = live.get(r.products.cj_pid);
    if (!l) continue;
    report.checked++;

    let price = Number(r.ebay_price);
    if (settings.sync.syncPrices && l.price !== null) {
      price = computePrice(
        { cjCost: toMarketCurrency(l.price, r.market, settings.fx), shipping: toMarketCurrency(Number(r.products.shipping), r.market, settings.fx), signal: { sold30d: 0, sellers: r.products.listed_num } },
        settings.pricing,
      ).price;
    }
    // Lien fournisseur suspect : variante disparue ou coût CJ en hausse de plus de 20 %.
    // Le prix N'EST PAS mis à jour tant que ce n'est pas vérifié (icône orange dans Mes Listings) : sinon un glitch
    // CJ pousserait un prix faussé sur eBay avant toute vérification humaine.
    const supplierOk = l.price !== null && l.price <= Number(r.products.cj_cost) * 1.2;
    if (!supplierOk) {
      price = Number(r.ebay_price);
      report.flagged++;
    }

    let status = r.status;
    let pauseReason = r.pause_reason;
    let zeroStockSince = r.zero_stock_since;
    // Le stock envoyé à eBay reste exact en temps réel (jamais de survente) : seul l'AFFICHAGE « rupture »
    // (statut, notification) attend STOCK_GRACE_MS avant de se déclencher, pour absorber un glitch CJ passager.
    let qty = Math.min(l.stock, STOCK_CAP);
    if (settings.sync.syncStock) {
      if (l.stock <= 0 && r.status === "active" && settings.sync.autoPause) {
        if (!zeroStockSince) {
          zeroStockSince = now; // première fois observé à 0 : on attend avant d'afficher la rupture
        } else if (Date.now() - new Date(zeroStockSince).getTime() >= STOCK_GRACE_MS) {
          status = "paused";
          pauseReason = "stock";
          report.paused++;
        }
      } else if (l.stock > 0 && r.status === "paused" && r.pause_reason === "stock") {
        status = "active";
        pauseReason = null;
        zeroStockSince = null;
        report.resumed++;
      } else if (l.stock > 0 && zeroStockSince) {
        zeroStockSince = null; // stock revenu avant la fin du délai : rien à afficher, on efface le compteur
      }
    }
    // Une annonce mise en pause à la main reste à 0.
    if (status === "paused") qty = 0;

    // Garde-fou : un prix qui bouge de plus de 2× (ou moins de 0,5×) vient probablement d'une donnée CJ aberrante.
    // On le refuse, on garde l'ancien prix et on signale le lien fournisseur.
    const old = Number(r.ebay_price);
    if (price > old * 2 || price < old * 0.5) {
      audits.push({ userId, action: "listing.price_rejected", entity: "listing", entityId: r.sku, meta: { from: old, to: price } });
      report.errors.push(`Prix ${r.sku.slice(0, 12)}… refusé (variation > 2×).`);
      price = old;
      report.flagged++;
    }
    const priceChanged = Math.abs(price - Number(r.ebay_price)) >= 0.01;
    if (priceChanged) audits.push({ userId, action: "listing.price_changed", entity: "listing", entityId: r.sku, meta: { from: old, to: price, market: r.market } });
    if (status !== r.status) audits.push({ userId, action: status === "paused" ? "listing.paused" : "listing.resumed", entity: "listing", entityId: r.sku, meta: { market: r.market } });
    if (priceChanged) report.repriced++;
    if (priceChanged || status !== r.status || settings.sync.syncStock) {
      const list = updates.get(r.market) ?? [];
      list.push({ sku: r.sku, offerId: r.ebay_offer_id, price, quantity: qty });
      updates.set(r.market, list);
    }
    dbWrites.push({ market: r.market, run: () => db.from("listings").update({ ebay_price: price, status, pause_reason: pauseReason, zero_stock_since: zeroStockSince, supplier_ok: supplierOk, last_sync_at: now }).eq("id", r.id).then() });
    if (l.price !== null) dbWrites.push({ market: r.market, run: () => db.from("products").update({ cj_cost: l.price, cj_stock: l.stock }).eq("id", r.products.id).then() });
  }

  // On n'écrit en base que pour les marchés où eBay a bien accepté la mise à jour.
  const failed = new Set<CountryCode>();
  for (const [market, list] of updates) {
    try {
      await bulkUpdatePriceQuantity(await getEbayToken(userId, market), market, list);
    } catch (e) {
      failed.add(market);
      report.errors.push(`eBay ${market.toUpperCase()} : ${safeMsg(e)}`);
    }
  }
  await Promise.all(dbWrites.filter((w) => !failed.has(w.market)).map((w) => w.run()));
  await auditMany(audits.slice(0, 200));
  await db.from("settings").upsert({ user_id: userId, last_sync_at: now });
  return report;
}
