import { Prisma, PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';

import type { NutritionProfileV2 } from '../src/domain/ingredient/types';
import { calculateDogAtwaterEnergyPer100g } from '../src/domain/recipe-designer/dog-atwater-energy';

const APPLY = process.argv.includes('--apply');
const REVIEWED_BY = 'codex:dog-atwater-audit';

type MacroPatchField = 'ash' | 'crudeFat' | 'fiber';

interface DogAtwaterTraceItem {
  name: string;
  value: number;
  unit: string;
  note: string;
  sourceNutrientId?: string;
}

export interface DogAtwaterFoodProfilePatch {
  externalId: string;
  displayNameZh: string;
  macroUpdates: Partial<Record<MacroPatchField, number>>;
  sourceType: string;
  sourceCode: string;
  noteZh: string;
  fieldNotes?: Partial<Record<MacroPatchField, string>>;
  traceItems?: DogAtwaterTraceItem[];
}

interface NutritionFoodSnapshot {
  id: string;
  externalId: string | null;
  displayNameZh: string | null;
  nutritionData: Prisma.JsonValue;
}

export const DOG_ATWATER_FOOD_PROFILE_PATCHES: DogAtwaterFoodProfilePatch[] = [
  {
    externalId: 'CFCT:043221',
    displayNameZh: '冬瓜（生）',
    sourceType: 'CFCT',
    sourceCode: 'CFCT',
    macroUpdates: { fiber: 0.3425 },
    noteZh:
      'CFCT:043221 冬瓜（生）缺膳食纤维字段；按来源水分、蛋白、脂肪、灰分与能量反推可用于犬用 Atwater 差值法的纤维补档值 0.3425g/100g。',
  },
  {
    externalId: 'NEVO:918',
    displayNameZh: '比目鱼类（水煮，鲽鱼来源）',
    sourceType: 'NEVO',
    sourceCode: 'NEVO',
    macroUpdates: { ash: 0 },
    noteZh:
      'NEVO:918 未给出灰分；先以 0g/100g 作为犬用 Atwater 差值法占位补档，矿物质字段仍使用 NEVO 原始分项值。',
  },
  {
    externalId: 'USDA:333476',
    displayNameZh: '狭鳕鱼（生）',
    sourceType: 'USDA',
    sourceCode: 'USDA_FDC',
    macroUpdates: { fiber: 0 },
    noteZh:
      'USDA:333476 生狭鳕鱼未给出膳食纤维；按鱼肉类可食部逻辑补为 0g/100g，用于犬用 Atwater 差值法。',
  },
  {
    externalId: 'NEVO:3319',
    displayNameZh: '阿拉斯加狭鳕（蒸熟）',
    sourceType: 'NEVO',
    sourceCode: 'NEVO',
    macroUpdates: { ash: 0 },
    noteZh:
      'NEVO:3319 未给出灰分；先以 0g/100g 作为犬用 Atwater 差值法占位补档，矿物质字段仍使用 NEVO 原始分项值。',
  },
  {
    externalId: 'CFCT:031306',
    displayNameZh: '北豆腐/老豆腐/卤水豆腐',
    sourceType: 'CFCT',
    sourceCode: 'CFCT',
    macroUpdates: { fiber: 1.425 },
    noteZh:
      'CFCT:031306 北豆腐膳食纤维列缺失；按来源水分、蛋白、脂肪、灰分与能量反推可用于犬用 Atwater 差值法的纤维补档值 1.425g/100g。',
  },
  {
    externalId: 'CFCT:031304',
    displayNameZh: '内酯豆腐',
    sourceType: 'CFCT',
    sourceCode: 'CFCT',
    macroUpdates: { fiber: 0.4 },
    noteZh:
      'CFCT:031304 内酯豆腐主表给出 0.4g/100g 纤维值；补入 macros.fiber 供犬用 Atwater 差值法使用。',
  },
  {
    externalId: 'CFCT:031307',
    displayNameZh: '南豆腐/嫩豆腐/石膏豆腐',
    sourceType: 'CFCT',
    sourceCode: 'CFCT',
    macroUpdates: { fiber: 0.9 },
    noteZh:
      'CFCT:031307 南豆腐膳食纤维列缺失；按来源水分、蛋白、脂肪、灰分与能量反推可用于犬用 Atwater 差值法的纤维补档值 0.9g/100g。',
  },
  {
    externalId: 'MEXT:10155',
    displayNameZh: '青花鱼（水煮）',
    sourceType: 'MEXT',
    sourceCode: 'MEXT',
    macroUpdates: { crudeFat: 17.3 },
    noteZh:
      'MEXT:10155 同时给出脂肪酸的三酰甘油当量 17.3g 与脂质 22.6g；犬用 Atwater 能量计算使用可闭合近似组成并匹配来源能量的三酰甘油当量，原脂质值保留在自定义追溯项。',
    fieldNotes: {
      crudeFat:
        'Atwater 计算使用 MEXT「脂肪酸のトリアシルグリセロール当量」17.3g/100g；MEXT「脂質」22.6g/100g 保留为追溯项。',
    },
    traceItems: [
      {
        name: 'MEXT 总脂肪',
        value: 22.6,
        unit: 'g',
        sourceNutrientId: 'FAT',
        note: 'MEXT:10155 原「脂質」22.6g/100g。Atwater 计算字段使用同表三酰甘油当量 17.3g/100g。',
      },
    ],
  },
  {
    externalId: 'CFCT:051013',
    displayNameZh: '黑木耳（干，未加工）',
    sourceType: 'CFCT',
    sourceCode: 'CFCT',
    macroUpdates: { fiber: 29.9 },
    noteZh:
      'CFCT:051013 当前总膳食纤维 70.1g 与近似组成闭合冲突；犬用 Atwater 差值法先采用同档案不溶性纤维 29.9g/100g 作为计算纤维，原总膳食纤维保留在自定义追溯项。',
    fieldNotes: {
      fiber:
        'Atwater 计算采用 CFCT:051013 不溶性纤维 29.9g/100g；原总膳食纤维 70.1g/100g 保留为追溯项。',
    },
    traceItems: [
      {
        name: 'CFCT 总膳食纤维',
        value: 70.1,
        unit: 'g',
        sourceNutrientId: 'FIBT',
        note: 'CFCT:051013 原总膳食纤维 70.1g/100g。Atwater 计算字段暂用同档案不溶性纤维 29.9g/100g。',
      },
    ],
  },
];

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return cloneJson(value) as Prisma.InputJsonValue;
}

function toNullableJsonInput(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : toJsonInput(value);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function appendUniqueNote(existing: string | null | undefined, note: string) {
  if (!existing) return note;
  if (existing.includes(note)) return existing;
  return `${existing}；${note}`;
}

function buildFieldSource(
  patch: DogAtwaterFoodProfilePatch,
  field: MacroPatchField,
  value: number,
  previousValue: unknown,
) {
  return {
    sourceNutrientId: `${patch.externalId}:macros.${field}:dog-atwater-patch`,
    sourceNutrientName: `Dog Atwater ${field} patch`,
    originalValue:
      typeof previousValue === 'number' && Number.isFinite(previousValue)
        ? previousValue
        : null,
    originalUnit: 'g',
    canonicalValue: value,
    canonicalUnit: 'g',
    basisType: 'PER_100_G',
    sourceRole: 'FIELD_SUPPLEMENT',
    sourceType: patch.sourceType,
    sourceKind: 'FOOD_DATABASE',
    sourceCode: patch.sourceCode,
    sourceKey: patch.externalId,
    externalId: patch.externalId,
    compatibility: 'MANUAL',
    confidenceLevel: 'MEDIUM',
    reviewedBy: REVIEWED_BY,
    noteZh: patch.fieldNotes?.[field] ?? patch.noteZh,
  };
}

function addTraceItems(
  profile: NutritionProfileV2,
  patch: DogAtwaterFoodProfilePatch,
) {
  if (!patch.traceItems?.length) return;
  profile.customItems ??= [];

  for (const item of patch.traceItems) {
    const exists = profile.customItems.some(
      (candidate) =>
        candidate.name === item.name &&
        candidate.reviewCategory === 'DOG_ATWATER_SOURCE_TRACE',
    );
    if (exists) continue;

    profile.customItems.push({
      name: item.name,
      value: item.value,
      unit: item.unit,
      rawBasisType: 'PER_100_G',
      note: item.note,
      sourceNutrientId: item.sourceNutrientId ?? null,
      sourceNutrientName: item.name,
      canonicalFieldPath: null,
      reviewCategory: 'DOG_ATWATER_SOURCE_TRACE',
      reviewStatus: 'REFERENCE_ONLY',
    });
  }
}

export function applyDogAtwaterFoodProfilePatch(
  nutritionData: NutritionProfileV2,
  patch: DogAtwaterFoodProfilePatch,
): NutritionProfileV2 {
  const next = cloneJson(nutritionData) as NutritionProfileV2;
  next.meta ??= { rawBasisType: 'PER_100_G' };
  next.meta.rawBasisType ??= 'PER_100_G';
  next.meta.sourceForms ??= {};
  next.meta.fieldSources ??= {};
  next.meta.conversionNotes ??= {};
  next.macros ??= {} as NutritionProfileV2['macros'];
  next.customItems ??= [];

  for (const [field, value] of Object.entries(
    patch.macroUpdates,
  ) as Array<[MacroPatchField, number]>) {
    const fieldPath = `macros.${field}`;
    const previousValue = (next.macros as Record<string, unknown>)[field];
    (next.macros as Record<string, number | null>)[field] = value;

    const sourceForm = buildFieldSource(patch, field, value, previousValue);
    next.meta.sourceForms[fieldPath] = sourceForm;
    next.meta.fieldSources[fieldPath] = sourceForm;
    next.meta.conversionNotes[fieldPath] =
      patch.fieldNotes?.[field] ?? patch.noteZh;
  }

  next.meta.versionNote = appendUniqueNote(
    next.meta.versionNote,
    `犬用 Atwater 补档：${patch.noteZh}`,
  );

  addTraceItems(next, patch);

  return next;
}

function getSourceRecordId(nutritionData: Prisma.JsonValue): string | null {
  if (
    !nutritionData ||
    typeof nutritionData !== 'object' ||
    Array.isArray(nutritionData)
  ) {
    return null;
  }
  const meta = (nutritionData as Record<string, unknown>).meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const sourceRecordId = (meta as Record<string, unknown>).sourceRecordId;
  return typeof sourceRecordId === 'string' && sourceRecordId.length > 0
    ? sourceRecordId
    : null;
}

function findPatch(externalId: string | null) {
  return DOG_ATWATER_FOOD_PROFILE_PATCHES.find(
    (patch) => patch.externalId === externalId,
  );
}

async function main() {
  loadEnv({ path: process.env.ENV_FILE || '.env' });

  const prisma = new PrismaClient();
  try {
    const foods = await prisma.nutritionFood.findMany({
      where: {
        externalId: {
          in: DOG_ATWATER_FOOD_PROFILE_PATCHES.map((patch) => patch.externalId),
        },
      },
      select: {
        id: true,
        externalId: true,
        displayNameZh: true,
        nutritionData: true,
      },
      orderBy: [{ externalId: 'asc' }, { displayNameZh: 'asc' }],
    });

    const foundExternalIds = new Set(foods.map((food) => food.externalId));
    const missingPatches = DOG_ATWATER_FOOD_PROFILE_PATCHES.filter(
      (patch) => !foundExternalIds.has(patch.externalId),
    );

    console.log(
      APPLY
        ? 'Applying dog Atwater FOOD profile patches'
        : 'Dry run: dog Atwater FOOD profile patches',
    );
    console.log(`Matched NutritionFood rows: ${foods.length}`);

    for (const missing of missingPatches) {
      console.log(`Missing profile: ${missing.displayNameZh} (${missing.externalId})`);
    }

    const patchedRows: Array<{
      food: NutritionFoodSnapshot;
      patch: DogAtwaterFoodProfilePatch;
      patchedProfile: NutritionProfileV2;
    }> = [];

    for (const food of foods) {
      const patch = findPatch(food.externalId);
      if (!patch) continue;

      const before = calculateDogAtwaterEnergyPer100g(
        food.nutritionData as unknown as NutritionProfileV2,
      );
      const patchedProfile = applyDogAtwaterFoodProfilePatch(
        food.nutritionData as unknown as NutritionProfileV2,
        patch,
      );
      const after = calculateDogAtwaterEnergyPer100g(patchedProfile);

      console.log(
        [
          `${food.displayNameZh ?? patch.displayNameZh} (${patch.externalId})`,
          `before=${before.energyKcalPer100g ?? 'null'}`,
          `after=${after.energyKcalPer100g === null ? 'null' : round(after.energyKcalPer100g)}`,
          `nfe=${after.nfeGPer100g === null ? 'null' : round(after.nfeGPer100g)}`,
        ].join(' | '),
      );

      if (after.energyKcalPer100g === null) {
        throw new Error(`Patch still leaves dog Atwater unavailable: ${patch.externalId}`);
      }

      patchedRows.push({ food, patch, patchedProfile });
    }

    if (!APPLY) {
      console.log('Re-run with --apply to persist changes.');
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const row of patchedRows) {
        await tx.nutritionFood.update({
          where: { id: row.food.id },
          data: {
            nutritionData: toJsonInput(row.patchedProfile),
          },
        });

        const sourceRecordId = getSourceRecordId(row.food.nutritionData);
        if (sourceRecordId) {
          await tx.nutritionSourceRecord.updateMany({
            where: { id: sourceRecordId },
            data: {
              normalizedNutrition: toNullableJsonInput(row.patchedProfile),
            },
          });
        }
      }
    });

    console.log(`Patched NutritionFood rows: ${patchedRows.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
