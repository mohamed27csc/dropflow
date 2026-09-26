import "server-only";
import type { CountryCode } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "./audit";
import { getEbayToken, listOpenOrders, sendTracking, type EbayOrder } from "./ebay";
import { PublicError, safeMsg } from "./http";
import { confirmPrintfulOrder, createPrintfulOrder, getPrintfulAuth, printfulOrderStatus, printfulShipments } from "./printful";

export type PrintfulOrdersReport = { created: number; tracked: number; errors: string[] };

type ListingRow = { id: string; sku: string; products: { printful_variant_id: number | null; design_url: string | null } };

/**
 * Traite les ventes eBay dont le produit vient de Printful : crée + confirme la commande Printful, puis renvoie le
 * suivi une fois disponible. Version plus simple que le pipeline CJ : pas encore de garde-fou de risque ni de
 * pause automatique en cas d'échec de paiement Printful — à construire si l'usage le justifie.
 */
export async function processPrintfulOrders(userId: string): Promise<PrintfulOrdersReport> {
  const report: PrintfulOrdersReport = { created: 0, tracked: 0, errors: [] };
  const db = supabaseAdmin();

  let auth;
  try {
    auth = await getPrintfulAuth(userId);
  } catch {
    return report; // Printful non connecté : rien à faire
  }

  const { data: accounts } = await db.from("ebay_accounts").select("market").eq("user_id", userId);
  for (const { market } of accounts ?? []) {
    const mkt = market as CountryCode;
    try {
      const ebayToken = await getEbayToken(userId, mkt);

      for (const order of await listOpenOrders(ebayToken, mkt)) {
        try {
          await handleNewPrintfulOrder(userId, mkt, order, ebayToken, auth, report);
        } catch (e) {
          report.errors.push(`Commande ${order.orderId} : ${safeMsg(e)}`);
        }
      }

      const { data: pending } = await db.from("orders").select("id, ebay_order_id, printful_order_id, line_items").eq("user_id", userId).eq("market", mkt).eq("status", "ordered").not("printful_order_id", "is", null);
      for (const o of pending ?? []) {
        try {
          const status = await printfulOrderStatus(auth.token, o.printful_order_id!, auth.storeId);
          if (status.status !== "fulfilled" && status.status !== "shipped") continue;
          const shipments = await printfulShipments(auth.token, o.printful_order_id!, auth.storeId);
          const tracking = shipments.find((s) => s.trackingNumber);
          if (!tracking?.trackingNumber) continue;

          const { data: claimed } = await db.from("orders").update({ status: "tracking_sent", tracking_number: tracking.trackingNumber, tracking_carrier: tracking.carrier ?? null }).eq("id", o.id).eq("user_id", userId).eq("status", "ordered").select("id");
          if (!claimed?.length) continue;
          await sendTracking(ebayToken, mkt, { orderId: o.ebay_order_id, lineItems: (o.line_items as { lineItemId: string; quantity: number }[]) ?? [], trackingNumber: tracking.trackingNumber, carrier: tracking.carrier ?? "Other" });
          await audit({ userId, action: "order.tracking_sent", entity: "order", entityId: o.ebay_order_id, meta: { carrier: tracking.carrier ?? "Other", supplier: "printful" } });
          report.tracked++;
        } catch (e) {
          report.errors.push(`Suivi ${o.ebay_order_id} : ${safeMsg(e)}`);
        }
      }
    } catch (e) {
      report.errors.push(`${mkt.toUpperCase()} : ${safeMsg(e)}`);
    }
  }
  return report;
}

async function handleNewPrintfulOrder(userId: string, market: CountryCode, order: EbayOrder, ebayToken: string, auth: Awaited<ReturnType<typeof getPrintfulAuth>>, report: PrintfulOrdersReport) {
  const db = supabaseAdmin();
  const { data: known } = await db.from("orders").select("id").eq("user_id", userId).eq("ebay_order_id", order.orderId).maybeSingle();
  if (known) return; // pas de rejeu automatique ici (contrairement à CJ) : à revoir si des échecs Printful réels surviennent

  const skus = order.lineItems.map((l) => l.sku).filter((s): s is string => Boolean(s));
  if (!skus.length) return;
  const { data: rows } = await db.from("listings").select("id, sku, products!inner(printful_variant_id, design_url)").eq("user_id", userId).in("sku", skus);
  const printfulRows = ((rows ?? []) as unknown as ListingRow[]).filter((l) => l.products.printful_variant_id !== null);
  if (!printfulRows.length) return; // vente CJ ou hors DropFlow : pas notre rayon

  if (!order.shipTo?.address || !order.shipTo.countryCode) {
    await db.from("orders").insert({ user_id: userId, market, ebay_order_id: order.orderId, buyer_username: order.buyer ?? null, total: Number(order.total.value), currency: order.total.currency, line_items: order.lineItems.map((l) => ({ lineItemId: l.lineItemId, quantity: l.quantity })), status: "blocked", error: "Adresse de livraison incomplète." });
    await audit({ userId, action: "order.blocked", entity: "order", entityId: order.orderId, meta: { reason: "Adresse incomplète", supplier: "printful" } });
    report.errors.push(`Commande ${order.orderId} bloquée : adresse incomplète.`);
    return;
  }

  const line = order.lineItems.find((l) => l.sku === printfulRows[0].sku)!;
  const designUrl = printfulRows[0].products.design_url;
  if (!designUrl) {
    await db.from("orders").insert({ user_id: userId, market, ebay_order_id: order.orderId, buyer_username: order.buyer ?? null, total: Number(order.total.value), currency: order.total.currency, line_items: order.lineItems.map((l) => ({ lineItemId: l.lineItemId, quantity: l.quantity })), status: "blocked", error: "Visuel du produit introuvable." });
    await audit({ userId, action: "order.blocked", entity: "order", entityId: order.orderId, meta: { reason: "Visuel manquant", supplier: "printful" } });
    report.errors.push(`Commande ${order.orderId} bloquée : visuel introuvable.`);
    return;
  }

  try {
    const printfulOrderId = await createPrintfulOrder(auth, {
      externalId: order.orderId,
      ship: { name: order.shipTo.name, address1: order.shipTo.address, address2: order.shipTo.address2, city: order.shipTo.city, stateCode: order.shipTo.province, countryCode: order.shipTo.countryCode, zip: order.shipTo.zip ?? "", phone: order.shipTo.phone, email: order.shipTo.email },
      catalogVariantId: printfulRows[0].products.printful_variant_id!,
      designUrl,
      quantity: line.quantity,
    });
    await confirmPrintfulOrder(auth, printfulOrderId);
    await db.from("orders").insert({ user_id: userId, market, ebay_order_id: order.orderId, listing_id: printfulRows[0].id, buyer_username: order.buyer ?? null, total: Number(order.total.value), currency: order.total.currency, line_items: order.lineItems.map((l) => ({ lineItemId: l.lineItemId, quantity: l.quantity })), status: "ordered", printful_order_id: printfulOrderId });
    await audit({ userId, action: "order.created", entity: "order", entityId: order.orderId, meta: { printfulOrderId, market, supplier: "printful" } });
    report.created++;
  } catch (e) {
    await db.from("orders").insert({ user_id: userId, market, ebay_order_id: order.orderId, buyer_username: order.buyer ?? null, total: Number(order.total.value), currency: order.total.currency, line_items: order.lineItems.map((l) => ({ lineItemId: l.lineItemId, quantity: l.quantity })), status: "error", error: safeMsg(e) });
    await audit({ userId, action: "order.error", entity: "order", entityId: order.orderId, meta: { reason: safeMsg(e).slice(0, 120), supplier: "printful" } });
    throw new PublicError(safeMsg(e));
  }
}
