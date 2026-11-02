/**
 * 该不该显示「新增采购商品」入口（2026-11-01）。
 *
 * 老板定：这次只管食材，补剂和包材不开放。后端 `assertFoodIngredientCanOwnProcurementSkus`
 * 也只允许 FOOD —— 所以界面必须同一口径，否则员工点了就是一个 400 的死路，
 * 而他正站在货架前。
 */
export function canAddProcurementSku(itemType?: string | null): boolean {
  return itemType === 'FOOD';
}
