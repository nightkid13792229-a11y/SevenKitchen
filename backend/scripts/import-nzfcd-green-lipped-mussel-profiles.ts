import {
  IngredientType,
  NutritionCandidateStatus,
  NutritionFoodCategory,
  NutritionFoodStatus,
  NutritionGovernanceSourceType,
  NutritionMatchConfidence,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import type { NutritionProfileV2 } from '../src/domain/ingredient/types';
import {
  mapNzfcdComponentsToNutritionProfile,
  NZFCD_SOURCE_PROVIDER,
  NZFCD_SOURCE_VERSION,
  type NzfcdComponent,
} from '../src/domain/nutrition-governance/nzfcd-nutrient-map';
import {
  buildNutritionSourceKey,
  getSourcePriority,
} from '../src/domain/nutrition-governance/nutrition-governance.utils';

loadEnv();
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/sevenkitchen';

const prisma = new PrismaClient();
const SOURCE_TYPE = NutritionGovernanceSourceType.NZFCD;
const SOURCE_TITLE = 'New Zealand Food Composition Database FOODfiles';
const NZFCD_BASE_URL = 'https://api.foodcomposition.co.nz/api';
const DEFAULT_INGREDIENT_NAME = '青口贝';
const SYSTEM_USER = 'system:nzfcd-green-lipped-mussel-import';

interface NzfcdFood {
  _id: string;
  foodname: string;
  shortname?: string | null;
  genus?: string | null;
  species?: string | null;
  description?: string | null;
  serving_size?: number | null;
  unit?: string | null;
  group?: string | null;
  alternate_name?: string[] | null;
}

interface ImportTarget {
  nzfcdId: 'T1024' | 'T1026';
  role: 'PRIMARY' | 'SECONDARY';
  preparationState: 'RAW' | 'COOKED';
  preparationStateLabel: string;
  ediblePortionLabel: string;
  processingLabel: string;
  confidence: NutritionMatchConfidence;
  score: number;
  reviewNote: string;
  matchReasonLabel: string;
}

interface ImportArgs {
  apply: boolean;
  ingredientName: string;
}

const TARGETS: readonly ImportTarget[] = [
  {
    nzfcdId: 'T1024',
    role: 'PRIMARY',
    preparationState: 'RAW',
    preparationStateLabel: '生',
    ediblePortionLabel: '肉',
    processingLabel: '未加工',
    confidence: NutritionMatchConfidence.HIGH,
    score: 0.99,
    reviewNote:
      'NZFCD T1024 is green-lipped mussel meat, fresh, raw; imported as the primary profile by reviewer decision.',
    matchReasonLabel:
      'NZFCD T1024 明确为 Perna canaliculus / Green-lipped mussel / Greenshell Mussel，生鲜肉，适合作为青口贝主档案。',
  },
  {
    nzfcdId: 'T1026',
    role: 'SECONDARY',
    preparationState: 'COOKED',
    preparationStateLabel: '熟',
    ediblePortionLabel: '肉',
    processingLabel: '水煮',
    confidence: NutritionMatchConfidence.HIGH,
    score: 0.94,
    reviewNote:
      'NZFCD T1026 is green-lipped mussel meat, boiled; imported as the cooked secondary profile by reviewer decision.',
    matchReasonLabel:
      'NZFCD T1026 食品名为 Mussel, green, meat, boiled，别名包含 Green-lipped mussel / kūtai，适合作为青口贝熟制次级档案。',
  },
];

function parseArgs(): ImportArgs {
  const args = process.argv.slice(2);
  const ingredientNameIndex = args.findIndex((arg) => arg === '--ingredient');

  return {
    apply: args.includes('--apply'),
    ingredientName:
      ingredientNameIndex >= 0 && args[ingredientNameIndex + 1]
        ? args[ingredientNameIndex + 1]
        : DEFAULT_INGREDIENT_NAME,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toNullableJson(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }
  return toJson(value);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `NZFCD request failed: ${response.status} ${response.statusText} ${url}`,
    );
  }

  return (await response.json()) as T;
}

async function fetchNzfcdFood(id: string): Promise<NzfcdFood> {
  return fetchJson<NzfcdFood>(`${NZFCD_BASE_URL}/food/${id}`);
}

async function fetchNzfcdComponents(id: string): Promise<NzfcdComponent[]> {
  return fetchJson<NzfcdComponent[]>(
    `${NZFCD_BASE_URL}/fiav/food/${id}?amount=100&comp_group_id=12`,
  );
}

function buildProfile(
  target: ImportTarget,
  food: NzfcdFood,
  components: NzfcdComponent[],
): NutritionProfileV2 {
  const profile = mapNzfcdComponentsToNutritionProfile(components);
  profile.meta.externalId = target.nzfcdId;
  profile.meta.sourceTitle = SOURCE_TITLE;
  profile.meta.sourceProvider = NZFCD_SOURCE_PROVIDER;
  profile.meta.sourceVersion = NZFCD_SOURCE_VERSION;
  profile.meta.confidenceLevel = target.confidence;
  profile.meta.sampleState = target.preparationState;
  profile.meta.versionNote = `Confirmed from ${SOURCE_TITLE}; ${target.nzfcdId}; ${target.role}.`;
  profile.meta.servingWeightG = food.serving_size ?? null;
  return profile;
}

function buildConfirmationSnapshot(params: {
  ingredientId: string;
  sourceRecordId: string;
  target: ImportTarget;
  confirmedAt: Date;
  profile: NutritionProfileV2;
}) {
  return {
    ingredientId: params.ingredientId,
    sourceRecordId: params.sourceRecordId,
    sourceType: SOURCE_TYPE,
    sourceTitle: SOURCE_TITLE,
    confidence: params.target.confidence,
    score: params.target.score,
    mappingRole: params.target.role,
    agentReview: null,
    hardGateResults: null,
    preparationState: params.target.preparationState,
    preparationStateLabel: params.target.preparationStateLabel,
    ediblePortionLabel: params.target.ediblePortionLabel,
    processingLabel: params.target.processingLabel,
    reviewNote: params.target.reviewNote,
    confirmedBy: SYSTEM_USER,
    confirmedAt: params.confirmedAt.toISOString(),
    nutritionProfile: params.profile,
  };
}

async function upsertTarget(params: {
  ingredient: { id: string; name: string };
  target: ImportTarget;
  food: NzfcdFood;
  components: NzfcdComponent[];
  profile: NutritionProfileV2;
}) {
  const { ingredient, target, food, components, profile } = params;
  const sourceKey = buildNutritionSourceKey(SOURCE_TYPE, target.nzfcdId);
  const confirmedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const sourceRecord = await tx.nutritionSourceRecord.upsert({
      where: {
        sourceType_sourceKey: {
          sourceType: SOURCE_TYPE,
          sourceKey,
        },
      },
      create: {
        sourceType: SOURCE_TYPE,
        sourceKey,
        sourceTitle: SOURCE_TITLE,
        sourceDetail: toNullableJson({
          nzfcdId: target.nzfcdId,
          provider: NZFCD_SOURCE_PROVIDER,
          sourceProvider: NZFCD_SOURCE_PROVIDER,
          sourceVersion: NZFCD_SOURCE_VERSION,
          foodUrl: `${NZFCD_BASE_URL}/food/${target.nzfcdId}`,
          nutrientUrl: `${NZFCD_BASE_URL}/fiav/food/${target.nzfcdId}?amount=100&comp_group_id=12`,
          importMode: 'nzfcd-green-lipped-mussel-profile-import',
          mappingRole: target.role,
        }),
        foodName: food.foodname,
        foodNameEn: food.foodname,
        dataType: NZFCD_SOURCE_VERSION,
        category: food.group ?? null,
        rawData: toJson({
          food,
          components,
        }),
        normalizedNutrition: toNullableJson(profile),
        status: 'ACTIVE',
      },
      update: {
        sourceTitle: SOURCE_TITLE,
        sourceDetail: toNullableJson({
          nzfcdId: target.nzfcdId,
          provider: NZFCD_SOURCE_PROVIDER,
          sourceProvider: NZFCD_SOURCE_PROVIDER,
          sourceVersion: NZFCD_SOURCE_VERSION,
          foodUrl: `${NZFCD_BASE_URL}/food/${target.nzfcdId}`,
          nutrientUrl: `${NZFCD_BASE_URL}/fiav/food/${target.nzfcdId}?amount=100&comp_group_id=12`,
          importMode: 'nzfcd-green-lipped-mussel-profile-import',
          mappingRole: target.role,
        }),
        foodName: food.foodname,
        foodNameEn: food.foodname,
        dataType: NZFCD_SOURCE_VERSION,
        category: food.group ?? null,
        rawData: toJson({
          food,
          components,
        }),
        normalizedNutrition: toNullableJson(profile),
      },
    });

    const isPrimary = target.role === 'PRIMARY';
    if (isPrimary) {
      await tx.ingredient.update({
        where: { id: ingredient.id },
        data: { nutritionProfile: toJson(profile) },
      });
    }

    const nutritionFood = await tx.nutritionFood.upsert({
      where: {
        name_dataSource_version: {
          name: food.foodname,
          dataSource: SOURCE_TYPE,
          version: 1,
        },
      },
      create: {
        name: food.foodname,
        nameEn: food.foodname,
        category: NutritionFoodCategory.OTHER,
        dataSource: SOURCE_TYPE,
        externalId: sourceKey,
        version: 1,
        status: NutritionFoodStatus.VERIFIED,
        preparationState: target.preparationState,
        preparationStateLabel: target.preparationStateLabel,
        ediblePortionLabel: target.ediblePortionLabel,
        processingLabel: target.processingLabel,
        nutritionData: toJson(profile),
        notes: target.reviewNote,
        verifiedBy: SYSTEM_USER,
        verifiedAt: confirmedAt,
      },
      update: {
        nameEn: food.foodname,
        category: NutritionFoodCategory.OTHER,
        externalId: sourceKey,
        status: NutritionFoodStatus.VERIFIED,
        preparationState: target.preparationState,
        preparationStateLabel: target.preparationStateLabel,
        ediblePortionLabel: target.ediblePortionLabel,
        processingLabel: target.processingLabel,
        nutritionData: toJson(profile),
        notes: target.reviewNote,
        verifiedBy: SYSTEM_USER,
        verifiedAt: confirmedAt,
      },
    });

    if (isPrimary) {
      await tx.nutritionFoodMapping.updateMany({
        where: {
          ingredientId: ingredient.id,
          isPrimary: true,
          NOT: {
            nutritionFoodId: nutritionFood.id,
          },
        },
        data: {
          isPrimary: false,
        },
      });
    }

    await tx.nutritionFoodMapping.upsert({
      where: {
        nutritionFoodId_ingredientId: {
          nutritionFoodId: nutritionFood.id,
          ingredientId: ingredient.id,
        },
      },
      create: {
        nutritionFoodId: nutritionFood.id,
        ingredientId: ingredient.id,
        yieldRate: 1,
        isPrimary,
        notes: `${target.preparationStateLabel}/${target.ediblePortionLabel}/${target.processingLabel}; ${sourceKey}`,
      },
      update: {
        isPrimary,
        notes: `${target.preparationStateLabel}/${target.ediblePortionLabel}/${target.processingLabel}; ${sourceKey}`,
      },
    });

    await tx.ingredientNutritionCandidate.upsert({
      where: {
        ingredientId_sourceRecordId: {
          ingredientId: ingredient.id,
          sourceRecordId: sourceRecord.id,
        },
      },
      create: {
        ingredientId: ingredient.id,
        sourceRecordId: sourceRecord.id,
        sourcePriority: getSourcePriority(SOURCE_TYPE),
        confidence: target.confidence,
        score: target.score,
        matchReasons: toJson([
          {
            code: 'MANUAL',
            label: target.matchReasonLabel,
            scoreDelta: 0.87,
          },
          {
            code: 'SOURCE_PRIORITY',
            label: '新西兰食物成分数据库来源',
            scoreDelta: 0.12,
          },
        ]),
        agentReview: Prisma.JsonNull,
        hardGateResults: Prisma.JsonNull,
        reviewGroup: 'AUTO_REVIEWABLE',
        preparationState: target.preparationState,
        preparationStateLabel: target.preparationStateLabel,
        ediblePortionLabel: target.ediblePortionLabel,
        processingLabel: target.processingLabel,
        reviewNote: target.reviewNote,
        normalizedNutrition: toJson(profile),
        status: NutritionCandidateStatus.CONFIRMED,
        confirmationSnapshot: toJson(
          buildConfirmationSnapshot({
            ingredientId: ingredient.id,
            sourceRecordId: sourceRecord.id,
            target,
            confirmedAt,
            profile,
          }),
        ),
        confirmedBy: SYSTEM_USER,
        confirmedAt,
      },
      update: {
        sourcePriority: getSourcePriority(SOURCE_TYPE),
        confidence: target.confidence,
        score: target.score,
        matchReasons: toJson([
          {
            code: 'MANUAL',
            label: target.matchReasonLabel,
            scoreDelta: 0.87,
          },
          {
            code: 'SOURCE_PRIORITY',
            label: '新西兰食物成分数据库来源',
            scoreDelta: 0.12,
          },
        ]),
        agentReview: Prisma.JsonNull,
        hardGateResults: Prisma.JsonNull,
        reviewGroup: 'AUTO_REVIEWABLE',
        preparationState: target.preparationState,
        preparationStateLabel: target.preparationStateLabel,
        ediblePortionLabel: target.ediblePortionLabel,
        processingLabel: target.processingLabel,
        reviewNote: target.reviewNote,
        normalizedNutrition: toJson(profile),
        status: NutritionCandidateStatus.CONFIRMED,
        confirmationSnapshot: toJson(
          buildConfirmationSnapshot({
            ingredientId: ingredient.id,
            sourceRecordId: sourceRecord.id,
            target,
            confirmedAt,
            profile,
          }),
        ),
        confirmedBy: SYSTEM_USER,
        confirmedAt,
      },
    });
  });
}

async function main() {
  const args = parseArgs();
  const ingredient = await prisma.ingredient.findFirst({
    where: {
      name: args.ingredientName,
      type: IngredientType.FOOD,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!ingredient) {
    throw new Error(`未找到食材标准原料：${args.ingredientName}`);
  }

  const preparedTargets = [];
  for (const target of TARGETS) {
    const [food, components] = await Promise.all([
      fetchNzfcdFood(target.nzfcdId),
      fetchNzfcdComponents(target.nzfcdId),
    ]);
    const profile = buildProfile(target, food, components);
    preparedTargets.push({ target, food, components, profile });
  }

  console.log(
    `${args.apply ? 'Applying' : 'Dry run'} NZFCD green-lipped mussel profiles for ${ingredient.name}`,
  );
  for (const item of preparedTargets) {
    const filledCount =
      Object.values(item.profile.macros).filter(
        (value) => typeof value === 'number',
      ).length +
      Object.values(item.profile.minerals).filter(
        (value) => typeof value === 'number',
      ).length +
      Object.values(item.profile.vitamins).filter(
        (value) => typeof value === 'number',
      ).length +
      Object.values(item.profile.fattyAcids).filter(
        (value) => typeof value === 'number',
      ).length +
      Object.values(item.profile.aminoAcids).filter(
        (value) => typeof value === 'number',
      ).length;
    console.log(
      `- ${item.target.nzfcdId} ${item.food.foodname} -> ${item.target.role}, ${item.target.preparationStateLabel}/${item.target.processingLabel}, fields=${filledCount}`,
    );
  }

  if (!args.apply) {
    console.log('Dry run only. Re-run with --apply to write records.');
    return;
  }

  for (const item of preparedTargets) {
    await upsertTarget({
      ingredient,
      target: item.target,
      food: item.food,
      components: item.components,
      profile: item.profile,
    });
  }

  console.log('NZFCD green-lipped mussel profiles imported.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
