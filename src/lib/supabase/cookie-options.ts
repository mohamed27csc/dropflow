import type { CookieOptions } from "@supabase/ssr";

/**
 * Cookies de session : httpOnly (illisibles par JavaScript, donc par une XSS), Secure, SameSite=Lax.
 * Conséquence voulue : le navigateur n'utilise jamais Supabase directement, tout passe par nos routes /api/auth/*.
 */
export function hardenCookie(options: CookieOptions = {}): CookieOptions {
  return { ...options, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" };
}
