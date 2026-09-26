import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { emailAllowed } from "@/lib/access";
import { LIVE } from "@/lib/mode";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { PublicError } from "./http";

export const MAX_SESSION_DAYS = 14;

export type AuthOk = { user: User; supabase: SupabaseClient };

/**
 * Utilisateur authentifié, ou PublicError (401/403). Le jeton est validé auprès de Supabase (getUser), jamais lu tel quel.
 * Exige : email confirmé, et deuxième facteur validé sur la session si l'utilisateur en a activé un.
 */
export async function requireUser(opts: { mfa?: boolean } = {}): Promise<AuthOk> {
  if (!LIVE) throw new PublicError("Service indisponible en mode démo.", 503);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new PublicError("Non connecté.", 401);
  // Durée de vie absolue de la session : reconnexion obligatoire au-delà, même si le jeton se rafraîchit.
  const last = data.user.last_sign_in_at ? new Date(data.user.last_sign_in_at).getTime() : 0;
  if (Date.now() - last > MAX_SESSION_DAYS * 86_400_000) throw new PublicError("Session expirée, reconnectez-vous.", 401);
  if (!emailAllowed(data.user.email)) throw new PublicError("Accès refusé.", 403);
  if (!data.user.email_confirmed_at) throw new PublicError("Confirmez votre adresse email pour continuer.", 403);
  if (opts.mfa !== false) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") throw new PublicError("Vérification en deux étapes requise.", 403);
  }
  return { user: data.user, supabase };
}

/** Rôle lu en base côté serveur (jamais dans des métadonnées modifiables par l'utilisateur). */
export async function requireAdmin(): Promise<AuthOk> {
  const a = await requireUser();
  const { data } = await supabaseAdmin().from("profiles").select("role").eq("id", a.user.id).maybeSingle();
  if (data?.role !== "admin") throw new PublicError("Accès refusé.", 403);
  return a;
}

export async function isAdmin(userId: string) {
  const { data } = await supabaseAdmin().from("profiles").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin";
}

/** Secret cron comparé en temps constant, uniquement dans l'en-tête Authorization (les URLs finissent dans les logs). */
export function cronAllowed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
