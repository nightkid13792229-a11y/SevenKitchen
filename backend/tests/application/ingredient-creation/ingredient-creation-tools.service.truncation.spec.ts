/**
 * 目录当前只有 60 个字段，正常数据到不了 80 的上限；
 * 这里用一个 81 字段的假目录，专门验证「超限截断」这条防御分支。
 */
jest.mock('../../../src/domain/ingredient/nutrition-field-catalog', () => ({
  NUTRITION_FIELD_CATALOG: Array.from({ length: 81 }, (_, index) => ({
    tabKey: 'macros',
    fieldKey: `field${index}`,
    fieldPath: `macros.field${index}`,
    label: `字段${index}`,
    unit: 'g',
    quantityKind: 'MASS',
    canonicalUnitBasis: `field_${index}_g`,
    conversionPolicy: 'UNIT_CONVERSION',
  })),
}));

import { Logger } from '@nestjs/common';
import { IngredientCandidateReviewService } from '../../../src/application/ingredient-creation/ingredient-candidate-review.service';
import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const NORMALIZED_NUTRITION = {
  meta: { rawBasisType: 'PER_100_G', sampleState: 'RAW' },
  macros: Object.fromEntries(
    Array.from({ length: 81 }, (_, index) => [`field${index}`, index + 1]),
  ),
};

function createTools() {
  const prisma = {
    nutritionSourceRecord: {
      findUnique: jest.fn(async () => ({
        id: 'rec-many-fields',
        status: 'ACTIVE',
        foodName: 'Many fields, raw',
        foodNameEn: null,
        normalizedNutrition: NORMALIZED_NUTRITION,
      })),
    },
  };

  return new IngredientCreationToolsService(
    {} as never,
    {} as never,
    {} as never,
    prisma as unknown as PrismaService,
    {
      reviewCandidates: jest.fn(async () => []),
    } as unknown as IngredientCandidateReviewService,
    {
      classifyNames: jest.fn(async (input: any) => ({
        results: input.items.map((item: { id: string }) => ({
          id: item.id,
          state: 'UNKNOWN',
          method: 'NONE',
          cutLabel: null,
          cutGroup: null,
          evidence: null,
          confidence: null,
        })),
        counts: {
          byState: { RAW: 0, COOKED: 0, UNKNOWN: input.items.length },
          byMethod: { BOILED: 0, STEAMED: 0, GRILLED: 0, FRIED: 0, OTHER: 0, NONE: input.items.length },
          byCutGroup: {},
        },
      })),
    } as never,
  );
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('IngredientCreationToolsService · getNutritionRecord 截断', () => {
  it('有值字段超过 80 时只返回前 80 个，并说明省略了多少', async () => {
    const tools = createTools();

    const execution = await tools.execute({
      runId: 'run-1',
      draftId: 'draft-1',
      name: 'getNutritionRecord',
      args: { sourceRecordId: 'rec-many-fields' },
    });

    expect(execution.ok).toBe(true);
    const body = JSON.parse(execution.content) as any;
    expect(body.record.values).toHaveLength(80);
    expect(body.record.values[0]).toEqual({
      fieldPath: 'macros.field0',
      value: 1,
      unit: 'g',
    });
    expect(body.record.values[79]).toEqual({
      fieldPath: 'macros.field79',
      value: 80,
      unit: 'g',
    });
    expect(body.record.truncated).toBe(true);
    expect(body.record.omittedFieldCount).toBe(1);
    expect(body.record.missing).toEqual([]);
  });
});
