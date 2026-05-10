import type { NutritionFieldTab } from '../ingredient/nutrition-field-catalog';

export type NutritionFieldPath = `${NutritionFieldTab}.${string}`;

export interface UsdaNutrientMapping {
  nutrientId: number;
  tabKey: NutritionFieldTab;
  fieldKey: string;
  fieldPath: NutritionFieldPath;
  amountMultiplier?: number;
}

const usdaField = (
  nutrientId: number,
  tabKey: NutritionFieldTab,
  fieldKey: string,
  options: { amountMultiplier?: number } = {},
): UsdaNutrientMapping => ({
  nutrientId,
  tabKey,
  fieldKey,
  fieldPath: `${tabKey}.${fieldKey}`,
  ...options,
});

export const USDA_NUTRIENT_MAP: readonly UsdaNutrientMapping[] = [
  usdaField(1008, 'macros', 'energyKcal'),
  usdaField(1051, 'macros', 'moisture'),
  usdaField(1003, 'macros', 'crudeProtein'),
  usdaField(1004, 'macros', 'crudeFat'),
  usdaField(1007, 'macros', 'ash'),
  usdaField(1005, 'macros', 'carbohydrate'),
  usdaField(1079, 'macros', 'fiber'),
  usdaField(1087, 'minerals', 'calcium'),
  usdaField(1091, 'minerals', 'phosphorus'),
  usdaField(1092, 'minerals', 'potassium'),
  usdaField(1093, 'minerals', 'sodium'),
  usdaField(1090, 'minerals', 'magnesium'),
  usdaField(1089, 'minerals', 'iron'),
  usdaField(1095, 'minerals', 'zinc'),
  usdaField(1098, 'minerals', 'copper'),
  usdaField(1101, 'minerals', 'manganese'),
  usdaField(1103, 'minerals', 'selenium'),
  usdaField(1104, 'vitamins', 'vitaminA'),
  usdaField(1114, 'vitamins', 'vitaminD', { amountMultiplier: 40 }),
  usdaField(1109, 'vitamins', 'vitaminE', { amountMultiplier: 1 / 0.67 }),
  usdaField(1165, 'vitamins', 'vitaminB1'),
  usdaField(1166, 'vitamins', 'vitaminB2'),
  usdaField(1167, 'vitamins', 'vitaminB3'),
  usdaField(1170, 'vitamins', 'vitaminB5'),
  usdaField(1175, 'vitamins', 'vitaminB6'),
  usdaField(1178, 'vitamins', 'vitaminB12'),
  usdaField(1180, 'vitamins', 'choline'),
  usdaField(1177, 'vitamins', 'vitaminB9'),
  usdaField(1213, 'aminoAcids', 'leucine'),
  usdaField(1292, 'fattyAcids', 'monounsaturatedFattyAcids'),
  usdaField(1293, 'fattyAcids', 'polyunsaturatedFattyAcids'),
  usdaField(1316, 'fattyAcids', 'linoleicAcid'),
  usdaField(1404, 'fattyAcids', 'alphaLinolenicAcid'),
  usdaField(1258, 'fattyAcids', 'saturatedFattyAcids'),
];
