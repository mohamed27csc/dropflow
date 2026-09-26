/**
 * Mode privé : si OWNER_EMAILS est défini (liste séparée par des virgules), SEULES ces adresses peuvent créer un compte
 * et se connecter. Même quelqu'un qui trouve l'URL ne peut ni s'inscrire ni entrer. Vide = inscription ouverte.
 */
export function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export const isPrivateMode = () => ownerEmails().length > 0;

export function emailAllowed(email: string | null | undefined): boolean {
  const list = ownerEmails();
  return list.length === 0 || (!!email && list.includes(email.trim().toLowerCase()));
}
