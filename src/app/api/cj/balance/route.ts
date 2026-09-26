import { cjBalance, getCjToken } from "@/server/cj";
import { secured } from "@/server/route";

const cache = new Map<string, { at: number; body: unknown }>();

/** Solde CJ, avec un petit cache (30 s) pour éviter de solliciter CJ à chaque ouverture de la page. */
export const GET = secured({ name: "cj-balance", user: [15, 60] }, async ({ user }) => {
  const hit = cache.get(user.id);
  if (hit && Date.now() - hit.at < 30_000) return hit.body;
  const token = await getCjToken(user.id);
  const body = await cjBalance(token);
  cache.set(user.id, { at: Date.now(), body });
  return body;
});
