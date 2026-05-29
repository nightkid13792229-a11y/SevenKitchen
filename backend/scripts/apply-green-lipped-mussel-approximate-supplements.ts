import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import {
  IngredientType,
  NutritionGovernanceSourceType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import { normalizeNutritionProfile } from '../src/domain/ingredient/nutrition-profile.utils';
import type {
  NutritionFieldSource,
  NutritionProfile,
  NutritionProfileV2,
} from '../src/domain/ingredient/types';
import {
  applyAcceptedGreenLippedMusselSupplements,
  buildGreenLippedMusselSupplementPlan,
  GREEN_LIPPED_MUSSEL_SUPPLEMENT_TARGET_FIELDS,
  type GreenLippedMusselProfileSnapshot,
  type SupplementalSourceSnapshot,
} from '../src/domain/nutrition-governance/green-lipped-mussel-gap-supplement';
import { USDA_NUTRIENT_MAP } from '../src/domain/nutrition-governance/usda-nutrient-map';

loadEnv();
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/sevenkitchen';

const prisma = new PrismaClient();
const DEFAULT_USDA_DATA_DIR =
  '/Users/zhaochen/Documents/petrecipedesigner/data/downloads/usda';
const DEFAULT_INGREDIENT_NAME = '青口贝';

interface Args {
  apply: boolean;
  ingredientName: string;
  usdaDataDir: string;
}

interface CsvRow {
  [key: string]: string;
}

interface CsvFoodRow extends CsvRow {
  fdc_id: string;
  description: string;
}

interface CsvNutrientRow extends CsvRow {
  id: string;
  name: string;
  unit_name: string;
}

interface CsvFoodNutrientRow extends CsvRow {
  fdc_id: string;
  nutrient_id: string;
  amount: string;
}

interface LoadedProfile {
  nutritionFoodId: string;
  sourceKey: string;
  role: 'PRIMARY' | 'SECONDARY';
  stateLabel: string;
  foodName: string;
  isPrimary: boolean;
  profile: NutritionProfileV2;
}

const USDA_MUSSEL_FOODS = [
  {
    fdcId: '174216',
    stateLabel: '生',
    sourceKey: 'USDA:174216',
    foodNameFallback: 'Mollusks, mussel, blue, raw',
  },
  {
    fdcId: '174217',
    stateLabel: '熟',
    sourceKey: 'USDA:174217',
    foodNameFallback: 'Mollusks, mussel, blue, cooked, moist heat',
  },
] as const;

function parseArgs(): Args {
  const args = process.argv.slice(2);
  return {
    apply: args.includes('--apply'),
    ingredientName:
      getArgValue(args, '--ingredient') ?? DEFAULT_INGREDIENT_NAME,
    usdaDataDir: getArgValue(args, '--usda-data-dir') ?? DEFAULT_USDA_DATA_DIR,
  };
}

function getArgValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function main() {
  const args = parseArgs();
  const ingredient = await prisma.ingredient.findFirst({
    where: { name: args.ingredientName, type: IngredientType.FOOD },
    select: { id: true, name: true },
  });
  if (!ingredient) {
    throw new Error(`未找到食材标准原料：${args.ingredientName}`);
  }

  const profiles = await loadGreenLippedMusselProfiles(ingredient.id);
  const sources = await loadUsdaBlueMusselSources(args.usdaDataDir);
  const snapshots = profiles.map(profileToSnapshot);
  const plan = buildGreenLippedMusselSupplementPlan({
    profiles: snapshots,
    supplementalSources: sources,
  });
  const updates = profiles
    .map((profile) => {
      const result = applyAcceptedGreenLippedMusselSupplements({
        profile: profile.profile,
        rows: plan.rows.filter((row) => row.profileId === profile.sourceKey),
        acceptedActions: ['REVIEW_APPROXIMATE_SOURCE'],
        refreshExistingFieldSources: true,
      });
      return { profile, result };
    })
    .filter(({ result }) => result.appliedRows.length > 0);

  console.log(
    `${args.apply ? 'Applying' : 'Dry run'} approximate blue/common mussel supplements for ${ingredient.name}`,
  );
  for (const update of updates) {
    console.log(
      `- ${update.profile.sourceKey} ${update.profile.stateLabel}: ${update.result.appliedRows
        .map((row) => `${row.label}=${row.bestSourceValue}${row.unit}`)
        .join(', ')}`,
    );
  }

  if (!args.apply) {
    console.log('Dry run only. Re-run with --apply to write records.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.nutritionFood.update({
        where: { id: update.profile.nutritionFoodId },
        data: { nutritionData: toJson(update.result.profile) },
      });

      const candidates = await tx.ingredientNutritionCandidate.findMany({
        where: {
          ingredientId: ingredient.id,
          sourceRecord: {
            sourceType: NutritionGovernanceSourceType.NZFCD,
            sourceKey: update.profile.sourceKey,
          },
        },
        select: {
          id: true,
          confirmationSnapshot: true,
        },
      });

      for (const candidate of candidates) {
        const snapshot =
          candidate.confirmationSnapshot &&
          typeof candidate.confirmationSnapshot === 'object' &&
          !Array.isArray(candidate.confirmationSnapshot)
            ? {
                ...(candidate.confirmationSnapshot as Record<string, unknown>),
                nutritionProfile: update.result.profile,
                fieldSupplementAppliedAt: new Date().toISOString(),
                fieldSupplementAcceptedSource: 'APPROXIMATE_SPECIES',
              }
            : {
                nutritionProfile: update.result.profile,
                fieldSupplementAppliedAt: new Date().toISOString(),
                fieldSupplementAcceptedSource: 'APPROXIMATE_SPECIES',
              };

        await tx.ingredientNutritionCandidate.update({
          where: { id: candidate.id },
          data: {
            normalizedNutrition: toJson(update.result.profile),
            confirmationSnapshot: toJson(snapshot),
          },
        });
      }

      if (update.profile.isPrimary) {
        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: { nutritionProfile: toJson(update.result.profile) },
        });
      }
    }
  });

  console.log('Approximate field supplements applied.');
}

async function loadGreenLippedMusselProfiles(
  ingredientId: string,
): Promise<LoadedProfile[]> {
  const mappings = await prisma.nutritionFoodMapping.findMany({
    where: {
      ingredientId,
      nutritionFood: {
        dataSource: NutritionGovernanceSourceType.NZFCD,
        externalId: { in: ['NZFCD:T1024', 'NZFCD:T1026'] },
      },
    },
    include: { nutritionFood: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });

  return mappings.map((mapping) => {
    const sourceKey =
      mapping.nutritionFood.externalId ?? mapping.nutritionFood.name;
    const profile = normalizeNutritionProfile(
      mapping.nutritionFood.nutritionData as unknown as NutritionProfile,
    );
    if (!profile) {
      throw new Error(`营养档案无法解析：${sourceKey}`);
    }

    return {
      nutritionFoodId: mapping.nutritionFood.id,
      sourceKey,
      role: mapping.isPrimary ? 'PRIMARY' : 'SECONDARY',
      stateLabel:
        mapping.nutritionFood.preparationStateLabel ??
        mapping.nutritionFood.preparationState ??
        '待确认',
      foodName: mapping.nutritionFood.name,
      isPrimary: mapping.isPrimary,
      profile,
    };
  });
}

function profileToSnapshot(
  profile: LoadedProfile,
): GreenLippedMusselProfileSnapshot {
  return {
    profileId: profile.sourceKey,
    role: profile.role,
    stateLabel: profile.stateLabel,
    foodName: profile.foodName,
    values: Object.fromEntries(
      GREEN_LIPPED_MUSSEL_SUPPLEMENT_TARGET_FIELDS.map((field) => {
        const existingFieldSource =
          profile.profile.meta.fieldSources?.[field.fieldPath];
        return [
          field.fieldPath,
          existingFieldSource?.sourceRole === 'FIELD_SUPPLEMENT'
            ? null
            : readFieldPath(profile.profile, field.fieldPath),
        ];
      }),
    ),
  };
}

function readFieldPath(input: unknown, fieldPath: string): number | null {
  const value = fieldPath.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    return (current as Record<string, unknown>)[segment];
  }, input);

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function loadUsdaBlueMusselSources(
  usdaDataDir: string,
): Promise<SupplementalSourceSnapshot[]> {
  const foodPath = resolve(usdaDataDir, 'food.csv');
  const nutrientPath = resolve(usdaDataDir, 'nutrient.csv');
  const foodNutrientPath = resolve(usdaDataDir, 'food_nutrient.csv');
  if (
    !existsSync(foodPath) ||
    !existsSync(nutrientPath) ||
    !existsSync(foodNutrientPath)
  ) {
    throw new Error(`USDA 本地数据不存在或不完整：${usdaDataDir}`);
  }

  const foods = await readCsv<CsvFoodRow>(foodPath);
  const nutrients = await readCsv<CsvNutrientRow>(nutrientPath);
  const foodNutrients = await readCsv<CsvFoodNutrientRow>(foodNutrientPath);
  const foodById = new Map(foods.map((food) => [food.fdc_id, food]));
  const nutrientById = new Map(
    nutrients.map((nutrient) => [nutrient.id, nutrient]),
  );
  const usdaMappingByNutrientId = new Map(
    USDA_NUTRIENT_MAP.map((mapping) => [String(mapping.nutrientId), mapping]),
  );

  return USDA_MUSSEL_FOODS.map((target) => {
    const values: Record<string, number> = {};
    const fieldSources: Record<string, Partial<NutritionFieldSource>> = {};

    for (const row of foodNutrients.filter(
      (item) => item.fdc_id === target.fdcId,
    )) {
      const mapping = usdaMappingByNutrientId.get(row.nutrient_id);
      const amount = Number(row.amount);
      if (!mapping || !Number.isFinite(amount)) continue;
      if (
        !GREEN_LIPPED_MUSSEL_SUPPLEMENT_TARGET_FIELDS.some(
          (field) => field.fieldPath === mapping.fieldPath,
        )
      ) {
        continue;
      }

      const nutrient = nutrientById.get(row.nutrient_id);
      const canonicalValue = amount * (mapping.amountMultiplier ?? 1);
      values[mapping.fieldPath] = canonicalValue;
      fieldSources[mapping.fieldPath] = {
        sourceNutrientId: row.nutrient_id,
        sourceNutrientName: nutrient?.name ?? null,
        originalValue: amount,
        originalUnit: mapping.sourceUnit ?? nutrient?.unit_name ?? null,
        canonicalValue,
      };
    }

    const food = foodById.get(target.fdcId);
    return {
      sourceKey: target.sourceKey,
      sourceType: 'USDA',
      foodName: food?.description ?? target.foodNameFallback,
      scientificName: 'Blue/common mussel; not Perna canaliculus',
      stateLabel: target.stateLabel,
      compatibility: 'APPROXIMATE_SPECIES',
      values,
      fieldSources,
      sourceNote:
        'USDA FoodData Central blue/common mussel row; accepted by reviewer as approximate species field supplement only.',
    };
  });
}

async function readCsv<T extends CsvRow>(path: string): Promise<T[]> {
  const content = await readFile(path, 'utf8');
  const lines = content.trim().split(/\r?\n/u);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? '']),
    ) as T;
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
