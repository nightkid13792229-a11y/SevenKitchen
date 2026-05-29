import type { NutritionFieldTab } from '../ingredient/nutrition-field-catalog';
import { getVitaminEConversion } from '../ingredient/vitamin-e-conversion';

export type NutritionFieldPath = `${NutritionFieldTab}.${string}`;
type SourceFormMetadata = Record<string, string | number | boolean | null>;

const USDA_VITAMIN_E_CONVERSION = getVitaminEConversion('D_ALPHA_TOCOPHEROL');

export interface UsdaNutrientMapping {
  nutrientId: number;
  tabKey: NutritionFieldTab;
  fieldKey: string;
  fieldPath: NutritionFieldPath;
  sourceUnit?: string;
  amountMultiplier?: number;
  fieldPriority?: number;
  conversionNote?: string;
  sourceFormMetadata?: SourceFormMetadata;
}

const usdaField = (
  nutrientId: number,
  tabKey: NutritionFieldTab,
  fieldKey: string,
  options: {
    sourceUnit?: string;
    amountMultiplier?: number;
    fieldPriority?: number;
    conversionNote?: string;
    sourceFormMetadata?: SourceFormMetadata;
  } = {},
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
  usdaField(1103, 'minerals', 'selenium', { sourceUnit: 'µg' }),
  usdaField(1100, 'minerals', 'iodine', { sourceUnit: 'µg' }),
  usdaField(1104, 'vitamins', 'vitaminA', {
    sourceUnit: 'IU',
    conversionNote:
      'USDA Vitamin A, IU is kept as a fallback source value; when USDA retinol or beta-carotene component rows are available, the field is recalculated with FEDIAF 2025 dog vitamin A activity factors.',
    sourceFormMetadata: {
      sourceCompound: 'source-declared vitamin A activity',
      vitaminAForm: 'SOURCE_DECLARED_IU',
      conversionStatus: 'SOURCE_DECLARED_IU_FALLBACK',
    },
  }),
  usdaField(1110, 'vitamins', 'vitaminD', {
    sourceUnit: 'IU',
    fieldPriority: 20,
    conversionNote:
      'USDA Vitamin D IU is already stored as vitamin D activity; D2/D3 component rows are retained for review.',
    sourceFormMetadata: {
      sourceCompound: 'Vitamin D (D2 + D3), IU',
      vitaminDForm: 'D2_PLUS_D3',
    },
  }),
  usdaField(1114, 'vitamins', 'vitaminD', {
    sourceUnit: 'µg',
    amountMultiplier: 40,
    fieldPriority: 10,
    conversionNote: '1 µg vitamin D = 40 IU',
    sourceFormMetadata: {
      sourceCompound: 'Vitamin D (D2 + D3)',
      vitaminDForm: 'D2_PLUS_D3',
      conversionFactor: 40,
      conversionFactorUnit: 'IU_PER_UG',
    },
  }),
  usdaField(1109, 'vitamins', 'vitaminE', {
    sourceUnit: 'mg',
    amountMultiplier: USDA_VITAMIN_E_CONVERSION?.iuPerMg,
    conversionNote:
      'FEDIAF 2025 vitamin E activity: d-α-tocopherol 1 mg = 1.49 IU',
    sourceFormMetadata: USDA_VITAMIN_E_CONVERSION
      ? {
          vitaminEForm: USDA_VITAMIN_E_CONVERSION.form,
          sourceCompound: USDA_VITAMIN_E_CONVERSION.sourceCompound,
          conversionFactor: USDA_VITAMIN_E_CONVERSION.iuPerMg,
          conversionFactorUnit: 'IU_PER_MG',
          conversionFactorSource: USDA_VITAMIN_E_CONVERSION.source,
        }
      : undefined,
  }),
  usdaField(1162, 'vitamins', 'vitaminC'),
  usdaField(1185, 'vitamins', 'vitaminK', {
    sourceUnit: 'µg',
    sourceFormMetadata: {
      sourceCompound: 'phylloquinone (K1)',
      vitaminKForm: 'K1_PHYLLOQUINONE',
    },
  }),
  usdaField(1165, 'vitamins', 'vitaminB1'),
  usdaField(1166, 'vitamins', 'vitaminB2'),
  usdaField(1167, 'vitamins', 'vitaminB3'),
  usdaField(1170, 'vitamins', 'vitaminB5'),
  usdaField(1175, 'vitamins', 'vitaminB6'),
  usdaField(1178, 'vitamins', 'vitaminB12'),
  usdaField(1180, 'vitamins', 'choline'),
  usdaField(1177, 'vitamins', 'vitaminB9'),
  usdaField(1220, 'aminoAcids', 'arginine'),
  usdaField(1214, 'aminoAcids', 'lysine'),
  usdaField(1215, 'aminoAcids', 'methionine'),
  usdaField(1216, 'aminoAcids', 'cystine'),
  usdaField(1210, 'aminoAcids', 'tryptophan'),
  usdaField(1211, 'aminoAcids', 'threonine'),
  usdaField(1213, 'aminoAcids', 'leucine'),
  usdaField(1212, 'aminoAcids', 'isoleucine'),
  usdaField(1219, 'aminoAcids', 'valine'),
  usdaField(1217, 'aminoAcids', 'phenylalanine'),
  usdaField(1218, 'aminoAcids', 'tyrosine'),
  usdaField(1221, 'aminoAcids', 'histidine'),
  usdaField(1224, 'aminoAcids', 'glutamicAcid'),
  usdaField(1225, 'aminoAcids', 'glycine'),
  usdaField(1226, 'aminoAcids', 'proline'),
  usdaField(1292, 'fattyAcids', 'monounsaturatedFattyAcids'),
  usdaField(1293, 'fattyAcids', 'polyunsaturatedFattyAcids'),
  usdaField(1316, 'fattyAcids', 'linoleicAcid', {
    fieldPriority: 10,
    sourceFormMetadata: {
      sourceCompound: 'linoleic acid (18:2 n-6 c,c)',
      fattyAcidSpecificity: 'ISOMER_SPECIFIC',
    },
  }),
  usdaField(2016, 'fattyAcids', 'linoleicAcid', {
    fieldPriority: 20,
    conversionNote:
      'USDA PUFA 18:2 c is used for linoleic acid only when a more specific n-6 c,c row is absent.',
    sourceFormMetadata: {
      sourceCompound: 'PUFA 18:2 c',
      fattyAcidSpecificity: 'CHAIN_LENGTH_GENERIC',
    },
  }),
  usdaField(1269, 'fattyAcids', 'linoleicAcid', {
    fieldPriority: 30,
    conversionNote:
      'USDA PUFA 18:2 is used for linoleic acid only when a more specific 18:2 row is absent.',
    sourceFormMetadata: {
      sourceCompound: 'PUFA 18:2',
      fattyAcidSpecificity: 'CHAIN_LENGTH_GENERIC',
    },
  }),
  usdaField(1404, 'fattyAcids', 'alphaLinolenicAcid', {
    fieldPriority: 10,
    sourceFormMetadata: {
      sourceCompound: 'alpha-linolenic acid (18:3 n-3 c,c,c)',
      fattyAcidSpecificity: 'ISOMER_SPECIFIC',
    },
  }),
  usdaField(2018, 'fattyAcids', 'alphaLinolenicAcid', {
    fieldPriority: 20,
    conversionNote:
      'USDA PUFA 18:3 c is used for alpha-linolenic acid only when a more specific ALA row is absent.',
    sourceFormMetadata: {
      sourceCompound: 'PUFA 18:3 c',
      fattyAcidSpecificity: 'CHAIN_LENGTH_GENERIC',
    },
  }),
  usdaField(1270, 'fattyAcids', 'alphaLinolenicAcid', {
    fieldPriority: 30,
    conversionNote:
      'USDA PUFA 18:3 is used for alpha-linolenic acid only when a more specific 18:3 n-3 row is absent.',
    sourceFormMetadata: {
      sourceCompound: 'PUFA 18:3',
      fattyAcidSpecificity: 'CHAIN_LENGTH_GENERIC',
    },
  }),
  usdaField(1408, 'fattyAcids', 'arachidonicAcid', {
    fieldPriority: 10,
    sourceFormMetadata: {
      sourceCompound: 'arachidonic acid (20:4 n-6)',
      fattyAcidSpecificity: 'ISOMER_SPECIFIC',
    },
  }),
  usdaField(2022, 'fattyAcids', 'arachidonicAcid', {
    fieldPriority: 20,
    sourceFormMetadata: {
      sourceCompound: 'PUFA 20:4 c',
      fattyAcidSpecificity: 'CHAIN_LENGTH_GENERIC',
    },
  }),
  usdaField(1271, 'fattyAcids', 'arachidonicAcid', {
    fieldPriority: 30,
    conversionNote:
      'USDA PUFA 20:4 is used for arachidonic acid only when a more specific 20:4 n-6 row is absent.',
    sourceFormMetadata: {
      sourceCompound: 'PUFA 20:4',
      fattyAcidSpecificity: 'CHAIN_LENGTH_GENERIC',
    },
  }),
  usdaField(1278, 'fattyAcids', 'epa', {
    sourceUnit: 'g',
    amountMultiplier: 1000,
    conversionNote: 'USDA EPA is reported in g; internal EPA is stored in mg.',
    sourceFormMetadata: {
      sourceCompound: 'EPA',
      conversionFactor: 1000,
      conversionFactorUnit: 'MG_PER_G',
    },
  }),
  usdaField(2023, 'fattyAcids', 'epa', {
    sourceUnit: 'g',
    amountMultiplier: 1000,
    conversionNote: 'USDA EPA is reported in g; internal EPA is stored in mg.',
    sourceFormMetadata: {
      sourceCompound: 'EPA',
      conversionFactor: 1000,
      conversionFactorUnit: 'MG_PER_G',
    },
  }),
  usdaField(1280, 'fattyAcids', 'dpa', {
    sourceUnit: 'g',
    amountMultiplier: 1000,
    conversionNote: 'USDA DPA is reported in g; internal DPA is stored in mg.',
    sourceFormMetadata: {
      sourceCompound: 'DPA',
      conversionFactor: 1000,
      conversionFactorUnit: 'MG_PER_G',
    },
  }),
  usdaField(2024, 'fattyAcids', 'dpa', {
    sourceUnit: 'g',
    amountMultiplier: 1000,
    conversionNote: 'USDA DPA is reported in g; internal DPA is stored in mg.',
    sourceFormMetadata: {
      sourceCompound: 'DPA',
      conversionFactor: 1000,
      conversionFactorUnit: 'MG_PER_G',
    },
  }),
  usdaField(1272, 'fattyAcids', 'dha', {
    sourceUnit: 'g',
    amountMultiplier: 1000,
    conversionNote: 'USDA DHA is reported in g; internal DHA is stored in mg.',
    sourceFormMetadata: {
      sourceCompound: 'DHA',
      conversionFactor: 1000,
      conversionFactorUnit: 'MG_PER_G',
    },
  }),
  usdaField(2025, 'fattyAcids', 'dha', {
    sourceUnit: 'g',
    amountMultiplier: 1000,
    conversionNote: 'USDA DHA is reported in g; internal DHA is stored in mg.',
    sourceFormMetadata: {
      sourceCompound: 'DHA',
      conversionFactor: 1000,
      conversionFactorUnit: 'MG_PER_G',
    },
  }),
  usdaField(1258, 'fattyAcids', 'saturatedFattyAcids'),
];
