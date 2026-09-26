import { test } from "node:test";
import assert from "node:assert/strict";
import { fitTitle, EBAY_TITLE_MAX } from "./generators.ts";

test("fitTitle : ne renvoie jamais un titre vide, même si le premier mot dépasse la limite à lui seul", () => {
  const longWord = "Gesichtsmassagegerätantifaltenbehandlungswerkzeugsetfür".padEnd(90, "x"); // > 80 caractères, un seul mot
  const r = fitTitle([longWord, "autre mot"]);
  assert.ok(r.length > 0, "le titre ne doit jamais être vide (eBay refuse un titre vide)");
  assert.ok(r.length <= EBAY_TITLE_MAX);
  assert.equal(r, longWord.slice(0, EBAY_TITLE_MAX));
});

test("fitTitle : cas normal, plusieurs mots courts, aucun doublon", () => {
  const r = fitTitle(["Masseur", "visage", "LED", "masseur", "Neuf"]);
  assert.equal(r, "Masseur visage LED Neuf");
});

test("fitTitle : s'arrête avant la limite sans dépasser", () => {
  const r = fitTitle(["Un", "titre", "avec", "beaucoup", "de", "mots", "différents", "pour", "vérifier", "la", "troncature", "exacte", "à", "quatre-vingts", "caractères", "maximum", "toujours"], 30);
  assert.ok(r.length <= 30);
});
