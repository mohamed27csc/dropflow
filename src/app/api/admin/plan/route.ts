import { adminPlanInput } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { PublicError } from "@/server/http";
import { secured } from "@/server/route";

/** Change le plan d'un utilisateur. Réservé au rôle « admin » lu en base (jamais côté client). En attendant Stripe. */
export const POST = secured({ name: "admin-plan", schema: adminPlanInput, admin: true, user: [20, 600] }, async ({ user, input, req }) => {
  const { data, error } = await supabaseAdmin().from("profiles").update({ plan: input.plan }).eq("id", input.userId).select("id");
  if (error) throw new PublicError("Mise à jour impossible.", 500);
  if (!data?.length) throw new PublicError("Utilisateur introuvable.", 404);
  await audit({ userId: user.id, action: "admin.plan_changed", entity: "user", entityId: input.userId, meta: { plan: input.plan }, req });
  return { ok: true };
});
