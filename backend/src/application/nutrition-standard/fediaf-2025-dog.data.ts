export type NutritionStandardSpecies = 'DOG' | 'CAT';
export type NutritionStandardSourceType = 'CORE_RECOMMENDATION' | 'ANNEX_7_8';
export type NutritionStandardBasis =
  | 'PER_100G_DRY_MATTER'
  | 'PER_1000_KCAL_ME'
  | 'PER_MJ_ME'
  | 'RATIO';
export type NutritionStandardMaxType =
  | 'LEGAL_MAX'
  | 'NUTRITIONAL_MAX'
  | 'UNSPECIFIED';

export interface FediafStandardVersionSeed {
  code: string;
  standardCode: string;
  name: string;
  species: NutritionStandardSpecies;
  publicationMonth: string;
  sourceTitle: string;
  sourceUrl: string;
  pdfUrl: string;
  importBatch: string;
  importStatus: string;
  isActive: boolean;
}

export interface NutrientDefinitionSeed {
  code: string;
  fieldPath: string | null;
  name: string;
  nameEn: string;
  category: string;
  defaultIngredientUnit: string | null;
  defaultStandardUnit: string;
  isDirect: boolean;
  isDerived: boolean;
  expression: Record<string, unknown> | null;
  sortOrder: number;
}

export interface FediafStandardEntrySeed {
  nutrientCode: string;
  fediafName: string;
  category: string;
  sourceTable:
    | 'III-3a'
    | 'III-3b'
    | 'III-3c'
    | 'VII-17a'
    | 'VII-17b'
    | 'VII-17c'
    | 'VII-17d';
  sourceType: NutritionStandardSourceType;
  pdfPage: number;
  species: NutritionStandardSpecies;
  lifeStage: string;
  basis: NutritionStandardBasis;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  recommendedValue: number | null;
  maxType: NutritionStandardMaxType;
  footnoteRefs: string[];
  notes: string | null;
  sortOrder: number;
}

type SourceTable = FediafStandardEntrySeed['sourceTable'];
type LifeStage =
  | 'ADULT_MER_95'
  | 'ADULT_MER_110'
  | 'EARLY_GROWTH_UNDER_14_WEEKS'
  | 'REPRODUCTION'
  | 'LATE_GROWTH_FROM_14_WEEKS';

type SourceStage = 'adult95' | 'adult110' | 'early' | 'late';
type BasisTuple = [number | null, number | null, number | null];
type BasisValues = Record<NutritionStandardBasis, number | null>;
type CellOverride = Partial<
  Pick<
    FediafStandardEntrySeed,
    'maxValue' | 'recommendedValue' | 'maxType' | 'footnoteRefs' | 'notes'
  >
>;
type RowOverrides = Partial<
  Record<LifeStage, Partial<Record<NutritionStandardBasis, CellOverride>>>
>;

interface FediafNutrientRow {
  nutrientCode: string;
  fediafName: string;
  category: string;
  unit: string;
  sortOrder: number;
  values: Record<LifeStage, BasisValues>;
  overrides: RowOverrides;
  core: boolean;
  annexLifeStages: LifeStage[];
  fediafNameBySourceTable: Partial<Record<SourceTable, string>>;
}

export const FEDIAF_2025_DOG_STANDARD_VERSION: FediafStandardVersionSeed = {
  code: 'FEDIAF_2025_DOG',
  standardCode: 'FEDIAF_2025',
  name: 'FEDIAF 2025 犬营养标准',
  species: 'DOG',
  publicationMonth: '2025-09',
  sourceTitle:
    'FEDIAF Nutritional Guidelines for Complete and Complementary Pet Food for Cats and Dogs, Publication September 2025',
  sourceUrl:
    'https://europeanpetfood.org/self-regulation/nutritional-guidelines/',
  pdfUrl:
    'https://europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf',
  importBatch: 'fediaf-2025-dog-v1',
  importStatus: 'IMPORTED',
  isActive: true,
};

const sumExpression = (...fields: string[]): Record<string, unknown> => ({
  op: 'sum',
  formula: fields.join(' + '),
  fields,
});

export const FEDIAF_2025_DOG_NUTRIENTS: NutrientDefinitionSeed[] = [
  {
    code: 'crudeProtein',
    fieldPath: 'macros.crudeProtein',
    name: '粗蛋白',
    nameEn: 'Crude protein',
    category: 'MACRONUTRIENT',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 10,
  },
  {
    code: 'crudeFat',
    fieldPath: 'macros.crudeFat',
    name: '粗脂肪',
    nameEn: 'Crude fat',
    category: 'MACRONUTRIENT',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 20,
  },
  {
    code: 'arginine',
    fieldPath: 'aminoAcids.arginine',
    name: '精氨酸',
    nameEn: 'Arginine',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 100,
  },
  {
    code: 'histidine',
    fieldPath: 'aminoAcids.histidine',
    name: '组氨酸',
    nameEn: 'Histidine',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 110,
  },
  {
    code: 'isoleucine',
    fieldPath: 'aminoAcids.isoleucine',
    name: '异亮氨酸',
    nameEn: 'Isoleucine',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 120,
  },
  {
    code: 'leucine',
    fieldPath: 'aminoAcids.leucine',
    name: '亮氨酸',
    nameEn: 'Leucine',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 130,
  },
  {
    code: 'lysine',
    fieldPath: 'aminoAcids.lysine',
    name: '赖氨酸',
    nameEn: 'Lysine',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 140,
  },
  {
    code: 'methionine',
    fieldPath: 'aminoAcids.methionine',
    name: '蛋氨酸',
    nameEn: 'Methionine',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 150,
  },
  {
    code: 'methionineCystine',
    fieldPath: null,
    name: '蛋氨酸 + 胱氨酸',
    nameEn: 'Methionine + cystine',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: false,
    isDerived: true,
    expression: sumExpression('aminoAcids.methionine', 'aminoAcids.cystine'),
    sortOrder: 160,
  },
  {
    code: 'phenylalanine',
    fieldPath: 'aminoAcids.phenylalanine',
    name: '苯丙氨酸',
    nameEn: 'Phenylalanine',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 170,
  },
  {
    code: 'phenylalanineTyrosine',
    fieldPath: null,
    name: '苯丙氨酸 + 酪氨酸',
    nameEn: 'Phenylalanine + tyrosine',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: false,
    isDerived: true,
    expression: sumExpression(
      'aminoAcids.phenylalanine',
      'aminoAcids.tyrosine',
    ),
    sortOrder: 180,
  },
  {
    code: 'threonine',
    fieldPath: 'aminoAcids.threonine',
    name: '苏氨酸',
    nameEn: 'Threonine',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 190,
  },
  {
    code: 'tryptophan',
    fieldPath: 'aminoAcids.tryptophan',
    name: '色氨酸',
    nameEn: 'Tryptophan',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 200,
  },
  {
    code: 'valine',
    fieldPath: 'aminoAcids.valine',
    name: '缬氨酸',
    nameEn: 'Valine',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 210,
  },
  {
    code: 'linoleicAcid',
    fieldPath: 'fattyAcids.linoleicAcid',
    name: '亚油酸',
    nameEn: 'Linoleic acid',
    category: 'FATTY_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 300,
  },
  {
    code: 'arachidonicAcid',
    fieldPath: 'fattyAcids.arachidonicAcid',
    name: '花生四烯酸',
    nameEn: 'Arachidonic acid',
    category: 'FATTY_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'mg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 310,
  },
  {
    code: 'alphaLinolenicAcid',
    fieldPath: 'fattyAcids.alphaLinolenicAcid',
    name: 'α-亚麻酸',
    nameEn: 'Alpha-linolenic acid',
    category: 'FATTY_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 320,
  },
  {
    code: 'epaDha',
    fieldPath: null,
    name: 'EPA + DHA',
    nameEn: 'EPA + DHA',
    category: 'FATTY_ACID',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'g',
    isDirect: false,
    isDerived: true,
    expression: sumExpression('fattyAcids.epa', 'fattyAcids.dha'),
    sortOrder: 330,
  },
  {
    code: 'calcium',
    fieldPath: 'minerals.calcium',
    name: '钙',
    nameEn: 'Calcium',
    category: 'MINERAL',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 400,
  },
  {
    code: 'phosphorus',
    fieldPath: 'minerals.phosphorus',
    name: '磷',
    nameEn: 'Phosphorus',
    category: 'MINERAL',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 410,
  },
  {
    code: 'calciumPhosphorusRatio',
    fieldPath: null,
    name: '钙磷比',
    nameEn: 'Calcium:Phosphorus ratio',
    category: 'DERIVED_RATIO',
    defaultIngredientUnit: null,
    defaultStandardUnit: 'ratio',
    isDirect: false,
    isDerived: true,
    expression: {
      op: 'divide',
      formula: 'minerals.calcium / minerals.phosphorus',
      numerator: 'minerals.calcium',
      denominator: 'minerals.phosphorus',
    },
    sortOrder: 420,
  },
  {
    code: 'potassium',
    fieldPath: 'minerals.potassium',
    name: '钾',
    nameEn: 'Potassium',
    category: 'MINERAL',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 430,
  },
  {
    code: 'sodium',
    fieldPath: 'minerals.sodium',
    name: '钠',
    nameEn: 'Sodium',
    category: 'MINERAL',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 440,
  },
  {
    code: 'chloride',
    fieldPath: 'minerals.chloride',
    name: '氯',
    nameEn: 'Chloride',
    category: 'MINERAL',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 450,
  },
  {
    code: 'magnesium',
    fieldPath: 'minerals.magnesium',
    name: '镁',
    nameEn: 'Magnesium',
    category: 'MINERAL',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 460,
  },
  {
    code: 'copper',
    fieldPath: 'minerals.copper',
    name: '铜',
    nameEn: 'Copper',
    category: 'TRACE_ELEMENT',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'mg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 500,
  },
  {
    code: 'iodine',
    fieldPath: 'minerals.iodine',
    name: '碘',
    nameEn: 'Iodine',
    category: 'TRACE_ELEMENT',
    defaultIngredientUnit: 'μg',
    defaultStandardUnit: 'mg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 510,
  },
  {
    code: 'iron',
    fieldPath: 'minerals.iron',
    name: '铁',
    nameEn: 'Iron',
    category: 'TRACE_ELEMENT',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'mg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 520,
  },
  {
    code: 'manganese',
    fieldPath: 'minerals.manganese',
    name: '锰',
    nameEn: 'Manganese',
    category: 'TRACE_ELEMENT',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'mg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 530,
  },
  {
    code: 'selenium',
    fieldPath: 'minerals.selenium',
    name: '硒',
    nameEn: 'Selenium',
    category: 'TRACE_ELEMENT',
    defaultIngredientUnit: 'μg',
    defaultStandardUnit: 'μg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 540,
  },
  {
    code: 'seleniumWetDiet',
    fieldPath: 'minerals.selenium',
    name: '硒（湿粮）',
    nameEn: 'Selenium (wet diets)',
    category: 'TRACE_ELEMENT',
    defaultIngredientUnit: 'μg',
    defaultStandardUnit: 'μg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 550,
  },
  {
    code: 'seleniumDryDiet',
    fieldPath: 'minerals.selenium',
    name: '硒（干粮）',
    nameEn: 'Selenium (dry diets)',
    category: 'TRACE_ELEMENT',
    defaultIngredientUnit: 'μg',
    defaultStandardUnit: 'μg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 560,
  },
  {
    code: 'zinc',
    fieldPath: 'minerals.zinc',
    name: '锌',
    nameEn: 'Zinc',
    category: 'TRACE_ELEMENT',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'mg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 570,
  },
  {
    code: 'vitaminA',
    fieldPath: 'vitamins.vitaminA',
    name: '维生素 A',
    nameEn: 'Vitamin A',
    category: 'VITAMIN',
    defaultIngredientUnit: 'IU',
    defaultStandardUnit: 'IU',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 600,
  },
  {
    code: 'vitaminD',
    fieldPath: 'vitamins.vitaminD',
    name: '维生素 D',
    nameEn: 'Vitamin D',
    category: 'VITAMIN',
    defaultIngredientUnit: 'IU',
    defaultStandardUnit: 'IU',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 610,
  },
  {
    code: 'vitaminE',
    fieldPath: 'vitamins.vitaminE',
    name: '维生素 E',
    nameEn: 'Vitamin E',
    category: 'VITAMIN',
    defaultIngredientUnit: 'IU',
    defaultStandardUnit: 'IU',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 620,
  },
  {
    code: 'vitaminB1',
    fieldPath: 'vitamins.vitaminB1',
    name: '维生素 B1',
    nameEn: 'Vitamin B1 (Thiamine)',
    category: 'VITAMIN',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'mg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 630,
  },
  {
    code: 'vitaminB2',
    fieldPath: 'vitamins.vitaminB2',
    name: '维生素 B2',
    nameEn: 'Vitamin B2 (Riboflavin)',
    category: 'VITAMIN',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'mg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 640,
  },
  {
    code: 'vitaminB5',
    fieldPath: 'vitamins.vitaminB5',
    name: '维生素 B5',
    nameEn: 'Vitamin B5 (Pantothenic acid)',
    category: 'VITAMIN',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'mg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 650,
  },
  {
    code: 'vitaminB6',
    fieldPath: 'vitamins.vitaminB6',
    name: '维生素 B6',
    nameEn: 'Vitamin B6 (Pyridoxine)',
    category: 'VITAMIN',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'mg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 660,
  },
  {
    code: 'vitaminB12',
    fieldPath: 'vitamins.vitaminB12',
    name: '维生素 B12',
    nameEn: 'Vitamin B12 (Cyanocobalamin)',
    category: 'VITAMIN',
    defaultIngredientUnit: 'μg',
    defaultStandardUnit: 'μg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 670,
  },
  {
    code: 'vitaminB3',
    fieldPath: 'vitamins.vitaminB3',
    name: '维生素 B3',
    nameEn: 'Vitamin B3 (Niacin)',
    category: 'VITAMIN',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'mg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 680,
  },
  {
    code: 'vitaminB9',
    fieldPath: 'vitamins.vitaminB9',
    name: '维生素 B9',
    nameEn: 'Vitamin B9 (Folic acid)',
    category: 'VITAMIN',
    defaultIngredientUnit: 'μg',
    defaultStandardUnit: 'μg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 690,
  },
  {
    code: 'vitaminB7',
    fieldPath: 'vitamins.vitaminB7',
    name: '维生素 B7',
    nameEn: 'Vitamin B7 (Biotin)',
    category: 'VITAMIN',
    defaultIngredientUnit: 'μg',
    defaultStandardUnit: 'μg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 700,
  },
  {
    code: 'choline',
    fieldPath: 'vitamins.choline',
    name: '胆碱',
    nameEn: 'Choline',
    category: 'VITAMIN',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'mg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 710,
  },
  {
    code: 'vitaminK',
    fieldPath: 'vitamins.vitaminK',
    name: '维生素 K',
    nameEn: 'Vitamin K',
    category: 'VITAMIN',
    defaultIngredientUnit: 'μg',
    defaultStandardUnit: 'μg',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 720,
  },
];

const BASIS_ORDER: NutritionStandardBasis[] = [
  'PER_100G_DRY_MATTER',
  'PER_1000_KCAL_ME',
  'PER_MJ_ME',
];

const CORE_TABLE_BY_BASIS: Record<
  NutritionStandardBasis,
  { sourceTable: SourceTable; pdfPage: number }
> = {
  PER_100G_DRY_MATTER: { sourceTable: 'III-3a', pdfPage: 15 },
  PER_1000_KCAL_ME: { sourceTable: 'III-3b', pdfPage: 16 },
  PER_MJ_ME: { sourceTable: 'III-3c', pdfPage: 17 },
  RATIO: { sourceTable: 'III-3a', pdfPage: 15 },
};

const ANNEX_TABLES: Array<{
  sourceTable: SourceTable;
  pdfPage: number;
  lifeStages: LifeStage[];
}> = [
  {
    sourceTable: 'VII-17a',
    pdfPage: 73,
    lifeStages: ['EARLY_GROWTH_UNDER_14_WEEKS', 'REPRODUCTION'],
  },
  {
    sourceTable: 'VII-17b',
    pdfPage: 74,
    lifeStages: ['LATE_GROWTH_FROM_14_WEEKS'],
  },
  { sourceTable: 'VII-17c', pdfPage: 75, lifeStages: ['ADULT_MER_110'] },
  { sourceTable: 'VII-17d', pdfPage: 76, lifeStages: ['ADULT_MER_95'] },
];

const CORE_LIFE_STAGES: LifeStage[] = [
  'ADULT_MER_95',
  'ADULT_MER_110',
  'EARLY_GROWTH_UNDER_14_WEEKS',
  'REPRODUCTION',
  'LATE_GROWTH_FROM_14_WEEKS',
];

const toBasisValues = (values: BasisTuple): BasisValues => ({
  PER_100G_DRY_MATTER: values[0],
  PER_1000_KCAL_ME: values[1],
  PER_MJ_ME: values[2],
  RATIO: null,
});

const byBasis = (
  dm: CellOverride,
  kcal: CellOverride = dm,
  mj: CellOverride = kcal,
): Partial<Record<NutritionStandardBasis, CellOverride>> => ({
  PER_100G_DRY_MATTER: dm,
  PER_1000_KCAL_ME: kcal,
  PER_MJ_ME: mj,
});

const nutritionalMax = (
  values: BasisTuple,
  footnoteRefs: string[] = [],
  notes: string | null = null,
): Partial<Record<NutritionStandardBasis, CellOverride>> =>
  byBasis(
    { maxValue: values[0], maxType: 'NUTRITIONAL_MAX', footnoteRefs, notes },
    { maxValue: values[1], maxType: 'NUTRITIONAL_MAX', footnoteRefs, notes },
    { maxValue: values[2], maxType: 'NUTRITIONAL_MAX', footnoteRefs, notes },
  );

const legalDryMatterMax = (
  value: number,
  footnoteRefs: string[] = [],
  notes = 'EU legal maximum is specified only on a dry-matter basis in the source table.',
): Partial<Record<NutritionStandardBasis, CellOverride>> =>
  byBasis(
    { maxValue: value, maxType: 'LEGAL_MAX', footnoteRefs, notes: null },
    { maxType: 'LEGAL_MAX', footnoteRefs, notes },
    { maxType: 'LEGAL_MAX', footnoteRefs, notes },
  );

const noValueNote =
  'No minimum or maximum level is specified for this nutrient in the source table.';

const noRecommendation = (): Partial<
  Record<NutritionStandardBasis, CellOverride>
> =>
  byBasis(
    { notes: noValueNote },
    { notes: noValueNote },
    { notes: noValueNote },
  );

const stageOverrides = (
  lifeStages: LifeStage[],
  overrides: Partial<Record<NutritionStandardBasis, CellOverride>>,
): RowOverrides =>
  lifeStages.reduce<RowOverrides>((acc, lifeStage) => {
    acc[lifeStage] = overrides;
    return acc;
  }, {});

const row = (
  nutrientCode: string,
  fediafName: string,
  category: string,
  unit: string,
  sortOrder: number,
  values: Record<SourceStage, BasisTuple>,
  overrides: RowOverrides = {},
  options: {
    core?: boolean;
    annexLifeStages?: LifeStage[];
    fediafNameBySourceTable?: Partial<Record<SourceTable, string>>;
  } = {},
): FediafNutrientRow => ({
  nutrientCode,
  fediafName,
  category,
  unit,
  sortOrder,
  values: {
    ADULT_MER_95: toBasisValues(values.adult95),
    ADULT_MER_110: toBasisValues(values.adult110),
    EARLY_GROWTH_UNDER_14_WEEKS: toBasisValues(values.early),
    REPRODUCTION: toBasisValues(values.early),
    LATE_GROWTH_FROM_14_WEEKS: toBasisValues(values.late),
  },
  overrides,
  core: options.core ?? true,
  annexLifeStages: options.annexLifeStages ?? CORE_LIFE_STAGES,
  fediafNameBySourceTable: options.fediafNameBySourceTable ?? {},
});

const allStages = (
  overrides: Partial<Record<NutritionStandardBasis, CellOverride>>,
) => stageOverrides(CORE_LIFE_STAGES, overrides);

const growthStages = (
  overrides: Partial<Record<NutritionStandardBasis, CellOverride>>,
) =>
  stageOverrides(
    [
      'EARLY_GROWTH_UNDER_14_WEEKS',
      'REPRODUCTION',
      'LATE_GROWTH_FROM_14_WEEKS',
    ],
    overrides,
  );

const earlyStages = (
  overrides: Partial<Record<NutritionStandardBasis, CellOverride>>,
) => stageOverrides(['EARLY_GROWTH_UNDER_14_WEEKS', 'REPRODUCTION'], overrides);

const adultStages = (
  overrides: Partial<Record<NutritionStandardBasis, CellOverride>>,
) => stageOverrides(['ADULT_MER_95', 'ADULT_MER_110'], overrides);

const mergeOverrides = (...items: RowOverrides[]): RowOverrides =>
  items.reduce<RowOverrides>((acc, item) => {
    for (const [lifeStage, basisOverrides] of Object.entries(item) as Array<
      [LifeStage, Partial<Record<NutritionStandardBasis, CellOverride>>]
    >) {
      acc[lifeStage] = {
        ...(acc[lifeStage] ?? {}),
        ...basisOverrides,
      };
    }
    return acc;
  }, {});

const lateCalciumAlternative: Partial<
  Record<NutritionStandardBasis, CellOverride>
> = byBasis(
  {
    recommendedValue: 1,
    maxValue: 1.8,
    maxType: 'NUTRITIONAL_MAX',
    footnoteRefs: ['a', 'b'],
    notes:
      'Late-growth calcium minimum is 0.80 g/100 g DM for breeds up to 15 kg and 1.00 g/100 g DM for breeds over 15 kg until about 6 months.',
  },
  {
    recommendedValue: 2.5,
    maxValue: 4.5,
    maxType: 'NUTRITIONAL_MAX',
    footnoteRefs: ['a', 'b'],
    notes:
      'Late-growth calcium minimum is 2.00 g/1000 kcal ME for breeds up to 15 kg and 2.50 g/1000 kcal ME for breeds over 15 kg until about 6 months.',
  },
  {
    recommendedValue: 0.6,
    maxValue: 1.08,
    maxType: 'NUTRITIONAL_MAX',
    footnoteRefs: ['a', 'b'],
    notes:
      'Late-growth calcium minimum is 0.48 g/MJ ME for breeds up to 15 kg and 0.60 g/MJ ME for breeds over 15 kg until about 6 months.',
  },
);

const vitaminDMax: Partial<Record<NutritionStandardBasis, CellOverride>> =
  byBasis(
    {
      maxValue: 227,
      recommendedValue: 320,
      maxType: 'LEGAL_MAX',
      notes: 'The table also lists a nutritional maximum of 320 IU/100 g DM.',
    },
    {
      maxValue: 800,
      maxType: 'NUTRITIONAL_MAX',
      notes:
        'EU legal maximum is specified only on a dry-matter basis in the source table.',
    },
    {
      maxValue: 191,
      maxType: 'NUTRITIONAL_MAX',
      notes:
        'EU legal maximum is specified only on a dry-matter basis in the source table.',
    },
  );

const safeSodiumChlorideNote =
  'Footnote c reports safe levels up to 1.5% DM sodium and 2.35% DM chloride for healthy dogs; higher levels may still be safe, but no scientific data are available.';

const seleniumFootnoteNote =
  'Footnote d says an organic selenium maximum supplementation level of 22.73 μg organic Se/100 g DM applies.';

const calciumPhosphorusRatioOverrides = mergeOverrides(
  adultStages(
    byBasis(
      {
        maxValue: 2,
        maxType: 'NUTRITIONAL_MAX',
        footnoteRefs: ['h'],
        notes: 'Maximum calcium:phosphorus ratio is 2:1 for adult dogs.',
      },
      {
        maxValue: 2,
        maxType: 'NUTRITIONAL_MAX',
        footnoteRefs: ['h'],
        notes: 'Maximum calcium:phosphorus ratio is 2:1 for adult dogs.',
      },
      {
        maxValue: 2,
        maxType: 'NUTRITIONAL_MAX',
        footnoteRefs: ['h'],
        notes: 'Maximum calcium:phosphorus ratio is 2:1 for adult dogs.',
      },
    ),
  ),
  earlyStages(
    byBasis(
      {
        maxValue: 1.6,
        maxType: 'NUTRITIONAL_MAX',
        footnoteRefs: ['h'],
        notes:
          'Maximum calcium:phosphorus ratio is 1.6:1 for early growth and reproduction.',
      },
      {
        maxValue: 1.6,
        maxType: 'NUTRITIONAL_MAX',
        footnoteRefs: ['h'],
        notes:
          'Maximum calcium:phosphorus ratio is 1.6:1 for early growth and reproduction.',
      },
      {
        maxValue: 1.6,
        maxType: 'NUTRITIONAL_MAX',
        footnoteRefs: ['h'],
        notes:
          'Maximum calcium:phosphorus ratio is 1.6:1 for early growth and reproduction.',
      },
    ),
  ),
  stageOverrides(['LATE_GROWTH_FROM_14_WEEKS'], {
    PER_100G_DRY_MATTER: {
      recommendedValue: 1.6,
      maxValue: 1.8,
      maxType: 'NUTRITIONAL_MAX',
      footnoteRefs: ['a', 'b', 'h'],
      notes:
        'Late-growth calcium:phosphorus maximum is 1.8:1 for footnote a or 1.6:1 for footnote b.',
    },
    PER_1000_KCAL_ME: {
      recommendedValue: 1.6,
      maxValue: 1.8,
      maxType: 'NUTRITIONAL_MAX',
      footnoteRefs: ['a', 'b', 'h'],
      notes:
        'Late-growth calcium:phosphorus maximum is 1.8:1 for footnote a or 1.6:1 for footnote b.',
    },
    PER_MJ_ME: {
      recommendedValue: 1.6,
      maxValue: 1.8,
      maxType: 'NUTRITIONAL_MAX',
      footnoteRefs: ['a', 'b', 'h'],
      notes:
        'Late-growth calcium:phosphorus maximum is 1.8:1 for footnote a or 1.6:1 for footnote b.',
    },
  }),
);

const NUTRIENT_ROWS: FediafNutrientRow[] = [
  row('crudeProtein', 'Protein*', 'MACRONUTRIENT', 'g', 10, {
    adult95: [21, 52.1, 12.5],
    adult110: [18, 45, 10.8],
    early: [25, 62.5, 14.94],
    late: [20, 50, 11.95],
  }),
  row('arginine', 'Arginine*', 'AMINO_ACID', 'g', 20, {
    adult95: [0.6, 1.51, 0.36],
    adult110: [0.52, 1.3, 0.31],
    early: [0.82, 2.04, 0.49],
    late: [0.74, 1.84, 0.44],
  }),
  row('histidine', 'Histidine', 'AMINO_ACID', 'g', 30, {
    adult95: [0.27, 0.67, 0.16],
    adult110: [0.23, 0.58, 0.14],
    early: [0.39, 0.98, 0.23],
    late: [0.25, 0.63, 0.15],
  }),
  row('isoleucine', 'Isoleucine', 'AMINO_ACID', 'g', 40, {
    adult95: [0.53, 1.33, 0.32],
    adult110: [0.46, 1.15, 0.27],
    early: [0.65, 1.63, 0.39],
    late: [0.5, 1.25, 0.3],
  }),
  row('leucine', 'Leucine', 'AMINO_ACID', 'g', 50, {
    adult95: [0.95, 2.37, 0.57],
    adult110: [0.82, 2.05, 0.49],
    early: [1.29, 3.23, 0.77],
    late: [0.8, 2, 0.48],
  }),
  row(
    'lysine',
    'Lysine*',
    'AMINO_ACID',
    'g',
    60,
    {
      adult95: [0.46, 1.22, 0.29],
      adult110: [0.42, 1.05, 0.25],
      early: [0.88, 2.2, 0.53],
      late: [0.7, 1.75, 0.42],
    },
    growthStages(nutritionalMax([2.8, 7, 1.67])),
  ),
  row('methionine', 'Methionine*', 'AMINO_ACID', 'g', 70, {
    adult95: [0.46, 1.16, 0.28],
    adult110: [0.4, 1, 0.24],
    early: [0.35, 0.88, 0.21],
    late: [0.26, 0.65, 0.16],
  }),
  row('methionineCystine', 'Methionine + Cystine*', 'AMINO_ACID', 'g', 80, {
    adult95: [0.88, 2.21, 0.53],
    adult110: [0.76, 1.91, 0.46],
    early: [0.7, 1.75, 0.42],
    late: [0.53, 1.33, 0.32],
  }),
  row('phenylalanine', 'Phenylalanine', 'AMINO_ACID', 'g', 90, {
    adult95: [0.63, 1.56, 0.37],
    adult110: [0.54, 1.35, 0.32],
    early: [0.65, 1.63, 0.39],
    late: [0.5, 1.25, 0.3],
  }),
  row(
    'phenylalanineTyrosine',
    'Phenylalanine + Tyrosine*',
    'AMINO_ACID',
    'g',
    100,
    {
      adult95: [1.03, 2.58, 0.62],
      adult110: [0.89, 2.23, 0.53],
      early: [1.3, 3.25, 0.78],
      late: [1, 2.5, 0.6],
    },
  ),
  row('threonine', 'Threonine', 'AMINO_ACID', 'g', 110, {
    adult95: [0.6, 1.51, 0.36],
    adult110: [0.52, 1.3, 0.31],
    early: [0.81, 2.03, 0.48],
    late: [0.64, 1.6, 0.38],
  }),
  row('tryptophan', 'Tryptophan', 'AMINO_ACID', 'g', 120, {
    adult95: [0.2, 0.49, 0.12],
    adult110: [0.17, 0.43, 0.1],
    early: [0.23, 0.58, 0.14],
    late: [0.21, 0.53, 0.13],
  }),
  row('valine', 'Valine', 'AMINO_ACID', 'g', 130, {
    adult95: [0.68, 1.71, 0.41],
    adult110: [0.59, 1.48, 0.35],
    early: [0.68, 1.7, 0.41],
    late: [0.56, 1.4, 0.33],
  }),
  row('crudeFat', 'Fat*', 'MACRONUTRIENT', 'g', 140, {
    adult95: [5.5, 13.75, 3.29],
    adult110: [5.5, 13.75, 3.29],
    early: [8.5, 21.25, 5.08],
    late: [8.5, 21.25, 5.08],
  }),
  row(
    'linoleicAcid',
    'Linoleic acid (omega-6)*',
    'FATTY_ACID',
    'g',
    150,
    {
      adult95: [1.53, 3.82, 0.91],
      adult110: [1.32, 3.27, 0.79],
      early: [1.3, 3.25, 0.78],
      late: [1.3, 3.25, 0.78],
    },
    earlyStages(nutritionalMax([6.5, 16.25, 3.88])),
  ),
  row(
    'arachidonicAcid',
    'Arachidonic acid (omega-6)*',
    'FATTY_ACID',
    'mg',
    160,
    {
      adult95: [null, null, null],
      adult110: [null, null, null],
      early: [30, 75, 17.9],
      late: [30, 75, 17.9],
    },
    mergeOverrides(adultStages(noRecommendation())),
  ),
  row(
    'alphaLinolenicAcid',
    'Alpha-linolenic acid (omega-3)*',
    'FATTY_ACID',
    'g',
    170,
    {
      adult95: [null, null, null],
      adult110: [null, null, null],
      early: [0.08, 0.2, 0.05],
      late: [0.08, 0.2, 0.05],
    },
    mergeOverrides(adultStages(noRecommendation())),
  ),
  row(
    'epaDha',
    'EPA + DHA (omega-3)*',
    'FATTY_ACID',
    'g',
    180,
    {
      adult95: [null, null, null],
      adult110: [null, null, null],
      early: [0.05, 0.13, 0.03],
      late: [0.05, 0.13, 0.03],
    },
    mergeOverrides(adultStages(noRecommendation())),
  ),
  row(
    'calcium',
    'Calcium*',
    'MINERAL',
    'g',
    190,
    {
      adult95: [0.58, 1.45, 0.35],
      adult110: [0.5, 1.25, 0.3],
      early: [1, 2.5, 0.6],
      late: [0.8, 2, 0.48],
    },
    mergeOverrides(
      adultStages(nutritionalMax([2.5, 6.25, 1.49])),
      earlyStages(nutritionalMax([1.6, 4, 0.96])),
      stageOverrides(['LATE_GROWTH_FROM_14_WEEKS'], lateCalciumAlternative),
    ),
  ),
  row(
    'phosphorus',
    'Phosphorus*',
    'MINERAL',
    'g',
    200,
    {
      adult95: [0.46, 1.16, 0.28],
      adult110: [0.4, 1, 0.24],
      early: [0.9, 2.25, 0.54],
      late: [0.7, 1.75, 0.42],
    },
    mergeOverrides(
      adultStages(
        nutritionalMax(
          [1.6, 4, 0.96],
          ['h'],
          'Footnote h flags the effect of high intake of inorganic phosphorus compounds in dogs.',
        ),
      ),
      growthStages(
        byBasis(
          {
            footnoteRefs: ['h'],
            notes:
              'The source table flags the growth phosphorus maximum cell with footnote h but does not specify a numeric maximum.',
          },
          {
            footnoteRefs: ['h'],
            notes:
              'The source table flags the growth phosphorus maximum cell with footnote h but does not specify a numeric maximum.',
          },
          {
            footnoteRefs: ['h'],
            notes:
              'The source table flags the growth phosphorus maximum cell with footnote h but does not specify a numeric maximum.',
          },
        ),
      ),
    ),
    {
      fediafNameBySourceTable: {
        'VII-17a': 'Phosphorus',
        'VII-17b': 'Phosphorus',
        'VII-17c': 'Phosphorus',
        'VII-17d': 'Phosphorus',
      },
    },
  ),
  row(
    'calciumPhosphorusRatio',
    'Ca / P ratio',
    'DERIVED_RATIO',
    'ratio',
    210,
    {
      adult95: [1, 1, 1],
      adult110: [1, 1, 1],
      early: [1, 1, 1],
      late: [1, 1, 1],
    },
    calciumPhosphorusRatioOverrides,
  ),
  row('potassium', 'Potassium', 'MINERAL', 'g', 220, {
    adult95: [0.58, 1.45, 0.35],
    adult110: [0.5, 1.25, 0.3],
    early: [0.44, 1.1, 0.26],
    late: [0.44, 1.1, 0.26],
  }),
  row(
    'sodium',
    'Sodium*',
    'MINERAL',
    'g',
    230,
    {
      adult95: [0.12, 0.29, 0.07],
      adult110: [0.1, 0.25, 0.06],
      early: [0.22, 0.55, 0.13],
      late: [0.22, 0.55, 0.13],
    },
    allStages(
      byBasis(
        { footnoteRefs: ['c'], notes: safeSodiumChlorideNote },
        { footnoteRefs: ['c'], notes: safeSodiumChlorideNote },
        { footnoteRefs: ['c'], notes: safeSodiumChlorideNote },
      ),
    ),
  ),
  row(
    'chloride',
    'Chloride*',
    'MINERAL',
    'g',
    240,
    {
      adult95: [0.17, 0.43, 0.1],
      adult110: [0.15, 0.38, 0.09],
      early: [0.33, 0.83, 0.2],
      late: [0.33, 0.83, 0.2],
    },
    allStages(
      byBasis(
        { footnoteRefs: ['c'], notes: safeSodiumChlorideNote },
        { footnoteRefs: ['c'], notes: safeSodiumChlorideNote },
        { footnoteRefs: ['c'], notes: safeSodiumChlorideNote },
      ),
    ),
    {
      fediafNameBySourceTable: {
        'VII-17a': 'Chloride',
        'VII-17b': 'Chloride',
        'VII-17c': 'Chloride',
      },
    },
  ),
  row('magnesium', 'Magnesium', 'MINERAL', 'g', 250, {
    adult95: [0.08, 0.2, 0.05],
    adult110: [0.07, 0.18, 0.04],
    early: [0.04, 0.1, 0.02],
    late: [0.04, 0.1, 0.02],
  }),
  row(
    'copper',
    'Copper*',
    'TRACE_ELEMENT',
    'mg',
    260,
    {
      adult95: [0.83, 2.08, 0.5],
      adult110: [0.72, 1.8, 0.43],
      early: [1.1, 2.75, 0.66],
      late: [1.1, 2.75, 0.66],
    },
    allStages(legalDryMatterMax(2.8)),
  ),
  row(
    'iodine',
    'Iodine*',
    'TRACE_ELEMENT',
    'mg',
    270,
    {
      adult95: [0.12, 0.3, 0.07],
      adult110: [0.11, 0.26, 0.06],
      early: [0.15, 0.38, 0.09],
      late: [0.15, 0.38, 0.09],
    },
    allStages(legalDryMatterMax(1.1)),
  ),
  row(
    'iron',
    'Iron*',
    'TRACE_ELEMENT',
    'mg',
    280,
    {
      adult95: [4.17, 10.4, 2.49],
      adult110: [3.6, 9, 2.15],
      early: [8.8, 22, 5.26],
      late: [8.8, 22, 5.26],
    },
    allStages(legalDryMatterMax(68.18)),
  ),
  row(
    'manganese',
    'Manganese',
    'TRACE_ELEMENT',
    'mg',
    290,
    {
      adult95: [0.67, 1.67, 0.4],
      adult110: [0.58, 1.44, 0.34],
      early: [0.56, 1.4, 0.33],
      late: [0.56, 1.4, 0.33],
    },
    allStages(legalDryMatterMax(17)),
  ),
  row(
    'selenium',
    'Selenium*',
    'TRACE_ELEMENT',
    'μg',
    300,
    {
      adult95: [null, null, null],
      adult110: [null, null, null],
      early: [40, 100, 23.9],
      late: [40, 100, 23.9],
    },
    mergeOverrides(
      adultStages(noRecommendation()),
      growthStages(legalDryMatterMax(56.8, ['d'], seleniumFootnoteNote)),
    ),
    {
      core: false,
      annexLifeStages: [
        'EARLY_GROWTH_UNDER_14_WEEKS',
        'REPRODUCTION',
        'LATE_GROWTH_FROM_14_WEEKS',
      ],
    },
  ),
  row(
    'seleniumWetDiet',
    'Selenium* (wet diets)',
    'TRACE_ELEMENT',
    'μg',
    310,
    {
      adult95: [27, 67.5, 16.1],
      adult110: [23, 57.5, 13.7],
      early: [40, 100, 23.9],
      late: [40, 100, 23.9],
    },
    allStages(legalDryMatterMax(56.8, ['d'], seleniumFootnoteNote)),
    {
      annexLifeStages: ['ADULT_MER_95', 'ADULT_MER_110'],
    },
  ),
  row(
    'seleniumDryDiet',
    'Selenium* (dry diets)',
    'TRACE_ELEMENT',
    'μg',
    320,
    {
      adult95: [22, 55, 13.1],
      adult110: [18, 45, 10.8],
      early: [40, 100, 23.9],
      late: [40, 100, 23.9],
    },
    allStages(legalDryMatterMax(56.8, ['d'], seleniumFootnoteNote)),
    {
      annexLifeStages: ['ADULT_MER_95', 'ADULT_MER_110'],
    },
  ),
  row(
    'zinc',
    'Zinc*',
    'TRACE_ELEMENT',
    'mg',
    330,
    {
      adult95: [8.34, 20.8, 4.98],
      adult110: [7.2, 18, 4.3],
      early: [10, 25, 5.98],
      late: [10, 25, 5.98],
    },
    allStages(legalDryMatterMax(22.7)),
  ),
  row(
    'vitaminA',
    'Vitamin A*',
    'VITAMIN',
    'IU',
    340,
    {
      adult95: [702, 1754, 419],
      adult110: [606, 1515, 362],
      early: [500, 1250, 299],
      late: [500, 1250, 299],
    },
    allStages(nutritionalMax([40000, 100000, 23900])),
  ),
  row(
    'vitaminD',
    'Vitamin D*',
    'VITAMIN',
    'IU',
    350,
    {
      adult95: [63.9, 159, 38.2],
      adult110: [55.2, 138, 33],
      early: [55.2, 138, 33],
      late: [50, 125, 29.9],
    },
    allStages(vitaminDMax),
  ),
  row('vitaminE', 'Vitamin E*', 'VITAMIN', 'IU', 360, {
    adult95: [4.17, 10.4, 2.49],
    adult110: [3.6, 9, 2.2],
    early: [5, 12.5, 3],
    late: [5, 12.5, 3],
  }),
  row('vitaminB1', 'Vitamin B1 (Thiamine)*', 'VITAMIN', 'mg', 370, {
    adult95: [0.25, 0.62, 0.15],
    adult110: [0.21, 0.54, 0.13],
    early: [0.18, 0.45, 0.11],
    late: [0.18, 0.45, 0.11],
  }),
  row('vitaminB2', 'Vitamin B2 (Riboflavin)*', 'VITAMIN', 'mg', 380, {
    adult95: [0.69, 1.74, 0.42],
    adult110: [0.6, 1.5, 0.36],
    early: [0.42, 1.05, 0.25],
    late: [0.42, 1.05, 0.25],
  }),
  row('vitaminB5', 'Vitamin B5 (Pantothenic acid)*', 'VITAMIN', 'mg', 390, {
    adult95: [1.64, 4.11, 0.98],
    adult110: [1.42, 3.55, 0.85],
    early: [1.2, 3, 0.72],
    late: [1.2, 3, 0.72],
  }),
  row('vitaminB6', 'Vitamin B6 (Pyridoxine)*', 'VITAMIN', 'mg', 400, {
    adult95: [0.17, 0.42, 0.1],
    adult110: [0.15, 0.36, 0.09],
    early: [0.12, 0.3, 0.07],
    late: [0.12, 0.3, 0.07],
  }),
  row('vitaminB12', 'Vitamin B12 (Cyanocobalamin)*', 'VITAMIN', 'μg', 410, {
    adult95: [3.87, 9.68, 2.31],
    adult110: [3.35, 8.36, 2],
    early: [2.8, 7, 1.67],
    late: [2.8, 7, 1.67],
  }),
  row('vitaminB3', 'Vitamin B3 (Niacin)*', 'VITAMIN', 'mg', 420, {
    adult95: [1.89, 4.74, 1.13],
    adult110: [1.64, 4.09, 0.98],
    early: [1.36, 3.4, 0.81],
    late: [1.36, 3.4, 0.81],
  }),
  row('vitaminB9', 'Vitamin B9 (Folic acid)*', 'VITAMIN', 'μg', 430, {
    adult95: [29.9, 74.7, 17.9],
    adult110: [25.8, 64.5, 15.4],
    early: [21.6, 54, 12.9],
    late: [21.6, 54, 12.9],
  }),
  row(
    'vitaminB7',
    'Vitamin B7 (Biotin)*',
    'VITAMIN',
    'μg',
    440,
    {
      adult95: [null, null, null],
      adult110: [null, null, null],
      early: [null, null, null],
      late: [null, null, null],
    },
    allStages(noRecommendation()),
  ),
  row(
    'choline',
    'Choline*',
    'VITAMIN',
    'mg',
    450,
    {
      adult95: [189, 474, 113],
      adult110: [164, 409, 97.8],
      early: [170, 425, 102],
      late: [170, 425, 102],
    },
    {},
    {
      fediafNameBySourceTable: {
        'VII-17b': 'Choline',
        'VII-17c': 'Choline',
        'VII-17d': 'Choline',
      },
    },
  ),
  row(
    'vitaminK',
    'Vitamin K*',
    'VITAMIN',
    'μg',
    460,
    {
      adult95: [null, null, null],
      adult110: [null, null, null],
      early: [null, null, null],
      late: [null, null, null],
    },
    allStages(noRecommendation()),
  ),
];

const createEntry = (
  nutrientRow: FediafNutrientRow,
  lifeStage: LifeStage,
  basis: NutritionStandardBasis,
  source: {
    sourceTable: SourceTable;
    pdfPage: number;
    sourceType: NutritionStandardSourceType;
  },
  sortOffset: number,
): FediafStandardEntrySeed => {
  const override = nutrientRow.overrides[lifeStage]?.[basis];
  const minValue = nutrientRow.values[lifeStage][basis];
  return {
    nutrientCode: nutrientRow.nutrientCode,
    fediafName:
      nutrientRow.fediafNameBySourceTable[source.sourceTable] ??
      nutrientRow.fediafName,
    category: nutrientRow.category,
    sourceTable: source.sourceTable,
    sourceType: source.sourceType,
    pdfPage: source.pdfPage,
    species: 'DOG',
    lifeStage,
    basis,
    unit: nutrientRow.unit,
    minValue,
    maxValue: override?.maxValue ?? null,
    recommendedValue: override?.recommendedValue ?? null,
    maxType: override?.maxType ?? 'UNSPECIFIED',
    footnoteRefs: override?.footnoteRefs ?? [],
    notes: override?.notes ?? null,
    sortOrder: nutrientRow.sortOrder * 100 + sortOffset,
  };
};

const coreEntries = (): FediafStandardEntrySeed[] =>
  BASIS_ORDER.flatMap((basis, basisIndex) => {
    const table = CORE_TABLE_BY_BASIS[basis];
    return NUTRIENT_ROWS.filter((nutrientRow) => nutrientRow.core).flatMap(
      (nutrientRow) =>
        CORE_LIFE_STAGES.map((lifeStage, lifeStageIndex) =>
          createEntry(
            nutrientRow,
            lifeStage,
            basis,
            {
              ...table,
              sourceType: 'CORE_RECOMMENDATION',
            },
            basisIndex * 10 + lifeStageIndex,
          ),
        ),
    );
  });

const annexEntries = (): FediafStandardEntrySeed[] =>
  ANNEX_TABLES.flatMap((table, tableIndex) =>
    NUTRIENT_ROWS.flatMap((nutrientRow) => {
      const lifeStages = table.lifeStages.filter((lifeStage) =>
        nutrientRow.annexLifeStages.includes(lifeStage),
      );
      return lifeStages.flatMap((lifeStage, lifeStageIndex) =>
        BASIS_ORDER.map((basis, basisIndex) =>
          createEntry(
            nutrientRow,
            lifeStage,
            basis,
            {
              sourceTable: table.sourceTable,
              pdfPage: table.pdfPage,
              sourceType: 'ANNEX_7_8',
            },
            tableIndex * 100 + lifeStageIndex * 10 + basisIndex,
          ),
        ),
      );
    }),
  );

export const FEDIAF_2025_DOG_STANDARD_ENTRIES: FediafStandardEntrySeed[] = [
  ...coreEntries(),
  ...annexEntries(),
];
