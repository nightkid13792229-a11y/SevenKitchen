import type { FoodCategory } from './food-category-map';

/** 用户可见全称；表单、详情、DIY、打印统一使用。 */
export const PREPARATION_FIELD_LABEL = '部位 / 状态 / 预处理';

/**
 * 只有这些食材类别需要在上线前填写「部位 / 状态 / 预处理」。
 *
 * 补剂、油脂、调味、乳制品、未分类不要求：
 * 它们没有「部位/状态/预处理」的实际意义，填了也多半是套话。
 */
export const PREPARATION_REQUIRED_FOOD_CATEGORIES: ReadonlySet<FoodCategory> =
  new Set<FoodCategory>([
    'PROTEIN',
    'ORGAN',
    'AQUATIC',
    'EGG',
    'CARB',
    'VEGETABLE',
    'MUSHROOM',
    'NUTS',
    'LEGUME',
    'FRUIT',
  ]);

export function isPreparationRequiredFoodCategory(
  category: FoodCategory | null | undefined,
): boolean {
  return category ? PREPARATION_REQUIRED_FOOD_CATEGORIES.has(category) : false;
}
