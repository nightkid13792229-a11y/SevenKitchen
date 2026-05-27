import {
  AMINO_ACID_NUTRIENT_KEYS,
  FATTY_ACID_NUTRIENT_KEYS,
  MACRO_NUTRIENT_KEYS,
  MINERAL_NUTRIENT_KEYS,
  VITAMIN_NUTRIENT_KEYS,
} from '../../domain/ingredient/nutrition-profile.constants';
import type {
  NutritionFieldSource,
  NutritionProfileV2,
} from '../../domain/ingredient/types';

type IngredientCreationProfileTab =
  | 'macros'
  | 'minerals'
  | 'vitamins'
  | 'fattyAcids'
  | 'aminoAcids';

type IngredientCreationProfileFieldPath =
  `${IngredientCreationProfileTab}.${string}`;

type NutrientLabelMap<TKey extends readonly string[]> = Record<
  TKey[number],
  string
>;

export interface IngredientCreationProfileFieldDefinition {
  fieldPath: IngredientCreationProfileFieldPath;
  label: string;
}

export interface IngredientCreationMissingField {
  fieldPath: IngredientCreationProfileFieldPath;
  label: string;
}

export interface IngredientCreationFieldSourceSummary {
  fieldPath: IngredientCreationProfileFieldPath;
  label: string;
  sourceType: string | null;
  sourceKey: string | null;
  confidenceLevel: string | null;
  compatibility: string | null;
}

export interface IngredientCreationProfileCompletenessSummary {
  total: number;
  filled: number;
  nonZero: number;
  zero: number;
  empty: number;
  missingFields: IngredientCreationMissingField[];
  sourceCoverage: {
    filledWithSource: number;
    filledWithoutSource: number;
  };
  fieldSources: IngredientCreationFieldSourceSummary[];
}

const MACRO_LABELS: NutrientLabelMap<typeof MACRO_NUTRIENT_KEYS> = {
  energyKcal: '能量',
  moisture: '水分',
  crudeProtein: '粗蛋白',
  crudeFat: '粗脂肪',
  ash: '灰分',
  carbohydrate: '碳水化合物',
  fiber: '膳食纤维',
  solubleFiber: '可溶性纤维',
  insolubleFiber: '不可溶性纤维',
};

const MINERAL_LABELS: NutrientLabelMap<typeof MINERAL_NUTRIENT_KEYS> = {
  calcium: '钙',
  phosphorus: '磷',
  potassium: '钾',
  sodium: '钠',
  magnesium: '镁',
  chloride: '氯',
  iron: '铁',
  zinc: '锌',
  copper: '铜',
  manganese: '锰',
  selenium: '硒',
  iodine: '碘',
};

const VITAMIN_LABELS: NutrientLabelMap<typeof VITAMIN_NUTRIENT_KEYS> = {
  vitaminA: '维生素 A',
  vitaminD: '维生素 D',
  vitaminE: '维生素 E',
  vitaminK: '维生素 K',
  vitaminB1: '维生素 B1',
  vitaminB2: '维生素 B2',
  vitaminB3: '维生素 B3',
  vitaminB5: '维生素 B5',
  vitaminB6: '维生素 B6',
  vitaminB7: '维生素 B7',
  vitaminB9: '维生素 B9',
  vitaminB12: '维生素 B12',
  choline: '胆碱',
  vitaminC: '维生素 C',
};

const FATTY_ACID_LABELS: NutrientLabelMap<typeof FATTY_ACID_NUTRIENT_KEYS> = {
  saturatedFattyAcids: '饱和脂肪酸',
  monounsaturatedFattyAcids: '单不饱和脂肪酸',
  polyunsaturatedFattyAcids: '多不饱和脂肪酸',
  linoleicAcid: '亚油酸',
  alphaLinolenicAcid: 'α-亚麻酸',
  arachidonicAcid: '花生四烯酸',
  epa: 'EPA',
  dpa: 'DPA',
  dha: 'DHA',
};

const AMINO_ACID_LABELS: NutrientLabelMap<typeof AMINO_ACID_NUTRIENT_KEYS> = {
  arginine: '精氨酸',
  lysine: '赖氨酸',
  methionine: '蛋氨酸',
  cystine: '胱氨酸',
  taurine: '牛磺酸',
  tryptophan: '色氨酸',
  threonine: '苏氨酸',
  leucine: '亮氨酸',
  isoleucine: '异亮氨酸',
  valine: '缬氨酸',
  phenylalanine: '苯丙氨酸',
  tyrosine: '酪氨酸',
  histidine: '组氨酸',
  glutamicAcid: '谷氨酸',
  glycine: '甘氨酸',
  proline: '脯氨酸',
};

function buildFieldDefinitions<TKey extends readonly string[]>(
  tabKey: IngredientCreationProfileTab,
  fieldKeys: TKey,
  labels: NutrientLabelMap<TKey>,
): IngredientCreationProfileFieldDefinition[] {
  return fieldKeys.map((fieldKey) => {
    const typedFieldKey = fieldKey as TKey[number];
    return {
      fieldPath:
        `${tabKey}.${typedFieldKey}` as IngredientCreationProfileFieldPath,
      label: labels[typedFieldKey],
    };
  });
}

export const INGREDIENT_CREATION_PROFILE_FIELD_DEFINITIONS: readonly IngredientCreationProfileFieldDefinition[] =
  [
    ...buildFieldDefinitions('macros', MACRO_NUTRIENT_KEYS, MACRO_LABELS),
    ...buildFieldDefinitions('minerals', MINERAL_NUTRIENT_KEYS, MINERAL_LABELS),
    ...buildFieldDefinitions('vitamins', VITAMIN_NUTRIENT_KEYS, VITAMIN_LABELS),
    ...buildFieldDefinitions(
      'fattyAcids',
      FATTY_ACID_NUTRIENT_KEYS,
      FATTY_ACID_LABELS,
    ),
    ...buildFieldDefinitions(
      'aminoAcids',
      AMINO_ACID_NUTRIENT_KEYS,
      AMINO_ACID_LABELS,
    ),
  ];

function isFilledNutritionValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readProfileValue(
  profile: NutritionProfileV2,
  fieldPath: IngredientCreationProfileFieldPath,
): unknown {
  const [tabKey, fieldKey] = fieldPath.split('.') as [
    IngredientCreationProfileTab,
    string,
  ];
  const tab = profile[tabKey] as Record<string, unknown> | undefined;

  return tab?.[fieldKey];
}

function summarizeFieldSource(
  definition: IngredientCreationProfileFieldDefinition,
  source: NutritionFieldSource,
): IngredientCreationFieldSourceSummary {
  return {
    fieldPath: definition.fieldPath,
    label: definition.label,
    sourceType: source.sourceType ?? null,
    sourceKey: source.sourceKey ?? null,
    confidenceLevel: source.confidenceLevel ?? null,
    compatibility: source.compatibility ?? null,
  };
}

export function summarizeIngredientCreationProfileCompleteness(
  profile: NutritionProfileV2,
): IngredientCreationProfileCompletenessSummary {
  let nonZero = 0;
  let zero = 0;
  let filledWithSource = 0;
  let filledWithoutSource = 0;
  const missingFields: IngredientCreationMissingField[] = [];
  const fieldSources: IngredientCreationFieldSourceSummary[] = [];

  for (const definition of INGREDIENT_CREATION_PROFILE_FIELD_DEFINITIONS) {
    const value = readProfileValue(profile, definition.fieldPath);
    const source = profile.meta.fieldSources?.[definition.fieldPath];
    const hasSource = source !== undefined && source !== null;

    if (hasSource) {
      fieldSources.push(summarizeFieldSource(definition, source));
    }

    if (!isFilledNutritionValue(value)) {
      missingFields.push({
        fieldPath: definition.fieldPath,
        label: definition.label,
      });
      continue;
    }

    if (value === 0) {
      zero += 1;
    } else {
      nonZero += 1;
    }

    if (hasSource) {
      filledWithSource += 1;
    } else {
      filledWithoutSource += 1;
    }
  }

  const total = INGREDIENT_CREATION_PROFILE_FIELD_DEFINITIONS.length;
  const filled = nonZero + zero;

  return {
    total,
    filled,
    nonZero,
    zero,
    empty: total - filled,
    missingFields,
    sourceCoverage: {
      filledWithSource,
      filledWithoutSource,
    },
    fieldSources,
  };
}
