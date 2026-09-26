import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cronAllowed } from "@/server/auth";
import { fail, safeMsg } from "@/server/http";
import { getCjToken } from "@/server/cj";
import { snapshotTrends } from "@/server/trends";
import { syncUser } from "@/server/sync";
import { maybeSendTrendDigest } from "@/server/trend-digest";
import { autoPublishDaily } from "@/server/autopublish";
import { cleanupDeadStock } from "@/server/cleanup";
import { notify } from "@/server/notify";

export const maxDuration = 300;

/** Réservé au cron : en-tête `Authorization: Bearer <CRON_SECRET>` (comparé en temps constant). Aucune donnée détaillée en réponse. */
export async function GET(req: Request) {
  if (!cronAllowed(req))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const { data } = await supabaseAdmin()
      .from("cj_accounts")
      .select("user_id");
    let ok = 0;
    let failed = 0;
    for (const { user_id } of data ?? []) {
      try {
        await syncUser(user_id, "");
        ok++;
      } catch (e) {
        failed++;
        console.error("[cron-sync]", safeMsg(e));
      }
      // Rapport tendance tous les 5 jours (Vercel Hobby : 2 tâches planifiées max, donc greffé ici aussi).
      try {
        await maybeSendTrendDigest(user_id, "");
      } catch (e) {
        console.error("[cron-sync/digest]", safeMsg(e));
      }
      // Nettoyage du stock mort (aucune vente en 15 jours) avant de republier, pour laisser la place.
      try {
        await cleanupDeadStock(user_id);
      } catch (e) {
        console.error("[cron-sync/cleanup]", safeMsg(e));
      }
      // Publication automatique quotidienne (2 annonces/marché, tranche 0-30 €).
      try {
        const reports = await autoPublishDaily(user_id, "");
        const total = reports.reduce((s, r) => s + r.created, 0);
        if (total > 0) {
          const detail = reports.filter((r) => r.created > 0).map((r) => `${r.market.toUpperCase()} : ${r.created}`).join(" · ");
          await notify({ userId: user_id, type: "autopublish", title: `${total} nouvelle${total > 1 ? "s" : ""} annonce${total > 1 ? "s" : ""} publiée${total > 1 ? "s" : ""}`, body: detail, url: "/listings" });
        }
      } catch (e) {
        console.error("[cron-sync/autopublish]", safeMsg(e));
      }
    }
    // Relevé quotidien des tendances (Vercel Hobby : 2 tâches planifiées max, donc greffé sur celle-ci).
  let snapshots = 0;
  try {
    if (data?.[0]) snapshots = await snapshotTrends(await getCjToken(data[0].user_id));
  } catch (e) {
    console.error("[cron-sync/trends]", safeMsg(e));
  }
  return NextResponse.json({ users: ok + failed, ok, failed, snapshots });
  } catch (e) {
    return fail(e);
  }
}
