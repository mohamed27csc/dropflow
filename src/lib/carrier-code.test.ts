import { test } from "node:test";
import assert from "node:assert/strict";
import { toEbayCarrierCode } from "./carrier-code.ts";

test("transporteurs confirmés par la documentation eBay : reconnus", () => {
  assert.equal(toEbayCarrierCode("DHL Express"), "DHL");
  assert.equal(toEbayCarrierCode("FedEx International"), "FedEx");
  assert.equal(toEbayCarrierCode("UPS Standard"), "UPS");
  assert.equal(toEbayCarrierCode("USPS First Class"), "USPS");
  assert.equal(toEbayCarrierCode("4PX Express"), "FourPX");
  assert.equal(toEbayCarrierCode("FourPX Standard"), "FourPX");
});

test("transporteurs CJ courants, non confirmés dans la liste eBay : repli sûr « OTHER », jamais le nom brut", () => {
  for (const cj of ["YunExpress Sensitive", "CJPacket Ordinary", "China Post Air Mail", "CJPacket Euro Sensitive F", "AliExpress Standard Shipping", "", null, undefined]) {
    assert.equal(toEbayCarrierCode(cj), "OTHER", `« ${cj} » doit tomber sur OTHER`);
  }
});

test("insensible à la casse et aux mots collés à d'autres lettres (pas de faux positif)", () => {
  assert.equal(toEbayCarrierCode("dhl"), "DHL");
  assert.equal(toEbayCarrierCode("Superdhlexpress"), "OTHER", "« dhl » collé à d'autres lettres ne doit pas matcher");
});
