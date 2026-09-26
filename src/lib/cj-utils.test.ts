import { test } from "node:test";
import assert from "node:assert/strict";
import { extractImages, parseCjPid, parsePrice } from "./cj-utils.ts";

test("parsePrice : prix simple, virgule, fourchette CJ", () => {
  assert.equal(parsePrice("3.5"), 3.5);
  assert.equal(parsePrice("3,50"), 3.5);
  assert.equal(parsePrice("3.50 -- 5.00"), 3.5);
  assert.equal(parsePrice(undefined), 0);
  assert.equal(parsePrice("n/a"), 0);
});

test("parseCjPid : UUID, lien produit, pid brut", () => {
  const uuid = "439fc05b-1311-4349-87fa-1e1ef942c418";
  assert.equal(parseCjPid(`https://cjdropshipping.com/product/cool-thing-p-${uuid}.html`), uuid.toUpperCase());
  assert.equal(parseCjPid("https://cjdropshipping.com/product/x-p-1234567890123.html"), "1234567890123");
  assert.equal(parseCjPid("ABC-123456"), "ABC-123456");
  assert.equal(parseCjPid("??"), null);
});

test("extractImages : tableau JSON sérialisé, URL simple, dédoublonnage", () => {
  assert.deepEqual(extractImages({ productImage: '["https://a/1.jpg","https://a/2.jpg"]', bigImage: "https://a/1.jpg" }), ["https://a/1.jpg", "https://a/2.jpg"]);
  assert.deepEqual(extractImages({ productImage: "https://b/x.jpg" }), ["https://b/x.jpg"]);
  assert.deepEqual(extractImages({ productImage: "pas une url" }), []);
});
