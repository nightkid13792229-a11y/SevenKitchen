/**
 * 成本来源（2026-11-07 成本口径归位 · Task 9）。
 *
 * 原料页的「这个成本是哪来的」只认**成本流水**的最新一条。
 * 不要再按「有没有已完成采购记录」去推测：那套推测会把
 * 「建档时用采购商品初始化」错说成「建档手填」。
 */
export type IngredientCostSourceCode =
  | 'INIT_FROM_SKU'
  | 'REIMBURSEMENT'
  | 'MANUAL'
  | 'MIGRATION'
  | 'NONE';

const KNOWN: ReadonlySet<string> = new Set([
  'INIT_FROM_SKU',
  'REIMBURSEMENT',
  'MANUAL',
  'MIGRATION',
]);

export function resolveIngredientCostSource(
  latest: { source?: string | null } | null | undefined,
): IngredientCostSourceCode {
  const raw = latest?.source;
  if (typeof raw !== 'string' || !KNOWN.has(raw)) {
    return 'NONE';
  }
  return raw as IngredientCostSourceCode;
}
