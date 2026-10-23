import { Logger } from '@nestjs/common';
import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import { NUTRITION_FIELD_CATALOG } from '../../../src/domain/ingredient/nutrition-field-catalog';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const DRAFT_ID = 'draft-1';
const RUN_ID = 'run-1';

interface SourceRecordFixture {
  id: string;
  status: string;
  foodName: string;
  foodNameEn?: string | null;
  normalizedNutrition?: unknown;
}

function createTools(records: SourceRecordFixture[]) {
  const prisma = {
    nutritionSourceRecord: {
      findUnique: jest.fn(async (query: { where: { id: string } }) => {
        const record = records.find((entry) => entry.id === query.where.id);
        return record
          ? {
              ...record,
              foodNameEn: record.foodNameEn ?? null,
              normalizedNutrition: record.normalizedNutrition ?? null,
            }
          : null;
      }),
    },
  };

  const draftService = {
    get: jest.fn(async () => ({
      id: DRAFT_ID,
      name: '鸡肝',
      type: 'FOOD',
      step: 'INTAKE',
      payload: {},
      createdBy: 'admin-1',
      createdAt: new Date('2026-10-23T00:00:00.000Z'),
      updatedAt: new Date('2026-10-23T00:00:00.000Z'),
    })),
    patch: jest.fn(),
  };

  const candidateService = { findCandidates: jest.fn() };
  const checkService = { runCheck: jest.fn() };

  const tools = new IngredientCreationToolsService(
    candidateService as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    checkService as unknown as IngredientCreationCheckService,
    prisma as unknown as PrismaService,
  );

  return { tools, prisma, draftService };
}

async function executeGetRecord(
  tools: IngredientCreationToolsService,
  args: Record<string, unknown>,
) {
  const execution = await tools.execute({
    runId: RUN_ID,
    draftId: DRAFT_ID,
    name: 'getNutritionRecord',
    args,
  });

  return {
    ...execution,
    body: JSON.parse(execution.content) as any,
  };
}

const FULL_PROFILE = {
  meta: { rawBasisType: 'PER_100_G', sampleState: 'RAW' },
  macros: {
    energyKcal: 120,
    moisture: null,
    crudeProtein: 19.5,
    crudeFat: null,
    ash: null,
    carbohydrate: null,
    fiber: null,
    solubleFiber: null,
    insolubleFiber: null,
  },
  minerals: {
    calcium: 120,
    phosphorus: null,
    potassium: null,
    sodium: 0,
    magnesium: null,
    chloride: null,
    iron: null,
    zinc: null,
    copper: null,
    manganese: null,
    selenium: 0.25,
    iodine: null,
  },
  vitamins: {
    vitaminA: 1000,
    vitaminD: null,
    vitaminE: null,
    vitaminK: null,
    vitaminB1: null,
    vitaminB2: null,
    vitaminB3: null,
    vitaminB5: null,
    vitaminB6: null,
    vitaminB7: null,
    vitaminB9: null,
    vitaminB12: null,
    choline: null,
    vitaminC: null,
  },
  fattyAcids: {
    saturatedFattyAcids: null,
    monounsaturatedFattyAcids: null,
    polyunsaturatedFattyAcids: null,
    linoleicAcid: null,
    alphaLinolenicAcid: null,
    arachidonicAcid: null,
    epa: 0.12,
    dpa: null,
    dha: null,
  },
  aminoAcids: {
    arginine: null,
    lysine: null,
    methionine: null,
    cystine: null,
    taurine: 0.4,
    tryptophan: null,
    threonine: null,
    leucine: null,
    isoleucine: null,
    valine: null,
    phenylalanine: null,
    tyrosine: null,
    histidine: null,
    glutamicAcid: null,
    glycine: null,
    proline: null,
  },
  customItems: [],
};

const PRESENT_FIELD_COUNT = 8;

let logSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('IngredientCreationToolsService · getNutritionRecord', () => {
  it('正常记录：只返回有值的字段，单位取自目录，null 值进 missing 不出现', async () => {
    const { tools } = createTools([
      {
        id: 'rec-liver-raw',
        status: 'ACTIVE',
        foodName: 'Chicken, liver, raw',
        foodNameEn: 'Chicken, liver, raw',
        normalizedNutrition: FULL_PROFILE,
      },
    ]);

    const result = await executeGetRecord(tools, {
      sourceRecordId: 'rec-liver-raw',
    });

    expect(result.ok).toBe(true);
    expect(result.body.ok).toBe(true);
    expect(result.body.record).toMatchObject({
      id: 'rec-liver-raw',
      name: 'Chicken, liver, raw',
      state: 'RAW',
    });

    const values = result.body.record.values as Array<{
      fieldPath: string;
      value: number;
      unit: string;
    }>;
    expect(values).toHaveLength(PRESENT_FIELD_COUNT);
    expect(values).toEqual(
      expect.arrayContaining([
        { fieldPath: 'macros.energyKcal', value: 120, unit: 'kcal' },
        { fieldPath: 'macros.crudeProtein', value: 19.5, unit: 'g' },
        { fieldPath: 'minerals.calcium', value: 120, unit: 'mg' },
        { fieldPath: 'minerals.selenium', value: 0.25, unit: 'μg' },
        { fieldPath: 'vitamins.vitaminA', value: 1000, unit: 'IU' },
        { fieldPath: 'fattyAcids.epa', value: 0.12, unit: 'mg' },
        { fieldPath: 'aminoAcids.taurine', value: 0.4, unit: 'g' },
      ]),
    );

    // 记录里的真实 0 要保留；null 不能变成 0，也不能出现在 values 里。
    expect(values).toContainEqual({
      fieldPath: 'minerals.sodium',
      value: 0,
      unit: 'mg',
    });
    expect(values.map((value) => value.fieldPath)).not.toContain(
      'macros.crudeFat',
    );

    const missing = result.body.record.missing as string[];
    expect(missing).toContain('macros.moisture');
    expect(missing).toContain('macros.crudeFat');
    expect(missing).toContain('minerals.iron');
    expect(missing).toContain('vitamins.vitaminD');
    expect(missing).not.toContain('macros.crudeProtein');
    expect(missing).toHaveLength(
      NUTRITION_FIELD_CATALOG.length - PRESENT_FIELD_COUNT,
    );

    const expectedCoverage =
      Math.round(
        (PRESENT_FIELD_COUNT / NUTRITION_FIELD_CATALOG.length) * 1000,
      ) / 10;
    expect(result.body.record.coverage).toBe(expectedCoverage);

    // 日志格式与现有工具一致。
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('tool=getNutritionRecord'),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ok=true'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('durationMs='));
  });

  it('id 不存在：返回 ok:false 与中文错误，不抛异常', async () => {
    const { tools } = createTools([]);

    const result = await executeGetRecord(tools, {
      sourceRecordId: 'missing-record',
    });

    expect(result.ok).toBe(false);
    expect(result.body).toEqual({
      ok: false,
      error: expect.stringContaining('不存在'),
    });
    expect(result.error).toContain('missing-record');
    expect(result.body.error).toMatch(/[\u4e00-\u9fa5]/u);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ok=false'));
  });

  it('记录非 ACTIVE：返回 ok:false，不返回任何数值', async () => {
    const { tools } = createTools([
      {
        id: 'rec-retired',
        status: 'DEPRECATED',
        foodName: 'Chicken, liver, raw',
        normalizedNutrition: FULL_PROFILE,
      },
    ]);

    const result = await executeGetRecord(tools, {
      sourceRecordId: 'rec-retired',
    });

    expect(result.ok).toBe(false);
    expect(result.body.ok).toBe(false);
    expect(result.body.error).toContain('已停用');
    expect(result.body.error).toContain('DEPRECATED');
    expect(result.body.record).toBeUndefined();
  });

  it('sourceRecordId 为空：返回 ok:false 与中文错误', async () => {
    const { tools } = createTools([]);

    const result = await executeGetRecord(tools, {});

    expect(result.ok).toBe(false);
    expect(result.body.error).toContain('sourceRecordId');
  });
});
