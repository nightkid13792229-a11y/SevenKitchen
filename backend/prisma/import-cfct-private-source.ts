import { readFileSync } from 'fs';
import { isAbsolute } from 'path';

import { Prisma, PrismaClient } from '@prisma/client';

import { createEmptyNutritionProfile } from '../src/domain/ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../src/domain/ingredient/types';
import {
  buildVitaminASourceFormMetadata,
  calculateVitaminAActivityIu,
} from '../src/domain/ingredient/vitamin-a-conversion';
import {
  buildVitaminESourceFormMetadata,
  calculateVitaminEActivityIu,
} from '../src/domain/ingredient/vitamin-e-conversion';
import {
  buildCfctFattyAcidPercentMetadata,
  calculateCfctFattyAcidValueFromPercent,
  type CfctFattyAcidCanonicalUnit,
} from '../src/domain/nutrition-governance/cfct-fatty-acid-conversion';
import type { NutritionSourceInput } from '../src/domain/nutrition-governance/nutrition-governance.types';
import { buildNutritionSourceKey } from '../src/domain/nutrition-governance/nutrition-governance.utils';

const CFCT_SOURCE_TYPE = 'CFCT' as const;
const CFCT_SOURCE_PROVIDER = '中国食物成分表';

const CFCT_MACRO_NUTRIENTS = [
  'energyKcal',
  'moisture',
  'crudeProtein',
  'crudeFat',
  'ash',
  'carbohydrate',
  'fiber',
  'solubleFiber',
  'insolubleFiber',
] as const satisfies readonly (keyof NutritionProfileV2['macros'])[];

const CFCT_MINERAL_NUTRIENTS = [
  'calcium',
  'phosphorus',
  'potassium',
  'sodium',
  'magnesium',
  'chloride',
  'iron',
  'zinc',
  'copper',
  'manganese',
  'selenium',
  'iodine',
] as const satisfies readonly (keyof NutritionProfileV2['minerals'])[];

const CFCT_VITAMIN_NUTRIENTS = [
  'vitaminA',
  'vitaminD',
  'vitaminE',
  'vitaminK',
  'vitaminB1',
  'vitaminB2',
  'vitaminB3',
  'vitaminB5',
  'vitaminB6',
  'vitaminB7',
  'vitaminB9',
  'vitaminB12',
  'choline',
  'vitaminC',
] as const satisfies readonly (keyof NutritionProfileV2['vitamins'])[];

const CFCT_FATTY_ACID_NUTRIENTS = [
  'saturatedFattyAcids',
  'monounsaturatedFattyAcids',
  'polyunsaturatedFattyAcids',
  'linoleicAcid',
  'alphaLinolenicAcid',
  'arachidonicAcid',
  'epa',
  'dpa',
  'dha',
] as const satisfies readonly (keyof NutritionProfileV2['fattyAcids'])[];

const CFCT_AMINO_ACID_NUTRIENTS = [
  'arginine',
  'lysine',
  'methionine',
  'cystine',
  'taurine',
  'tryptophan',
  'threonine',
  'leucine',
  'isoleucine',
  'valine',
  'phenylalanine',
  'tyrosine',
  'histidine',
  'glutamicAcid',
  'glycine',
  'proline',
] as const satisfies readonly (keyof NutritionProfileV2['aminoAcids'])[];

type CfctMacroNutrient = (typeof CFCT_MACRO_NUTRIENTS)[number];
type CfctMineralNutrient = (typeof CFCT_MINERAL_NUTRIENTS)[number];
type CfctVitaminNutrient = (typeof CFCT_VITAMIN_NUTRIENTS)[number];
type CfctFattyAcidNutrient = (typeof CFCT_FATTY_ACID_NUTRIENTS)[number];
type CfctAminoAcidNutrient = (typeof CFCT_AMINO_ACID_NUTRIENTS)[number];

export type ReviewedCfctNutrients = Partial<
  Record<
    | CfctMacroNutrient
    | CfctMineralNutrient
    | CfctVitaminNutrient
    | CfctFattyAcidNutrient
    | CfctAminoAcidNutrient,
    number | null | undefined
  >
>;

export interface ReviewedCfctSourceSegment {
  kind: 'PRIMARY' | 'CONTINUATION';
  page: string | number;
  row: string | number;
  rawOcrText: string;
  ocrConfidence?: number | null;
  nutrientKeys?: string[];
}

export interface ReviewedCfctRow {
  volume: string;
  page: string | number;
  row: string | number;
  foodName: string;
  category?: string | null;
  foodCode?: string | null;
  ediblePortionPercent?: number | null;
  energyKj?: number | null;
  nutrients: ReviewedCfctNutrients;
  sourceSegments?: ReviewedCfctSourceSegment[];
  unmappedNutrients?: Record<string, number | null | undefined>;
  qualityFlags?: string[];
  reviewStatus?: string | null;
}

type ImportLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

export type CfctPrivateImportCounters = {
  apply: number;
  upsert: number;
  skip: number;
};

function assignNumericNutrients(profile: NutritionProfileV2, row: ReviewedCfctRow) {
  const nutrients = row.nutrients ?? {};

  for (const key of CFCT_MACRO_NUTRIENTS) {
    const value = nutrients[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      profile.macros[key] = value;
    }
  }

  for (const key of CFCT_MINERAL_NUTRIENTS) {
    const value = nutrients[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      profile.minerals[key] = value;
    }
  }

  for (const key of CFCT_VITAMIN_NUTRIENTS) {
    const value = nutrients[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      profile.vitamins[key] = value;
    }
  }

  for (const key of CFCT_FATTY_ACID_NUTRIENTS) {
    const value = nutrients[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      profile.fattyAcids[key] = value;
    }
  }

  for (const key of CFCT_AMINO_ACID_NUTRIENTS) {
    const value = nutrients[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      profile.aminoAcids[key] = value;
    }
  }
}

function finiteUnmappedValue(
  unmappedNutrients: ReviewedCfctRow['unmappedNutrients'],
  key: string,
): number | null {
  const value = unmappedNutrients?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function assignCfctVitaminAActivity(
  profile: NutritionProfileV2,
  row: ReviewedCfctRow,
) {
  const retinolUg =
    finiteUnmappedValue(row.unmappedNutrients, 'cfctVitaminARetinolUg') ??
    finiteUnmappedValue(row.unmappedNutrients, 'cfctRetinolUg');
  const betaCaroteneUg =
    finiteUnmappedValue(row.unmappedNutrients, 'cfctVitaminABetaCaroteneUg') ??
    finiteUnmappedValue(row.unmappedNutrients, 'cfctCaroteneUg');
  const calculation = calculateVitaminAActivityIu({
    retinolUg,
    betaCaroteneUg,
  });
  if (!calculation) {
    return;
  }

  profile.vitamins.vitaminA = calculation.valueIu;
  profile.meta.sourceForms ??= {};
  profile.meta.conversionNotes ??= {};
  profile.meta.sourceForms['vitamins.vitaminA'] = {
    sourceNutrientId: 'CFCT_VITAMIN_A_COMPONENTS',
    sourceNutrientName:
      retinolUg !== null && betaCaroteneUg !== null
        ? '视黄醇 / 胡萝卜素'
        : retinolUg !== null
          ? '视黄醇'
          : '胡萝卜素',
    originalValue: null,
    originalUnit: 'µg/100g',
    canonicalValue: calculation.valueIu,
    canonicalUnit: 'IU',
    basisType: profile.meta.rawBasisType,
    ...buildVitaminASourceFormMetadata(calculation),
    cfctCaroteneInterpretedAsBetaCarotene: betaCaroteneUg !== null,
  };
  profile.meta.conversionNotes['vitamins.vitaminA'] =
    `${calculation.note} CFCT 胡萝卜素列按 β-胡萝卜素活性处理；如后续来源拆分 α/β 胡萝卜素，应优先使用 β-胡萝卜素分项。`;
}

function assignCfctVitaminEActivity(
  profile: NutritionProfileV2,
  row: ReviewedCfctRow,
) {
  const alphaMg = finiteUnmappedValue(
    row.unmappedNutrients,
    'cfctVitaminEAlphaTocopherolMg',
  );
  const betaGammaMg = finiteUnmappedValue(
    row.unmappedNutrients,
    'cfctVitaminEBetaGammaTocopherolMg',
  );
  const deltaMg = finiteUnmappedValue(
    row.unmappedNutrients,
    'cfctVitaminEDeltaTocopherolMg',
  );
  const totalAlphaEquivalentMg = finiteUnmappedValue(
    row.unmappedNutrients,
    'cfctVitaminETotalAlphaEquivalentMg',
  );
  const hasComponentRows =
    alphaMg !== null || betaGammaMg !== null || deltaMg !== null;
  const calculation = calculateVitaminEActivityIu(
    hasComponentRows
      ? {
          alphaTocopherolMg: alphaMg,
          betaGammaTocopherolMg: betaGammaMg,
          deltaTocopherolMg: deltaMg,
        }
      : {
          alphaTocopherolEquivalentMg: totalAlphaEquivalentMg,
        },
  );
  if (!calculation) {
    return;
  }

  profile.vitamins.vitaminE = calculation.valueIu;
  profile.meta.sourceForms ??= {};
  profile.meta.conversionNotes ??= {};
  profile.meta.sourceForms['vitamins.vitaminE'] = {
    sourceNutrientId: 'CFCT_VITAMIN_E_COMPONENTS',
    sourceNutrientName: hasComponentRows
      ? '维生素E / α-生育酚 / β+γ-生育酚 / δ-生育酚'
      : '维生素E（α-生育酚当量）',
    originalValue: totalAlphaEquivalentMg,
    originalUnit: 'mg/100g',
    canonicalValue: calculation.valueIu,
    canonicalUnit: 'IU',
    basisType: profile.meta.rawBasisType,
    ...buildVitaminESourceFormMetadata(calculation),
  };
  profile.meta.conversionNotes['vitamins.vitaminE'] = calculation.note;
}

const CFCT_FATTY_ACID_PERCENT_FIELDS = [
  {
    profileKey: 'linoleicAcid',
    unmappedKey: 'cfctLinoleicAcidPercent',
    sourceNutrientId: 'CFCT_FA_18_2_PERCENT',
    sourceNutrientName: '18:2 / 总脂肪酸',
    canonicalUnit: 'g',
  },
  {
    profileKey: 'alphaLinolenicAcid',
    unmappedKey: 'cfctAlphaLinolenicAcidPercent',
    sourceNutrientId: 'CFCT_FA_18_3_PERCENT',
    sourceNutrientName: '18:3 / 总脂肪酸',
    canonicalUnit: 'g',
  },
  {
    profileKey: 'arachidonicAcid',
    unmappedKey: 'cfctArachidonicAcidPercent',
    sourceNutrientId: 'CFCT_FA_20_4_PERCENT',
    sourceNutrientName: '20:4 / 总脂肪酸',
    canonicalUnit: 'g',
  },
  {
    profileKey: 'epa',
    unmappedKey: 'cfctEpaPercent',
    sourceNutrientId: 'CFCT_FA_20_5_PERCENT',
    sourceNutrientName: '20:5 / 总脂肪酸',
    canonicalUnit: 'mg',
  },
  {
    profileKey: 'dpa',
    unmappedKey: 'cfctDpaPercent',
    sourceNutrientId: 'CFCT_FA_22_5_PERCENT',
    sourceNutrientName: '22:5 / 总脂肪酸',
    canonicalUnit: 'mg',
  },
  {
    profileKey: 'dha',
    unmappedKey: 'cfctDhaPercent',
    sourceNutrientId: 'CFCT_FA_22_6_PERCENT',
    sourceNutrientName: '22:6 / 总脂肪酸',
    canonicalUnit: 'mg',
  },
] as const satisfies readonly {
  profileKey: keyof NutritionProfileV2['fattyAcids'];
  unmappedKey: string;
  sourceNutrientId: string;
  sourceNutrientName: string;
  canonicalUnit: CfctFattyAcidCanonicalUnit;
}[];

function assignCfctFattyAcidPercentRows(
  profile: NutritionProfileV2,
  row: ReviewedCfctRow,
) {
  const totalFattyAcidsG = finiteUnmappedValue(
    row.unmappedNutrients,
    'cfctFattyAcidTotalG',
  );
  if (totalFattyAcidsG === null) {
    return;
  }

  for (const field of CFCT_FATTY_ACID_PERCENT_FIELDS) {
    const percent = finiteUnmappedValue(row.unmappedNutrients, field.unmappedKey);
    if (percent === null) {
      continue;
    }
    const value = calculateCfctFattyAcidValueFromPercent({
      totalFattyAcidsG,
      percentOfTotalFattyAcids: percent,
      targetUnit: field.canonicalUnit,
    });
    if (value === null) {
      continue;
    }

    const fieldPath = `fattyAcids.${field.profileKey}`;
    profile.fattyAcids[field.profileKey] = value;
    profile.meta.sourceForms ??= {};
    profile.meta.conversionNotes ??= {};
    profile.meta.sourceForms[fieldPath] = buildCfctFattyAcidPercentMetadata({
      sourceNutrientId: field.sourceNutrientId,
      sourceNutrientName: field.sourceNutrientName,
      totalFattyAcidsG,
      percentOfTotalFattyAcids: percent,
      canonicalValue: value,
      canonicalUnit: field.canonicalUnit,
    });
    profile.meta.conversionNotes[fieldPath] =
      field.canonicalUnit === 'mg'
        ? 'CFCT 脂肪酸组成表给出单项脂肪酸占总脂肪酸百分比；按 总脂肪酸 × 百分比 ÷ 100 × 1000 换算为 mg/100g 可食部。'
        : 'CFCT 脂肪酸组成表给出单项脂肪酸占总脂肪酸百分比；按 总脂肪酸 × 百分比 ÷ 100 换算为 g/100g 可食部。';
  }
}

export function mapCfctRowToSourceInput(
  row: ReviewedCfctRow,
): NutritionSourceInput {
  const profile = createEmptyNutritionProfile();
  const sourceTitle = `${CFCT_SOURCE_PROVIDER} ${row.volume}`;

  profile.meta.rawBasisType = 'PER_100_G';
  profile.meta.sourceType = CFCT_SOURCE_TYPE;
  profile.meta.sourceTitle = sourceTitle;
  profile.meta.sourceProvider = CFCT_SOURCE_PROVIDER;
  profile.meta.confidenceLevel = 'MEDIUM';
  assignNumericNutrients(profile, row);
  assignCfctVitaminAActivity(profile, row);
  assignCfctVitaminEActivity(profile, row);
  assignCfctFattyAcidPercentRows(profile, row);

  return {
    sourceType: CFCT_SOURCE_TYPE,
    externalId: `${row.volume}:p${row.page}:r${row.row}`,
    sourceTitle,
    foodName: row.foodName,
    category: row.category ?? null,
    sourceDetail: {
      volume: row.volume,
      page: row.page,
      row: row.row,
      foodCode: row.foodCode ?? null,
      ediblePortionPercent: row.ediblePortionPercent ?? null,
      energyKj: row.energyKj ?? null,
      sourceSegments: row.sourceSegments ?? null,
      unmappedNutrients: row.unmappedNutrients ?? null,
      privateLocalSource: true,
      provider: CFCT_SOURCE_PROVIDER,
      sourceProvider: CFCT_SOURCE_PROVIDER,
    },
    rawData: row as unknown as Record<string, unknown>,
    normalizedNutrition: profile,
  };
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJsonInput(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) {
    return Prisma.DbNull;
  }

  return toJsonInput(value);
}

function getInputPath(argv: string[]): string {
  const inputArg = argv.find((arg) => arg.startsWith('--input='));
  if (!inputArg) {
    throw new Error(
      'Missing required --input=/absolute/path/to/reviewed-cfct.json argument',
    );
  }

  const inputPath = inputArg.slice('--input='.length);
  if (!isAbsolute(inputPath)) {
    throw new Error('--input must be an absolute path');
  }

  return inputPath;
}

function parseReviewedCfctRows(inputPath: string): ReviewedCfctRow[] {
  const parsed = JSON.parse(readFileSync(inputPath, 'utf8')) as unknown;

  if (Array.isArray(parsed)) {
    return parsed as ReviewedCfctRow[];
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { rows?: unknown }).rows)
  ) {
    return (parsed as { rows: ReviewedCfctRow[] }).rows;
  }

  throw new Error('Reviewed CFCT input must be a JSON array or an object with rows');
}

export function validateReviewedCfctRows(rows: ReviewedCfctRow[]): void {
  rows.forEach((row, index) => {
    const label = `row ${index + 1}`;
    if (!row || typeof row !== 'object') {
      throw new Error(`${label} must be an object`);
    }
    if (typeof row.volume !== 'string' || !row.volume.trim()) {
      throw new Error(`${label} volume is required`);
    }
    if (row.page === null || row.page === undefined || `${row.page}`.trim() === '') {
      throw new Error(`${label} page is required`);
    }
    if (row.row === null || row.row === undefined || `${row.row}`.trim() === '') {
      throw new Error(`${label} row is required`);
    }
    if (typeof row.foodName !== 'string' || !row.foodName.trim()) {
      throw new Error(`${label} foodName is required`);
    }
    if (!row.nutrients || typeof row.nutrients !== 'object') {
      throw new Error(`${label} nutrients is required`);
    }
    if (row.reviewStatus === 'NEEDS_REVIEW') {
      throw new Error(`${label} must be reviewed before import`);
    }
    if (Array.isArray(row.qualityFlags) && row.qualityFlags.length > 0) {
      throw new Error(`${label} must be reviewed before import`);
    }

    const hasMappedNutrient = [
      ...CFCT_MACRO_NUTRIENTS,
      ...CFCT_MINERAL_NUTRIENTS,
      ...CFCT_VITAMIN_NUTRIENTS,
      ...CFCT_FATTY_ACID_NUTRIENTS,
      ...CFCT_AMINO_ACID_NUTRIENTS,
    ].some((key) => {
      const value = row.nutrients[key];
      return typeof value === 'number' && Number.isFinite(value);
    });

    if (!hasMappedNutrient) {
      throw new Error(`${label} must include at least one mapped nutrient`);
    }
  });
}

export async function importCfctPrivateSourceRows({
  prisma,
  rows,
  apply,
  logger,
}: {
  prisma: PrismaClient;
  rows: ReviewedCfctRow[];
  apply: boolean;
  logger: ImportLogger;
}): Promise<CfctPrivateImportCounters> {
  const counters: CfctPrivateImportCounters = {
    apply: 0,
    upsert: 0,
    skip: 0,
  };

  logger.info(
    apply
      ? 'Applying private CFCT source import...'
      : 'Dry run: private CFCT source import...',
  );

  for (const row of rows) {
    const input = mapCfctRowToSourceInput(row);
    const sourceKey = buildNutritionSourceKey(input.sourceType, input.externalId);
    counters.upsert += 1;

    logger.info(`- ${apply ? 'upsert' : 'dry-run'} ${sourceKey} ${input.foodName}`);

    if (!apply) {
      continue;
    }

    await prisma.nutritionSourceRecord.upsert({
      where: {
        sourceType_sourceKey: {
          sourceType: input.sourceType,
          sourceKey,
        },
      },
      create: {
        sourceType: input.sourceType,
        sourceKey,
        sourceTitle: input.sourceTitle,
        sourceDetail: toNullableJsonInput(input.sourceDetail),
        foodName: input.foodName,
        foodNameEn: input.foodNameEn ?? null,
        dataType: input.dataType ?? null,
        category: input.category ?? null,
        rawData: toJsonInput(input.rawData),
        normalizedNutrition: toNullableJsonInput(input.normalizedNutrition),
        status: 'ACTIVE',
      },
      update: {
        sourceTitle: input.sourceTitle,
        sourceDetail: toNullableJsonInput(input.sourceDetail),
        foodName: input.foodName,
        foodNameEn: input.foodNameEn ?? null,
        dataType: input.dataType ?? null,
        category: input.category ?? null,
        rawData: toJsonInput(input.rawData),
        normalizedNutrition: toNullableJsonInput(input.normalizedNutrition),
      },
    });

    counters.apply += 1;
  }

  logger.info('');
  logger.info('Summary');
  logger.info(`- apply: ${counters.apply}`);
  logger.info(`- upsert: ${counters.upsert}`);
  logger.info(`- skip: ${counters.skip}`);
  if (!apply) {
    logger.info('Dry run complete. Re-run with --apply to persist changes.');
  }

  return counters;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const inputPath = getInputPath(argv);
  const apply = argv.includes('--apply');
  const rows = parseReviewedCfctRows(inputPath);
  validateReviewedCfctRows(rows);
  const prisma = new PrismaClient();

  try {
    await importCfctPrivateSourceRows({
      prisma,
      rows,
      apply,
      logger: {
        info: (message) => console.log(message),
        error: (message) => console.error(message),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to import private CFCT source rows:', error);
    process.exit(1);
  });
}
