/** Code pays ISO 3166-1 alpha-2 → nom complet en anglais (ce qu'attend le champ « shippingCountry » de CJ). */
export function countryName(code: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase());
    return name && name !== code.toUpperCase() ? name : code;
  } catch {
    return code;
  }
}
