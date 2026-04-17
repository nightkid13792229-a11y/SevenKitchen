import { normalizeNutritionProfile } from './nutrition-profile.utils';
import type {
  ActiveNutrientValue,
  NutritionProfile,
  NutritionProfileV2,
} from './types';

type NutritionProfileTabKey =
  | 'macros'
  | 'minerals'
  | 'vitamins'
  | 'fattyAcids'
  | 'aminoAcids';

interface SupplementNutrientFieldDefinition {
  tabKey: NutritionProfileTabKey;
  fieldKey: string;
  label: string;
  unit: string;
}

const SUPPLEMENT_NUTRIENT_FIELDS: readonly SupplementNutrientFieldDefinition[] = [
  { tabKey: 'macros', fieldKey: 'energyKcal', label: '能量', unit: 'kcal' },
  { tabKey: 'macros', fieldKey: 'moisture', label: '水分', unit: 'g' },
  { tabKey: 'macros', fieldKey: 'crudeProtein', label: '粗蛋白', unit: 'g' },
  { tabKey: 'macros', fieldKey: 'crudeFat', label: '粗脂肪', unit: 'g' },
  { tabKey: 'macros', fieldKey: 'ash', label: '灰分', unit: 'g' },
  { tabKey: 'macros', fieldKey: 'carbohydrate', label: '碳水化合物', unit: 'g' },
  { tabKey: 'macros', fieldKey: 'fiber', label: '膳食纤维', unit: 'g' },
  { tabKey: 'macros', fieldKey: 'solubleFiber', label: '可溶性纤维', unit: 'g' },
  { tabKey: 'macros', fieldKey: 'insolubleFiber', label: '不可溶性纤维', unit: 'g' },
  { tabKey: 'minerals', fieldKey: 'calcium', label: '钙', unit: 'mg' },
  { tabKey: 'minerals', fieldKey: 'phosphorus', label: '磷', unit: 'mg' },
  { tabKey: 'minerals', fieldKey: 'potassium', label: '钾', unit: 'mg' },
  { tabKey: 'minerals', fieldKey: 'sodium', label: '钠', unit: 'mg' },
  { tabKey: 'minerals', fieldKey: 'magnesium', label: '镁', unit: 'mg' },
  { tabKey: 'minerals', fieldKey: 'chloride', label: '氯', unit: 'mg' },
  { tabKey: 'minerals', fieldKey: 'iron', label: '铁', unit: 'mg' },
  { tabKey: 'minerals', fieldKey: 'zinc', label: '锌', unit: 'mg' },
  { tabKey: 'minerals', fieldKey: 'copper', label: '铜', unit: 'mg' },
  { tabKey: 'minerals', fieldKey: 'manganese', label: '锰', unit: 'mg' },
  { tabKey: 'minerals', fieldKey: 'selenium', label: '硒', unit: 'μg' },
  { tabKey: 'minerals', fieldKey: 'iodine', label: '碘', unit: 'μg' },
  { tabKey: 'vitamins', fieldKey: 'vitaminA', label: '维生素 A', unit: 'IU' },
  { tabKey: 'vitamins', fieldKey: 'vitaminD', label: '维生素 D', unit: 'IU' },
  { tabKey: 'vitamins', fieldKey: 'vitaminE', label: '维生素 E', unit: 'IU' },
  { tabKey: 'vitamins', fieldKey: 'vitaminK', label: '维生素 K', unit: 'μg' },
  { tabKey: 'vitamins', fieldKey: 'vitaminB1', label: '维生素 B1', unit: 'mg' },
  { tabKey: 'vitamins', fieldKey: 'vitaminB2', label: '维生素 B2', unit: 'mg' },
  { tabKey: 'vitamins', fieldKey: 'vitaminB3', label: '维生素 B3', unit: 'mg' },
  { tabKey: 'vitamins', fieldKey: 'vitaminB5', label: '维生素 B5', unit: 'mg' },
  { tabKey: 'vitamins', fieldKey: 'vitaminB6', label: '维生素 B6', unit: 'mg' },
  { tabKey: 'vitamins', fieldKey: 'vitaminB7', label: '维生素 B7', unit: 'μg' },
  { tabKey: 'vitamins', fieldKey: 'vitaminB9', label: '维生素 B9', unit: 'μg' },
  { tabKey: 'vitamins', fieldKey: 'vitaminB12', label: '维生素 B12', unit: 'μg' },
  { tabKey: 'vitamins', fieldKey: 'choline', label: '胆碱', unit: 'mg' },
  { tabKey: 'vitamins', fieldKey: 'vitaminC', label: '维生素 C', unit: 'mg' },
  { tabKey: 'fattyAcids', fieldKey: 'saturatedFattyAcids', label: '饱和脂肪酸', unit: 'g' },
  { tabKey: 'fattyAcids', fieldKey: 'monounsaturatedFattyAcids', label: '单不饱和脂肪酸', unit: 'g' },
  { tabKey: 'fattyAcids', fieldKey: 'polyunsaturatedFattyAcids', label: '多不饱和脂肪酸', unit: 'g' },
  { tabKey: 'fattyAcids', fieldKey: 'linoleicAcid', label: '亚油酸', unit: 'g' },
  { tabKey: 'fattyAcids', fieldKey: 'alphaLinolenicAcid', label: 'α-亚麻酸', unit: 'g' },
  { tabKey: 'fattyAcids', fieldKey: 'arachidonicAcid', label: '花生四烯酸', unit: 'g' },
  { tabKey: 'fattyAcids', fieldKey: 'epa', label: 'EPA', unit: 'mg' },
  { tabKey: 'fattyAcids', fieldKey: 'dpa', label: 'DPA', unit: 'mg' },
  { tabKey: 'fattyAcids', fieldKey: 'dha', label: 'DHA', unit: 'mg' },
  { tabKey: 'aminoAcids', fieldKey: 'arginine', label: '精氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'lysine', label: '赖氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'methionine', label: '蛋氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'cystine', label: '胱氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'taurine', label: '牛磺酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'tryptophan', label: '色氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'threonine', label: '苏氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'leucine', label: '亮氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'isoleucine', label: '异亮氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'valine', label: '缬氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'phenylalanine', label: '苯丙氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'tyrosine', label: '酪氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'histidine', label: '组氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'glutamicAcid', label: '谷氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'glycine', label: '甘氨酸', unit: 'g' },
  { tabKey: 'aminoAcids', fieldKey: 'proline', label: '脯氨酸', unit: 'g' },
];

function normalizeLegacyTargetKey(label: string): string {
  return label.replace(/\s+/g, '');
}

function assignResolvedNutrient(
  activeNutrients: Record<string, ActiveNutrientValue>,
  label: string,
  value: number | null | undefined,
  unit: string,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return;
  }

  activeNutrients[normalizeLegacyTargetKey(label)] = { value, unit };
}

function buildFromStructuredProfile(
  profile: NutritionProfileV2,
): Record<string, ActiveNutrientValue> {
  const activeNutrients: Record<string, ActiveNutrientValue> = {};

  for (const field of SUPPLEMENT_NUTRIENT_FIELDS) {
    const tabValues = profile[field.tabKey] as Record<string, number | null | undefined>;
    assignResolvedNutrient(
      activeNutrients,
      field.label,
      tabValues?.[field.fieldKey],
      field.unit,
    );
  }

  for (const item of profile.customItems ?? []) {
    const name = item.name?.trim();
    const unit = item.unit?.trim();
    if (!name || !unit) {
      continue;
    }
    assignResolvedNutrient(activeNutrients, name, item.value, unit);
  }

  return activeNutrients;
}

export function resolveSupplementNutrients(input: {
  nutritionProfile: NutritionProfile | null | undefined;
  fallback?: Record<string, ActiveNutrientValue>;
}): Record<string, ActiveNutrientValue> {
  // Temporary display compatibility for old clients that still read active_nutrients.
  // New supplement dosing must use nutritionProfile + supplementTargets directly.
  if (!input.nutritionProfile) {
    return { ...(input.fallback ?? {}) };
  }

  const normalizedProfile = normalizeNutritionProfile(input.nutritionProfile);
  if (!normalizedProfile) {
    return { ...(input.fallback ?? {}) };
  }

  return buildFromStructuredProfile(normalizedProfile);
}
