import { test } from "node:test";
import assert from "node:assert/strict";
import { inPriceTier } from "./price-tiers.ts";

test("bornes de chaque tranche, y compris les valeurs exactement à la limite", () => {
  assert.equal(inPriceTier(29.99, "low"), true);
  assert.equal(inPriceTier(30, "low"), false);
  assert.equal(inPriceTier(30, "mid"), true);
  assert.equal(inPriceTier(49.99, "mid"), true);
  assert.equal(inPriceTier(50, "mid"), false);
  assert.equal(inPriceTier(50, "high"), true);
  assert.equal(inPriceTier(0, "low"), true);
});

test("« all » accepte n'importe quel prix, y compris négatif ou nul par sécurité", () => {
  assert.equal(inPriceTier(0, "all"), true);
  assert.equal(inPriceTier(-5, "all"), true);
  assert.equal(inPriceTier(9999, "all"), true);
});
