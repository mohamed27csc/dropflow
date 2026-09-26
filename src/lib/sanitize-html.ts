/**
 * Assainisseur HTML par liste blanche (anti-XSS) pour les descriptions eBay générées par IA ou reprises d'un fournisseur.
 * Ne garde que des balises de mise en forme SANS aucun attribut ; tout le reste est retiré ; le texte est échappé.
 */
const ALLOWED = new Set(["h2", "h3", "p", "ul", "ol", "li", "strong", "em", "b", "i", "br"]);
const DROP_WITH_CONTENT = /<\s*(script|style|iframe|object|embed|svg|math|template|noscript)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;

const escapeText = (s: string) => s.replace(/&(?!(?:amp|lt|gt|quot|#\d{1,6}|#x[0-9a-f]{1,6});)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sanitizeHtml(input: string, maxLen = 20_000): string {
  const src = input.slice(0, maxLen).replace(DROP_WITH_CONTENT, "").replace(/<!--[\s\S]*?-->/g, "");
  const tag = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let out = "";
  let last = 0;
  for (let m = tag.exec(src); m; m = tag.exec(src)) {
    out += escapeText(src.slice(last, m.index));
    const name = m[2].toLowerCase();
    if (ALLOWED.has(name)) out += name === "br" ? "<br>" : `<${m[1]}${name}>`;
    last = m.index + m[0].length;
  }
  return out + escapeText(src.slice(last));
}
