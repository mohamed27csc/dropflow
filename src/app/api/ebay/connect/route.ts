import { NextResponse } from "next/server";
import { marketInput } from "@/lib/schemas";
import { createState } from "@/lib/oauth-state";
import { authorizeUrl } from "@/server/ebay";
import { deriveKey } from "@/server/crypto";
import { safeMsg } from "@/server/http";
import { secured } from "@/server/route";

/** Démarre l'OAuth eBay officiel. État signé (HMAC), lié à l'utilisateur et au marché, usage unique, 10 min. */
export const GET = secured({ name: "ebay-connect", schema: marketInput.pick({ market: true }).strict(), source: "query", user: [10, 600] }, async ({ user, input, req }) => {
  try {
    const { nonce, cookie } = createState(user.id, input.market, deriveKey("oauth-state"));
    const res = NextResponse.redirect(authorizeUrl(nonce));
    res.cookies.set("ebay_oauth", cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/ebay/callback" });
    return res;
  } catch (e) {
    return NextResponse.redirect(new URL(`/parametres?ebay=error&msg=${encodeURIComponent(safeMsg(e))}`, req.url));
  }
});
