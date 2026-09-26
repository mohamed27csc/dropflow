import { NextResponse } from "next/server";
import { z } from "zod";
import { safeNext } from "@/lib/origin";
import { supabaseServer } from "@/lib/supabase/server";
import { siteUrl } from "@/server/auth-flow";

const q = z.object({ code: z.string().max(2048).optional(), token_hash: z.string().max(2048).optional(), type: z.enum(["signup", "recovery", "email", "magiclink"]).optional(), next: z.string().max(200).optional() });

/** Retour des emails Supabase (confirmation, réinitialisation). `next` limité aux chemins internes (anti open-redirect). */
export async function GET(req: Request) {
  const p = q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  const base = siteUrl(req);
  if (!p.success) return NextResponse.redirect(`${base}/login?error=link`);
  const supabase = await supabaseServer();
  let ok = false;
  if (p.data.code) ok = !(await supabase.auth.exchangeCodeForSession(p.data.code)).error;
  else if (p.data.token_hash && p.data.type) ok = !(await supabase.auth.verifyOtp({ token_hash: p.data.token_hash, type: p.data.type })).error;
  return NextResponse.redirect(ok ? `${base}${safeNext(p.data.next)}` : `${base}/login?error=link`);
}
