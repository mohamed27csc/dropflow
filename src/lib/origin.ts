/** Protection CSRF par vérification d'origine (en plus de SameSite=Lax) pour toute requête qui modifie l'état. */

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function originAllowed(i: { method: string; origin: string | null; host: string | null; secFetchSite: string | null; extraOrigins?: string[] }): boolean {
  if (SAFE.has(i.method.toUpperCase())) return true;
  if (i.origin) {
    try {
      const o = new URL(i.origin);
      return o.host === i.host || (i.extraOrigins ?? []).includes(o.origin);
    } catch {
      return false;
    }
  }
  // Pas d'Origin : n'accepter que les requêtes que le navigateur déclare same-origin (ou saisies directes).
  return i.secFetchSite === "same-origin" || i.secFetchSite === "none";
}

/** Redirection interne uniquement (anti open-redirect). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  return next && /^\/(?![/\\])[\w\-./?=&%#]*$/.test(next) ? next : fallback;
}
