import type { DesignerItem } from '@/types/recipeDesigner'

/**
 * 草稿原料的「标准原料身份」。
 *
 * Agent 通过 nutritionFoodId 加原料时不一定带 ingredientId；
 * 此时原料名称/类型必须从营养档案的映射里反查，不能退回英文档案名，
 * 也不能把补剂当成食材（否则补剂的宏量营养素会卡住能量评估）。
 */
export function itemMappingIngredient(item: DesignerItem) {
  const mappings = item.nutritionFood?.mappings ?? []
  return (
    mappings.find(
      (mapping) => mapping.ingredientId === item.ingredientId,
    ) ??
    mappings.find((mapping) => mapping.isPrimary) ??
    mappings[0] ??
    null
  )
}

export function itemIngredientName(item: DesignerItem): string | null {
  return (
    item.ingredientName ||
    item.ingredient?.name ||
    itemMappingIngredient(item)?.ingredient?.name ||
    null
  )
}

export function itemIngredientType(item: DesignerItem): string | null {
  return (
    item.ingredientType ||
    item.ingredient?.type ||
    itemMappingIngredient(item)?.ingredient?.type ||
    null
  )
}

export function isSupplementDesignerItem(item: DesignerItem): boolean {
  return String(itemIngredientType(item) ?? '').trim().toUpperCase() === 'SUPPLEMENT'
}
