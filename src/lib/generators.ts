/**
 * Générateurs de démo : simples gabarits, sans IA.
 * Étape « branchement » : remplacés par un appel serveur à l'API Claude (clé côté serveur),
 * en gardant la même signature et la contrainte de 80 caractères.
 */

export const EBAY_TITLE_MAX = 80;

const SUFFIX = { fr: "Neuf", de: "Neu", en: "New" } as const;
export type Lang = keyof typeof SUFFIX;

/** Assemble des morceaux sans doublons de mots, en s'arrêtant avant 80 caractères. */
export function fitTitle(parts: string[], max = EBAY_TITLE_MAX): string {
  const seen = new Set<string>();
  const out: string[] = [];
  let len = 0;
  for (const part of parts) {
    for (const word of part.split(/\s+/).filter(Boolean)) {
      const key = word.toLowerCase();
      if (seen.has(key)) continue;
      const next = len + (out.length ? 1 : 0) + word.length;
      if (next > max) {
        // Le tout premier mot dépasse déjà la limite à lui seul (mot composé allemand, URL…) : on le tronque plutôt
        // que de renvoyer un titre vide, qu'eBay refuserait (le titre est un champ obligatoire).
        if (out.length === 0) return word.slice(0, max);
        return out.join(" ");
      }
      seen.add(key);
      out.push(word);
      len = next;
    }
  }
  return out.join(" ");
}

export function buildTitles(input: { product: string; keywords: string[]; brand?: string; lang: Lang }): string[] {
  const { product, keywords, brand, lang } = input;
  const suffix = SUFFIX[lang];
  const k = keywords.filter(Boolean);
  const variants = [
    fitTitle([brand ?? "", product, ...k, suffix]),
    fitTitle([...k.slice(0, 2), product, brand ?? "", ...k.slice(2), suffix]),
    fitTitle([product, ...k.slice().reverse(), brand ?? ""]),
  ];
  return [...new Set(variants.map((v) => v.trim()).filter(Boolean))];
}

export type Tone = "pro" | "warm" | "short";

const COPY: Record<Lang, { highlights: string; shipping: string; shippingBody: string; returns: string; returnsBody: string }> = {
  fr: {
    highlights: "Points forts",
    shipping: "Livraison",
    shippingBody: "Expédié depuis l'entrepôt de notre fournisseur. Délai indicatif : à compléter selon votre configuration.",
    returns: "Retours",
    returnsBody: "Retours acceptés selon la politique de la boutique.",
  },
  de: {
    highlights: "Highlights",
    shipping: "Versand",
    shippingBody: "Versand aus dem Lager unseres Lieferanten. Voraussichtliche Lieferzeit: bitte anpassen.",
    returns: "Rückgabe",
    returnsBody: "Rückgabe gemäß den Richtlinien des Shops.",
  },
  en: {
    highlights: "Highlights",
    shipping: "Shipping",
    shippingBody: "Shipped from our supplier's warehouse. Estimated delivery time: please adjust to your setup.",
    returns: "Returns",
    returnsBody: "Returns accepted according to the shop policy.",
  },
};

const INTRO: Record<Tone, Record<Lang, (p: string) => string>> = {
  pro: {
    fr: (p) => `${p} : un produit neuf, conçu pour un usage quotidien fiable.`,
    de: (p) => `${p}: ein neues Produkt für zuverlässigen Alltagsgebrauch.`,
    en: (p) => `${p}: a brand-new product built for reliable everyday use.`,
  },
  warm: {
    fr: (p) => `Découvrez ${p} ! Pratique, simple à utiliser, il va vite devenir indispensable.`,
    de: (p) => `Entdecken Sie ${p}! Praktisch, einfach zu bedienen und bald unverzichtbar.`,
    en: (p) => `Meet ${p}! Handy, easy to use, and soon indispensable.`,
  },
  short: {
    fr: (p) => `${p}. Neuf.`,
    de: (p) => `${p}. Neu.`,
    en: (p) => `${p}. New.`,
  },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildDescription(input: { product: string; features: string[]; tone: Tone; lang: Lang }) {
  const { product, features, tone, lang } = input;
  const c = COPY[lang];
  const intro = INTRO[tone][lang](product);
  const bullets = tone === "short" ? features.slice(0, 3) : features;

  const text = [intro, "", bullets.length ? `${c.highlights}\n${bullets.map((f) => `• ${f}`).join("\n")}` : "", "", `${c.shipping}\n${c.shippingBody}`, "", `${c.returns}\n${c.returnsBody}`]
    .filter((l, i, a) => !(l === "" && (a[i - 1] === "" || i === 0)))
    .join("\n")
    .trim();

  const html = [
    `<h2>${esc(product)}</h2>`,
    `<p>${esc(intro)}</p>`,
    bullets.length ? `<h3>${c.highlights}</h3>\n<ul>\n${bullets.map((f) => `  <li>${esc(f)}</li>`).join("\n")}\n</ul>` : "",
    `<h3>${c.shipping}</h3>\n<p>${esc(c.shippingBody)}</p>`,
    `<h3>${c.returns}</h3>\n<p>${esc(c.returnsBody)}</p>`,
  ]
    .filter(Boolean)
    .join("\n");

  return { text, html };
}
