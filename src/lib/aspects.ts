/**
 * Choix d'une valeur pour une caractéristique eBay obligatoire (ex. « Type »), à partir d'une proposition de l'IA.
 * Fonction pure, testée indépendamment de tout appel réseau.
 */
export type RequiredAspect = { name: string; mode: string; allowedValues: string[] };

const norm = (s: string) => s.trim().toLowerCase();

/** eBay accepte presque toujours cette valeur générique quand aucune autre ne convient (liste fermée). */
const GENERIC_FALLBACKS = ["Ne s'applique pas", "Does Not Apply", "Autre", "Other", "Unbranded", "Sans marque"];

export function resolveAspectValue(spec: RequiredAspect, suggested: string | undefined): string {
  const isClosedList = spec.mode === "SELECTION_ONLY" && spec.allowedValues.length > 0;
  if (!isClosedList) return (suggested ?? "").trim() || "Standard";

  if (suggested) {
    const exact = spec.allowedValues.find((v) => norm(v) === norm(suggested));
    if (exact) return exact;
  }
  const generic = spec.allowedValues.find((v) => GENERIC_FALLBACKS.some((g) => norm(v) === norm(g)));
  return generic ?? spec.allowedValues[0];
}

/** Construit la map complète des caractéristiques à envoyer à eBay, une valeur garantie par caractéristique obligatoire. */
export function buildRequiredAspectsMap(specs: RequiredAspect[], suggestions: Record<string, string> | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const spec of specs) out[spec.name] = [resolveAspectValue(spec, suggestions?.[spec.name])];
  return out;
}
