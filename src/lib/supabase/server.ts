import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { hardenCookie } from "./cookie-options";

/** Client lié à la session de l'utilisateur (cookies). Respecte la RLS. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, hardenCookie(options)));
        } catch {
          /* appelé depuis un Server Component : le proxy rafraîchit déjà la session */
        }
      },
    },
  });
}

/** Client service-role : contourne la RLS. Réservé au serveur (tokens chiffrés, cron). */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante côté serveur");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
