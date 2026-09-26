import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cronAllowed } from "@/server/auth";
import { fail, safeMsg } from "@/server/http";
import { notify } from "@/server/notify";
import { processOrders } from "@/server/orders";
import { processPrintfulOrders } from "@/server/printful-orders";

export const maxDuration = 300;

/**
 * Réservé au cron (Bearer CRON_SECRET). L'idempotence est garantie par la réservation atomique des ventes
 * dans processOrders. Les messages acheteur ont leur propre cron horaire (/api/cron/messages) pour rester
 * réactifs sans dépendre de la fréquence quotidienne de celui-ci.
 */
export async function GET(req: Request) {
  if (!cronAllowed(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const [{ data: cjUsers }, { data: printfulUsers }] = await Promise.all([
      supabaseAdmin().from("cj_accounts").select("user_id"),
      supabaseAdmin().from("printful_accounts").select("user_id"),
    ]);
    const userIds = new Set([...(cjUsers ?? []).map((u) => u.user_id), ...(printfulUsers ?? []).map((u) => u.user_id)]);
    let ok = 0;
    let failed = 0;
    for (const user_id of userIds) {
      try {
        const report = await processOrders(user_id, "");
        const printfulReport = await processPrintfulOrders(user_id).catch((e) => {
          console.error("[cron-orders/printful]", safeMsg(e));
          return { created: 0, tracked: 0, errors: [] };
        });
        ok++;
        // Veille des transactions : on alerte seulement s'il y a un vrai problème (pas à chaque passage sans souci).
        const issues = report.blocked + report.errors.length + printfulReport.errors.length;
        if (issues > 0) {
          await notify({
            userId: user_id,
            type: "order_issue",
            title: `${issues} commande(s) à vérifier`,
            body: report.errors[0] ?? printfulReport.errors[0] ?? "Une ou plusieurs commandes bloquées : validation ou action nécessaire.",
            url: "/dashboard",
          }).catch(() => {});
        }
      } catch (e) {
        failed++;
        console.error("[cron-orders]", safeMsg(e));
      }
    }
    return NextResponse.json({ users: ok + failed, ok, failed });
  } catch (e) {
    return fail(e);
  }
}
