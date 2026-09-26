import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cronAllowed } from "@/server/auth";
import { getCjToken } from "@/server/cj";
import { fail, safeMsg } from "@/server/http";
import { snapshotTrends } from "@/server/trends";

export const maxDuration = 300;

/** Relevé nocturne des tendances CJ (Bearer CRON_SECRET). Un seul jeton CJ suffit : les données de marché sont communes. */
export async function GET(req: Request) {
  if (!cronAllowed(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const { data } = await supabaseAdmin().from("cj_accounts").select("user_id").limit(1).maybeSingle();
    if (!data) return NextResponse.json({ ok: true, snapshots: 0 });
    try {
      return NextResponse.json({ ok: true, snapshots: await snapshotTrends(await getCjToken(data.user_id)) });
    } catch (e) {
      console.error("[cron-trends]", safeMsg(e));
      return NextResponse.json({ ok: false, error: "relevé impossible" }, { status: 500 });
    }
  } catch (e) {
    return fail(e);
  }
}
