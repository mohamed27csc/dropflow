/**
 * Codes d'erreur CJ liés au solde du portefeuille (documentation CJ, Appendix « Global Error Codes »).
 * 1604000 : solde insuffisant. 1604001 : paiement par solde temporairement restreint (doit être payé à la main dans CJ).
 * Dans les deux cas, la commande n'a PAS été créée chez CJ : aucune commande en double si l'on réessaie plus tard.
 */
export const BALANCE_ERROR_CODES = new Set([1604000, 1604001]);

export function isInsufficientBalance(code: number | undefined): boolean {
  return code !== undefined && BALANCE_ERROR_CODES.has(code);
}
