import { normalizeNutritionProfile } from './nutrition-profile.utils';
import type { NutritionProfile, NutritionProfileV2 } from './types';

export type NutritionFieldTab =
  | 'macros'
  | 'minerals'
  | 'vitamins'
  | 'fattyAcids'
  | 'aminoAcids';

export type NutritionQuantityKind = 'ENERGY' | 'MASS' | 'ACTIVITY' | 'RATIO';

export type NutritionConversionPolicy =
  | 'DIRECT'
  | 'UNIT_CONVERSION'
  | 'SOURCE_FORM_REQUIRED_FOR_LABELS'
  | 'DERIVED';

export interface NutritionSourceAlias {
  sourceCode: string;
  sourceNutrientId?: number;
  sourceFieldName: string;
  sourceUnit?: string;
}

export interface NutritionFieldDefinition {
  tabKey: NutritionFieldTab;
  fieldKey: string;
  fieldPath: `${NutritionFieldTab}.${string}`;
  label: string;
  unit: string;
  quantityKind: NutritionQuantityKind;
  canonicalUnitBasis: string;
  conversionPolicy: NutritionConversionPolicy;
  sourceAliases?: NutritionSourceAlias[];
}

export interface DerivedNutritionFieldDefinition {
  fieldPath: `derived.${string}`;
  label: string;
  unit: string;
  quantityKind: 'MASS' | 'RATIO';
  sourceFieldPaths: readonly `${NutritionFieldTab}.${string}`[];
  formula: 'SUM' | 'RATIO';
}

interface NutritionFieldEntry {
  fieldKey: string;
  label: string;
  unit: string;
  quantityKind?: NutritionQuantityKind;
  canonicalUnitBasis?: string;
  conversionPolicy?: NutritionConversionPolicy;
  sourceAliases?: NutritionSourceAlias[];
}

const toSnakeCase = (value: string): string =>
  value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const normalizeUnitForBasis = (unit: string): string =>
  unit
    .replace(/μ/g, 'u')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const inferQuantityKind = (
  fieldKey: string,
  unit: string,
): NutritionQuantityKind => {
  if (fieldKey === 'energyKcal') {
    return 'ENERGY';
  }
  if (unit === 'IU') {
    return 'ACTIVITY';
  }
  return 'MASS';
};

const inferConversionPolicy = (
  quantityKind: NutritionQuantityKind,
): NutritionConversionPolicy =>
  quantityKind === 'ACTIVITY'
    ? 'SOURCE_FORM_REQUIRED_FOR_LABELS'
    : 'UNIT_CONVERSION';

const usdaAlias = (
  sourceNutrientId: number,
  sourceFieldName: string,
  sourceUnit?: string,
): NutritionSourceAlias => ({
  sourceCode: 'USDA_FDC',
  sourceNutrientId,
  sourceFieldName,
  sourceUnit,
});

const fields = <TTab extends NutritionFieldTab>(
  tabKey: TTab,
  entries: NutritionFieldEntry[],
): NutritionFieldDefinition[] =>
  entries.map((entry) => {
    const quantityKind =
      entry.quantityKind ?? inferQuantityKind(entry.fieldKey, entry.unit);

    return {
      tabKey,
      fieldKey: entry.fieldKey,
      fieldPath:
        `${tabKey}.${entry.fieldKey}` as `${NutritionFieldTab}.${string}`,
      label: entry.label,
      unit: entry.unit,
      quantityKind,
      canonicalUnitBasis:
        entry.canonicalUnitBasis ??
        `${toSnakeCase(entry.fieldKey)}_${normalizeUnitForBasis(entry.unit)}`,
      conversionPolicy:
        entry.conversionPolicy ?? inferConversionPolicy(quantityKind),
      sourceAliases: entry.sourceAliases,
    };
  });

export const NUTRITION_FIELD_CATALOG: readonly NutritionFieldDefinition[] = [
  ...fields('macros', [
    {
      fieldKey: 'energyKcal',
      label: '能量',
      unit: 'kcal',
      canonicalUnitBasis: 'energy_kcal',
      sourceAliases: [usdaAlias(1008, 'Energy', 'kcal')],
    },
    {
      fieldKey: 'moisture',
      label: '水分',
      unit: 'g',
      sourceAliases: [usdaAlias(1051, 'Water', 'g')],
    },
    {
      fieldKey: 'crudeProtein',
      label: '粗蛋白',
      unit: 'g',
      sourceAliases: [usdaAlias(1003, 'Protein', 'g')],
    },
    {
      fieldKey: 'crudeFat',
      label: '粗脂肪',
      unit: 'g',
      sourceAliases: [usdaAlias(1004, 'Total lipid (fat)', 'g')],
    },
    {
      fieldKey: 'ash',
      label: '灰分',
      unit: 'g',
      sourceAliases: [usdaAlias(1007, 'Ash', 'g')],
    },
    {
      fieldKey: 'carbohydrate',
      label: '碳水化合物',
      unit: 'g',
      sourceAliases: [usdaAlias(1005, 'Carbohydrate, by difference', 'g')],
    },
    {
      fieldKey: 'fiber',
      label: '膳食纤维',
      unit: 'g',
      sourceAliases: [usdaAlias(1079, 'Fiber, total dietary', 'g')],
    },
    { fieldKey: 'solubleFiber', label: '可溶性纤维', unit: 'g' },
    { fieldKey: 'insolubleFiber', label: '不可溶性纤维', unit: 'g' },
  ]),
  ...fields('minerals', [
    {
      fieldKey: 'calcium',
      label: '钙',
      unit: 'mg',
      sourceAliases: [usdaAlias(1087, 'Calcium, Ca', 'mg')],
    },
    {
      fieldKey: 'phosphorus',
      label: '磷',
      unit: 'mg',
      sourceAliases: [usdaAlias(1091, 'Phosphorus, P', 'mg')],
    },
    {
      fieldKey: 'potassium',
      label: '钾',
      unit: 'mg',
      sourceAliases: [usdaAlias(1092, 'Potassium, K', 'mg')],
    },
    {
      fieldKey: 'sodium',
      label: '钠',
      unit: 'mg',
      sourceAliases: [usdaAlias(1093, 'Sodium, Na', 'mg')],
    },
    {
      fieldKey: 'magnesium',
      label: '镁',
      unit: 'mg',
      sourceAliases: [usdaAlias(1090, 'Magnesium, Mg', 'mg')],
    },
    { fieldKey: 'chloride', label: '氯', unit: 'mg' },
    {
      fieldKey: 'iron',
      label: '铁',
      unit: 'mg',
      sourceAliases: [usdaAlias(1089, 'Iron, Fe', 'mg')],
    },
    {
      fieldKey: 'zinc',
      label: '锌',
      unit: 'mg',
      sourceAliases: [usdaAlias(1095, 'Zinc, Zn', 'mg')],
    },
    {
      fieldKey: 'copper',
      label: '铜',
      unit: 'mg',
      sourceAliases: [usdaAlias(1098, 'Copper, Cu', 'mg')],
    },
    {
      fieldKey: 'manganese',
      label: '锰',
      unit: 'mg',
      sourceAliases: [usdaAlias(1101, 'Manganese, Mn', 'mg')],
    },
    {
      fieldKey: 'selenium',
      label: '硒',
      unit: 'μg',
      sourceAliases: [usdaAlias(1103, 'Selenium, Se', 'μg')],
    },
    { fieldKey: 'iodine', label: '碘', unit: 'μg' },
  ]),
  ...fields('vitamins', [
    {
      fieldKey: 'vitaminA',
      label: '维生素 A',
      unit: 'IU',
      canonicalUnitBasis: 'vitamin_a_activity_iu',
      conversionPolicy: 'SOURCE_FORM_REQUIRED_FOR_LABELS',
      sourceAliases: [usdaAlias(1104, 'Vitamin A, IU', 'IU')],
    },
    {
      fieldKey: 'vitaminD',
      label: '维生素 D',
      unit: 'IU',
      canonicalUnitBasis: 'vitamin_d_activity_iu',
      conversionPolicy: 'SOURCE_FORM_REQUIRED_FOR_LABELS',
      sourceAliases: [usdaAlias(1114, 'Vitamin D (D2 + D3)', 'μg')],
    },
    {
      fieldKey: 'vitaminE',
      label: '维生素 E',
      unit: 'IU',
      canonicalUnitBasis: 'vitamin_e_activity_iu',
      conversionPolicy: 'SOURCE_FORM_REQUIRED_FOR_LABELS',
      sourceAliases: [usdaAlias(1109, 'Vitamin E (alpha-tocopherol)', 'mg')],
    },
    {
      fieldKey: 'vitaminK',
      label: '维生素 K',
      unit: 'μg',
      canonicalUnitBasis: 'vitamin_k_activity_ug',
    },
    {
      fieldKey: 'vitaminB1',
      label: '维生素 B1',
      unit: 'mg',
      sourceAliases: [usdaAlias(1165, 'Thiamin', 'mg')],
    },
    {
      fieldKey: 'vitaminB2',
      label: '维生素 B2',
      unit: 'mg',
      sourceAliases: [usdaAlias(1166, 'Riboflavin', 'mg')],
    },
    {
      fieldKey: 'vitaminB3',
      label: '维生素 B3',
      unit: 'mg',
      sourceAliases: [usdaAlias(1167, 'Niacin', 'mg')],
    },
    {
      fieldKey: 'vitaminB5',
      label: '维生素 B5',
      unit: 'mg',
      sourceAliases: [usdaAlias(1170, 'Pantothenic acid', 'mg')],
    },
    {
      fieldKey: 'vitaminB6',
      label: '维生素 B6',
      unit: 'mg',
      sourceAliases: [usdaAlias(1175, 'Vitamin B-6', 'mg')],
    },
    { fieldKey: 'vitaminB7', label: '维生素 B7', unit: 'μg' },
    {
      fieldKey: 'vitaminB9',
      label: '维生素 B9',
      unit: 'μg',
      sourceAliases: [usdaAlias(1177, 'Folate, total', 'μg')],
    },
    {
      fieldKey: 'vitaminB12',
      label: '维生素 B12',
      unit: 'μg',
      sourceAliases: [usdaAlias(1178, 'Vitamin B-12', 'μg')],
    },
    {
      fieldKey: 'choline',
      label: '胆碱',
      unit: 'mg',
      sourceAliases: [usdaAlias(1180, 'Choline, total', 'mg')],
    },
    { fieldKey: 'vitaminC', label: '维生素 C', unit: 'mg' },
  ]),
  ...fields('fattyAcids', [
    {
      fieldKey: 'saturatedFattyAcids',
      label: '饱和脂肪酸',
      unit: 'g',
      sourceAliases: [
        usdaAlias(1258, 'Fatty acids, total saturated', 'g'),
      ],
    },
    {
      fieldKey: 'monounsaturatedFattyAcids',
      label: '单不饱和脂肪酸',
      unit: 'g',
      sourceAliases: [
        usdaAlias(1292, 'Fatty acids, total monounsaturated', 'g'),
      ],
    },
    {
      fieldKey: 'polyunsaturatedFattyAcids',
      label: '多不饱和脂肪酸',
      unit: 'g',
      sourceAliases: [
        usdaAlias(1293, 'Fatty acids, total polyunsaturated', 'g'),
      ],
    },
    {
      fieldKey: 'linoleicAcid',
      label: '亚油酸',
      unit: 'g',
      sourceAliases: [usdaAlias(1316, '18:2 undifferentiated', 'g')],
    },
    {
      fieldKey: 'alphaLinolenicAcid',
      label: 'α-亚麻酸',
      unit: 'g',
      sourceAliases: [usdaAlias(1404, '18:3 undifferentiated', 'g')],
    },
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

export const DERIVED_NUTRITION_FIELD_CATALOG = [
  {
    fieldPath: 'derived.epaDha',
    label: 'EPA + DHA',
    unit: 'mg',
    quantityKind: 'MASS',
    sourceFieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
    formula: 'SUM',
  },
  {
    fieldPath: 'derived.caP',
    label: '钙磷比',
    unit: 'ratio',
    quantityKind: 'RATIO',
    sourceFieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
    formula: 'RATIO',
  },
] as const satisfies readonly DerivedNutritionFieldDefinition[];

const cloneNutritionField = (
  field: NutritionFieldDefinition,
): NutritionFieldDefinition => ({
  ...field,
  sourceAliases: field.sourceAliases?.map((alias) => ({ ...alias })),
});

const cloneDerivedNutritionField = (
  field: DerivedNutritionFieldDefinition,
): DerivedNutritionFieldDefinition => ({
  ...field,
  sourceFieldPaths: [...field.sourceFieldPaths],
});

export function listSupplementTargetFields(): NutritionFieldDefinition[] {
  return NUTRITION_FIELD_CATALOG.map(cloneNutritionField);
}

export function listDerivedNutritionFields(): DerivedNutritionFieldDefinition[] {
  return DERIVED_NUTRITION_FIELD_CATALOG.map(cloneDerivedNutritionField);
}

export function findNutritionField(
  fieldPath: string | null | undefined,
): NutritionFieldDefinition | undefined {
  const field = NUTRITION_FIELD_CATALOG.find(
    (field) => field.fieldPath === fieldPath,
  );
  return field ? cloneNutritionField(field) : undefined;
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
