import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * AES-256-GCM avec clé dérivée (HKDF-SHA256) de ENCRYPTION_KEY, une clé distincte de toutes les clés Supabase/eBay.
 * - `aad` lie le chiffré à son contexte (ex. `cj-key:<userId>`) : un chiffré copié vers une autre ligne ne se déchiffre pas.
 * - Rotation : mettez l'ancienne clé dans ENCRYPTION_KEY_PREVIOUS, la nouvelle dans ENCRYPTION_KEY ; les anciens chiffrés
 *   restent lisibles et sont ré-écrits avec la nouvelle clé à leur prochain usage.
 */

function master(name: "ENCRYPTION_KEY" | "ENCRYPTION_KEY_PREVIOUS"): string | null {
  const k = process.env[name];
  if (!k) return null;
  if (k.length < 32) throw new Error("Configuration de chiffrement invalide.");
  return k;
}

/** Clé dérivée par usage (chiffrement, signature d'état OAuth…) : une fuite d'un usage n'expose pas les autres. */
export function deriveKey(purpose: string, which: "ENCRYPTION_KEY" | "ENCRYPTION_KEY_PREVIOUS" = "ENCRYPTION_KEY"): Buffer {
  const m = master(which);
  if (!m) throw new Error("Configuration de chiffrement manquante.");
  return Buffer.from(hkdfSync("sha256", m, "dropflow-kdf-v1", purpose, 32));
}

export function encrypt(plain: string, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey("aes-256-gcm"), iv);
  cipher.setAAD(Buffer.from(aad));
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return "v1." + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

function tryDecrypt(buf: Buffer, key: Buffer, aad: string): string {
  const d = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

export function decrypt(payload: string, aad: string): string {
  if (!payload.startsWith("v1.")) throw new Error("Format de chiffré inconnu.");
  const buf = Buffer.from(payload.slice(3), "base64");
  try {
    return tryDecrypt(buf, deriveKey("aes-256-gcm"), aad);
  } catch (e) {
    if (!master("ENCRYPTION_KEY_PREVIOUS")) throw e;
    return tryDecrypt(buf, deriveKey("aes-256-gcm", "ENCRYPTION_KEY_PREVIOUS"), aad);
  }
}
