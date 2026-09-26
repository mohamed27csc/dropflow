/**
 * Le champ « transporteur » de l'API Fulfillment d'eBay attend un code d'une liste fermée (ShippingCarrierCodeType),
 * pas un nom libre. Les transporteurs CJ (YunExpress, CJPacket, China Post…) n'y figurent pas de façon certaine :
 * leur envoyer tels quels risquerait un refus d'eBay, et l'acheteur ne verrait jamais son numéro de suivi.
 * On ne mappe que les codes confirmés dans la documentation eBay ; tout le reste part en « OTHER », valeur universelle
 * acceptée par eBay (le numéro de suivi reste transmis et cliquable, seul le logo du transporteur n'est pas affiché).
 */
const KNOWN: [RegExp, string][] = [
  [/\b4px\b|\bfourpx\b/i, "FourPX"],
  [/\bdhl\b/i, "DHL"],
  [/\bfedex\b/i, "FedEx"],
  [/\bups\b/i, "UPS"],
  [/\busps\b/i, "USPS"],
];

export function toEbayCarrierCode(cjCarrierName: string | undefined | null): string {
  const name = (cjCarrierName ?? "").trim();
  for (const [pattern, code] of KNOWN) if (pattern.test(name)) return code;
  return "OTHER";
}
