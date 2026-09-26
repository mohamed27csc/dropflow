/**
 * Garde-fous des commandes automatiques. Fonction pure : toute décision d'acheter chez CJ passe ici.
 * Les montants sont en EUR.
 */
export type RiskLimits = { maxPerDay: number; maxDailySpend: number; approveAbove: number; mode: "api" | "manual" };

export type RiskInput = {
  /** Encaissé sur eBay pour cette commande. */
  revenue: number;
  ebayFeePct: number;
  /** Coût CJ estimé (produits + livraison). */
  estCost: number;
  ordersToday: number;
  spentToday: number;
  limits: RiskLimits;
};

export type RiskDecision =
  | { action: "order_auto" }
  | { action: "order_manual"; reason: string } // commande créée chez CJ mais NON payée : validation humaine
  | { action: "defer"; reason: string } // on ne fait rien, réessai au prochain passage (lendemain)
  | { action: "block"; reason: string }; // refusée définitivement

export function evaluateOrderRisk(i: RiskInput): RiskDecision {
  if (!Number.isFinite(i.estCost) || i.estCost <= 0 || !Number.isFinite(i.revenue)) return { action: "block", reason: "Montants invalides : commande bloquée." };
  const netRevenue = i.revenue * (1 - i.ebayFeePct / 100);
  if (netRevenue < i.estCost) return { action: "block", reason: `Marge négative (encaissé net ${netRevenue.toFixed(2)} € < coût CJ ${i.estCost.toFixed(2)} €).` };
  if (i.ordersToday >= i.limits.maxPerDay) return { action: "defer", reason: "Plafond de commandes/jour atteint." };
  if (i.spentToday + i.estCost > i.limits.maxDailySpend) return { action: "defer", reason: "Plafond de dépense/jour atteint." };
  if (i.limits.mode === "manual") return { action: "order_manual", reason: "Mode validation manuelle." };
  if (i.estCost > i.limits.approveAbove) return { action: "order_manual", reason: `Montant > ${i.limits.approveAbove} € : validation manuelle requise.` };
  return { action: "order_auto" };
}
