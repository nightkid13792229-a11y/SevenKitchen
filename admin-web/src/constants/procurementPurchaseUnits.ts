/**
 * 采购单位白名单（与后端 `ALLOWED_PURCHASE_UNITS_BY_BASE_UNIT` 保持一致）。
 *
 * 后端会拒绝白名单外的单位，所以前端的下拉必须用同一份清单 ——
 * 否则管理员选了「罐」，保存时才被 400 拒掉，等于把死路做进界面。
 */
import { BaseUnit } from '@/types/ingredient'

export const PROCUREMENT_PURCHASE_UNITS_BY_BASE_UNIT: Record<
  string,
  string[]
> = {
  [BaseUnit.G]: [
    'g',
    'kg',
    '斤',
    '两',
    '吨',
    '个',
    '只',
    '条',
    '块',
    '片',
    '颗',
    '粒',
    '包',
    '袋',
    '盒',
    '箱',
    '瓶',
    '桶',
    '罐',
    '份'
  ],
  [BaseUnit.ML]: ['ml', 'L', '瓶', '桶', '罐', '盒', '箱', '袋', '包'],
  [BaseUnit.PCS]: [
    '个',
    '只',
    '片',
    '粒',
    '颗',
    '条',
    '块',
    '包',
    '袋',
    '盒',
    '箱',
    '瓶',
    '罐',
    '卷'
  ]
}

export function purchaseUnitsForBaseUnit(
  baseUnit: string | null | undefined
): string[] {
  if (!baseUnit) return []
  return PROCUREMENT_PURCHASE_UNITS_BY_BASE_UNIT[baseUnit] ?? []
}
