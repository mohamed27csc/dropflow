import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProduct } from "./product-safety.ts";

const bad = (n: string, d = "") => assert.equal(checkProduct(n, d).safe, false, `devrait être refusé : ${n}`);
const ok = (n: string, d = "") => assert.equal(checkProduct(n, d).safe, true, `devrait passer : ${n}`);

test("marques protégées et contrefaçons refusées", () => {
  bad("Nike Air Max Running Shoes");
  bad("Wireless Earphones for iPhone 15");
  bad("Pokemon Plush Toy Pikachu");
  bad("Louis Vuitton style handbag");
  bad("Replica watch 1:1 luxury");
  bad("Casque Sony WH-1000 clone");
});

test("articles restreints ou à risque refusés", () => {
  bad("Tactical Folding Knife Outdoor");
  bad("Portable Power Bank 20000mAh");
  bad("Electronic Cigarette Vape Pen");
  bad("Weight Loss Slimming Capsules");
  bad("Teeth Whitening Kit LED");
  bad("Drone with Camera 4K");
  bad("Neodymium Magnet Set");
  bad("Anti-aging face cream serum");
  bad("Fun gadget", "contains a lithium battery");
});

test("produits ordinaires passent, sans faux positifs sur des mots proches", () => {
  ok("Kitchen Storage Organizer Rack Drawer");
  ok("Yoga Mat Non-Slip 6mm");
  ok("Cat Litter Scoop Stainless Steel");
  ok("Wooden Cutting Board Black Walnut");
  ok("Women Jumpsuit Flowers Print");
  ok("Outdoor Garden Solar Light Lamp");
  ok("Phone Holder Car Mount"); // « phone » seul n'est pas une marque
  ok("Pilot jacket"); // ne doit pas être bloqué par « lot »
  ok("Vansit organizer"); // « vans » n'est pas dans « vansit »
  ok("3 Items Storage Set"); // « items » ne doit pas déclencher « ems »
  ok("Precious Gems Jewelry Box"); // « gems » ne doit pas déclencher « ems »
  ok("Home Systems Organizer"); // « systems » ne doit pas déclencher « ems »
  ok("Handheld Back and Shoulder Massage Gun Percussion"); // « gun » seul ne doit plus bloquer pistolet à colle/peinture/massage
  ok("Hot Melt Glue Gun 60W Craft Tool");
});

test("dispositifs médicaux et actes dermatologiques refusés (politique eBay)", () => {
  bad("New EMS Patch Mini Eye Beauty Device");
  bad("Facial Beauty Device Lifting Firming Microcurrent Massage");
  bad("Electric Wireless Micro-needle Pen");
  bad("Mole Removal Pen White Household Beauty Instrument");
  bad("Portable TENS Unit Muscle Stimulator");
  bad("Handheld Nebulizer for Home Use");
  bad("Fingertip Pulse Oximeter Blood Oxygen Monitor");
});

test("appareils beauté électriques visage/yeux refusés (2e retrait, même politique)", () => {
  bad("Ultrasonic Massage Device Home Beauty Device");
  bad("Facial Color Mask IPL Device Spectrum Beauty Apparatus");
  bad("Silicone Beauty Mask Photon Skin Rejuvenation Device");
  bad("Smart eye massager");
  bad("Rechargeable Mask Face LED Color Light Domestic Beauty Apparatus");
});

test("gadgets lumineux/massants ordinaires non liés au visage : toujours acceptés", () => {
  ok("Selfie Portable Mobile Phone Holder With Light Foldable Tripod");
  ok("Outdoor Garden Solar LED Light Lamp");
  ok("Handheld Back and Shoulder Massage Gun Percussion");
});

test("perruques et cheveux écartés (choix du vendeur)", () => {
  bad("Wigs real hair India hair ladies water wave hair hair");
  bad("Tissage cheveux humains ondulé eau 12-28 pouces 100g naturel");
  bad("Lace Front Human Hair Wig 13x4");
});
