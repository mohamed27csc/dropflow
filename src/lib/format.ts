export type Currency = "EUR" | "GBP";

export function money(n: number, currency: Currency = "EUR", digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function signedMoney(n: number, currency: Currency = "EUR") {
  return (n > 0 ? "+" : "") + money(n, currency);
}

export function pct(n: number, digits = 1) {
  return `${n.toFixed(digits).replace(".", ",")} %`;
}

export function int(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n);
}
