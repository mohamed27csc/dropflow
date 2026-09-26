import "server-only";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodType, z } from "zod";
import { requireAdmin, requireUser } from "./auth";
import { fail, json, parseBody, parseQuery, PublicError } from "./http";
import { clientIp, rateLimit } from "./ratelimit";

type Opts<S extends ZodType | undefined> = {
  /** Nom stable de la route (clé des compteurs). */
  name: string;
  schema?: S;
  source?: "body" | "query";
  /** [requêtes, fenêtre en secondes] par utilisateur. Défaut : 60 / 60 s. */
  user?: [number, number];
  /** Par IP, avant même l'authentification. Défaut : 120 / 60 s. */
  ip?: [number, number];
  admin?: boolean;
  /** false pour les routes du flux MFA lui-même (vérifier / gérer le 2e facteur). */
  mfa?: boolean;
};

type Ctx<S extends ZodType | undefined> = { req: Request; user: User; supabase: SupabaseClient; ip: string; input: S extends ZodType ? z.output<S> : undefined };

/**
 * Enveloppe commune de toutes les routes utilisateur :
 * limite par IP → authentification (+ email confirmé + MFA) → [admin] → limite par utilisateur → validation Zod → handler → erreurs génériques.
 * Le handler ne reçoit que des données validées et l'identité vérifiée : il ne doit jamais lire un user id ailleurs.
 */
export function secured<S extends ZodType | undefined = undefined>(opts: Opts<S>, handler: (c: Ctx<S>) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    try {
      const ip = clientIp(req);
      const [ipLimit, ipWin] = opts.ip ?? [120, 60];
      const ipRl = await rateLimit(`ip:${opts.name}:${ip}`, ipLimit, ipWin);
      if (!ipRl.ok) return json({ error: "Trop de requêtes. Réessayez plus tard." }, 429, { "Retry-After": String(ipRl.retryAfter) });

      const { user, supabase } = opts.admin ? await requireAdmin() : await requireUser({ mfa: opts.mfa });

      const [uLimit, uWin] = opts.user ?? [60, 60];
      const rl = await rateLimit(`u:${opts.name}:${user.id}`, uLimit, uWin);
      if (!rl.ok) return json({ error: "Trop de requêtes. Réessayez plus tard." }, 429, { "Retry-After": String(rl.retryAfter) });

      const input = opts.schema ? (opts.source === "query" ? parseQuery(req, opts.schema) : await parseBody(req, opts.schema)) : undefined;
      const out = await handler({ req, user, supabase, ip, input: input as Ctx<S>["input"] });
      return out instanceof Response ? out : json(out ?? { ok: true });
    } catch (e) {
      return fail(e);
    }
  };
}

export { PublicError };
