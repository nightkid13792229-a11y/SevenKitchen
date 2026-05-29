import { config as loadEnv } from 'dotenv';
import {
  NutritionFoodCategory,
  NutritionFoodStatus,
  NutritionGovernanceSourceType,
  Prisma,
  PrismaClient,
} from '@prisma/client';

import {
  buildRedSweetPepperFoundationOnlyProfile,
  buildRedSweetPepperPrimaryProfile,
  RED_SWEET_PEPPER_FOUNDATION_RECORD,
  RED_SWEET_PEPPER_FOUNDATION_SOURCE_KEY,
  RED_SWEET_PEPPER_LEGACY_SOURCE_KEY,
} from '../src/domain/nutrition-governance/red-sweet-pepper-foundation-upgrade';
import type { NutritionProfileV2 } from '../src/domain/ingredient/types';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const APPLY = process.argv.includes('--apply');
const INGREDIENT_NAME = '红甜椒';
const FOUNDATION_SOURCE_VERSION = 'USDA_FDC_FOUNDATION:2026-04-30';
const FOUNDATION_SOURCE_TITLE = 'USDA FoodData Central Foundation Foods';
const USDA_PROVIDER = 'USDA FoodData Central';
const DOWNLOAD_URL =
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip';

const prisma = new PrismaClient();

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJsonInput(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

function readLegacyFoodNutrients(rawData: Prisma.JsonValue): Array<{
  nutrient?: { id?: number; name?: string; unitName?: string };
  amount?: number;
}> {
  const raw = rawData as any;
  const nutrients = Array.isArray(raw?.foodNutrients)
    ? raw.foodNutrients
    : Array.isArray(raw?.food?.foodNutrients)
      ? raw.food.foodNutrients
      : null;

  if (!nutrients) {
    throw new Error('USDA:170108 source record does not contain foodNutrients.');
  }

  return nutrients;
}

function countFilled(profile: NutritionProfileV2): number {
  let total = 0;
  for (const group of [
    'macros',
    'minerals',
    'vitamins',
    'fattyAcids',
    'aminoAcids',
  ] as const) {
    for (const value of Object.values(profile[group])) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        total += 1;
      }
    }
  }
  return total;
}

async function main() {
  try {
    const ingredient = await prisma.ingredient.findFirst({
      where: { name: INGREDIENT_NAME },
      include: {
        nutritionFoodMappings: {
          include: { nutritionFood: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!ingredient) {
      throw new Error(`Ingredient not found: ${INGREDIENT_NAME}`);
    }

    const primaryMapping = ingredient.nutritionFoodMappings.find(
      (mapping) => mapping.isPrimary,
    );
    if (!primaryMapping) {
      throw new Error(`${INGREDIENT_NAME} does not have a primary nutrition food.`);
    }

    const currentPrimarySourceKey = primaryMapping.nutritionFood.externalId;
    if (
      currentPrimarySourceKey !== RED_SWEET_PEPPER_LEGACY_SOURCE_KEY &&
      currentPrimarySourceKey !== RED_SWEET_PEPPER_FOUNDATION_SOURCE_KEY
    ) {
      throw new Error(
        `Expected primary profile ${RED_SWEET_PEPPER_LEGACY_SOURCE_KEY} or ${RED_SWEET_PEPPER_FOUNDATION_SOURCE_KEY}, got ${currentPrimarySourceKey}.`,
      );
    }

    const legacyRecord = await prisma.nutritionSourceRecord.findFirst({
      where: {
        sourceType: NutritionGovernanceSourceType.USDA,
        sourceKey: RED_SWEET_PEPPER_LEGACY_SOURCE_KEY,
      },
    });
    if (!legacyRecord) {
      throw new Error(`Missing source record: ${RED_SWEET_PEPPER_LEGACY_SOURCE_KEY}`);
    }

    const legacyFoodNutrients = readLegacyFoodNutrients(legacyRecord.rawData);
    const previewProfile = buildRedSweetPepperPrimaryProfile({
      legacyFoodNutrients,
      legacySourceRecordId: legacyRecord.id,
    });

    if (!APPLY) {
      console.log('Dry run: red sweet pepper Foundation profile upgrade');
      console.log(`- ingredient: ${ingredient.name} (${ingredient.id})`);
      console.log(
        `- current primary: ${primaryMapping.nutritionFood.displayNameZh} (${primaryMapping.nutritionFood.externalId})`,
      );
      console.log(
        `- would upsert source record: ${RED_SWEET_PEPPER_FOUNDATION_SOURCE_KEY}`,
      );
      console.log(
        `- would update primary profile to: ${RED_SWEET_PEPPER_FOUNDATION_RECORD.description}`,
      );
      console.log(`- filled fields after upgrade: ${countFilled(previewProfile)}/60`);
      console.log('Re-run with --apply to persist changes.');
      return;
    }

    await prisma.$transaction(async (tx) => {
      const foundationOnlyPreview = buildRedSweetPepperFoundationOnlyProfile();
      const foundationRecord = await tx.nutritionSourceRecord.upsert({
        where: {
          sourceType_sourceKey: {
            sourceType: NutritionGovernanceSourceType.USDA,
            sourceKey: RED_SWEET_PEPPER_FOUNDATION_SOURCE_KEY,
          },
        },
        create: {
          sourceType: NutritionGovernanceSourceType.USDA,
          sourceKey: RED_SWEET_PEPPER_FOUNDATION_SOURCE_KEY,
          sourceTitle: FOUNDATION_SOURCE_TITLE,
          sourceDetail: toNullableJsonInput({
            fdcId: RED_SWEET_PEPPER_FOUNDATION_RECORD.fdcId,
            provider: USDA_PROVIDER,
            sourceProvider: USDA_PROVIDER,
            sourceVersion: FOUNDATION_SOURCE_VERSION,
            publicationDate: RED_SWEET_PEPPER_FOUNDATION_RECORD.publicationDate,
            downloadUrl: DOWNLOAD_URL,
            importMode: 'manual-red-sweet-pepper-foundation-upgrade',
            fieldSupplementSourceKey: RED_SWEET_PEPPER_LEGACY_SOURCE_KEY,
          }),
          foodName: RED_SWEET_PEPPER_FOUNDATION_RECORD.description,
          foodNameEn: RED_SWEET_PEPPER_FOUNDATION_RECORD.description,
          dataType: RED_SWEET_PEPPER_FOUNDATION_RECORD.dataType,
          category: RED_SWEET_PEPPER_FOUNDATION_RECORD.foodCategory.description,
          rawData: toJsonInput(RED_SWEET_PEPPER_FOUNDATION_RECORD),
          normalizedNutrition: toNullableJsonInput(foundationOnlyPreview),
          status: 'ACTIVE',
        },
        update: {
          sourceTitle: FOUNDATION_SOURCE_TITLE,
          sourceDetail: toNullableJsonInput({
            fdcId: RED_SWEET_PEPPER_FOUNDATION_RECORD.fdcId,
            provider: USDA_PROVIDER,
            sourceProvider: USDA_PROVIDER,
            sourceVersion: FOUNDATION_SOURCE_VERSION,
            publicationDate: RED_SWEET_PEPPER_FOUNDATION_RECORD.publicationDate,
            downloadUrl: DOWNLOAD_URL,
            importMode: 'manual-red-sweet-pepper-foundation-upgrade',
            fieldSupplementSourceKey: RED_SWEET_PEPPER_LEGACY_SOURCE_KEY,
          }),
          foodName: RED_SWEET_PEPPER_FOUNDATION_RECORD.description,
          foodNameEn: RED_SWEET_PEPPER_FOUNDATION_RECORD.description,
          dataType: RED_SWEET_PEPPER_FOUNDATION_RECORD.dataType,
          category: RED_SWEET_PEPPER_FOUNDATION_RECORD.foodCategory.description,
          rawData: toJsonInput(RED_SWEET_PEPPER_FOUNDATION_RECORD),
          normalizedNutrition: toNullableJsonInput(foundationOnlyPreview),
          status: 'ACTIVE',
        },
      });

      const foundationOnlyProfile = buildRedSweetPepperFoundationOnlyProfile(
        foundationRecord.id,
      );
      const upgradedProfile = buildRedSweetPepperPrimaryProfile({
        legacyFoodNutrients,
        foundationSourceRecordId: foundationRecord.id,
        legacySourceRecordId: legacyRecord.id,
      });

      await tx.nutritionSourceRecord.update({
        where: { id: foundationRecord.id },
        data: {
          normalizedNutrition: toNullableJsonInput(foundationOnlyProfile),
        },
      });

      await tx.nutritionFood.update({
        where: { id: primaryMapping.nutritionFood.id },
        data: {
          name: RED_SWEET_PEPPER_FOUNDATION_RECORD.description,
          nameEn: RED_SWEET_PEPPER_FOUNDATION_RECORD.description,
          displayNameZh: '红甜椒（生）',
          displayNameZhSource: 'CURATED_MANUAL',
          displayNameZhReviewedAt: new Date(),
          displayNameZhReviewedBy: 'codex:nutrition-audit',
          category: NutritionFoodCategory.VEGETABLE,
          dataSource: 'USDA',
          externalId: RED_SWEET_PEPPER_FOUNDATION_SOURCE_KEY,
          status: NutritionFoodStatus.VERIFIED,
          preparationState: 'RAW',
          preparationStateLabel: '生',
          ediblePortionLabel: '标准可食部',
          processingLabel: '未加工',
          nutritionData: toJsonInput(upgradedProfile),
          notes:
            '主源升级为 USDA Foundation 2258590 Peppers, bell, red, raw；Foundation 缺失字段由 USDA SR Legacy 170108 同食材补源。',
          verifiedBy: 'codex:nutrition-audit',
          verifiedAt: new Date(),
        },
      });

      await tx.nutritionFoodMapping.update({
        where: { id: primaryMapping.id },
        data: {
          isPrimary: true,
          yieldRate: 1,
          notes:
            '生/标准可食部/未加工; USDA:2258590 Foundation 主源; USDA:170108 SR Legacy 补源。',
        },
      });

      await tx.ingredient.update({
        where: { id: ingredient.id },
        data: {
          nutritionProfile: toJsonInput(upgradedProfile),
        },
      });
    });

    const updated = await prisma.ingredient.findFirst({
      where: { id: ingredient.id },
      include: {
        nutritionFoodMappings: {
          include: { nutritionFood: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    console.log('Applied red sweet pepper Foundation profile upgrade:');
    for (const mapping of updated?.nutritionFoodMappings ?? []) {
      console.log(
        `- ${mapping.isPrimary ? 'PRIMARY' : 'SECONDARY'} ${mapping.nutritionFood.displayNameZh} (${mapping.nutritionFood.externalId})`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to apply red sweet pepper Foundation profile:', error);
  process.exit(1);
});
