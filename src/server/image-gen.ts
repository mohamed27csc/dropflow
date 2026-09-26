import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PublicError } from "./http";

/**
 * Génération d'image (OpenAI) pour les visuels produits Printful. Coût réel par appel, contrairement au reste de
 * DropFlow (Claude Haiku, quasi gratuit) : n'appeler que pour un produit réellement destiné à être publié.
 */

const BUCKET = "product-designs";
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const db = supabaseAdmin();
  const { data: buckets } = await db.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: "10MB" });
    if (error && !error.message.includes("already exists")) throw new Error(`Bucket de stockage : ${error.message}`);
  }
  bucketReady = true;
}

/**
 * Génère un visuel et l'héberge de façon permanente (les URL renvoyées par OpenAI expirent après ~1h, trop court
 * pour survivre jusqu'à une commande Printful). Renvoie une URL publique stable.
 */
export async function generateProductImage(prompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new PublicError("Clé OpenAI manquante : ajoutez OPENAI_API_KEY sur Vercel.");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt: prompt.slice(0, 900), size: "1024x1024", n: 1 }),
  });
  const json = await res.json();
  if (!res.ok) throw new PublicError(`Génération d'image refusée : ${json.error?.message ?? res.status}`);
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new PublicError("Réponse de génération d'image invalide.");

  await ensureBucket();
  const path = `${crypto.randomUUID()}.png`;
  const db = supabaseAdmin();
  const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(b64, "base64"), { contentType: "image/png" });
  if (error) throw new Error(`Envoi du visuel impossible : ${error.message}`);

  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
