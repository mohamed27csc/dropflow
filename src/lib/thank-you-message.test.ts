import { test } from "node:test";
import assert from "node:assert/strict";
import { stockDelayMessage, thankYouMessage } from "./thank-you-message.ts";

test("message sans suivi : annonce la préparation, pas de faux numéro", () => {
  assert.match(thankYouMessage("fr"), /préparation/);
  assert.doesNotMatch(thankYouMessage("fr"), /suivi\s*:/);
});

test("message avec suivi : contient le numéro et le transporteur si fourni", () => {
  const m = thankYouMessage("de", { number: "YT12345", carrier: "YunExpress" });
  assert.match(m, /YT12345/);
  assert.match(m, /YunExpress/);
});

test("marché uk → anglais", () => {
  assert.match(thankYouMessage("uk", { number: "AB1" }), /thank you for your purchase/i);
});

test("message de retard fournisseur : honnête sans révéler la cause interne (solde CJ)", () => {
  const fr = stockDelayMessage("fr");
  assert.match(fr, /retard/i);
  assert.doesNotMatch(fr.toLowerCase(), /cj|solde|dropshipping/);
  assert.match(stockDelayMessage("de"), /Lieferverzögerung/);
  assert.match(stockDelayMessage("uk"), /supply delay/i);
});
