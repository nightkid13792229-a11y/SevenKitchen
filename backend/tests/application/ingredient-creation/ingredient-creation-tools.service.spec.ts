import { Logger } from '@nestjs/common';
import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import { NUTRITION_FIELD_CATALOG } from '../../../src/domain/ingredient/nutrition-field-catalog';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';
import type {
  CandidateSearchResult,
  PendingQuestion,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';

const DRAFT_ID = 'draft-1';
const RUN_ID = 'run-1';

interface SourceRecordFixture {
  id: string;
  status: string;
  foodName: string;
  foodNameEn?: string | null;
  normalizedNutrition?: unknown;
}

function createTools(
  records: SourceRecordFixture[],
  draftPayload: Record<string, unknown> = {},
) {
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
      payload: draftPayload,
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

  return { tools, prisma, draftService, candidateService };
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

async function executeBatch(
  tools: IngredientCreationToolsService,
  args: Record<string, unknown>,
) {
  const execution = await tools.execute({
    runId: RUN_ID,
    draftId: DRAFT_ID,
    name: 'updateNutritionFields',
    args,
  });

  return {
    ...execution,
    body: JSON.parse(execution.content) as any,
  };
}

function draftWithRawProfile() {
  return {
    profiles: [
      {
        preparationState: 'RAW',
        sourceRecordId: 'rec-liver-raw',
        entries: [],
        notes: null,
      },
    ],
  };
}

const RAW_LIVER: SourceRecordFixture = {
  id: 'rec-liver-raw',
  status: 'ACTIVE',
  foodName: 'Chicken, liver, raw',
  foodNameEn: 'Chicken, liver, raw',
  normalizedNutrition: {
    meta: { rawBasisType: 'PER_100_G', sampleState: 'RAW' },
    macros: { energyKcal: 120, crudeProtein: 19.5 },
    minerals: { calcium: 120 },
  },
};

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

describe('IngredientCreationToolsService · updateNutritionFields 批量写入', () => {
  it('工具定义存在，描述提示优先使用并写明单次最多 70 条', () => {
    const { tools } = createTools([]);

    const definition = tools
      .getDefinitions()
      .find((tool) => tool.function.name === 'updateNutritionFields');

    expect(definition).toBeDefined();
    expect(definition?.function.description).toContain('优先');
    expect(definition?.function.description).toContain('70');
    expect(definition?.function.parameters.required).toEqual(
      expect.arrayContaining(['profileIndex', 'entries']),
    );
  });

  it('全部合法：一次调用写入所有字段，返回 applied 且只 patch 一次', async () => {
    const { tools, draftService } = createTools(
      [RAW_LIVER],
      draftWithRawProfile(),
    );

    const result = await executeBatch(tools, {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 19.5,
          unit: 'g',
          sourceRecordId: 'rec-liver-raw',
        },
        {
          fieldPath: 'macros.energyKcal',
          value: 120,
          unit: 'kcal',
          sourceRecordId: 'rec-liver-raw',
        },
        {
          fieldPath: 'minerals.calcium',
          value: 120,
          unit: 'mg',
          sourceRecordId: 'rec-liver-raw',
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.body).toMatchObject({ ok: true, applied: 3, failed: [] });
    expect(draftService.patch).toHaveBeenCalledTimes(1);

    const [, , payload] = draftService.patch.mock.calls[0];
    const entries = (payload as any).profiles[0].entries as Array<
      Record<string, unknown>
    >;
    expect(entries).toHaveLength(3);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: 'macros.crudeProtein',
          finalValue: 19.5,
          unit: 'g',
          status: 'DIRECT',
          sourceRecordId: 'rec-liver-raw',
        }),
        expect.objectContaining({
          fieldPath: 'macros.energyKcal',
          finalValue: 120,
          unit: 'kcal',
        }),
        expect.objectContaining({
          fieldPath: 'minerals.calcium',
          finalValue: 120,
          unit: 'mg',
        }),
      ]),
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('tool=updateNutritionFields'),
    );
  });

  it('部分失败：成功项照常写入，失败项逐条返回 fieldPath 与错误', async () => {
    const { tools, draftService } = createTools(
      [RAW_LIVER],
      draftWithRawProfile(),
    );

    const result = await executeBatch(tools, {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 19.5,
          unit: 'g',
          sourceRecordId: 'rec-liver-raw',
        },
        {
          fieldPath: 'macros.energyKcal',
          value: 120,
          unit: '两',
          sourceRecordId: 'rec-liver-raw',
        },
        {
          fieldPath: 'minerals.calcium',
          value: 120,
          unit: 'mg',
          sourceRecordId: 'missing-source',
        },
        {
          fieldPath: 'minerals.selenium',
          value: 0.25,
          unit: 'μg',
          sourceRecordId: 'rec-liver-raw',
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.body.ok).toBe(true);
    expect(result.body.applied).toBe(2);
    expect(result.body.failed).toEqual([
      {
        fieldPath: 'macros.energyKcal',
        error: expect.stringContaining('单位'),
      },
      {
        fieldPath: 'minerals.calcium',
        error: expect.stringContaining('不存在'),
      },
    ]);

    // 部分成功也必须落库：patch 里只有成功的那两条，失败项不写。
    const [, , payload] = draftService.patch.mock.calls[0];
    const entries = (payload as any).profiles[0].entries as Array<
      Record<string, unknown>
    >;
    expect(entries.map((entry) => entry.fieldPath)).toEqual([
      'macros.crudeProtein',
      'minerals.selenium',
    ]);
  });

  it('超过 70 条：整批拒绝，什么都不写', async () => {
    const { tools, draftService } = createTools(
      [RAW_LIVER],
      draftWithRawProfile(),
    );

    const entries = Array.from({ length: 71 }, (_, index) => ({
      fieldPath: 'macros.crudeProtein',
      value: index + 1,
      unit: 'g',
      sourceRecordId: 'rec-liver-raw',
    }));

    const result = await executeBatch(tools, { profileIndex: 0, entries });

    expect(result.ok).toBe(false);
    expect(result.body.ok).toBe(false);
    expect(result.body.error).toContain('70');
    expect(result.body.error).toContain('71');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('entries 为空：返回错误文本，不 patch', async () => {
    const { tools, draftService } = createTools(
      [RAW_LIVER],
      draftWithRawProfile(),
    );

    const result = await executeBatch(tools, { profileIndex: 0, entries: [] });

    expect(result.ok).toBe(false);
    expect(result.body.error).toContain('entries');
    expect(draftService.patch).not.toHaveBeenCalled();
  });
});

describe('IngredientCreationToolsService · searchLocalNutrition 匹配依据', () => {
  async function executeSearch(
    tools: IngredientCreationToolsService,
    args: Record<string, unknown>,
  ) {
    const execution = await tools.execute({
      runId: RUN_ID,
      draftId: DRAFT_ID,
      name: 'searchLocalNutrition',
      args,
    });

    return {
      ...execution,
      body: JSON.parse(execution.content) as any,
    };
  }

  const coverage = {
    state: 'RAW' as const,
    candidateCount: 0,
    bestCoveragePercent: null,
    bestMissingFieldCount: null,
  };

  it('命中时回传 keywords、matchedBy、matchedKeyword 与 score', async () => {
    const { tools, candidateService } = createTools([]);
    candidateService.findCandidates.mockResolvedValue({
      keywords: ['西洋菜', 'watercress'],
      candidates: [
        {
          sourceRecordId: 'usda-watercress',
          sourceType: 'USDA',
          foodName: 'Watercress, raw',
          foodNameEn: 'Watercress, raw',
          preparationState: 'RAW',
          cookingMethod: null,
          coveragePercent: 82,
          missingFields: [],
          matchScore: 0.8,
          matchedBy: 'ZH_ALIAS',
          matchedKeyword: '西洋菜',
          matchedSourceName: 'Watercress, raw',
          notes: [],
        },
      ],
      excludedCount: 0,
      coverage: {
        ...coverage,
        candidateCount: 1,
        bestCoveragePercent: 82,
        bestMissingFieldCount: 0,
      },
    });

    const result = await executeSearch(tools, {
      keyword: '西洋菜',
      state: 'RAW',
    });

    expect(result.ok).toBe(true);
    expect(result.body.found).toBe(true);
    expect(result.body.keywords).toEqual(['西洋菜', 'watercress']);
    expect(result.body.candidates[0]).toMatchObject({
      sourceRecordId: 'usda-watercress',
      foodName: 'Watercress, raw',
      matchedBy: 'ZH_ALIAS',
      matchedKeyword: '西洋菜',
      score: 0.8,
    });
  });

  it('零命中时工具仍然 ok，但 found=false、候选为空并明确写“没有找到匹配词条”', async () => {
    const { tools, candidateService } = createTools([]);
    candidateService.findCandidates.mockResolvedValue({
      keywords: ['西洋菜', 'watercress'],
      candidates: [],
      excludedCount: 0,
      coverage,
    });

    const result = await executeSearch(tools, {
      keyword: '西洋菜',
      state: 'RAW',
    });

    expect(result.ok).toBe(true);
    expect(result.body.ok).toBe(true);
    expect(result.body.found).toBe(false);
    expect(result.body.candidates).toEqual([]);
    expect(result.body.keywords).toEqual(['西洋菜', 'watercress']);
    expect(result.body.hint).toContain('没有找到匹配词条');
    expect(result.body.hint).toContain('西洋菜');
    expect(result.body.hint).toContain('watercress');
  });
});

describe('IngredientCreationToolsService · askUser 选项先核实本地营养库', () => {
  const ASK_QUESTION = '山药你指的是哪一种？';
  const ASK_OPTIONS = ['铁棍山药', '菜山药', '毛山药'];
  const COOKED_INTAKE = {
    intake: {
      name: '山药',
      nameEn: null,
      aliases: [],
      confusables: [],
      category: 'STARCHY_VEGETABLE',
      requiredStates: ['COOKED'],
      suggestedStates: ['RAW'],
    },
  };

  function candidateHit(
    foodName: string,
    state: 'RAW' | 'COOKED' = 'COOKED',
  ): CandidateSearchResult {
    return {
      keywords: [foodName],
      candidates: [
        {
          sourceRecordId: `rec-${foodName}`,
          sourceType: 'USDA_FDC',
          foodName,
          foodNameEn: null,
          preparationState: state,
          cookingMethod: null,
          coveragePercent: 80,
          missingFields: [],
          matchScore: 0.9,
          notes: [],
        },
      ],
      excludedCount: 0,
      coverage: {
        state,
        candidateCount: 1,
        bestCoveragePercent: 80,
        bestMissingFieldCount: 0,
      },
    };
  }

  function emptyCandidates(state: 'RAW' | 'COOKED' = 'COOKED') {
    return {
      keywords: [],
      candidates: [],
      excludedCount: 0,
      coverage: {
        state,
        candidateCount: 0,
        bestCoveragePercent: null,
        bestMissingFieldCount: null,
      },
    };
  }

  async function executeAskUser(
    tools: IngredientCreationToolsService,
    args: Record<string, unknown>,
  ) {
    const execution = await tools.execute({
      runId: RUN_ID,
      draftId: DRAFT_ID,
      name: 'askUser',
      args,
    });

    return {
      ...execution,
      body: JSON.parse(execution.content) as {
        ok: boolean;
        error?: string;
        options?: string[];
        optionChecks?: PendingQuestion['optionChecks'];
      },
    };
  }

  it('3 个选项命中 2 个：标 inLibrary=true 并带词条名，未命中的保留且加后缀', async () => {
    const { tools, draftService, candidateService } = createTools(
      [],
      COOKED_INTAKE,
    );
    candidateService.findCandidates.mockImplementation(
      async (input: { name: string }) => {
        if (input.name === '铁棍山药') return candidateHit('Yam, raw');
        if (input.name === '菜山药') return candidateHit('Yam, cooked');
        return emptyCandidates();
      },
    );

    const result = await executeAskUser(tools, {
      question: ASK_QUESTION,
      options: ASK_OPTIONS,
    });

    expect(result.ok).toBe(true);
    expect(result.body.ok).toBe(true);
    expect(result.body.options).toEqual(ASK_OPTIONS);
    expect(result.body.optionChecks).toEqual([
      {
        label: '铁棍山药',
        inLibrary: true,
        matchedName: 'Yam, raw',
        displayLabel: '铁棍山药',
      },
      {
        label: '菜山药',
        inLibrary: true,
        matchedName: 'Yam, cooked',
        displayLabel: '菜山药',
      },
      {
        label: '毛山药',
        inLibrary: false,
        matchedName: null,
        displayLabel: '毛山药（库里未收录，选了会去线上找）',
      },
    ]);

    // 每个选项都用当前草稿的目标状态（STARCHY_VEGETABLE → COOKED）核实，
    // limit=1，不把 50 条候选全读出来。
    expect(candidateService.findCandidates).toHaveBeenCalledTimes(3);
    for (const option of ASK_OPTIONS) {
      expect(candidateService.findCandidates).toHaveBeenCalledWith(
        { name: option, state: 'COOKED' },
        1,
      );
    }

    // 核实结果随问题一起落库，刷新页面后标签仍然在。
    expect(draftService.patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INTAKE',
      expect.objectContaining({
        pendingQuestion: expect.objectContaining({
          options: ASK_OPTIONS,
          optionChecks: expect.arrayContaining([
            expect.objectContaining({ label: '毛山药', inLibrary: false }),
          ]),
        }),
      }),
    );
  });

  it('一个都没命中：返回错误文本让模型改问更宽的问题，不写 pendingQuestion', async () => {
    const { tools, draftService, candidateService } = createTools(
      [],
      COOKED_INTAKE,
    );
    candidateService.findCandidates.mockResolvedValue(emptyCandidates());

    const result = await executeAskUser(tools, {
      question: ASK_QUESTION,
      options: ASK_OPTIONS,
    });

    expect(result.ok).toBe(false);
    expect(result.pendingQuestion).toBeUndefined();
    expect(result.error).toContain('全部未收录');
    expect(result.error).toContain('可能库里没有');
    expect(result.error).toContain('更宽');
    expect(result.body.ok).toBe(false);
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('核实失败（异常）不影响提问：仍写 pendingQuestion，全部标 inLibrary=null', async () => {
    const { tools, draftService, candidateService } = createTools(
      [],
      COOKED_INTAKE,
    );
    candidateService.findCandidates.mockRejectedValue(
      new Error('nutrition db down'),
    );

    const result = await executeAskUser(tools, {
      question: ASK_QUESTION,
      options: ['铁棍山药', '菜山药'],
    });

    expect(result.ok).toBe(true);
    expect(result.pendingQuestion).toBeDefined();
    expect(result.body.optionChecks).toEqual([
      {
        label: '铁棍山药',
        inLibrary: null,
        matchedName: null,
        displayLabel: '铁棍山药',
      },
      {
        label: '菜山药',
        inLibrary: null,
        matchedName: null,
        displayLabel: '菜山药',
      },
    ]);
    expect(draftService.patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INTAKE',
      expect.objectContaining({ pendingQuestion: expect.any(Object) }),
    );
  });

  it('单个选项核实超时（800ms）不阻塞：标 inLibrary=null，提问仍然成功', async () => {
    const { tools, candidateService } = createTools([], COOKED_INTAKE);
    candidateService.findCandidates.mockImplementation(
      async (input: { name: string }) => {
        if (input.name === '铁棍山药') {
          return new Promise<CandidateSearchResult>(() => {});
        }
        return emptyCandidates();
      },
    );

    const startedAt = Date.now();
    const result = await executeAskUser(tools, {
      question: ASK_QUESTION,
      options: ['铁棍山药', '菜山药'],
    });
    const elapsed = Date.now() - startedAt;

    expect(result.ok).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(750);
    expect(elapsed).toBeLessThan(3_000);
    expect(result.body.optionChecks).toEqual([
      {
        label: '铁棍山药',
        inLibrary: null,
        matchedName: null,
        displayLabel: '铁棍山药',
      },
      {
        label: '菜山药',
        inLibrary: false,
        matchedName: null,
        displayLabel: '菜山药（库里未收录，选了会去线上找）',
      },
    ]);
  });
});
