import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ENCRYPTION_KEY = "une-cle-de-test-suffisamment-longue-1234";
const { encrypt, decrypt, deriveKey } = await import("./crypto.ts");

test("chiffrement AES-GCM : aller-retour, IV aléatoire, rien en clair", () => {
  const secret = "CJ123@api@abcdef";
  const a = encrypt(secret, "cj-key:u1");
  assert.notEqual(a, encrypt(secret, "cj-key:u1"));
  assert.equal(decrypt(a, "cj-key:u1"), secret);
  assert.ok(!a.includes(secret) && a.startsWith("v1."));
});

test("chiffrement : message altéré, mauvais contexte (AAD) et mauvaise clé rejetés", () => {
  const enc = encrypt("secret", "cj-key:u1");
  const buf = Buffer.from(enc.slice(3), "base64");
  buf[buf.length - 1] ^= 1;
  assert.throws(() => decrypt("v1." + buf.toString("base64"), "cj-key:u1"), "altéré");
  assert.throws(() => decrypt(enc, "cj-key:u2"), "chiffré d'un autre utilisateur copié dans cette ligne");
  process.env.ENCRYPTION_KEY = "une-AUTRE-cle-de-test-suffisamment-longue-99";
  assert.throws(() => decrypt(enc, "cj-key:u1"), "mauvaise clé");
});

test("rotation de clé : l'ancienne clé reste acceptée via ENCRYPTION_KEY_PREVIOUS", () => {
  process.env.ENCRYPTION_KEY = "cle-numero-un-suffisamment-longue-pour-le-test";
  const enc = encrypt("hello", "ctx");
  process.env.ENCRYPTION_KEY_PREVIOUS = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = "cle-numero-deux-suffisamment-longue-pour-le-test";
  assert.equal(decrypt(enc, "ctx"), "hello");
  delete process.env.ENCRYPTION_KEY_PREVIOUS;
});

test("clés dérivées : usages distincts, clé trop courte refusée", () => {
  process.env.ENCRYPTION_KEY = "cle-numero-un-suffisamment-longue-pour-le-test";
  assert.notDeepEqual(deriveKey("aes-256-gcm"), deriveKey("oauth-state"));
  process.env.ENCRYPTION_KEY = "trop-courte";
  assert.throws(() => deriveKey("x"));
});
