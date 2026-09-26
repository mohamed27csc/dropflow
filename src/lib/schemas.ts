import { z } from "zod";

/** Validation de toutes les entrées (body / query). `.strict()` rejette les champs inconnus (anti mass-assignment). */

export const market = z.enum(["fr", "de", "uk"]);
const lang = z.enum(["fr", "de", "en"]).default("fr");
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const authSchemas = {
  login: z.object({ email: emailSchema, password: z.string().min(1).max(128), captchaToken: z.string().max(4096).optional() }).strict(),
  reset: z.object({ email: emailSchema, captchaToken: z.string().max(4096).optional() }).strict(),
  newPassword: z.object({ password: z.string().min(1).max(128) }).strict(),
  mfaVerify: z.object({ factorId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).strict(),
  mfaFactor: z.object({ factorId: z.string().uuid() }).strict(),
};

const tier = z.object({ upTo: z.number().min(0).max(100_000).nullable(), marginPct: z.number().min(0).max(1000) }).strict();

export const settingsPatch = z
  .object({
    pseudo: text(2, 30).optional(),
    pricing: z
      .object({
        tiers: z.array(tier).min(1).max(10),
        ebayFeePct: z.number().min(0).max(50),
        fixedFee: z.number().min(0).max(50),
        alertThresholdPct: z.number().min(0).max(1000),
        autoAdjust: z.boolean(),
        adRatePct: z.number().min(0).max(100),
      })
      .strict()
      .optional(),
    sync: z
      .object({ everyHours: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12), z.literal(24)]), syncPrices: z.boolean(), syncStock: z.boolean(), autoPause: z.boolean() })
      .strict()
      .optional(),
    autoOrder: z
      .object({
        enabled: z.boolean(),
        maxPerDay: z.number().int().min(1).max(1000),
        maxDailySpend: z.number().min(1).max(100_000),
        approveAbove: z.number().min(0).max(100_000),
        mode: z.enum(["api", "manual"]),
        notifyOrder: z.boolean(),
        notifyError: z.boolean(),
      })
      .strict()
      .optional(),
    fx: z.object({ usdEur: z.number().min(0.1).max(5), eurGbp: z.number().min(0.1).max(5) }).strict().optional(),
  })
  .strict();

export const sniperInput = z
  .object({
    count: z.number().int().min(1).max(100),
    targetMargin: z.number().min(0).max(1000).default(0),
    market,
    sort: z.enum(["popularity", "sales", "new"]).default("popularity"),
    categories: z.array(text(1, 40)).max(8).default([]),
    /** Tranche de prix eBay ESTIMÉE (hors livraison) visée pour les produits publiés. */
    priceTier: z.enum(["all", "low", "mid", "high"]).default("all"),
  })
  .strict();

export const listingAddInput = z.object({ link: text(3, 500), market }).strict();
export const cjConnectInput = z.object({ apiKey: text(8, 200) }).strict();
export const vintedConnectInput = z.object({ apiKey: text(8, 400) }).strict();
export const printfulConnectInput = z.object({ apiToken: text(8, 300) }).strict();

export const printfulPublishInput = z
  .object({
    market,
    catalogProductName: text(2, 200),
    catalogVariantId: z.number().int().positive(),
    designPrompt: text(3, 500),
    retailPrice: z.number().min(1).max(10_000),
  })
  .strict();
export const marketInput = z.object({ market }).strict();
export const accountDeleteInput = z.object({ confirm: z.literal("SUPPRIMER") }).strict();
export const adminPlanInput = z.object({ userId: z.string().uuid(), plan: z.enum(["free", "pro"]) }).strict();

export const analyticsInput = z.object({ keyword: text(2, 100), market: market.default("fr"), exclude: z.string().trim().max(200).default("") }).strict();

export const notificationsReadInput = z.object({ ids: z.array(z.string().uuid()).min(1).max(100).optional(), all: z.boolean().optional() }).strict();

export const pushSubscribeInput = z
  .object({ endpoint: z.string().url().max(500), keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }).strict() })
  .strict();
export const pushUnsubscribeInput = z.object({ endpoint: z.string().url().max(500) }).strict();

export const messageReplyInput = z.object({ id: z.string().uuid(), text: text(1, 2000) }).strict();

export const generateInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("title"), product: text(2, 200), keywords: z.array(text(1, 60)).max(12).default([]), brand: z.string().trim().max(40).optional(), lang }).strict(),
  z.object({ kind: z.literal("description"), product: text(2, 200), features: z.array(text(1, 300)).max(20).default([]), tone: z.enum(["pro", "warm", "short"]).default("pro"), lang }).strict(),
  z.object({ kind: z.literal("vinted"), product: text(2, 200), details: z.string().trim().max(600).default(""), condition: z.enum(["new_tag", "new", "very_good", "good", "fair"]).default("very_good"), lang }).strict(),
]);
