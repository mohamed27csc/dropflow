import { test } from "node:test";
import assert from "node:assert/strict";
import { isInsufficientBalance } from "./cj-errors.ts";

test("solde insuffisant : les deux codes documentés par CJ sont reconnus", () => {
  assert.equal(isInsufficientBalance(1604000), true);
  assert.equal(isInsufficientBalance(1604001), true);
});

test("toute autre erreur (rupture de stock, adresse invalide…) n'est PAS traitée comme un solde insuffisant", () => {
  assert.equal(isInsufficientBalance(1600200), false); // limite de débit
  assert.equal(isInsufficientBalance(500), false);
  assert.equal(isInsufficientBalance(undefined), false);
});
