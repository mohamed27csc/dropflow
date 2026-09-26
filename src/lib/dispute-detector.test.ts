import { test } from "node:test";
import assert from "node:assert/strict";
import { isDisputeLike } from "./dispute-detector.ts";

test("messages à risque détectés (litige, remboursement, produit défectueux, menace)", () => {
  assert.equal(isDisputeLike("Je veux un remboursement immédiat, ce produit est une arnaque !"), true);
  assert.equal(isDisputeLike("L'objet est arrivé cassé, ça ne fonctionne pas du tout."), true);
  assert.equal(isDisputeLike("Je n'ai jamais reçu mon colis, c'est inadmissible."), true);
  assert.equal(isDisputeLike("Je vais contacter mon avocat si ce n'est pas résolu."), true);
  assert.equal(isDisputeLike("I want a refund, this is a scam."), true);
  assert.equal(isDisputeLike("This item is broken and defective."), true);
  assert.equal(isDisputeLike("Je porte plainte, ceci est une contrefaçon."), true);
  assert.equal(isDisputeLike("J'ai ouvert un litige PayPal."), true);
});

test("messages allemands à risque détectés (eBay.de)", () => {
  assert.equal(isDisputeLike("Ich möchte eine Erstattung, das ist Betrug!"), true);
  assert.equal(isDisputeLike("Der Artikel ist kaputt angekommen und funktioniert nicht."), true);
  assert.equal(isDisputeLike("Ich habe mein Paket nicht erhalten, das ist unverschämt."), true);
  assert.equal(isDisputeLike("Ich werde meinen Anwalt kontaktieren, wenn das nicht gelöst wird."), true);
  assert.equal(isDisputeLike("Ich reiche eine Beschwerde ein, das ist eine Fälschung."), true);
});

test("messages allemands ordinaires non signalés", () => {
  assert.equal(isDisputeLike("Hallo, gibt es dieses Produkt auch in Blau?"), false);
  assert.equal(isDisputeLike("Vielen Dank, sehr schnelle Lieferung!"), false);
  assert.equal(isDisputeLike("Wie lange dauert der Versand ungefähr?"), false);
});

test("messages ordinaires non signalés", () => {
  assert.equal(isDisputeLike("Bonjour, est-ce que ce produit existe en bleu ?"), false);
  assert.equal(isDisputeLike("Merci beaucoup, super rapide !"), false);
  assert.equal(isDisputeLike("Quel est le délai de livraison estimé ?"), false);
  assert.equal(isDisputeLike("Bonjour parfait merci"), false);
  assert.equal(isDisputeLike("Est-ce compatible avec un iPhone 15 ?"), false);
});
