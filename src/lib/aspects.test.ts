import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAspectValue, buildRequiredAspectsMap, type RequiredAspect } from "./aspects.ts";

test("liste fermée : la suggestion de l'IA est utilisée si elle correspond exactement (insensible à la casse)", () => {
  const spec: RequiredAspect = { name: "Type", mode: "SELECTION_ONLY", allowedValues: ["Masseur", "Brosse", "Autre"] };
  assert.equal(resolveAspectValue(spec, "masseur"), "Masseur");
  assert.equal(resolveAspectValue(spec, "Brosse"), "Brosse");
});

test("liste fermée : suggestion absente de la liste → repli générique, jamais une valeur inventée", () => {
  const spec: RequiredAspect = { name: "Type", mode: "SELECTION_ONLY", allowedValues: ["Masseur", "Brosse", "Autre"] };
  assert.equal(resolveAspectValue(spec, "Gadget de beauté"), "Autre");
  assert.equal(resolveAspectValue(spec, undefined), "Autre");
});

test("liste fermée sans repli générique disponible : première valeur autorisée (jamais de valeur hors liste)", () => {
  const spec: RequiredAspect = { name: "Couleur", mode: "SELECTION_ONLY", allowedValues: ["Rouge", "Bleu"] };
  assert.equal(resolveAspectValue(spec, "Vert"), "Rouge");
});

test("texte libre : la suggestion est reprise telle quelle, sinon repli neutre", () => {
  const spec: RequiredAspect = { name: "Modèle", mode: "FREE_TEXT", allowedValues: [] };
  assert.equal(resolveAspectValue(spec, "XR-200"), "XR-200");
  assert.equal(resolveAspectValue(spec, undefined), "Standard");
  assert.equal(resolveAspectValue(spec, "  "), "Standard");
});

test("une valeur garantie pour CHAQUE caractéristique obligatoire, jamais de trou", () => {
  const specs: RequiredAspect[] = [
    { name: "Type", mode: "SELECTION_ONLY", allowedValues: ["Masseur", "Autre"] },
    { name: "Modèle", mode: "FREE_TEXT", allowedValues: [] },
  ];
  const map = buildRequiredAspectsMap(specs, { Type: "Masseur" }); // "Modèle" absent de la suggestion
  assert.deepEqual(map, { Type: ["Masseur"], Modèle: ["Standard"] });
});
