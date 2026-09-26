/** Détection de tendance : compare le nombre de boutiques CJ qui vendent un produit, jour après jour. Fonction pure. */

export type Snapshot = { cj_pid: string; day: string; listed_num: number };
export type Rising = { cj_pid: string; from: number; to: number; days: number; growthPct: number; perDay: number };

const MIN_BASE = 5; // évite les « +400 % » de 1 à 5 boutiques : bruit
const DAY_MS = 86_400_000;

/**
 * Pour chaque produit ayant au moins 2 relevés dans la fenêtre : croissance entre le plus ancien et le plus récent.
 * Retourne ceux qui progressent d'au moins `minGrowthPct` % et d'au moins `minAbs` boutiques, du plus rapide au plus lent.
 */
export function findRising(snaps: Snapshot[], opts: { windowDays?: number; minGrowthPct?: number; minAbs?: number; now?: number } = {}): Rising[] {
  const { windowDays = 8, minGrowthPct = 30, minAbs = 5, now = Date.now() } = opts;
  const since = now - windowDays * DAY_MS;
  const byPid = new Map<string, Snapshot[]>();
  for (const s of snaps) {
    if (new Date(s.day).getTime() < since) continue;
    const list = byPid.get(s.cj_pid) ?? [];
    list.push(s);
    byPid.set(s.cj_pid, list);
  }
  const out: Rising[] = [];
  for (const [cj_pid, list] of byPid) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.day.localeCompare(b.day));
    const first = list[0];
    const last = list[list.length - 1];
    const days = Math.max(1, Math.round((new Date(last.day).getTime() - new Date(first.day).getTime()) / DAY_MS));
    const from = first.listed_num;
    const to = last.listed_num;
    const abs = to - from;
    const growthPct = (abs / Math.max(from, MIN_BASE)) * 100;
    if (abs >= minAbs && growthPct >= minGrowthPct) out.push({ cj_pid, from, to, days, growthPct: Math.round(growthPct), perDay: Math.round((abs / days) * 10) / 10 });
  }
  return out.sort((a, b) => b.growthPct - a.growthPct);
}
