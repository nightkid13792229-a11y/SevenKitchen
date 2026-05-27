import { createEmptyNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type {
  NutritionFieldSource,
  NutritionProfileV2,
  NutritionSourceForm,
} from '../ingredient/types';
import { NUTRITION_TAB_KEYS } from '../ingredient/nutrition-profile.constants';
import { mapUsdaNutrientsToNutritionProfile } from './nutrition-governance.utils';

export const RED_SWEET_PEPPER_FOUNDATION_SOURCE_KEY = 'USDA:2258590';
export const RED_SWEET_PEPPER_LEGACY_SOURCE_KEY = 'USDA:170108';

const USDA_PROVIDER = 'USDA FoodData Central';
const FOUNDATION_SOURCE_VERSION = 'USDA_FDC_FOUNDATION:2026-04-30';
const FOUNDATION_SOURCE_TITLE = 'USDA FoodData Central Foundation Foods';
const LEGACY_SOURCE_VERSION = 'USDA_FDC:2019-04-01';
const LEGACY_SOURCE_TITLE = 'USDA FoodData Central SR Legacy';

type FieldGroup = (typeof NUTRITION_TAB_KEYS)[number];
type FieldPath = `${FieldGroup}.${string}`;

export interface UsdaFoodNutrientInput {
  nutrient?: {
    id?: number;
    name?: string;
    unitName?: string;
  };
  amount?: number;
  type?: string;
  foodNutrientDerivation?: {
    code?: string;
    description?: string;
  };
}

export interface RedSweetPepperFoundationFoodRecord {
  fdcId: number;
  description: string;
  dataType: string;
  publicationDate: string;
  foodCategory: {
    description: string;
  };
  foodNutrients: UsdaFoodNutrientInput[];
}

export interface BuildRedSweetPepperPrimaryProfileInput {
  legacyFoodNutrients: UsdaFoodNutrientInput[];
  foundationSourceRecordId?: string | null;
  legacySourceRecordId?: string | null;
}

export const RED_SWEET_PEPPER_FOUNDATION_RECORD: RedSweetPepperFoundationFoodRecord =
  {
    fdcId: 2258590,
    description: 'Peppers, bell, red, raw',
    dataType: 'Foundation',
    publicationDate: '4/28/2022',
    foodCategory: {
      description: 'Vegetables and Vegetable Products',
    },
    foodNutrients: [
      analytical(1089, 'Iron, Fe', 'mg', 0.353),
      analytical(1090, 'Magnesium, Mg', 'mg', 11),
      analytical(1091, 'Phosphorus, P', 'mg', 26.6),
      analytical(1092, 'Potassium, K', 'mg', 213),
      analytical(1093, 'Sodium, Na', 'mg', 0),
      analytical(1095, 'Zinc, Zn', 'mg', 0.202),
      analytical(1098, 'Copper, Cu', 'mg', 0.04),
      analytical(1002, 'Nitrogen', 'g', 0.143),
      analytical(1162, 'Vitamin C, total ascorbic acid', 'mg', 142),
      analytical(1004, 'Total lipid (fat)', 'g', 0.126),
      analytical(1101, 'Manganese, Mn', 'mg', 0.133),
      analytical(1165, 'Thiamin', 'mg', 0.055),
      analytical(1166, 'Riboflavin', 'mg', 0.142),
      analytical(1007, 'Ash', 'g', 0.396),
      analytical(1167, 'Niacin', 'mg', 1.02),
      analytical(1103, 'Selenium, Se', 'µg', 0),
      analytical(1079, 'Fiber, total dietary', 'g', 1.16),
      analytical(1175, 'Vitamin B-6', 'mg', 0.303),
      analytical(1176, 'Biotin', 'µg', 0.427),
      analytical(1177, 'Folate, total', 'µg', 47.3),
      analytical(1051, 'Water', 'g', 91.9),
      analytical(1087, 'Calcium, Ca', 'mg', 6.36),
      calculated(1005, 'Carbohydrate, by difference', 'g', 6.65),
      calculated(1003, 'Protein', 'g', 0.896),
      calculated(2047, 'Energy (Atwater General Factors)', 'kcal', 31.3),
      calculated(2048, 'Energy (Atwater Specific Factors)', 'kcal', 27),
    ],
  };

function analytical(
  id: number,
  name: string,
  unitName: string,
  amount: number,
): UsdaFoodNutrientInput {
  return {
    nutrient: { id, name, unitName },
    amount,
    type: 'FoodNutrient',
    foodNutrientDerivation: {
      code: 'A',
      description: 'Analytical',
    },
  };
}

function calculated(
  id: number,
  name: string,
  unitName: string,
  amount: number,
): UsdaFoodNutrientInput {
  return {
    nutrient: { id, name, unitName },
    amount,
    type: 'FoodNutrient',
    foodNutrientDerivation: {
      code: 'NC',
      description: 'Calculated',
    },
  };
}

export function buildRedSweetPepperFoundationOnlyProfile(
  foundationSourceRecordId?: string | null,
): NutritionProfileV2 {
  const profile = mapUsdaNutrientsToNutritionProfile(
    RED_SWEET_PEPPER_FOUNDATION_RECORD.foodNutrients,
  );

  applyFoundationOnlyExtraFields(profile);
  profile.meta = {
    ...profile.meta,
    externalId: '2258590',
    sourceTitle: FOUNDATION_SOURCE_TITLE,
    sourceProvider: USDA_PROVIDER,
    sourceVersion: FOUNDATION_SOURCE_VERSION,
    sourceRecordId: foundationSourceRecordId ?? profile.meta.sourceRecordId,
    confidenceLevel: 'HIGH',
    versionNote:
      'USDA Foundation 2258590 Peppers, bell, red, raw; FoodData Central Foundation Foods 2026-04 download.',
  };
  enrichSourceMaps(profile, {
    role: 'PROFILE_PRIMARY',
    sourceKey: RED_SWEET_PEPPER_FOUNDATION_SOURCE_KEY,
    externalId: '2258590',
    sourceVersion: FOUNDATION_SOURCE_VERSION,
    sourceTitle: FOUNDATION_SOURCE_TITLE,
    sourceRecordId: foundationSourceRecordId,
    confidenceLevel: 'HIGH',
    noteZh:
      'USDA Foundation 2026-04 档案，作为红甜椒主来源字段。',
  });

  return profile;
}

export function buildRedSweetPepperPrimaryProfile(
  input: BuildRedSweetPepperPrimaryProfileInput,
): NutritionProfileV2 {
  const foundationProfile = buildRedSweetPepperFoundationOnlyProfile(
    input.foundationSourceRecordId,
  );
  const legacyProfile = mapUsdaNutrientsToNutritionProfile(
    input.legacyFoodNutrients,
  );

  enrichSourceMaps(legacyProfile, {
    role: 'FIELD_SUPPLEMENT',
    sourceKey: RED_SWEET_PEPPER_LEGACY_SOURCE_KEY,
    externalId: '170108',
    sourceVersion: LEGACY_SOURCE_VERSION,
    sourceTitle: LEGACY_SOURCE_TITLE,
    sourceRecordId: input.legacySourceRecordId,
    confidenceLevel: 'MEDIUM',
    noteZh:
      'Foundation 未提供该字段；使用同食材 USDA SR Legacy 170108 补源。',
  });

  const profile = createEmptyNutritionProfile();
  profile.customItems = [
    ...foundationProfile.customItems,
    ...legacyProfile.customItems,
  ];
  profile.meta = {
    rawBasisType: 'PER_100_G',
    sampleState: 'RAW',
    isEdiblePortionBasis: true,
    sourceType: 'USDA',
    sourceKind: 'FOOD_DATABASE',
    sourceCode: 'USDA_FDC',
    sourceVersion: FOUNDATION_SOURCE_VERSION,
    externalId: '2258590',
    sourceRecordId: input.foundationSourceRecordId ?? null,
    sourceTitle: FOUNDATION_SOURCE_TITLE,
    sourceProvider: USDA_PROVIDER,
    confidenceLevel: 'HIGH',
    sourceForms: {},
    fieldSources: {},
    conversionNotes: {},
    versionNote:
      'Primary source upgraded to USDA Foundation 2258590; fields absent from Foundation are supplemented from USDA SR Legacy 170108.',
  };

  for (const tabKey of NUTRITION_TAB_KEYS) {
    const fields = profile[tabKey] as Record<string, number | null>;
    const foundationFields = foundationProfile[tabKey] as Record<
      string,
      number | null
    >;
    const legacyFields = legacyProfile[tabKey] as Record<string, number | null>;

    for (const fieldKey of Object.keys(fields)) {
      const fieldPath = `${tabKey}.${fieldKey}` as FieldPath;
      if (isFiniteNumber(foundationFields[fieldKey])) {
        fields[fieldKey] = foundationFields[fieldKey];
        copySource(profile, foundationProfile, fieldPath);
        continue;
      }

      if (isFiniteNumber(legacyFields[fieldKey])) {
        fields[fieldKey] = legacyFields[fieldKey];
        copySource(profile, legacyProfile, fieldPath);
      }
    }
  }

  return profile;
}

function applyFoundationOnlyExtraFields(profile: NutritionProfileV2): void {
  const energySpecific = findFoundationNutrient(2048);
  if (energySpecific) {
    profile.macros.energyKcal = energySpecific.amount!;
    setSourceForm(profile, 'macros.energyKcal', {
      sourceNutrientId: 2048,
      sourceNutrientName: 'Energy (Atwater Specific Factors)',
      originalValue: energySpecific.amount!,
      originalUnit: 'kcal',
      canonicalValue: energySpecific.amount!,
      canonicalUnit: 'kcal',
      basisType: 'PER_100_G',
      derivationCode: 'NC',
      derivationDescription: 'Calculated',
    });
  }

  const biotin = findFoundationNutrient(1176);
  if (biotin) {
    profile.vitamins.vitaminB7 = biotin.amount!;
    setSourceForm(profile, 'vitamins.vitaminB7', {
      sourceNutrientId: 1176,
      sourceNutrientName: 'Biotin',
      originalValue: biotin.amount!,
      originalUnit: 'µg',
      canonicalValue: biotin.amount!,
      canonicalUnit: 'μg',
      basisType: 'PER_100_G',
      derivationCode: 'A',
      derivationDescription: 'Analytical',
    });
  }
}

function findFoundationNutrient(
  nutrientId: number,
): UsdaFoodNutrientInput | null {
  return (
    RED_SWEET_PEPPER_FOUNDATION_RECORD.foodNutrients.find(
      (item) => item.nutrient?.id === nutrientId,
    ) ?? null
  );
}

function setSourceForm(
  profile: NutritionProfileV2,
  fieldPath: FieldPath,
  sourceForm: NutritionSourceForm,
): void {
  profile.meta.sourceForms ??= {};
  profile.meta.fieldSources ??= {};
  profile.meta.sourceForms[fieldPath] = sourceForm;
  profile.meta.fieldSources[fieldPath] = sourceForm as NutritionFieldSource;
}

function enrichSourceMaps(
  profile: NutritionProfileV2,
  params: {
    role: 'PROFILE_PRIMARY' | 'FIELD_SUPPLEMENT';
    sourceKey: string;
    externalId: string;
    sourceVersion: string;
    sourceTitle: string;
    sourceRecordId?: string | null;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    noteZh: string;
  },
): void {
  profile.meta.sourceForms ??= {};
  profile.meta.fieldSources ??= {};

  for (const [fieldPath, sourceForm] of Object.entries(
    profile.meta.sourceForms,
  )) {
    const enriched = {
      ...sourceForm,
      sourceRole: params.role,
      sourceType: 'USDA',
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'USDA_FDC',
      sourceVersion: params.sourceVersion,
      sourceKey: params.sourceKey,
      externalId: params.externalId,
      sourceTitle: params.sourceTitle,
      sourceProvider: USDA_PROVIDER,
      sourceRecordId: params.sourceRecordId ?? null,
      compatibility: 'EXACT_FOOD',
      confidenceLevel: params.confidenceLevel,
      noteZh: params.noteZh,
    } satisfies NutritionFieldSource;

    profile.meta.sourceForms[fieldPath] = enriched;
    profile.meta.fieldSources[fieldPath] = enriched;
  }
}

function copySource(
  target: NutritionProfileV2,
  source: NutritionProfileV2,
  fieldPath: FieldPath,
): void {
  const sourceForm = source.meta.sourceForms?.[fieldPath];
  if (sourceForm) {
    target.meta.sourceForms![fieldPath] = sourceForm;
    target.meta.fieldSources![fieldPath] = sourceForm as NutritionFieldSource;
  }

  const note = source.meta.conversionNotes?.[fieldPath];
  if (note) {
    target.meta.conversionNotes![fieldPath] = note;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
