/**
 * Détecte les messages acheteur à risque (litige, menace, contentieux) : ceux-là ne reçoivent JAMAIS de réponse
 * automatique par IA. Ils sont escaladés vers une notification pour une réponse manuelle. Volontairement large :
 * un faux positif coûte juste une notification en plus, un faux négatif pourrait envoyer une réponse IA
 * malvenue à un client en colère ou dans une procédure formelle.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const DISPUTE_PATTERNS: RegExp[] = [
  // français
  /\blitige\b/, /\bavocat\b/, /\bjuridique\b/, /\bplainte\b/, /\bpolice\b/, /\bgendarmerie\b/,
  /\barnaqu/, /\bescroqu/, /\brembours/, /\bremboursement\b/, /\bretour.{0,15}argent\b/,
  /\bcontrefa[cç]on\b/, /\bfaux produit\b/, /\bpas conforme\b/, /\bne correspond pas\b/,
  /\bcass[ée]\b/, /\bd[ée]fectueu/, /\bne fonctionne pas\b/, /\bne marche pas\b/,
  /\bjamais re[cç]u\b/, /\bpas re[cç]u\b/, /\bmenac/, /\bd[ée][cç]u\b/, /\bhonteux\b/, /\binadmissible\b/, /\burgent\b/,
  // anglais
  /\bfraud/, /\bscam\b/, /\bmoney.?back\b/, /\brefund\b/, /\bbroken\b/, /\bdefective\b/,
  /\bnot received\b/, /\bitem not received\b/, /\binr\b/, /\bsnad\b/, /\bopen(ed)? a case\b/, /\bdispute\b/, /\bcomplaint\b/,
  /\bthreat/, /\bnegative feedback\b/, /\bscandal/, /\blawyer\b/, /\blegal action\b/, /\bcounterfeit\b/, /\bfake\b/,
  // allemand
  /\bbetrug/, /\banwalt\b/, /\brechtlich/, /\bbeschwerde\b/, /\bpolizei\b/,
  /\berstattung\b/, /\bgeld.?zur[uü]ck\b/, /\bstreitfall\b/, /\bf[aä]lschung\b/, /\bgef[aä]lscht\b/,
  /\bkaputt\b/, /\bdefekt\b/, /\bfunktioniert nicht\b/, /\bnicht erhalten\b/, /\bnicht bekommen\b/,
  /\bdroh\w*/, /\bklage\b/, /\benttäuscht\b/, /\bunversch[aä]mt\b/, /\bskandal[oö]s\b/, /\bnegative bewertung\b/,
];

export function isDisputeLike(text: string): boolean {
  const t = norm(text);
  return DISPUTE_PATTERNS.some((re) => re.test(t));
}
