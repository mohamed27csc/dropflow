import "server-only";
import { isInsufficientBalance } from "@/lib/cj-errors";
import { countryName } from "@/lib/country-name";
import { evaluateOrderRisk } from "@/lib/order-risk";
import { thankYouMessage } from "@/lib/thank-you-message";
import type { CountryCode, Settings } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "./audit";
import { CjError, cjCreateOrder, cjFreight, cjOrderDetail, cjVariantStock, getCjToken } from "./cj";
import { bulkUpdatePriceQuantity, getEbayToken, listOpenOrders, sendTracking, type EbayOrder } from "./ebay";
import { replyToBuyer } from "./ebay-trading";
import { PublicError, safeMsg } from "./http";
import { notify } from "./notify";
import { STOCK_CAP } from "./pipeline";
import { loadSettings } from "./settings";

/**
 * Message de remerciement (gabarit fixe, sans IA) envoyé au client, avec le numéro de suivi si connu.
 * Best-effort : un échec d'envoi ne doit JAMAIS faire échouer la commande ou le suivi eux-mêmes.
 */
async function sendThankYou(ebayToken: string, market: CountryCode, itemId: string, buyer: string, tracking?: { number: string; carrier?: string }) {
  try {
    await replyToBuyer(ebayToken, market, { itemId, buyer }, thankYouMessage(market, tracking));
  } catch (e) {
    console.error("[thank-you]", safeMsg(e));
  }
}

export type OrdersReport = { created: number; awaitingPayment: number; blocked: number; deferred: number; tracked: number; errors: string[]; pausedForBalance?: number; resumedAfterBalance?: number };

type ListingRow = { id: string; sku: string; ebay_listing_id: string | null; products: { cj_vid: string; cj_cost: number } };

/**
 * Solde CJ insuffisant pour payer une commande : on ne laisse PAS le client attendre indéfiniment sans solution.
 * On met en pause TOUTES les annonces actives de ce marché (affichées « rupture ») pour arrêter immédiatement
 * de vendre ce qu'on ne peut pas payer, et on les réactive automatiquement dès qu'une commande repasse (preuve
 * que le solde est revenu). La commande déjà vendue, elle, est rejouée automatiquement (statut « error », 24 h).
 */
async function pauseForInsufficientBalance(userId: string, market: CountryCode, ebayToken: string): Promise<number> {
  const db = supabaseAdmin();
  const { data: rows } = await db.from("listings").select("id, sku, ebay_offer_id, ebay_price").eq("user_id", userId).eq("market", market).eq("status", "active").not("ebay_offer_id", "is", null);
  if (!rows?.length) return 0;
  await bulkUpdatePriceQuantity(
    ebayToken,
    market,
    rows.map((r) => ({ sku: r.sku, offerId: r.ebay_offer_id!, price: Number(r.ebay_price), quantity: 0 })),
  );
  await db
    .from("listings")
    .update({ status: "paused", pause_reason: "solde" })
    .in(
      "id",
      rows.map((r) => r.id),
    );
  await audit({ userId, action: "listing.paused", meta: { reason: "cj_balance", market, count: rows.length } });
  return rows.length;
}

async function resumeAfterBalanceRestored(userId: string, market: CountryCode, cjToken: string, ebayToken: string): Promise<number> {
  const db = supabaseAdmin();
  const { data: rows } = await db
    .from("listings")
    .select("id, sku, ebay_offer_id, ebay_price, products!inner(cj_vid)")
    .eq("user_id", userId)
    .eq("market", market)
    .eq("status", "paused")
    .eq("pause_reason", "solde")
    .not("ebay_offer_id", "is", null);
  if (!rows?.length) return 0;

  const updates: { sku: string; offerId: string; price: number; quantity: number }[] = [];
  const backToActive: string[] = [];
  const stillOutOfStock: string[] = [];
  for (const r of rows) {
    const vid = (r.products as unknown as { cj_vid: string }).cj_vid;
    const stock = await cjVariantStock(cjToken, vid).catch(() => 0);
    const quantity = Math.min(stock, STOCK_CAP);
    updates.push({ sku: r.sku, offerId: r.ebay_offer_id!, price: Number(r.ebay_price), quantity });
    (quantity > 0 ? backToActive : stillOutOfStock).push(r.id);
  }
  if (updates.length) await bulkUpdatePriceQuantity(ebayToken, market, updates);
  if (backToActive.length) await db.from("listings").update({ status: "active", pause_reason: null }).in("id", backToActive);
  if (stillOutOfStock.length) await db.from("listings").update({ pause_reason: "stock" }).in("id", stillOutOfStock); // solde revenu, mais rupture CJ réelle entre-temps
  if (backToActive.length) await audit({ userId, action: "listing.resumed", meta: { reason: "cj_balance_restored", market, count: backToActive.length } });
  return backToActive.length;
}

/**
 * 1) Nouvelles ventes eBay → commande CJ, sous garde-fous (plafonds, marge, validation manuelle).
 * 2) Commandes CJ expédiées → numéro de suivi renvoyé à eBay.
 *
 * Idempotence : la ligne `orders` (unique par user + ebay_order_id) est RÉSERVÉE de façon atomique AVANT tout appel CJ.
 * Deux exécutions simultanées ou un rejeu ne peuvent donc jamais créer deux commandes CJ pour une même vente.
 */
export async function processOrders(userId: string, email: string): Promise<OrdersReport> {
  const report: OrdersReport = { created: 0, awaitingPayment: 0, blocked: 0, deferred: 0, tracked: 0, errors: [] };
  const settings = await loadSettings(userId, email);
  if (!settings.autoOrder.enabled) return report;

  const db = supabaseAdmin();
  const cjToken = await getCjToken(userId);
  const { data: accounts } = await db.from("ebay_accounts").select("market").eq("user_id", userId);
  const markets = (accounts ?? []).map((a) => a.market as CountryCode);

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data: today } = await db.from("orders").select("est_cost").eq("user_id", userId).in("status", ["pending", "ordered", "awaiting_payment", "shipped", "tracking_sent"]).gte("created_at", dayStart.toISOString());
  const day = { orders: today?.length ?? 0, spent: (today ?? []).reduce((s, o) => s + Number(o.est_cost ?? 0), 0) };
  // Au plus une pause / une reprise par marché et par passage (évite de renvoyer 25 mises à jour eBay pour chaque commande en attente).
  const balanceGuard = { paused: new Set<CountryCode>(), resumed: new Set<CountryCode>() };

  for (const market of markets) {
    try {
      const ebayToken = await getEbayToken(userId, market);

      // ── 1) Nouvelles commandes
      for (const order of await listOpenOrders(ebayToken, market)) {
        try {
          await handleNewOrder({ userId, market, order, cjToken, ebayToken, settings, day, report, balanceGuard });
        } catch (e) {
          report.errors.push(`Commande ${order.orderId} : ${safeMsg(e)}`);
        }
      }

      // ── 2) Suivis à renvoyer
      const { data: pending } = await db
        .from("orders")
        .select("id, ebay_order_id, cj_order_id, line_items, status, buyer_username, listings(ebay_listing_id)")
        .eq("user_id", userId)
        .eq("market", market)
        .in("status", ["ordered", "awaiting_payment", "shipped"])
        .not("cj_order_id", "is", null);
      for (const o of pending ?? []) {
        try {
          const d = await cjOrderDetail(cjToken, o.cj_order_id!);
          if (d.status === "CANCELLED") {
            await db.from("orders").update({ status: "error", error: "Commande annulée chez CJ" }).eq("id", o.id).eq("user_id", userId);
            await audit({ userId, action: "order.error", entity: "order", entityId: o.ebay_order_id, meta: { reason: "cj_cancelled" } });
            continue;
          }
          if (!d.trackNumber) continue;
          // Réservation atomique du renvoi de suivi (évite un double envoi à eBay).
          const { data: claimed } = await db.from("orders").update({ status: "tracking_sent", tracking_number: d.trackNumber, tracking_carrier: d.trackingProvider ?? null, error: null }).eq("id", o.id).eq("user_id", userId).in("status", ["ordered", "awaiting_payment", "shipped"]).select("id");
          if (!claimed?.length) continue;
          try {
            await sendTracking(ebayToken, market, { orderId: o.ebay_order_id, lineItems: (o.line_items as { lineItemId: string; quantity: number }[]) ?? [], trackingNumber: d.trackNumber, carrier: d.trackingProvider ?? "Other" });
          } catch (e) {
            await db.from("orders").update({ status: o.status, tracking_number: null }).eq("id", o.id).eq("user_id", userId); // on retentera au prochain passage
            throw e;
          }
          await audit({ userId, action: "order.tracking_sent", entity: "order", entityId: o.ebay_order_id, meta: { carrier: d.trackingProvider ?? "Other" } });
          report.tracked++;

          // Message de suivi (numéro connu pour la première fois) : best-effort, ne bloque jamais le traitement.
          const itemId = (o.listings as unknown as { ebay_listing_id: string | null } | null)?.ebay_listing_id;
          if (itemId && o.buyer_username) await sendThankYou(ebayToken, market, itemId, o.buyer_username, { number: d.trackNumber, carrier: d.trackingProvider ?? undefined });
        } catch (e) {
          report.errors.push(`Suivi ${o.ebay_order_id} : ${safeMsg(e)}`);
        }
      }
    } catch (e) {
      report.errors.push(`${market.toUpperCase()} : ${safeMsg(e)}`);
    }
  }
  return report;
}

async function handleNewOrder(c: {
  userId: string;
  market: CountryCode;
  order: EbayOrder;
  cjToken: string;
  ebayToken: string;
  settings: Settings;
  day: { orders: number; spent: number };
  report: OrdersReport;
  balanceGuard: { paused: Set<CountryCode>; resumed: Set<CountryCode> };
}) {
  const { userId, market, order, cjToken, ebayToken, settings, day, report, balanceGuard } = c;
  const db = supabaseAdmin();

  const { data: known } = await db.from("orders").select("id, status, created_at, cj_order_id, balance_issue_since").eq("user_id", userId).eq("ebay_order_id", order.orderId).maybeSingle();
  // Seuls les échecs qui n'ont JAMAIS atteint CJ (et récents) sont rejoués ; tout le reste est définitif.
  // Exception : un blocage pour solde CJ insuffisant se résout par un simple rechargement, pas de raison d'abandonner
  // la commande après 24 h (le client recevrait un message de retard à 10 h pour rien si elle n'était jamais rejouée).
  const retryable = known?.status === "error" && !known.cj_order_id && (Boolean(known.balance_issue_since) || Date.now() - new Date(known.created_at).getTime() < 24 * 3600_000);
  if (known && !retryable) return;

  const skus = order.lineItems.map((l) => l.sku).filter((s): s is string => Boolean(s));
  if (!skus.length) return;
  const { data: rows } = await db.from("listings").select("id, sku, ebay_listing_id, products!inner(cj_vid, cj_cost)").eq("user_id", userId).in("sku", skus);
  const bySku = new Map(((rows ?? []) as unknown as ListingRow[]).map((l) => [l.sku, l]));
  if (bySku.size === 0) return; // vente hors DropFlow : on n'y touche pas

  const base = {
    user_id: userId,
    market,
    ebay_order_id: order.orderId,
    listing_id: bySku.get(skus[0])?.id ?? null,
    buyer_username: order.buyer ?? null,
    total: Number(order.total.value),
    currency: order.total.currency,
    line_items: order.lineItems.map((l) => ({ lineItemId: l.lineItemId, quantity: l.quantity })),
  };

  const finish = async (status: "blocked" | "error", error: string, estCost?: number) => {
    if (known) await db.from("orders").update({ status, error, est_cost: estCost ?? null }).eq("id", known.id).eq("user_id", userId);
    else await db.from("orders").upsert({ ...base, status, error, est_cost: estCost ?? null }, { onConflict: "user_id,ebay_order_id", ignoreDuplicates: true });
  };

  if (bySku.size !== skus.length || !order.shipTo || !order.shipTo.address || !order.shipTo.countryCode) {
    const reason = bySku.size !== skus.length ? "Article non géré par DropFlow dans la commande." : "Adresse de livraison incomplète.";
    await finish("blocked", reason);
    report.blocked++;
    await audit({ userId, action: "order.blocked", entity: "order", entityId: order.orderId, meta: { reason } });
    return;
  }

  // ── Estimation du coût (lecture seule chez CJ) puis décision de risque
  const products = order.lineItems.map((l) => ({ vid: bySku.get(l.sku!)!.products.cj_vid, quantity: l.quantity, cost: Number(bySku.get(l.sku!)!.products.cj_cost) }));
  const to = order.shipTo.countryCode;
  const freight = await cjFreight(cjToken, { to, items: products.map(({ vid, quantity }) => ({ vid, quantity })) }); // tous les articles de la commande : le port combiné, pas seulement le premier
  if (!freight.length) throw new PublicError(`Aucune livraison CJ vers ${to}`);
  const estUsd = products.reduce((s, p) => s + p.cost * p.quantity, 0) + freight[0].price;
  const estCost = estUsd * settings.fx.usdEur;
  const revenue = order.total.currency === "GBP" ? Number(order.total.value) / settings.fx.eurGbp : Number(order.total.value);

  const decision = evaluateOrderRisk({
    revenue,
    ebayFeePct: settings.pricing.ebayFeePct,
    estCost,
    ordersToday: day.orders,
    spentToday: day.spent,
    limits: { maxPerDay: settings.autoOrder.maxPerDay, maxDailySpend: settings.autoOrder.maxDailySpend, approveAbove: settings.autoOrder.approveAbove, mode: settings.autoOrder.mode },
  });

  if (decision.action === "defer") {
    report.deferred++; // aucune écriture : la vente sera reprise au prochain passage
    return;
  }
  if (decision.action === "block") {
    await finish("blocked", decision.reason, estCost);
    report.blocked++;
    await audit({ userId, action: "order.blocked", entity: "order", entityId: order.orderId, meta: { reason: decision.reason, estCost: Math.round(estCost * 100) / 100, revenue: Math.round(revenue * 100) / 100 } });
    return;
  }

  // ── Réservation ATOMIQUE de la vente : un seul exécutant peut passer cette étape
  let claimed = false;
  if (known) {
    const { data } = await db.from("orders").update({ status: "pending", error: null, est_cost: estCost }).eq("id", known.id).eq("user_id", userId).eq("status", "error").is("cj_order_id", null).select("id");
    claimed = Boolean(data?.length);
  } else {
    const { error } = await db.from("orders").insert({ ...base, status: "pending", est_cost: estCost });
    claimed = !error; // violation d'unicité (23505) : une autre exécution a déjà pris cette vente
  }
  if (!claimed) return;
  day.orders++;
  day.spent += estCost;

  try {
    const manual = decision.action === "order_manual";
    const created = await cjCreateOrder(cjToken, {
      orderNumber: order.orderId.replace(/[^\w-]/g, "").slice(0, 50),
      products: products.map(({ vid, quantity }) => ({ vid, quantity })),
      logisticName: freight[0].name,
      fromCountryCode: "CN",
      payType: manual ? 3 : 2, // 3 = créée mais NON payée : validation humaine dans CJ
      ship: { ...order.shipTo, countryCode: to, country: countryName(to) },
    });
    const status = manual ? "awaiting_payment" : "ordered";
    await db.from("orders").update({ status, cj_order_id: created.orderId, error: manual ? decision.reason : null }).eq("user_id", userId).eq("ebay_order_id", order.orderId);
    await audit({ userId, action: manual ? "order.awaiting_payment" : "order.created", entity: "order", entityId: order.orderId, meta: { cjOrderId: created.orderId, estCost: Math.round(estCost * 100) / 100, market } });

    // Remerciement immédiat (pas de suivi à ce stade : CJ n'a pas encore expédié). Best-effort, ne bloque jamais la commande.
    const itemId = bySku.get(skus[0])?.ebay_listing_id;
    if (itemId && order.buyer) {
      await sendThankYou(ebayToken, market, itemId, order.buyer);
      await db.from("orders").update({ thanked_at: new Date().toISOString() }).eq("user_id", userId).eq("ebay_order_id", order.orderId);
    }
    if (manual) report.awaitingPayment++;
    else report.created++;

    // La commande vient de passer : la preuve que le solde CJ est de nouveau suffisant. Réactive les annonces mises en pause pour ce motif.
    if (!manual && !balanceGuard.resumed.has(market)) {
      balanceGuard.resumed.add(market);
      const resumed = await resumeAfterBalanceRestored(userId, market, cjToken, ebayToken).catch(() => 0);
      if (resumed) report.resumedAfterBalance = (report.resumedAfterBalance ?? 0) + resumed;
    }
  } catch (e) {
    // La commande CJ n'a pas été créée : on note l'erreur (rejouable 24 h). Si la création avait réussi, la ligne reste « pending » : jamais rejouée.
    const msg = safeMsg(e);
    await db.from("orders").update({ status: "error", error: msg }).eq("user_id", userId).eq("ebay_order_id", order.orderId).is("cj_order_id", null);
    await audit({ userId, action: "order.error", entity: "order", entityId: order.orderId, meta: { reason: msg.slice(0, 120) } });
    day.orders--;
    day.spent -= estCost;

    // Solde CJ insuffisant : on ne laisse pas le client attendre sans solution. Toutes les annonces de ce marché passent
    // en « rupture » (plus aucune vente qu'on ne pourrait honorer) jusqu'à ce que le solde soit réapprovisionné.
    if (e instanceof CjError && isInsufficientBalance(e.code)) {
      // Une vente a eu lieu : le vendeur doit le savoir immédiatement, même si elle ne peut pas encore être honorée.
      await notify({
        userId,
        type: "order_balance",
        title: "Vente reçue, mais solde CJ insuffisant",
        body: `Commande ${order.orderId} (${Number(order.total.value).toFixed(2)} ${order.total.currency}) — rechargez CJ pour l'honorer, elle repassera automatiquement dès que possible.`,
        url: "/ventes",
      }).catch(() => {});
      // Première fois seulement (set-once) : sert de départ au délai de 10 h avant de prévenir l'acheteur.
      await db.from("orders").update({ balance_issue_since: new Date().toISOString() }).eq("user_id", userId).eq("ebay_order_id", order.orderId).is("balance_issue_since", null);
      if (!balanceGuard.paused.has(market)) {
        balanceGuard.paused.add(market);
        const paused = await pauseForInsufficientBalance(userId, market, ebayToken).catch(() => 0);
        if (paused) report.pausedForBalance = (report.pausedForBalance ?? 0) + paused;
      }
    }
    throw e;
  }
}
