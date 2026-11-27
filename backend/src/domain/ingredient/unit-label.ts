/**
 * 原料基础单位 → 给人看的单位文案。
 *
 * 2026-11-28：库存/采购里以前用 `unitDisplayLabel || baseUnit` 兜底，
 * 原料没维护「显示单位」时后台就显示 G / ML / PCS 这种枚举码。
 * 兜底也必须是**文案**，不能是内部码。
 */
const BASE_UNIT_LABELS: Record<string, string> = {
  G: 'g',
  KG: 'kg',
  ML: 'ml',
  L: 'L',
  PCS: '个',
};

export function resolveBaseUnitLabel(baseUnit?: string | null): string {
  const key = String(baseUnit ?? '').trim().toUpperCase();
  return BASE_UNIT_LABELS[key] || '';
}
