import { test } from "node:test";
import assert from "node:assert/strict";
import { computePrice, profitAt, roundTo99, tierMarginPct, DEFAULT_PRICING, DEFAULT_TIERS } from "./margin.ts";

const s = DEFAULT_PRICING;

test("paliers de marge selon le coût CJ", () => {
  assert.equal(tierMarginPct(4.99, DEFAULT_TIERS), 150);
  assert.equal(tierMarginPct(5, DEFAULT_TIERS), 100);
  assert.equal(tierMarginPct(14.99, DEFAULT_TIERS), 100);
  assert.equal(tierMarginPct(15, DEFAULT_TIERS), 60);
  assert.equal(tierMarginPct(30, DEFAULT_TIERS), 40);
  assert.equal(tierMarginPct(120, DEFAULT_TIERS), 25);
});

test("arrondi au x,99 supérieur", () => {
  assert.equal(roundTo99(21.5).toFixed(2), "21.99");
  assert.equal(roundTo99(21.99).toFixed(2), "21.99");
  assert.equal(roundTo99(22).toFixed(2), "22.99");
  assert.equal(roundTo99(0.5).toFixed(2), "0.99");
});

test("prix de vente : formule et arrondi", () => {
  // coût total 9,99 + 0 + 0,35 = 10,34 ; marge 100 % ; frais eBay 13 % (pub désactivée par défaut) → 20,68 / 0,87 = 23,77 → 23,99
  const r = computePrice({ cjCost: 9.99, shipping: 0 }, s);
  assert.equal(r.price.toFixed(2), "23.99");
  assert.ok(r.netMarginPct >= r.appliedMarginPct, "l'arrondi ne peut pas faire baisser la marge");
  assert.ok(r.price.toFixed(2).endsWith(".99"));
});

test("taux de pub (Promoted Listings) déduit du prix et de la marge affichée", () => {
  const withAds = computePrice({ cjCost: 20, shipping: 0 }, { ...s, adRatePct: 8 });
  const withoutAds = computePrice({ cjCost: 20, shipping: 0 }, { ...s, adRatePct: 0 });
  assert.ok(withAds.price > withoutAds.price, "le prix doit monter pour compenser le coût de la pub");
  const profitPromoted = profitAt(50, 20, { ebayFeePct: 13, alertThresholdPct: 20, adRatePct: 8 });
  const profitOrganic = profitAt(50, 20, { ebayFeePct: 13, alertThresholdPct: 20, adRatePct: 0 });
  assert.ok(profitPromoted.netProfit < profitOrganic.netProfit, "une annonce promue doit afficher une marge nette plus basse");
});

test("ajustement : demande forte + peu de concurrence relève la marge, marché saturé la baisse", () => {
  const base = computePrice({ cjCost: 10, shipping: 1 }, s);
  const hot = computePrice({ cjCost: 10, shipping: 1, signal: { sold30d: 800, sellers: 8 } }, s);
  const crowded = computePrice({ cjCost: 10, shipping: 1, signal: { sold30d: 40, sellers: 90 } }, s);
  assert.ok(hot.appliedMarginPct > base.appliedMarginPct);
  assert.ok(crowded.appliedMarginPct < base.appliedMarginPct);
  assert.ok(hot.price > base.price && crowded.price < base.price);
});

test("marge cible = plancher, ajustement désactivable", () => {
  const floor = computePrice({ cjCost: 50, shipping: 0, minMarginPct: 70 }, s);
  assert.equal(floor.appliedMarginPct, 70);
  const off = computePrice({ cjCost: 10, shipping: 0, signal: { sold30d: 800, sellers: 8 } }, { ...s, autoAdjust: false });
  assert.equal(off.appliedMarginPct, 100);
});

test("alerte sous le seuil", () => {
  const r = computePrice({ cjCost: 10, shipping: 0 }, { ...s, alertThresholdPct: 500 });
  assert.equal(r.belowThreshold, true);
  assert.equal(computePrice({ cjCost: 10, shipping: 0 }, s).belowThreshold, false);
});
