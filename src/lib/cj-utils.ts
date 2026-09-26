// Fonctions pures liées à CJ (sans dépendance serveur : testables avec `npm test`).

/** « 3.50 -- 5.00 » ou « 3.5 » → 3.5 (le prix bas). */
export function parsePrice(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** productImage est tantôt une URL, tantôt un tableau JSON sérialisé. */
/** Repousse en fin de liste les images qui ne sont probablement pas des photos du produit (guide des tailles, logo…). */
const LOW_PRIORITY = /(size[-_]?chart|size[-_]?guide|guide[-_]?taille|taille|logo|watermark)/i;

/**
 * Photo principale (celle qu'eBay affiche en premier) en tête, puis le reste de la galerie CJ, dédoublonné.
 * CJ ne fournit pas de score de qualité : c'est la meilleure approximation possible sans analyser chaque image.
 */
export function extractImages(d: { productImage?: string; productImageSet?: string[]; bigImage?: string }): string[] {
  const out = new Set<string>();
  const add = (u?: string) => u && /^https?:\/\//.test(u) && out.add(u);
  add(d.bigImage); // photo principale CJ : en premier, c'est elle que verra l'acheteur sur eBay
  d.productImageSet?.forEach(add);
  if (d.productImage) {
    try {
      const parsed = JSON.parse(d.productImage);
      if (Array.isArray(parsed)) parsed.forEach(add);
      else add(d.productImage);
    } catch {
      add(d.productImage);
    }
  }
  const all = [...out];
  const ranked = [...all.filter((u) => !LOW_PRIORITY.test(u)), ...all.filter((u) => LOW_PRIORITY.test(u))];
  return ranked.slice(0, 12);
}

/** Extrait l'identifiant produit d'un lien CJ (…-p-<pid>.html, /product/<pid>) ou d'un pid brut. */
export function parseCjPid(input: string): string | null {
  const s = input.trim();
  const uuid = s.match(/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/);
  if (uuid) return uuid[0].toUpperCase();
  const num = s.match(/(?:-p-|\/product\/)(\d{6,})/);
  if (num) return num[1];
  return /^[\w-]{6,}$/.test(s) ? s : null;
}
