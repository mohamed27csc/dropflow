import { test } from "node:test";
import assert from "node:assert/strict";
import { countryName } from "./country-name.ts";

test("codes ISO courants convertis en nom complet anglais", () => {
  assert.equal(countryName("FR"), "France");
  assert.equal(countryName("DE"), "Germany");
  assert.equal(countryName("GB"), "United Kingdom");
  assert.equal(countryName("PL"), "Poland");
  assert.equal(countryName("SE"), "Sweden");
  assert.equal(countryName("fr"), "France", "insensible à la casse");
});

test("code invalide : jamais d'erreur, on retombe sur le code lui-même", () => {
  assert.equal(countryName("XX"), "XX");
  assert.equal(countryName(""), "");
});
