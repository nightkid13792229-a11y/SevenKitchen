/**
 * 按重量买的单位换算（2026-11-10 补货改版）。
 *
 * 只用于「没有采购商品」的重量行：斤/两/克/公斤/kg → 基准单位（克）。
 * 基准单位是 PCS 的原料（鸡蛋等）不走这里，必须用商品净含量。
 */
export const WEIGHT_UNIT_TO_BASE_RATIO: Record<string, number> = {
  斤: 500,
  两: 50,
  克: 1,
  g: 1,
  公斤: 1000,
  千克: 1000,
  kg: 1000,
};

export function isWeightUnit(unit?: string | null): boolean {
  const normalized = String(unit ?? '').trim().toLowerCase();
  return (
    normalized.length > 0 &&
    WEIGHT_UNIT_TO_BASE_RATIO[normalized] !== undefined
  );
}

export function weightUnitToBaseRatio(
  unit?: string | null,
): number | undefined {
  return WEIGHT_UNIT_TO_BASE_RATIO[
    String(unit ?? '').trim().toLowerCase()
  ];
}
