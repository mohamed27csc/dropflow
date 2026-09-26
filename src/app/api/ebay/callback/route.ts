import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyState } from "@/lib/oauth-state";
import type { CountryCode } from "@/lib/settings";
import { audit } from "@/server/audit";
import { requireUser } from "@/server/auth";
import { deriveKey } from "@/server/crypto";
import { saveEbayAccount } from "@/server/ebay";
import { safeMsg } from "@/server/http";
import { clientIp, rateLimit } from "@/server/ratelimit";

const q = z.object({ code: z.string().max(4096).optional(), state: z.string().max(200).optional(), error: z.string().max(200).optional() });

/**
 * Retour d'eBay (Accept URL du RuName : https://<domaine>/api/ebay/callback).
 * Validation stricte : utilisateur connecté, état signé valide/non expiré/lié à CE compte, même nonce. Le cookie est à usage unique.
 * Le redirect URI est fixé par le RuName enregistré chez eBay : eBay refuse toute autre valeur.
 */
export async function GET(req: Request) {
  const back = (qs: string) => {
    const res = NextResponse.redirect(new URL(`/parametres?${qs}#connexions`, req.url));
    res.cookies.set("ebay_oauth", "", { maxAge: 0, path: "/api/ebay/callback" });
    return res;
  };
  try {
    const rl = await rateLimit(`ebay-callback:${clientIp(req)}`, 20, 600);
    if (!rl.ok) return back("ebay=error&msg=" + encodeURIComponent("Trop de tentatives."));
    const { user } = await requireUser();

    const p = q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!p.success) return back("ebay=error&msg=" + encodeURIComponent("Réponse eBay invalide."));
    if (p.data.error) return back("ebay=error&msg=" + encodeURIComponent("Connexion refusée sur eBay."));

    const cookie = req.headers.get("cookie")?.split("; ").find((c) => c.startsWith("ebay_oauth="))?.slice("ebay_oauth=".length);
    const st = verifyState(cookie, p.data.state ?? null, user.id, deriveKey("oauth-state"));
    if (!st || !p.data.code || !["fr", "de", "uk"].includes(st.market)) return back("ebay=error&msg=" + encodeURIComponent("Session OAuth invalide, recommencez."));

    await saveEbayAccount(user.id, st.market as CountryCode, p.data.code);
    await audit({ userId: user.id, action: "ebay.connected", meta: { market: st.market }, req });
    return back(`ebay=ok&market=${st.market}`);
  } catch (e) {
    return back("ebay=error&msg=" + encodeURIComponent(safeMsg(e)));
  }
}
