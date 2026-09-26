import type { CountryCode } from "./settings";

/**
 * Message de remerciement après achat, avec numéro de suivi si connu. Gabarit fixe (pas d'appel IA) : contenu
 * prévisible, fiable, et sans coût — contrairement aux réponses aux questions acheteur, qui varient et justifient l'IA.
 */
export function thankYouMessage(market: CountryCode, tracking?: { number: string; carrier?: string }): string {
  if (market === "fr") {
    return tracking
      ? `Bonjour, merci pour votre achat ! Votre colis est en route, voici votre numéro de suivi : ${tracking.number}${tracking.carrier ? ` (${tracking.carrier})` : ""}. N'hésitez pas si vous avez une question.`
      : `Bonjour, merci pour votre achat ! Votre commande est en cours de préparation, vous recevrez le numéro de suivi dès qu'il sera disponible.`;
  }
  if (market === "de") {
    return tracking
      ? `Hallo, vielen Dank für Ihren Einkauf! Ihr Paket ist unterwegs, hier ist Ihre Sendungsnummer: ${tracking.number}${tracking.carrier ? ` (${tracking.carrier})` : ""}. Bei Fragen stehen wir gerne zur Verfügung.`
      : `Hallo, vielen Dank für Ihren Einkauf! Ihre Bestellung wird vorbereitet, Sie erhalten die Sendungsnummer, sobald sie verfügbar ist.`;
  }
  return tracking
    ? `Hello, thank you for your purchase! Your parcel is on its way, here is your tracking number: ${tracking.number}${tracking.carrier ? ` (${tracking.carrier})` : ""}. Feel free to reach out with any question.`
    : `Hello, thank you for your purchase! Your order is being prepared, you'll receive the tracking number as soon as it's available.`;
}

/** Message honnête en cas de retard d'approvisionnement fournisseur, sans révéler la cause interne. Gabarit fixe, pas d'IA. */
export function stockDelayMessage(market: CountryCode): string {
  if (market === "fr") return "Bonjour, votre commande rencontre un léger retard d'approvisionnement chez notre fournisseur. Nous faisons le nécessaire pour vous l'envoyer au plus vite et vous tiendrons informé(e). Merci de votre patience.";
  if (market === "de") return "Hallo, bei Ihrer Bestellung gibt es eine kleine Lieferverzögerung bei unserem Lieferanten. Wir kümmern uns darum, sie so schnell wie möglich zu versenden, und halten Sie auf dem Laufenden. Vielen Dank für Ihr Verständnis.";
  return "Hello, your order is experiencing a slight supply delay with our supplier. We're working to ship it as soon as possible and will keep you updated. Thank you for your patience.";
}
