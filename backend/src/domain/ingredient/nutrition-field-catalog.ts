import { normalizeNutritionProfile } from './nutrition-profile.utils';
import type { NutritionProfile, NutritionProfileV2 } from './types';

export type NutritionFieldTab =
  | 'macros'
  | 'minerals'
  | 'vitamins'
  | 'fattyAcids'
  | 'aminoAcids';

export interface NutritionFieldDefinition {
  tabKey: NutritionFieldTab;
  fieldKey: string;
  fieldPath: `${NutritionFieldTab}.${string}`;
  label: string;
  unit: string;
}

const fields = <TTab extends NutritionFieldTab>(
  tabKey: TTab,
  entries: Array<{ fieldKey: string; label: string; unit: string }>,
): NutritionFieldDefinition[] =>
  entries.map((entry) => ({
    tabKey,
    fieldKey: entry.fieldKey,
    fieldPath:
      `${tabKey}.${entry.fieldKey}` as `${NutritionFieldTab}.${string}`,
    label: entry.label,
    unit: entry.unit,
  }));

export const NUTRITION_FIELD_CATALOG: readonly NutritionFieldDefinition[] = [
  ...fields('macros', [
    { fieldKey: 'energyKcal', label: '能量', unit: 'kcal' },
    { fieldKey: 'moisture', label: '水分', unit: 'g' },
    { fieldKey: 'crudeProtein', label: '粗蛋白', unit: 'g' },
    { fieldKey: 'crudeFat', label: '粗脂肪', unit: 'g' },
    { fieldKey: 'ash', label: '灰分', unit: 'g' },
    { fieldKey: 'carbohydrate', label: '碳水化合物', unit: 'g' },
    { fieldKey: 'fiber', label: '膳食纤维', unit: 'g' },
    { fieldKey: 'solubleFiber', label: '可溶性纤维', unit: 'g' },
    { fieldKey: 'insolubleFiber', label: '不可溶性纤维', unit: 'g' },
  ]),
  ...fields('minerals', [
    { fieldKey: 'calcium', label: '钙', unit: 'mg' },
    { fieldKey: 'phosphorus', label: '磷', unit: 'mg' },
    { fieldKey: 'potassium', label: '钾', unit: 'mg' },
    { fieldKey: 'sodium', label: '钠', unit: 'mg' },
    { fieldKey: 'magnesium', label: '镁', unit: 'mg' },
    { fieldKey: 'chloride', label: '氯', unit: 'mg' },
    { fieldKey: 'iron', label: '铁', unit: 'mg' },
    { fieldKey: 'zinc', label: '锌', unit: 'mg' },
    { fieldKey: 'copper', label: '铜', unit: 'mg' },
    { fieldKey: 'manganese', label: '锰', unit: 'mg' },
    { fieldKey: 'selenium', label: '硒', unit: 'μg' },
    { fieldKey: 'iodine', label: '碘', unit: 'μg' },
  ]),
  ...fields('vitamins', [
    { fieldKey: 'vitaminA', label: '维生素 A', unit: 'IU' },
    { fieldKey: 'vitaminD', label: '维生素 D', unit: 'IU' },
    { fieldKey: 'vitaminE', label: '维生素 E', unit: 'IU' },
    { fieldKey: 'vitaminK', label: '维生素 K', unit: 'μg' },
    { fieldKey: 'vitaminB1', label: '维生素 B1', unit: 'mg' },
    { fieldKey: 'vitaminB2', label: '维生素 B2', unit: 'mg' },
    { fieldKey: 'vitaminB3', label: '维生素 B3', unit: 'mg' },
    { fieldKey: 'vitaminB5', label: '维生素 B5', unit: 'mg' },
    { fieldKey: 'vitaminB6', label: '维生素 B6', unit: 'mg' },
    { fieldKey: 'vitaminB7', label: '维生素 B7', unit: 'μg' },
    { fieldKey: 'vitaminB9', label: '维生素 B9', unit: 'μg' },
    { fieldKey: 'vitaminB12', label: '维生素 B12', unit: 'μg' },
    { fieldKey: 'choline', label: '胆碱', unit: 'mg' },
    { fieldKey: 'vitaminC', label: '维生素 C', unit: 'mg' },
  ]),
  ...fields('fattyAcids', [
    { fieldKey: 'saturatedFattyAcids', label: '饱和脂肪酸', unit: 'g' },
    {
      fieldKey: 'monounsaturatedFattyAcids',
      label: '单不饱和脂肪酸',
      unit: 'g',
    },
    {
      fieldKey: 'polyunsaturatedFattyAcids',
      label: '多不饱和脂肪酸',
      unit: 'g',
    },
    { fieldKey: 'linoleicAcid', label: '亚油酸', unit: 'g' },
    { fieldKey: 'alphaLinolenicAcid', label: 'α-亚麻酸', unit: 'g' },
    { fieldKey: 'arachidonicAcid', label: '花生四烯酸', unit: 'g' },
    { fieldKey: 'epa', label: 'EPA', unit: 'mg' },
    { fieldKey: 'dpa', label: 'DPA', unit: 'mg' },
    { fieldKey: 'dha', label: 'DHA', unit: 'mg' },
  ]),
  ...fields('aminoAcids', [
    { fieldKey: 'arginine', label: '精氨酸', unit: 'g' },
    { fieldKey: 'lysine', label: '赖氨酸', unit: 'g' },
    { fieldKey: 'methionine', label: '蛋氨酸', unit: 'g' },
    { fieldKey: 'cystine', label: '胱氨酸', unit: 'g' },
    { fieldKey: 'taurine', label: '牛磺酸', unit: 'g' },
    { fieldKey: 'tryptophan', label: '色氨酸', unit: 'g' },
    { fieldKey: 'threonine', label: '苏氨酸', unit: 'g' },
    { fieldKey: 'leucine', label: '亮氨酸', unit: 'g' },
    { fieldKey: 'isoleucine', label: '异亮氨酸', unit: 'g' },
    { fieldKey: 'valine', label: '缬氨酸', unit: 'g' },
    { fieldKey: 'phenylalanine', label: '苯丙氨酸', unit: 'g' },
    { fieldKey: 'tyrosine', label: '酪氨酸', unit: 'g' },
    { fieldKey: 'histidine', label: '组氨酸', unit: 'g' },
    { fieldKey: 'glutamicAcid', label: '谷氨酸', unit: 'g' },
    { fieldKey: 'glycine', label: '甘氨酸', unit: 'g' },
    { fieldKey: 'proline', label: '脯氨酸', unit: 'g' },
  ]),
];

export function listSupplementTargetFields(): NutritionFieldDefinition[] {
  return [...NUTRITION_FIELD_CATALOG];
}

export function findNutritionField(
  fieldPath: string | null | undefined,
): NutritionFieldDefinition | undefined {
  return NUTRITION_FIELD_CATALOG.find(
    (field) => field.fieldPath === fieldPath,
  );
}

export function getNutritionProfileFieldValue(
  nutritionProfile: NutritionProfile | null | undefined,
  fieldPath: string,
): number | undefined {
  const field = findNutritionField(fieldPath);
  if (!field) {
    return undefined;
  }

  const normalized = normalizeNutritionProfile(
    nutritionProfile,
  ) as NutritionProfileV2 | null;
  const tabValues = normalized?.[field.tabKey] as
    | Record<string, number | null | undefined>
    | undefined;
  const value = tabValues?.[field.fieldKey];

  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
