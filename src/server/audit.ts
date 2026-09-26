import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { clientIp } from "./ratelimit";

/**
 * Journal d'audit append-only (qui, quoi, quand, d'où). Ne bloque jamais l'action, ne contient jamais de secret :
 * `meta` ne reçoit que des valeurs simples (id, montants, marché, ancien/nouveau prix).
 */
export type AuditAction =
  | "auth.signup" | "auth.login.success" | "auth.login.failure" | "auth.login.locked" | "auth.logout"
  | "auth.password.reset_requested" | "auth.password.changed" | "auth.mfa.enrolled" | "auth.mfa.verified" | "auth.mfa.removed"
  | "ebay.connected" | "ebay.disconnected" | "cj.connected" | "cj.disconnected" | "printful.connected" | "printful.disconnected" | "vinted.connected" | "vinted.disconnected"
  | "listing.created" | "listing.price_changed" | "listing.paused" | "listing.resumed" | "listing.price_rejected" | "listing.ended"
  | "order.created" | "order.awaiting_payment" | "order.blocked" | "order.error" | "order.tracking_sent"
  | "message.auto_replied" | "message.escalated" | "message.manual_replied"
  | "settings.updated" | "account.exported" | "account.deleted" | "admin.plan_changed" | "webhook.ebay.account_deletion";

type Meta = Record<string, string | number | boolean | null>;

export async function audit(a: { userId: string | null; action: AuditAction; entity?: string; entityId?: string; meta?: Meta; req?: Request }): Promise<void> {
  try {
    await supabaseAdmin().from("audit_log").insert({
      user_id: a.userId,
      action: a.action,
      entity: a.entity ?? null,
      entity_id: a.entityId?.slice(0, 100) ?? null,
      meta: a.meta ?? {},
      ip: a.req ? clientIp(a.req) : null,
      user_agent: a.req?.headers.get("user-agent")?.slice(0, 200) ?? null,
    });
  } catch {
    console.error("[audit] écriture impossible pour", a.action);
  }
}

export async function auditMany(rows: { userId: string; action: AuditAction; entity?: string; entityId?: string; meta?: Meta }[]) {
  if (!rows.length) return;
  try {
    await supabaseAdmin().from("audit_log").insert(rows.map((a) => ({ user_id: a.userId, action: a.action, entity: a.entity ?? null, entity_id: a.entityId ?? null, meta: a.meta ?? {} })));
  } catch {
    console.error("[audit] écriture groupée impossible");
  }
}
