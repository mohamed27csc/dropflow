import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_SETTINGS, type CountryCode, type Settings, type Usage } from "@/lib/settings";
import { PLANS, type PlanId } from "@/lib/plans";
import type { MarginTier } from "@/lib/margin";

/** Champs modifiables depuis le navigateur. Le plan, les connexions et les quotas sont gérés côté serveur. */
export type SettingsPatch = Partial<Pick<Settings, "pricing" | "sync" | "autoOrder" | "fx" | "pseudo">>;

const today = () => new Date().toISOString().slice(0, 10);

type StoredUsage = Usage & { date?: string };
const emptyUsage = (): StoredUsage => ({ date: today(), sniperRuns: 0, analyses: 0, generations: 0 });

export async function loadSettings(userId: string, email: string): Promise<Settings> {
  const db = supabaseAdmin();
  const [{ data: s }, { data: p }, { data: rules }, { data: ebay }, { data: cj }, { data: printful }, { data: vinted }] = await Promise.all([
    db.from("settings").select("data, usage").eq("user_id", userId).maybeSingle(),
    db.from("profiles").select("pseudo, plan, role").eq("id", userId).maybeSingle(),
    db.from("margin_rules").select("up_to, margin_pct, position").eq("user_id", userId).order("position"),
    db.from("ebay_accounts").select("market, ebay_username").eq("user_id", userId),
    db.from("cj_accounts").select("key_hint").eq("user_id", userId).maybeSingle(),
    db.from("printful_accounts").select("key_hint").eq("user_id", userId).maybeSingle(),
    db.from("vinted_accounts").select("key_hint").eq("user_id", userId).maybeSingle(),
  ]);

  const data = (s?.data ?? {}) as SettingsPatch;
  const usage = (s?.usage ?? {}) as StoredUsage;
  const fresh = usage.date === today() ? usage : emptyUsage();
  const tiers: MarginTier[] | undefined = rules?.length ? rules.map((r) => ({ upTo: r.up_to === null ? null : Number(r.up_to), marginPct: Number(r.margin_pct) })) : undefined;

  const ebayState = { fr: { connected: false, shop: "" }, de: { connected: false, shop: "" }, uk: { connected: false, shop: "" } } as Settings["ebay"];
  for (const a of ebay ?? []) ebayState[a.market as CountryCode] = { connected: true, shop: a.ebay_username ?? "" };

  return {
    ...DEFAULT_SETTINGS,
    ...data,
    pricing: { ...DEFAULT_SETTINGS.pricing, ...data.pricing, tiers: tiers ?? data.pricing?.tiers ?? DEFAULT_SETTINGS.pricing.tiers },
    sync: { ...DEFAULT_SETTINGS.sync, ...data.sync },
    autoOrder: { ...DEFAULT_SETTINGS.autoOrder, ...data.autoOrder },
    fx: { ...DEFAULT_SETTINGS.fx, ...data.fx },
    pseudo: p?.pseudo ?? email.split("@")[0],
    email,
    plan: p?.role === "admin" ? "owner" : ((p?.plan as PlanId) ?? "free"),
    ebay: ebayState,
    cj: { connected: Boolean(cj), keyHint: cj?.key_hint ?? "" },
    printful: { connected: Boolean(printful), keyHint: printful?.key_hint ?? "" },
    vinted: { connected: Boolean(vinted), keyHint: vinted?.key_hint ?? "" },
    usage: { sniperRuns: fresh.sniperRuns, analyses: fresh.analyses, generations: fresh.generations },
  };
}

export async function saveSettings(userId: string, patch: SettingsPatch) {
  const db = supabaseAdmin();
  const { data: cur } = await db.from("settings").select("data").eq("user_id", userId).maybeSingle();
  const { pseudo, ...rest } = patch;
  const merged = { ...((cur?.data as object) ?? {}), ...rest };
  if (merged && "pricing" in merged) {
    const pricing = { ...(merged as { pricing: Settings["pricing"] }).pricing };
    const tiers = pricing.tiers;
    (merged as { pricing: unknown }).pricing = { ...pricing, tiers: undefined }; // les paliers vivent dans margin_rules
    await db.from("margin_rules").delete().eq("user_id", userId);
    if (tiers?.length) {
      await db.from("margin_rules").insert(tiers.map((t, i) => ({ user_id: userId, position: i, up_to: t.upTo, margin_pct: t.marginPct })));
    }
  }
  await db.from("settings").upsert({ user_id: userId, data: merged, updated_at: new Date().toISOString() });
  if (pseudo && pseudo.trim().length >= 2) await db.from("profiles").update({ pseudo: pseudo.trim().slice(0, 30) }).eq("id", userId);
}

/** Décompte un quota journalier côté serveur. `ok:false` = limite atteinte. */
export async function consumeQuota(userId: string, plan: PlanId, kind: keyof Usage, amount = 1) {
  const db = supabaseAdmin();
  const { data } = await db.from("settings").select("usage").eq("user_id", userId).maybeSingle();
  const stored = (data?.usage ?? {}) as StoredUsage;
  const usage = stored.date === today() ? stored : emptyUsage();
  const limit = PLANS[plan].quotas[kind];
  if (usage[kind] + amount > limit) return { ok: false as const, usage, limit };
  usage[kind] += amount;
  await db.from("settings").upsert({ user_id: userId, usage, updated_at: new Date().toISOString() });
  return { ok: true as const, usage, limit };
}
