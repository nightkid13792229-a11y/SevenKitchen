import { BadRequestException } from '@nestjs/common';

/**
 * 补剂展示单位与库存基准单位的 1:1 校验。
 *
 * 需求：平勺可以按 PCS 记（1 平勺 = 1 PCS），但不能把 g / 平勺互相猜密度。
 * 上架体检、报价、下单、预占、分装共用这一处规则。
 */
export type SupplementBaseUnit = 'G' | 'ML' | 'PCS';

export function normalizeSupplementUnit(unit: string): string {
  return String(unit || '').trim().toLowerCase();
}

export function isSupplementUnitOneToOne(
  unit: string,
  baseUnit: string,
): boolean {
  const normalized = normalizeSupplementUnit(unit);
  const base = String(baseUnit || '').trim().toUpperCase();

  const isGram = ['g', '克', 'gram'].includes(normalized);
  const isMl = ['ml', '毫升'].includes(normalized);
  const isPcs = ['粒', '片', '个', '颗', '平勺', '勺', 'pcs'].includes(
    normalized,
  );

  if (base === 'G') return isGram;
  if (base === 'ML') return isMl;
  if (base === 'PCS') return isPcs;
  return false;
}

export function toSupplementBaseQuantity(
  unit: string,
  amount: number,
  baseUnit: string,
  ingredientName: string,
): number {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(`「${ingredientName}」数量必须大于 0`);
  }
  if (!isSupplementUnitOneToOne(unit, baseUnit)) {
    throw new BadRequestException(
      `「${ingredientName}」的单位「${unit}」无法与库存基准单位 ${baseUnit} 1:1 对应；请先在原料档案修正`,
    );
  }
  return round3(value);
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}
