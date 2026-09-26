import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { emailAllowed } from "@/lib/access";
import { originAllowed } from "@/lib/origin";
import { hardenCookie } from "@/lib/supabase/cookie-options";

/**
 * Point d'entrée de sécurité de toutes les requêtes :
 * 1. CSRF : toute requête d'écriture vers /api doit venir de notre origine (Origin / Sec-Fetch-Site).
 * 2. CSP stricte à nonce, générée à chaque requête.
 * 3. Rafraîchissement de la session Supabase avec cookies httpOnly/Secure/SameSite=Lax.
 * 4. Accès : tout est privé sauf la liste blanche ci-dessous.
 */

const MAX_SESSION_DAYS = 14;
const PUBLIC_PAGES = new Set(["/login", "/confidentialite", "/robots.txt"]);
const PUBLIC_API = ["/api/auth/login", "/api/auth/reset"];
/** Authentifiés autrement que par cookie (secret cron, signature eBay) : hors contrôle d'origine. */
const NON_COOKIE_API = ["/api/cron/", "/api/webhooks/"];

function csp(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  const turnstile = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? " https://challenges.cloudflare.com" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}${turnstile}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'", // attributs style="" générés par React (tailles, dégradés) ; aucun <style> inline non signé
    "img-src 'self' data: blob: https:", // photos produits CJ hébergées sur plusieurs domaines HTTPS
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    `frame-src ${turnstile ? "https://challenges.cloudflare.com" : "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");

  // 1) CSRF
  if (isApi && !NON_COOKIE_API.some((p) => path.startsWith(p))) {
    const ok = originAllowed({
      method: request.method,
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      secFetchSite: request.headers.get("sec-fetch-site"),
      extraOrigins: process.env.NEXT_PUBLIC_SITE_URL ? [new URL(process.env.NEXT_PUBLIC_SITE_URL).origin] : [],
    });
    if (!ok) return NextResponse.json({ error: "Origine refusée." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  // 2) CSP + nonce
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = csp(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const make = () => {
    const r = NextResponse.next({ request: { headers } });
    r.headers.set("Content-Security-Policy", policy);
    return r;
  };
  let response = make();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response; // mode démo

  // 3) Session
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = make();
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, hardenCookie(options)));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  let user = data.user;
  if (user && user.last_sign_in_at && Date.now() - new Date(user.last_sign_in_at).getTime() > MAX_SESSION_DAYS * 86_400_000) {
    await supabase.auth.signOut(); // durée de vie absolue dépassée
    user = null;
  }

  if (user && !emailAllowed(user.email)) {
    await supabase.auth.signOut(); // mode privé : compte non autorisé
    user = null;
  }

  // 4) Accès
  const isPublic = PUBLIC_PAGES.has(path) || path.startsWith("/auth/") || PUBLIC_API.includes(path) || NON_COOKIE_API.some((p) => path.startsWith(p));
  if (!user && !isPublic) {
    if (isApi) return NextResponse.json({ error: "Non connecté" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  if (user && path === "/login") return NextResponse.redirect(new URL("/dashboard", request.url));
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
