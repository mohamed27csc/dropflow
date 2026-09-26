/** Politique de mot de passe (OWASP ASVS 2.1) : longueur avant tout, pas de mots de passe triviaux. */

const COMMON = ["password", "motdepasse", "azerty", "qwerty", "123456", "111111", "letmein", "welcome", "admin", "dropflow", "ebay", "iloveyou", "azertyuiop", "changeme"];

export function checkPassword(pw: string, email = ""): string | null {
  if (pw.length < 12) return "12 caractères minimum.";
  if (pw.length > 128) return "128 caractères maximum.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) return "Utilisez majuscules, minuscules, chiffres et un symbole.";
  const lower = pw.toLowerCase();
  if (COMMON.some((c) => lower.includes(c))) return "Mot de passe trop courant.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Ne contenez pas votre adresse email.";
  if (/^(.)\1+$/.test(pw) || /(0123|1234|2345|3456|4567|5678|6789|abcd|bcde)/i.test(pw)) return "Évitez les suites de caractères.";
  return null;
}
