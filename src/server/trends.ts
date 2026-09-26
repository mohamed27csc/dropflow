import "server-only";
import { checkProduct } from "@/lib/product-safety";
import { findRising, type Rising } from "@/lib/trend-score";
import { supabaseAdmin } from "@/lib/supabase/server";
import { CANDIDATE, cjListProducts, type CjListItem } from "./cj";

/** Pages relevées chaque nuit : nouveautés + zone « populaire mais pas saturée ». ~10 appels CJ, espacés (CJ limite le débit). */
const PLAN: { orderBy: number; page: number }[] = [
  ...[1, 2, 3, 4].map((page) => ({ orderBy: 3, page })),
  ...[10, 16, 24, 32, 48, 64].map((page) => ({ orderBy: 1, page })),
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Enregistre l'état du jour. Retourne le nombre de produits relevés. */
export async function snapshotTrends(token: string): Promise<number> {
  const rows = new Map<string, { cj_pid: string; name: string; image_url: string | null; price: number; listed_num: number }>();
  for (const step of PLAN) {
    try {
      const items = await cjListProducts(token, { page: step.page, size: 50, orderBy: step.orderBy, startSellPrice: CANDIDATE.minPrice, endSellPrice: CANDIDATE.maxPrice });
      for (const p of items) if (checkProduct(p.name).safe) rows.set(p.pid, { cj_pid: p.pid, name: p.name, image_url: p.image.startsWith("https://") ? p.image : null, price: p.price, listed_num: p.listedNum });
    } catch {
      /* une page en échec ne doit pas annuler le relevé */
    }
    await sleep(1200);
  }
  const db = supabaseAdmin();
  const list = [...rows.values()];
  for (let i = 0; i < list.length; i += 200) {
    const { error } = await db.from("product_snapshots").upsert(list.slice(i, i + 200), { onConflict: "cj_pid,day" });
    if (error) throw new Error("Table product_snapshots absente ou inaccessible : exécutez supabase/trends.sql");
  }
  await db.from("product_snapshots").delete().lt("day", new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)); // conservation 30 jours
  return list.length;
}

export type RisingProduct = CjListItem & Rising & { fromCount: number };

/** Produits dont le nombre de boutiques progresse vite. Vide tant que moins de 2 jours de relevés ou table absente. */
export async function loadRising(limit = 12): Promise<{ items: (Pick<CjListItem, "pid" | "name" | "image" | "price"> & Rising)[]; days: number }> {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db.from("product_snapshots").select("cj_pid, day, listed_num, name, image_url, price").gte("day", since).limit(20000);
  if (error || !data?.length) return { items: [], days: 0 };
  const days = new Set(data.map((r) => r.day)).size;
  const rising = findRising(data.filter((r) => r.listed_num <= 3000)).slice(0, limit);
  const latest = new Map<string, (typeof data)[number]>();
  for (const r of data) if (!latest.has(r.cj_pid) || latest.get(r.cj_pid)!.day < r.day) latest.set(r.cj_pid, r);
  return {
    days,
    items: rising.flatMap((r) => {
      const m = latest.get(r.cj_pid);
      return m ? [{ ...r, pid: r.cj_pid, name: m.name, image: m.image_url ?? "", price: Number(m.price) }] : [];
    }),
  };
}
