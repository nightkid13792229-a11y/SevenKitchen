import type { NutritionFieldTab } from '../ingredient/nutrition-field-catalog';
import { findNutritionField } from '../ingredient/nutrition-field-catalog';
import { createEmptyNutritionProfile } from '../ingredient/nutrition-profile.utils';
import {
  buildVitaminASourceFormMetadata,
  calculateVitaminAActivityIu,
  getVitaminAConversion,
} from '../ingredient/vitamin-a-conversion';
import {
  buildVitaminESourceFormMetadata,
  calculateVitaminEActivityIu,
  getVitaminEConversion,
} from '../ingredient/vitamin-e-conversion';
import type { NutritionProfileV2 } from '../ingredient/types';

export const NZFCD_SOURCE_PROVIDER = 'New Zealand Food Composition Database';
export const NZFCD_SOURCE_CODE = 'NZFCD_FOODFILES';
export const NZFCD_SOURCE_VERSION = 'FOODfiles 2024 Version 01';

export type NzfcdNutritionFieldPath = `${NutritionFieldTab}.${string}`;

export interface NzfcdComponent {
  component_code?: string | null;
  component_shortname?: string | null;
  component_displayname?: string | null;
  num_value?: number | null;
  value?: string | null;
  unit_abbr?: string | null;
}

interface NzfcdNutrientMapping {
  componentCode: string;
  tabKey: NutritionFieldTab;
  fieldKey: string;
  fieldPath: NzfcdNutritionFieldPath;
  amountMultiplier?: number;
  fieldPriority?: number;
  conversionNote?: string;
  sourceFormMetadata?: Record<string, string | number | boolean | null>;
}

const NZFCD_VITAMIN_E_CONVERSION = getVitaminEConversion('D_ALPHA_TOCOPHEROL');
const NZFCD_VITAMIN_A_EQUIVALENT_CONVERSION = getVitaminAConversion(
  'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS',
);
const NZFCD_COUNTED_VITAMIN_A_COMPONENT_CODES = new Set(['RETOL', 'CARTB']);

const nzfcdField = (
  componentCode: string,
  tabKey: NutritionFieldTab,
  fieldKey: string,
  options: {
    amountMultiplier?: number;
    fieldPriority?: number;
    conversionNote?: string;
    sourceFormMetadata?: Record<string, string | number | boolean | null>;
  } = {},
): NzfcdNutrientMapping => ({
  componentCode,
  tabKey,
  fieldKey,
  fieldPath: `${tabKey}.${fieldKey}`,
  ...options,
});

export const NZFCD_NUTRIENT_MAP: readonly NzfcdNutrientMapping[] = [
  nzfcdField('ENERC_FSANZ2_KCAL', 'macros', 'energyKcal', {
    fieldPriority: 10,
  }),
  nzfcdField('ENERC_KCAL', 'macros', 'energyKcal', {
    fieldPriority: 20,
  }),
  nzfcdField('WATER', 'macros', 'moisture'),
  nzfcdField('PROT', 'macros', 'crudeProtein'),
  nzfcdField('FAT', 'macros', 'crudeFat'),
  nzfcdField('ASH', 'macros', 'ash'),
  nzfcdField('CHOAVL_FSANZ', 'macros', 'carbohydrate', {
    fieldPriority: 10,
  }),
  nzfcdField('CHOCDF', 'macros', 'carbohydrate', {
    fieldPriority: 20,
  }),
  nzfcdField('FIBTG', 'macros', 'fiber'),
  nzfcdField('FIBSOL', 'macros', 'solubleFiber', {
    fieldPriority: 10,
  }),
  nzfcdField('PSACNSS', 'macros', 'solubleFiber', {
    fieldPriority: 20,
  }),
  nzfcdField('FIBINS', 'macros', 'insolubleFiber', {
    fieldPriority: 10,
  }),
  nzfcdField('PSACNSI', 'macros', 'insolubleFiber', {
    fieldPriority: 20,
  }),
  nzfcdField('CA', 'minerals', 'calcium'),
  nzfcdField('P', 'minerals', 'phosphorus'),
  nzfcdField('K', 'minerals', 'potassium'),
  nzfcdField('NA', 'minerals', 'sodium'),
  nzfcdField('MG', 'minerals', 'magnesium'),
  nzfcdField('FE', 'minerals', 'iron'),
  nzfcdField('ZN', 'minerals', 'zinc'),
  nzfcdField('CU', 'minerals', 'copper'),
  nzfcdField('MN', 'minerals', 'manganese', {
    amountMultiplier: 0.001,
    conversionNote:
      'NZFCD manganese is reported in µg; internal manganese is stored in mg.',
    sourceFormMetadata: {
      conversionFactor: 0.001,
      conversionFactorUnit: 'MG_PER_UG',
    },
  }),
  nzfcdField('SE', 'minerals', 'selenium'),
  nzfcdField('ID', 'minerals', 'iodine'),
  nzfcdField('VITA_RAE', 'vitamins', 'vitaminA', {
    amountMultiplier:
      NZFCD_VITAMIN_A_EQUIVALENT_CONVERSION?.ugPerIu === undefined
        ? 10 / 3
        : 1 / NZFCD_VITAMIN_A_EQUIVALENT_CONVERSION.ugPerIu,
    fieldPriority: 10,
    conversionNote:
      'NZFCD vitamin A RAE is used as a fallback only when retinol and beta-carotene component rows are absent; 1 µg retinol activity equivalent = 3.333 IU retinol activity.',
    sourceFormMetadata: {
      sourceCompound: 'Vitamin A, retinol activity equivalents',
      vitaminAForm: 'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS',
      conversionStatus: 'SOURCE_EQUIVALENT_FALLBACK',
      conversionFactor:
        NZFCD_VITAMIN_A_EQUIVALENT_CONVERSION?.ugPerIu === undefined
          ? 10 / 3
          : 1 / NZFCD_VITAMIN_A_EQUIVALENT_CONVERSION.ugPerIu,
      conversionFactorUnit: 'IU_PER_UG_RAE',
      conversionFactorSource: 'FEDIAF_2025_TABLE_VII_14',
    },
  }),
  nzfcdField('VITA', 'vitamins', 'vitaminA', {
    amountMultiplier:
      NZFCD_VITAMIN_A_EQUIVALENT_CONVERSION?.ugPerIu === undefined
        ? 10 / 3
        : 1 / NZFCD_VITAMIN_A_EQUIVALENT_CONVERSION.ugPerIu,
    fieldPriority: 20,
    conversionNote:
      'NZFCD vitamin A retinol equivalents are used only when component rows and RAE are absent; 1 µg RE = 3.333 IU retinol activity.',
    sourceFormMetadata: {
      sourceCompound: 'Vitamin A, retinol equivalents',
      vitaminAForm: 'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS',
      conversionStatus: 'SOURCE_EQUIVALENT_FALLBACK',
      conversionFactor:
        NZFCD_VITAMIN_A_EQUIVALENT_CONVERSION?.ugPerIu === undefined
          ? 10 / 3
          : 1 / NZFCD_VITAMIN_A_EQUIVALENT_CONVERSION.ugPerIu,
      conversionFactorUnit: 'IU_PER_UG_RE',
      conversionFactorSource: 'FEDIAF_2025_TABLE_VII_14',
    },
  }),
  nzfcdField('VITD', 'vitamins', 'vitaminD', {
    amountMultiplier: 40,
    fieldPriority: 10,
    conversionNote: '1 µg vitamin D = 40 IU',
    sourceFormMetadata: {
      sourceCompound: 'Vitamin D calculated by summation',
      vitaminDForm: 'D2_PLUS_D3',
      conversionFactor: 40,
      conversionFactorUnit: 'IU_PER_UG',
    },
  }),
  nzfcdField('CHOCAL', 'vitamins', 'vitaminD', {
    amountMultiplier: 40,
    fieldPriority: 20,
    conversionNote:
      'NZFCD cholecalciferol is used for vitamin D only when total vitamin D is absent; 1 µg vitamin D3 = 40 IU.',
    sourceFormMetadata: {
      sourceCompound: 'Cholecalciferol (Vitamin D3)',
      vitaminDForm: 'D3_CHOLECALCIFEROL',
      conversionFactor: 40,
      conversionFactorUnit: 'IU_PER_UG',
    },
  }),
  nzfcdField('TOCPHA', 'vitamins', 'vitaminE', {
    amountMultiplier: NZFCD_VITAMIN_E_CONVERSION?.iuPerMg,
    fieldPriority: 10,
    conversionNote:
      'FEDIAF 2025 vitamin E activity: d-α-tocopherol 1 mg = 1.49 IU；来源只给出 α-生育酚时作为保守下限，其他生育酚形态未计入。',
    sourceFormMetadata: NZFCD_VITAMIN_E_CONVERSION
      ? {
          vitaminEForm: NZFCD_VITAMIN_E_CONVERSION.form,
          sourceCompound: NZFCD_VITAMIN_E_CONVERSION.sourceCompound,
          conversionFactor: NZFCD_VITAMIN_E_CONVERSION.iuPerMg,
          conversionFactorUnit: 'IU_PER_MG',
          conversionFactorSource: NZFCD_VITAMIN_E_CONVERSION.source,
        }
      : undefined,
  }),
  nzfcdField('VITE', 'vitamins', 'vitaminE', {
    amountMultiplier: NZFCD_VITAMIN_E_CONVERSION?.iuPerMg,
    fieldPriority: 20,
    conversionNote:
      '来源给出 α-生育酚当量，按活性当量换算为 IU；不额外估算或叠加其他生育酚形态。',
    sourceFormMetadata: {
      vitaminEForm: 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT',
      sourceCompound: 'source alpha-tocopherol equivalents',
      conversionStatus: 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT',
      conversionFactor: NZFCD_VITAMIN_E_CONVERSION?.iuPerMg ?? 1.49,
      conversionFactorUnit: 'IU_PER_MG',
      conversionFactorSource: 'FEDIAF_2025',
    },
  }),
  nzfcdField('THIA', 'vitamins', 'vitaminB1'),
  nzfcdField('RIBF', 'vitamins', 'vitaminB2'),
  nzfcdField('NIA', 'vitamins', 'vitaminB3'),
  nzfcdField('VITB6A', 'vitamins', 'vitaminB6'),
  nzfcdField('FOL', 'vitamins', 'vitaminB9'),
  nzfcdField('VITB12', 'vitamins', 'vitaminB12'),
  nzfcdField('VITC', 'vitamins', 'vitaminC'),
  nzfcdField('FASAT', 'fattyAcids', 'saturatedFattyAcids'),
  nzfcdField('FAMS', 'fattyAcids', 'monounsaturatedFattyAcids'),
  nzfcdField('FAPU', 'fattyAcids', 'polyunsaturatedFattyAcids'),
  nzfcdField('F18D2N6', 'fattyAcids', 'linoleicAcid'),
  nzfcdField('F18D3N3', 'fattyAcids', 'alphaLinolenicAcid'),
  nzfcdField('F20D4N6', 'fattyAcids', 'arachidonicAcid'),
  nzfcdField('F20D5N3', 'fattyAcids', 'epa', {
    amountMultiplier: 1000,
    conversionNote: 'NZFCD EPA is reported in g; internal EPA is stored in mg.',
  }),
  nzfcdField('F22D5N3', 'fattyAcids', 'dpa', {
    amountMultiplier: 1000,
    conversionNote: 'NZFCD DPA is reported in g; internal DPA is stored in mg.',
  }),
  nzfcdField('F22D6N3', 'fattyAcids', 'dha', {
    amountMultiplier: 1000,
    conversionNote: 'NZFCD DHA is reported in g; internal DHA is stored in mg.',
  }),
  nzfcdField('TRP_G', 'aminoAcids', 'tryptophan'),
];

const NZFCD_REVIEW_ONLY_CATEGORIES: Record<
  string,
  {
    canonicalFieldPath: string;
    reviewCategory: string;
    note: string;
  }
> = {
  RETOL: {
    canonicalFieldPath: 'vitamins.vitaminA',
    reviewCategory: 'NZFCD_VITAMIN_A_RELATED',
    note: '未单独计入维生素 A 主字段：主字段优先采用 NZFCD Vitamin A, retinol activity equivalents。',
  },
  CARTA: {
    canonicalFieldPath: 'vitamins.vitaminA',
    reviewCategory: 'NZFCD_VITAMIN_A_RELATED',
    note: '未单独计入维生素 A 主字段：类胡萝卜素先保留来源项供审核。',
  },
  CARTB: {
    canonicalFieldPath: 'vitamins.vitaminA',
    reviewCategory: 'NZFCD_VITAMIN_A_RELATED',
    note: '未单独计入维生素 A 主字段：类胡萝卜素先保留来源项供审核。',
  },
  CARTBEQ: {
    canonicalFieldPath: 'vitamins.vitaminA',
    reviewCategory: 'NZFCD_VITAMIN_A_RELATED',
    note: '未单独计入维生素 A 主字段：类胡萝卜素等价值先保留来源项供审核。',
  },
  VITA: {
    canonicalFieldPath: 'vitamins.vitaminA',
    reviewCategory: 'NZFCD_VITAMIN_A_RELATED',
    note: '维生素 A retinol equivalents 来源项保留供追溯；主字段优先采用 RAE。',
  },
  CHOCAL: {
    canonicalFieldPath: 'vitamins.vitaminD',
    reviewCategory: 'NZFCD_VITAMIN_D_RELATED',
    note: '维生素 D3 来源项保留供追溯；主字段优先采用 total vitamin D。',
  },
  ERGCAL: {
    canonicalFieldPath: 'vitamins.vitaminD',
    reviewCategory: 'NZFCD_VITAMIN_D_RELATED',
    note: '维生素 D2 来源项保留供追溯；主字段优先采用 total vitamin D。',
  },
  VITE: {
    canonicalFieldPath: 'vitamins.vitaminE',
    reviewCategory: 'NZFCD_VITAMIN_E_RELATED',
    note: '维生素 E alpha-tocopherol equivalents 来源项保留供追溯；有 alpha-tocopherol 分项时优先采用分项，缺失时可作为活性当量 fallback。',
  },
};

export function mapNzfcdComponentsToNutritionProfile(
  components: NzfcdComponent[],
): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  profile.meta.rawBasisType = 'PER_100_G';
  profile.meta.sourceType = 'NZFCD';
  profile.meta.sourceKind = 'FOOD_DATABASE';
  profile.meta.sourceCode = NZFCD_SOURCE_CODE;
  profile.meta.sourceProvider = NZFCD_SOURCE_PROVIDER;
  profile.meta.sourceVersion = NZFCD_SOURCE_VERSION;
  profile.meta.sourceForms = {};
  profile.meta.conversionNotes = {};

  const assignedFieldPriorities = new Map<string, number>();

  for (const component of components) {
    const componentCode = component.component_code?.trim();
    const amount = component.num_value;
    if (
      !componentCode ||
      typeof amount !== 'number' ||
      !Number.isFinite(amount)
    ) {
      continue;
    }

    const reviewOnlyItem = buildNzfcdReviewOnlyCustomItem({
      component,
      amount,
      rawBasisType: profile.meta.rawBasisType,
    });
    if (reviewOnlyItem) {
      profile.customItems.push(reviewOnlyItem);
    }

    const mapping = NZFCD_NUTRIENT_MAP.find(
      (item) => item.componentCode === componentCode,
    );
    if (!mapping) {
      continue;
    }

    const nextPriority = mapping.fieldPriority ?? 100;
    const assignedPriority = assignedFieldPriorities.get(mapping.fieldPath);
    if (
      typeof assignedPriority === 'number' &&
      assignedPriority <= nextPriority
    ) {
      continue;
    }

    const canonicalValue = amount * (mapping.amountMultiplier ?? 1);
    const tab = profile[mapping.tabKey] as Record<string, number | null>;
    tab[mapping.fieldKey] = canonicalValue;
    assignedFieldPriorities.set(mapping.fieldPath, nextPriority);

    const field = findNutritionField(mapping.fieldPath);
    profile.meta.sourceForms[mapping.fieldPath] = {
      sourceNutrientId: componentCode,
      sourceNutrientName:
        component.component_shortname ??
        component.component_displayname ??
        null,
      originalValue: amount,
      originalUnit: component.unit_abbr ?? null,
      canonicalValue,
      canonicalUnit: field?.unit ?? null,
      basisType: profile.meta.rawBasisType,
      ...(mapping.sourceFormMetadata ?? {}),
    };
    if (mapping.conversionNote) {
      profile.meta.conversionNotes[mapping.fieldPath] = mapping.conversionNote;
    }
  }

  applyNzfcdVitaminAActivity(profile, components);
  applyNzfcdVitaminEActivity(profile, components);

  return profile;
}

function findNzfcdAmount(
  components: NzfcdComponent[],
  componentCode: string,
): number | null {
  const component = components.find(
    (item) => item.component_code?.trim() === componentCode,
  );
  const amount = component?.num_value;
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : null;
}

function applyNzfcdVitaminAActivity(
  profile: NutritionProfileV2,
  components: NzfcdComponent[],
) {
  const retinolUg = findNzfcdAmount(components, 'RETOL');
  const betaCaroteneUg = findNzfcdAmount(components, 'CARTB');
  const calculation = calculateVitaminAActivityIu({
    retinolUg,
    betaCaroteneUg,
  });
  if (!calculation) {
    return;
  }

  const hasRetinol = retinolUg !== null;
  const hasBetaCarotene = betaCaroteneUg !== null;

  profile.vitamins.vitaminA = calculation.valueIu;
  profile.meta.sourceForms ??= {};
  profile.meta.conversionNotes ??= {};
  profile.meta.sourceForms['vitamins.vitaminA'] = {
    sourceNutrientId:
      hasRetinol && hasBetaCarotene
        ? 'NZFCD:RETOL+CARTB'
        : hasRetinol
          ? 'RETOL'
          : 'CARTB',
    sourceNutrientName:
      hasRetinol && hasBetaCarotene
        ? 'Vitamin A activity from retinol and beta-carotene'
        : hasRetinol
          ? 'Retinol'
          : 'Beta-carotene',
    originalValue:
      hasRetinol && hasBetaCarotene
        ? null
        : hasRetinol
          ? retinolUg
          : betaCaroteneUg,
    originalUnit: 'µg/100g',
    canonicalValue: calculation.valueIu,
    canonicalUnit: findNutritionField('vitamins.vitaminA')?.unit ?? null,
    basisType: profile.meta.rawBasisType,
    ...buildVitaminASourceFormMetadata(calculation),
  };
  profile.meta.conversionNotes['vitamins.vitaminA'] =
    `${calculation.note} NZFCD RAE/RE is used only when component rows are unavailable.`;
}

function applyNzfcdVitaminEActivity(
  profile: NutritionProfileV2,
  components: NzfcdComponent[],
) {
  const alphaTocopherolMg = findNzfcdAmount(components, 'TOCPHA');
  const betaTocopherolMg = findNzfcdAmount(components, 'TOCPHB');
  const gammaTocopherolMg = findNzfcdAmount(components, 'TOCPHG');
  const deltaTocopherolMg = findNzfcdAmount(components, 'TOCPHD');
  const hasSplitComponents =
    alphaTocopherolMg !== null ||
    betaTocopherolMg !== null ||
    gammaTocopherolMg !== null ||
    deltaTocopherolMg !== null;

  const calculation = hasSplitComponents
    ? calculateVitaminEActivityIu({
        alphaTocopherolMg,
        betaTocopherolMg,
        gammaTocopherolMg,
        deltaTocopherolMg,
      })
    : calculateVitaminEActivityIu({
        alphaTocopherolEquivalentMg: findNzfcdAmount(components, 'VITE'),
      });

  if (!calculation) {
    return;
  }

  profile.vitamins.vitaminE = calculation.valueIu;
  profile.meta.sourceForms ??= {};
  profile.meta.conversionNotes ??= {};
  profile.meta.sourceForms['vitamins.vitaminE'] = {
    sourceNutrientId:
      calculation.status === 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT'
        ? 'VITE'
        : calculation.status === 'ALPHA_ONLY_LOWER_BOUND'
          ? 'TOCPHA'
          : 'NZFCD:TOCPHA+TOCPHB+TOCPHG+TOCPHD',
    sourceNutrientName:
      calculation.status === 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT'
        ? 'Vitamin E, alpha-tocopherol equivalents'
        : calculation.status === 'ALPHA_ONLY_LOWER_BOUND'
          ? 'Alpha-tocopherol'
          : 'Vitamin E tocopherol component activity',
    originalValue:
      calculation.status === 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT'
        ? findNzfcdAmount(components, 'VITE')
        : calculation.status === 'ALPHA_ONLY_LOWER_BOUND'
          ? alphaTocopherolMg
          : null,
    originalUnit: 'mg/100g',
    canonicalValue: calculation.valueIu,
    canonicalUnit: findNutritionField('vitamins.vitaminE')?.unit ?? null,
    basisType: profile.meta.rawBasisType,
    ...buildVitaminESourceFormMetadata(calculation),
  };
  profile.meta.conversionNotes['vitamins.vitaminE'] = calculation.note;
}

function buildNzfcdReviewOnlyCustomItem(params: {
  component: NzfcdComponent;
  amount: number;
  rawBasisType: NutritionProfileV2['meta']['rawBasisType'];
}): NutritionProfileV2['customItems'][number] | null {
  if (params.amount <= 0) {
    return null;
  }

  const componentCode = params.component.component_code?.trim();
  if (!componentCode) {
    return null;
  }
  if (NZFCD_COUNTED_VITAMIN_A_COMPONENT_CODES.has(componentCode)) {
    return null;
  }

  const reviewCategory = NZFCD_REVIEW_ONLY_CATEGORIES[componentCode];
  if (!reviewCategory) {
    return null;
  }

  return {
    name:
      params.component.component_shortname ??
      params.component.component_displayname ??
      componentCode,
    value: params.amount,
    unit: params.component.unit_abbr ?? '',
    rawBasisType: params.rawBasisType,
    note: reviewCategory.note,
    sourceNutrientId: componentCode,
    sourceNutrientName:
      params.component.component_shortname ??
      params.component.component_displayname ??
      null,
    canonicalFieldPath: reviewCategory.canonicalFieldPath,
    reviewCategory: reviewCategory.reviewCategory,
    reviewStatus: 'REVIEW_ONLY',
  };
}
