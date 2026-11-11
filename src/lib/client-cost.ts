/**
 * Cálculo padronizado de acessos/telas e despesa de créditos de servidor por cliente.
 * Cada acesso (tela / ponto) consome 1 crédito do servidor por ciclo mensal do plano.
 */

export function getClientAccessCount(points: number | null | undefined): number {
  const n = Math.trunc(Number(points) || 1);
  return Math.max(1, n);
}

export function getPlanMonths(durationDays: number | null | undefined): number {
  if (!durationDays || durationDays <= 0) return 1;
  return Math.max(1, Math.round(durationDays / 30));
}

export function computeClientServerCostCents(params: {
  creditCostCents?: number | null;
  durationDays?: number | null;
  points?: number | null;
}): number {
  const unitCost = Math.max(0, Math.trunc(Number(params.creditCostCents) || 0));
  if (unitCost === 0) return 0;
  return unitCost * getPlanMonths(params.durationDays) * getClientAccessCount(params.points);
}
