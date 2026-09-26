import "server-only";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { buildRequiredAspectsMap, type RequiredAspect } from "@/lib/aspects";
import { buildDescription, buildTitles, EBAY_TITLE_MAX, fitTitle, type Lang, type Tone } from "@/lib/generators";

const LANG_NAME: Record<Lang, string> = { fr: "français", de: "allemand", en: "anglais britannique" };

const RULES =
  "Règles : n'utilise QUE les faits fournis, n'invente aucune caractéristique, aucune marque, aucune certification, aucune promesse de délai ni de santé. Pas d'emoji, pas de MAJUSCULES abusives.";

export const AI_ENABLED = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** Appel Claude ; renvoie null si aucune clé n'est configurée. */
async function claude(system: string, user: string, maxTokens = 1200): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  return json.content?.find((c) => c.type === "text")?.text ?? null;
}

function parseJson<T>(text: string | null): T | null {
  const m = text?.match(/[\[{][\s\S]*[\]}]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function aiTitles(i: { product: string; keywords: string[]; brand?: string; lang: Lang }): Promise<{ titles: string[]; ai: boolean }> {
  const out = await claude(
    `Tu écris des titres d'annonces eBay en ${LANG_NAME[i.lang]}. Chaque titre fait ${EBAY_TITLE_MAX} caractères MAX, avec les mots-clés les plus recherchés en premier. ${RULES} Réponds uniquement par un tableau JSON de 3 chaînes.`,
    `Produit : ${i.product}\nMots-clés : ${i.keywords.join(", ")}\nMarque : ${i.brand || "aucune"}`,
    400,
  ).catch(() => null);
  // Le modèle ne respecte pas toujours strictement la consigne « tableau JSON » : tableau nu, { "titles": [...] },
  // ou objet à clés arbitraires ({ "titre1": "...", "titre2": "..." }) sont tous acceptés.
  const parsed = parseJson<unknown>(out);
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { titles?: unknown })?.titles)
      ? (parsed as { titles: unknown[] }).titles
      : parsed && typeof parsed === "object"
        ? Object.values(parsed)
        : [];
  const titles = arr.filter((t): t is string => typeof t === "string").map((t) => fitTitle([t.trim()])).filter(Boolean);
  return titles.length ? { titles: titles.slice(0, 3), ai: true } : { titles: buildTitles(i), ai: false };
}

export async function aiDescription(i: { product: string; features: string[]; tone: Tone; lang: Lang }): Promise<{ text: string; html: string; ai: boolean }> {
  const out = await claude(
    `Tu rédiges des descriptions d'annonces eBay en ${LANG_NAME[i.lang]}, ton ${i.tone === "pro" ? "professionnel" : i.tone === "warm" ? "chaleureux" : "concis"}. ${RULES} Réponds uniquement par du HTML simple (h2, p, ul, li), sans balise script ni style. Ajoute une section livraison en précisant que le délai dépend de l'entrepôt fournisseur sans donner de chiffre.`,
    `Produit : ${i.product}\nCaractéristiques :\n${i.features.map((f) => `- ${f}`).join("\n") || "(aucune fournie)"}`,
  ).catch(() => null);
  if (out && /<(p|ul|h2)\b/i.test(out)) {
    const html = out.replace(/<\s*(script|style)[\s\S]*?<\/\s*\1\s*>/gi, "").trim();
    return { html, text: html.replace(/<\/(p|h\d|li)>/gi, "\n").replace(/<[^>]+>/g, "").trim(), ai: true };
  }
  return { ...buildDescription(i), ai: false };
}

const VINTED_CONDITION: Record<string, Record<Lang, string>> = {
  new_tag: { fr: "Neuf avec étiquette", de: "Neu mit Etikett", en: "New with tags" },
  new: { fr: "Neuf sans étiquette", de: "Neu ohne Etikett", en: "New without tags" },
  very_good: { fr: "Très bon état", de: "Sehr guter Zustand", en: "Very good condition" },
  good: { fr: "Bon état", de: "Guter Zustand", en: "Good condition" },
  fair: { fr: "État correct", de: "Zufriedenstellend", en: "Fair condition" },
};

/**
 * Annonce au format Vinted (titre court, description naturelle, mots-clés) pour un article que le vendeur possède.
 * Assistant manuel : rien n'est envoyé à Vinted, l'utilisateur copie et publie lui-même.
 */
export async function aiVintedListing(i: { product: string; details: string; condition: string; lang: Lang }): Promise<{ title: string; description: string; keywords: string[]; ai: boolean }> {
  const cond = VINTED_CONDITION[i.condition]?.[i.lang] ?? i.condition;
  const out = await claude(
    `Tu rédiges des annonces Vinted en ${LANG_NAME[i.lang]}, ton naturel et sincère de particulier (pas de jargon marketing). Titre : 60 caractères max, marque/type/taille en premier. Description : 3 à 6 courtes lignes (état réel, taille, mesures si fournies, défauts éventuels, envoi soigné). ${RULES} N'invente aucune marque, taille, mesure ni défaut : utilise uniquement les informations données. Réponds uniquement par un objet JSON : {"title": string, "description": string, "keywords": string[]} avec 5 à 8 mots-clés de recherche.`,
    `Article : ${i.product}\nÉtat : ${cond}\nDétails fournis : ${i.details || "(aucun)"}`,
    600,
  ).catch(() => null);
  const j = parseJson<{ title?: string; description?: string; keywords?: string[] }>(out);
  if (j?.title && j.description) {
    return { title: fitTitle([j.title], 60), description: j.description.trim(), keywords: (j.keywords ?? []).filter((k) => typeof k === "string").slice(0, 8), ai: true };
  }
  return { title: fitTitle([i.product, cond], 60), description: [i.product, `${cond}.`, i.details].filter(Boolean).join("\n"), keywords: [], ai: false };
}

/**
 * Réponse courte à une question acheteur (avant-vente ou suivi). Prompt volontairement court (coût maîtrisé, Haiku).
 * Ne promet JAMAIS de remboursement, de délai précis ni de geste commercial : uniquement des faits déjà connus.
 */
export async function draftBuyerReply(i: { question: string; itemTitle: string; lang: Lang; trackingNumber?: string; trackingCarrier?: string }): Promise<string | null> {
  const tracking = i.trackingNumber ? `\nNuméro de suivi disponible : ${i.trackingNumber}${i.trackingCarrier ? ` (${i.trackingCarrier})` : ""}.` : "\nAucun numéro de suivi disponible pour l'instant.";
  return claude(
    `Tu réponds en ${LANG_NAME[i.lang]} à une question d'acheteur eBay, en 2 à 4 phrases, ton poli et direct. ${RULES} N'invente aucun délai de livraison précis, aucun remboursement, aucun geste commercial. Si tu ne peux pas répondre avec certitude, dis que le vendeur reviendra vers lui rapidement. Réponds uniquement par le texte du message, sans formule de politesse finale ni signature.`,
    `Annonce concernée : ${i.itemTitle}${tracking}\nQuestion de l'acheteur : ${i.question}`,
    300,
  ).catch(() => null);
}

/** Titre + description d'une annonce créée depuis un produit CJ (nom anglais → langue du marché). */
const SHIPPING_NOTE: Record<Lang, { h: string; body: string }> = {
  fr: { h: "Livraison", body: "Article expédié depuis un entrepôt à l'étranger. Délai de livraison indicatif : 10 à 20 jours ouvrés après expédition. Un numéro de suivi est fourni." },
  de: { h: "Versand", body: "Versand aus einem Auslandslager. Voraussichtliche Lieferzeit: 10 bis 20 Werktage nach Versand. Sendungsverfolgung inklusive." },
  en: { h: "Delivery", body: "Shipped from an overseas warehouse. Estimated delivery: 10 to 20 working days after dispatch. Tracking number provided." },
};

/**
 * Titre + description d'une annonce depuis une fiche CJ (anglais) vers la langue du marché.
 * Règles de référencement eBay : mot-clé principal en premier, 70-80 caractères utilisés, termes que les acheteurs tapent vraiment
 * (type d'objet, matière, usage, compatibilité, taille), aucune marque inventée, aucun mot promotionnel (« promo », « pas cher », « livraison gratuite »).
 * Sans clé IA (ai:false), l'appelant doit refuser de publier : un titre anglais sur eBay.fr ne se référence pas.
 */
export async function writeListingCopy(i: { name: string; cjDescription: string; lang: Lang; requiredAspects?: RequiredAspect[] }): Promise<{ title: string; html: string; ai: boolean; aspects: Record<string, string[]> }> {
  const plain = i.cjDescription.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000);
  const specs = i.requiredAspects ?? [];
  const aspectsAsk = specs.length
    ? `\nCARACTÉRISTIQUES OBLIGATOIRES eBay pour cette catégorie : propose une valeur factuelle pour chacune, dans "aspects".${specs.some((s) => s.mode === "SELECTION_ONLY") ? " Pour celles à liste fermée, choisis EXACTEMENT une valeur parmi celles données, aucune autre." : ""}\n${specs.map((s) => `- ${s.name}${s.allowedValues.length ? ` (choix possibles : ${s.allowedValues.slice(0, 20).join(" | ")})` : " (texte libre court)"}`).join("\n")}`
    : "";
  const out = await claude(
    `Tu es rédacteur d'annonces eBay expert en référencement (Cassini). Tu écris en ${LANG_NAME[i.lang]}, à partir d'une fiche fournisseur en anglais.
TITRE : ${EBAY_TITLE_MAX} caractères maximum, vise 72 à ${EBAY_TITLE_MAX}. Commence par le mot-clé principal (ce que l'acheteur tape : type d'objet), puis matière, usage, taille/quantité, compatibilité. Une seule fois chaque mot. Pas de ponctuation décorative, pas de MAJUSCULES abusives, pas de mots promotionnels, pas de marque.
DESCRIPTION : une phrase d'accroche (bénéfice réel), 5 à 8 puces de caractéristiques factuelles issues de la fiche (dimensions, matière, contenu du colis, usage), et une liste "keywords" de 5 à 8 expressions de recherche naturelles.${aspectsAsk}
${RULES}
Réponds uniquement par un objet JSON : {"title": string, "intro": string, "bullets": string[], "keywords": string[]${specs.length ? ', "aspects": { [nomCaractéristique: string]: string }' : ""}}.`,
    `Nom fournisseur : ${i.name}\nFiche fournisseur : ${plain || "(vide)"}`,
    1300,
  ).catch(() => null);
  const j = parseJson<{ title?: string; bullets?: string[]; intro?: string; keywords?: string[]; aspects?: Record<string, string> }>(out);
  const ship = SHIPPING_NOTE[i.lang];
  const aspects = buildRequiredAspectsMap(specs, j?.aspects); // une valeur garantie par caractéristique obligatoire, IA ou repli sûr
  if (j?.title && j.bullets && j.bullets.length >= 3) {
    const kw = (j.keywords ?? []).filter((k) => typeof k === "string").slice(0, 8).map(esc).join(", ");
    const html = `<h2>${esc(j.title)}</h2>${j.intro ? `<p>${esc(j.intro)}</p>` : ""}<ul>${j.bullets.slice(0, 8).map((b) => `<li>${esc(String(b))}</li>`).join("")}</ul>${kw ? `<p><strong>${i.lang === "fr" ? "Mots-clés" : i.lang === "de" ? "Suchbegriffe" : "Keywords"} :</strong> ${kw}</p>` : ""}<h3>${ship.h}</h3><p>${ship.body}</p>`;
    return { title: fitTitle([j.title]), html: sanitizeHtml(html), ai: true, aspects };
  }
  const d = buildDescription({ product: i.name, features: [], tone: "pro", lang: i.lang });
  return { title: fitTitle([i.name, i.lang === "fr" ? "Neuf" : i.lang === "de" ? "Neu" : "New"]), html: sanitizeHtml(d.html), ai: false, aspects };
}
