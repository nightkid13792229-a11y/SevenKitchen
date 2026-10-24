import { Logger } from '@nestjs/common';
import { IngredientCandidateReviewService } from '../../../src/application/ingredient-creation/ingredient-candidate-review.service';
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

  let payload = { ...draftPayload };
  const draftService = {
    get: jest.fn(async () => ({
      id: DRAFT_ID,
      name: '鸡肝',
      type: 'FOOD',
      step: 'INTAKE',
      payload: { ...payload },
      createdBy: 'admin-1',
      createdAt: new Date('2026-10-23T00:00:00.000Z'),
      updatedAt: new Date('2026-10-23T00:00:00.000Z'),
    })),
    patch: jest.fn(
      async (
        _id: string,
        _step: string,
        next: Record<string, unknown>,
      ) => {
        payload = { ...payload, ...next };
        return { payload };
      },
    ),
  };

  const candidateService = { findCandidates: jest.fn() };
  const checkService = { runCheck: jest.fn() };
  const reviewService: { reviewCandidates: jest.Mock } = {
    reviewCandidates: jest.fn(
      async (input: { candidates: Array<{ id: string }> }) =>
        input.candidates.map((candidate) => ({
          id: candidate.id,
          verdict: 'RELEVANT' as const,
          reason: '就是目标食材',
        })),
    ),
  };

  const tools = new IngredientCreationToolsService(
    candidateService as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    checkService as unknown as IngredientCreationCheckService,
    prisma as unknown as PrismaService,
    reviewService as unknown as IngredientCandidateReviewService,
  );

  return {
    tools,
    prisma,
    draftService,
    candidateService,
    reviewService,
  };
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

async function executeTool(
  tools: IngredientCreationToolsService,
  name: string,
  args: Record<string, unknown>,
) {
  const execution = await tools.execute({
    runId: RUN_ID,
    draftId: DRAFT_ID,
    name,
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

describe('IngredientCreationToolsService · AI 复核候选（判断与写入闸门）', () => {
  const coverage = {
    state: 'RAW' as const,
    candidateCount: 0,
    bestCoveragePercent: null,
    bestMissingFieldCount: null,
  };

  function row(
    sourceRecordId: string,
    foodName: string,
    matchScore = 0.8,
  ) {
    return {
      sourceRecordId,
      sourceType: 'USDA_FDC',
      foodName,
      foodNameEn: foodName,
      preparationState: 'RAW' as const,
      cookingMethod: null,
      coveragePercent: 80,
      missingFields: [],
      matchScore,
      matchedBy: 'EN_PARTIAL' as const,
      matchedKeyword: 'yam',
      matchedSourceName: foodName,
      notes: [],
    };
  }

  function searchResult(candidates: ReturnType<typeof row>[]) {
    return {
      keywords: ['山药', 'yam'],
      candidates,
      excludedCount: 0,
      coverage: {
        ...coverage,
        candidateCount: candidates.length,
        bestCoveragePercent: 80,
        bestMissingFieldCount: 0,
      },
    };
  }

  const YAM_RECORD: SourceRecordFixture = {
    id: 'rec-yam',
    status: 'ACTIVE',
    foodName: 'Yam, raw',
    foodNameEn: 'Yam, raw',
    normalizedNutrition: {
      meta: { sampleState: 'RAW' },
      macros: { crudeProtein: 1.5 },
    },
  };

  const JICAMA_RECORD: SourceRecordFixture = {
    id: 'rec-jicama',
    status: 'ACTIVE',
    foodName: 'Yambean (jicama), raw',
    foodNameEn: 'Yambean (jicama), raw',
    normalizedNutrition: {
      meta: { sampleState: 'RAW' },
      macros: { crudeProtein: 0.7 },
    },
  };

  function review(
    id: string,
    verdict: 'RELEVANT' | 'UNCERTAIN' | 'IRRELEVANT',
    reason: string,
  ) {
    return { id, verdict, reason };
  }

  it('查库后先复核：每条候选带 review，顶部给出相关 / 存疑 / 不相关计数与下一步', async () => {
    const { tools, candidateService, reviewService, draftService } =
      createTools([], { intake: { name: '山药', nameEn: 'yam' } });
    const candidates = [
      row('rec-yam', 'Yam, raw'),
      row('rec-jicama', 'Yambean (jicama), raw'),
      row('rec-celery', 'Celery, raw'),
    ];
    candidateService.findCandidates.mockResolvedValue(searchResult(candidates));
    reviewService.reviewCandidates.mockResolvedValue([
      review('rec-yam', 'RELEVANT', '就是山药'),
      review('rec-jicama', 'IRRELEVANT', '凉薯，不是山药'),
      review('rec-celery', 'UNCERTAIN', '无法确认'),
    ]);

    const result = await executeTool(tools, 'searchLocalNutrition', {
      keyword: '山药',
      state: 'RAW',
    });

    expect(result.ok).toBe(true);
    expect(reviewService.reviewCandidates).toHaveBeenCalledWith({
      target: { zh: '山药', en: 'yam', state: 'RAW' },
      candidates: [
        {
          id: 'rec-yam',
          name: 'Yam, raw',
          sourceType: 'USDA_FDC',
          coverage: 80,
        },
        {
          id: 'rec-jicama',
          name: 'Yambean (jicama), raw',
          sourceType: 'USDA_FDC',
          coverage: 80,
        },
        {
          id: 'rec-celery',
          name: 'Celery, raw',
          sourceType: 'USDA_FDC',
          coverage: 80,
        },
      ],
    });
    expect(result.body.candidates.map((candidate: any) => candidate.review)).toEqual([
      { verdict: 'RELEVANT', reason: '就是山药' },
      { verdict: 'IRRELEVANT', reason: '凉薯，不是山药' },
      { verdict: 'UNCERTAIN', reason: '无法确认' },
    ]);
    expect(result.body.reviewSummary).toEqual({
      relevantCount: 1,
      uncertainCount: 1,
      irrelevantCount: 1,
      failed: false,
    });
    expect(result.body.nextAction).toBe('USE_SINGLE_RELEVANT');
    expect(result.body.hint).toContain('我选了这条');
    expect(draftService.patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INTAKE',
      expect.objectContaining({
        candidateReviewGate: expect.objectContaining({
          relevantCount: 1,
          reviewFailed: false,
          candidates: expect.arrayContaining([
            expect.objectContaining({
              id: 'rec-jicama',
              verdict: 'IRRELEVANT',
              foodName: 'Yambean (jicama), raw',
            }),
          ]),
        }),
      }),
    );
  });

  it('不因类别 / 词位置丢候选：12 条原样交给复核，芹菜也在结果里', async () => {
    const { tools, candidateService, reviewService } = createTools([]);
    const candidates = Array.from({ length: 12 }, (_, index) =>
      row(
        `rec-${index}`,
        index === 5 ? 'Celery, raw' : index === 7 ? 'Yambean (jicama), raw' : `Yam ${index}, raw`,
        0.9 - index * 0.01,
      ),
    );
    candidateService.findCandidates.mockResolvedValue(searchResult(candidates));
    reviewService.reviewCandidates.mockResolvedValue(
      candidates.map((candidate) =>
        review(candidate.sourceRecordId, 'UNCERTAIN', '需要人判断'),
      ),
    );

    const result = await executeTool(tools, 'searchLocalNutrition', {
      keyword: '山药',
      state: 'RAW',
    });

    expect(result.body.candidates).toHaveLength(12);
    expect(result.body.candidates.map((candidate: any) => candidate.foodName)).toEqual(
      candidates.map((candidate) => candidate.foodName),
    );
    expect(result.body.candidates[5].foodName).toBe('Celery, raw');
    expect(reviewService.reviewCandidates).toHaveBeenCalledTimes(1);
    expect(
      (reviewService.reviewCandidates.mock.calls[0] as any)[0].candidates,
    ).toHaveLength(12);
  });

  it('候选被判为不相关时，不能直接写入营养字段', async () => {
    const { tools, candidateService, reviewService, draftService } = createTools(
      [YAM_RECORD, JICAMA_RECORD],
      {},
    );
    candidateService.findCandidates.mockResolvedValue(
      searchResult([
        row('rec-yam', 'Yam, raw'),
        row('rec-jicama', 'Yambean (jicama), raw'),
      ]),
    );
    reviewService.reviewCandidates.mockResolvedValue([
      review('rec-yam', 'RELEVANT', '就是山药'),
      review('rec-jicama', 'IRRELEVANT', '凉薯，不是山药'),
    ]);
    await executeTool(tools, 'searchLocalNutrition', {
      keyword: '山药',
      state: 'RAW',
    });

    draftService.patch.mockClear();
    const result = await executeTool(tools, 'updateNutritionFields', {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 0.7,
          unit: 'g',
          sourceRecordId: 'rec-jicama',
        },
      ],
    });

    // 批量工具按条返回失败：整批没有写入，错误逐条给出。
    expect(result.body.applied).toBe(0);
    const error = result.body.failed[0].error as string;
    expect(error).toContain('AI 复核');
    expect(error).toContain('不相关');
    expect(error).toContain('凉薯');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('0 条相关时不许硬选：任何营养写入都被拒绝', async () => {
    const { tools, candidateService, reviewService, draftService } = createTools(
      [JICAMA_RECORD],
      {},
    );
    candidateService.findCandidates.mockResolvedValue(
      searchResult([row('rec-jicama', 'Yambean (jicama), raw')]),
    );
    reviewService.reviewCandidates.mockResolvedValue([
      review('rec-jicama', 'IRRELEVANT', '凉薯，不是山药'),
    ]);
    const search = await executeTool(tools, 'searchLocalNutrition', {
      keyword: '山药',
      state: 'RAW',
    });
    expect(search.body.nextAction).toBe('ONLINE_OR_LEAVE_BLANK');
    expect(search.body.hint).toContain('去线上');

    draftService.patch.mockClear();
    const result = await executeTool(tools, 'updateNutritionField', {
      profileIndex: 0,
      fieldPath: 'macros.crudeProtein',
      value: 0.7,
      unit: 'g',
      sourceRecordId: 'rec-jicama',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('没有');
    expect(result.error).toContain('相关');
    expect(result.error).toContain('线上');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('≥2 条相关时先拦写入，askUser 之后才放行', async () => {
    const { tools, candidateService, reviewService, draftService } = createTools(
      [YAM_RECORD],
      {},
    );
    candidateService.findCandidates.mockResolvedValue(
      searchResult([row('rec-yam', 'Yam, raw'), row('rec-yam-2', 'Yam, cooked')]),
    );
    reviewService.reviewCandidates.mockResolvedValue([
      review('rec-yam', 'RELEVANT', '就是山药'),
      review('rec-yam-2', 'RELEVANT', '也是山药'),
    ]);
    const search = await executeTool(tools, 'searchLocalNutrition', {
      keyword: '山药',
      state: 'RAW',
    });
    expect(search.body.nextAction).toBe('ASK_USER');
    expect(search.body.hint).toContain('askUser');

    draftService.patch.mockClear();
    const blocked = await executeTool(tools, 'updateNutritionFields', {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 1.5,
          unit: 'g',
          sourceRecordId: 'rec-yam',
        },
      ],
    });
    expect(blocked.body.applied).toBe(0);
    expect(blocked.body.failed[0].error).toContain('askUser');
    expect(blocked.body.failed[0].error).toContain('2 条');
    expect(draftService.patch).not.toHaveBeenCalled();

    candidateService.findCandidates.mockResolvedValue(
      searchResult([row('rec-yam', 'Yam, raw')]),
    );
    const asked = await executeTool(tools, 'askUser', {
      question: '山药用哪一条？',
      options: ['Yam, raw —— 相关：就是山药', 'Yam, cooked —— 相关：也是山药'],
    });
    expect(asked.ok).toBe(true);
    expect(draftService.patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INTAKE',
      expect.objectContaining({ candidateReviewGate: null }),
    );

    const written = await executeTool(tools, 'updateNutritionFields', {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 1.5,
          unit: 'g',
          sourceRecordId: 'rec-yam',
        },
      ],
    });
    expect(written.ok).toBe(true);
    expect(written.body.applied).toBe(1);
  });

  it('askUser 选项带 AI 判断：拆出候选名去核实，标签与理由随问题一起落库', async () => {
    const { tools, candidateService } = createTools([], {});
    candidateService.findCandidates.mockResolvedValue(
      searchResult([row('rec-yam', 'Yam, raw')]),
    );

    const result = await executeTool(tools, 'askUser', {
      question: '山药你指的是哪一条？',
      options: [
        'Yam, raw —— 相关：就是山药',
        'Yambean (jicama) —— 不相关：凉薯',
        'Celery —— 存疑：不确定',
      ],
    });

    expect(result.ok).toBe(true);
    expect(candidateService.findCandidates).toHaveBeenCalledWith(
      { name: 'Yam, raw', state: 'RAW' },
      1,
    );
    expect(candidateService.findCandidates).toHaveBeenCalledWith(
      { name: 'Yambean (jicama)', state: 'RAW' },
      1,
    );
    expect(result.body.optionChecks).toEqual([
      {
        label: 'Yam, raw —— 相关：就是山药',
        candidateLabel: 'Yam, raw',
        aiVerdict: 'RELEVANT',
        aiReason: '就是山药',
        inLibrary: true,
        matchedName: 'Yam, raw',
        displayLabel: 'Yam, raw',
      },
      {
        label: 'Yambean (jicama) —— 不相关：凉薯',
        candidateLabel: 'Yambean (jicama)',
        aiVerdict: 'IRRELEVANT',
        aiReason: '凉薯',
        inLibrary: true,
        matchedName: 'Yam, raw',
        displayLabel: 'Yambean (jicama)',
      },
      {
        label: 'Celery —— 存疑：不确定',
        candidateLabel: 'Celery',
        aiVerdict: 'UNCERTAIN',
        aiReason: '不确定',
        inLibrary: true,
        matchedName: 'Yam, raw',
        displayLabel: 'Celery',
      },
    ]);
    // 页面点选后回传的仍是完整 label，AI 判断只是附加信息。
    expect(result.pendingQuestion?.options).toEqual([
      'Yam, raw —— 相关：就是山药',
      'Yambean (jicama) —— 不相关：凉薯',
      'Celery —— 存疑：不确定',
    ]);
  });

  it('长选项只截断文案，结构化候选名与库内词条名保留完整全称', async () => {
    const fullName = `Beef, ${'very long cut name '.repeat(10)}raw`;
    const option = `${fullName} —— 相关：肌肉部位，适合炖煮`;
    expect(Array.from(option)).toHaveLength(215);

    const { tools, candidateService } = createTools([], {});
    candidateService.findCandidates.mockResolvedValue(
      searchResult([row('rec-long', fullName)]),
    );

    const result = await executeTool(tools, 'askUser', {
      question: '牛肉用哪一条？',
      options: [option, '牛腱子'],
    });

    expect(result.ok).toBe(true);
    const check = result.body.optionChecks[0];
    // 点选回传的文案截到 118 字（前 117 字 + …）。
    expect(Array.from(check.label)).toHaveLength(118);
    expect(check.label.endsWith('…')).toBe(true);
    // 词条名本身不截断：结构化字段里保留完整全称。
    expect(check.candidateLabel).toBe(fullName);
    expect(check.matchedName).toBe(fullName);
    expect(Array.from(check.candidateLabel)).toHaveLength(
      Array.from(fullName).length,
    );
    expect(Array.from(check.matchedName ?? '')).toHaveLength(
      Array.from(fullName).length,
    );
    // 展示层拿完整名，省略交给前端单行省略 + title。
    expect(check.displayLabel).toBe(fullName);
    expect(result.pendingQuestion?.optionChecks?.[0]?.candidateLabel).toBe(
      fullName,
    );
  });

  it('普通长选项：点选文案截断，displayLabel 保留完整原文', async () => {
    const longOption = `牛${'肉'.repeat(130)}`;
    const { tools, candidateService } = createTools([], {});
    candidateService.findCandidates.mockResolvedValue(
      searchResult([row('rec-beef', 'Beef, raw')]),
    );

    const result = await executeTool(tools, 'askUser', {
      question: '牛肉用哪一个？',
      options: [longOption, '牛腱子'],
    });

    expect(result.ok).toBe(true);
    const check = result.body.optionChecks[0];
    expect(Array.from(check.label)).toHaveLength(118);
    expect(check.label.endsWith('…')).toBe(true);
    // 展示文案保留完整原文，页面单行省略 + title 展示全文。
    expect(check.displayLabel).toBe(longOption);
    expect(Array.from(check.displayLabel)).toHaveLength(131);
  });
});
describe('IngredientCreationToolsService · 候选太多时先收窄、再列词条', () => {
  const coverage = {
    state: 'RAW' as const,
    candidateCount: 0,
    bestCoveragePercent: null,
    bestMissingFieldCount: null,
  };

  function row(
    sourceRecordId: string,
    foodName: string,
    preparationState: 'RAW' | 'COOKED' = 'RAW',
  ) {
    return {
      sourceRecordId,
      sourceType: 'USDA_FDC',
      foodName,
      foodNameEn: foodName,
      preparationState,
      cookingMethod: null,
      coveragePercent: 80,
      missingFields: [],
      matchScore: 0.8,
      matchedBy: 'EN_PARTIAL' as const,
      matchedKeyword: 'beef',
      matchedSourceName: foodName,
      notes: [],
    };
  }

  function searchResult(candidates: ReturnType<typeof row>[]) {
    return {
      keywords: ['牛肉', 'beef'],
      candidates,
      excludedCount: 0,
      coverage: {
        ...coverage,
        candidateCount: candidates.length,
        bestCoveragePercent: 80,
        bestMissingFieldCount: 0,
      },
    };
  }

  function beefCandidates() {
    return [
      ...Array.from({ length: 6 }, (_, index) =>
        row(`ground-${index}`, `Beef, ground, raw ${index + 1}`),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        row(`tenderloin-${index}`, `Beef, tenderloin, raw ${index + 1}`),
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        row(`brisket-${index}`, `Beef, brisket, raw ${index + 1}`),
      ),
    ];
  }

  function mockAllRelevant(
    candidateService: { findCandidates: jest.Mock },
    reviewService: { reviewCandidates: jest.Mock },
    candidates: ReturnType<typeof row>[],
  ) {
    candidateService.findCandidates.mockResolvedValue(searchResult(candidates));
    reviewService.reviewCandidates.mockImplementation(
      async (input: { candidates: Array<{ id: string }> }) =>
        input.candidates.map((candidate) => ({
          id: candidate.id,
          verdict: 'RELEVANT' as const,
          reason: '就是牛肉',
        })),
    );
  }

  it('11 条相关跨 3 组：先发收窄问题，选项是组名 + 条数，不列词条', async () => {
    const { tools, candidateService, reviewService, draftService } =
      createTools([], { intake: { name: '牛肉' } });
    const candidates = beefCandidates();
    mockAllRelevant(candidateService, reviewService, candidates);

    const search = await executeTool(tools, 'searchLocalNutrition', {
      keyword: '牛肉',
      state: 'RAW',
    });

    expect(search.ok).toBe(true);
    expect(search.body.totalCandidates).toBe(11);
    expect(search.body.nextAction).toBe('NARROW_GROUP');
    expect(search.body.groups).toEqual([
      { key: 'ground', label: '牛绞肉', count: 6, states: ['RAW'] },
      { key: 'tenderloin', label: '牛里脊', count: 3, states: ['RAW'] },
      { key: 'brisket', label: '牛腩', count: 2, states: ['RAW'] },
    ]);
    expect(search.body.narrowing).toMatchObject({
      required: true,
      kind: 'GROUP',
      options: ['牛绞肉（6 条）', '牛里脊（3 条）', '牛腩（2 条）'],
    });
    expect(search.body.narrowing.question).toContain('11 条相关');
    expect(search.body.narrowing.options.join('')).not.toContain('Beef');
    expect(search.body.hint).toContain('先按部位');
    expect(search.body.hint).toContain('不要列');

    // 收窄记录随草稿保存：askUser 用它拦「直接列词条」。
    expect(draftService.patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INTAKE',
      expect.objectContaining({
        candidateNarrowing: expect.objectContaining({
          required: true,
          kind: 'GROUP',
        }),
      }),
    );

    // 模型如果绕过收窄、直接拿候选名问人，必须被拒。
    draftService.patch.mockClear();
    const blocked = await executeTool(tools, 'askUser', {
      question: '牛肉用哪一条？',
      options: [
        'Beef, ground, raw 1 · 来源 USDA_FDC · 覆盖率 80% · 相关：就是牛肉',
        'Beef, tenderloin, raw 1 · 来源 USDA_FDC · 覆盖率 80% · 相关：就是牛肉',
      ],
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toContain('先按部位收窄');
    expect(blocked.error).toContain('牛绞肉（6 条）');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('选组后只列该组 ≤5 条 + 「都不对，我直接说」，并带来源库 / 覆盖率 / AI 判断', async () => {
    const { tools, candidateService, reviewService, draftService } =
      createTools([], { intake: { name: '牛肉' } });
    const candidates = beefCandidates();
    mockAllRelevant(candidateService, reviewService, candidates);

    await executeTool(tools, 'searchLocalNutrition', {
      keyword: '牛肉',
      state: 'RAW',
    });
    const narrowed = await executeTool(tools, 'searchLocalNutrition', {
      keyword: '牛肉',
      state: 'RAW',
      group: 'ground',
    });

    expect(narrowed.ok).toBe(true);
    expect(narrowed.body.group).toMatchObject({
      key: 'ground',
      label: '牛绞肉',
      count: 6,
    });
    // 只回该组候选，不再把别的组混进来。
    expect(narrowed.body.candidates).toHaveLength(6);
    expect(
      narrowed.body.candidates.every((candidate: any) =>
        candidate.foodName.startsWith('Beef, ground'),
      ),
    ).toBe(true);
    expect(narrowed.body.nextAction).toBe('ASK_USER_ENTRIES');
    expect(narrowed.body.listing.entries).toHaveLength(5);
    expect(narrowed.body.listing.options).toHaveLength(6);
    expect(narrowed.body.listing.options.at(-1)).toBe('都不对，我直接说');
    expect(narrowed.body.listing.options[0]).toContain('Beef, ground, raw 1');
    expect(narrowed.body.listing.options[0]).toContain('来源 USDA_FDC');
    expect(narrowed.body.listing.options[0]).toContain('覆盖率 80%');
    expect(narrowed.body.listing.options[0]).toContain('相关：就是牛肉');
    expect(narrowed.body.listing.question).toContain('这一组');
    expect(narrowed.body.hint).toContain('都不对，我直接说');

    // 把组内词条原样问人：允许，并且兜底选项不能带「未收录」后缀。
    draftService.patch.mockClear();
    const asked = await executeTool(tools, 'askUser', {
      question: narrowed.body.listing.question,
      options: narrowed.body.listing.options,
    });
    expect(asked.ok).toBe(true);
    expect(asked.body.options).toHaveLength(6);
    // 展示层保留来源库 / 覆盖率；AI 判断由页面小标展示，不在文案里重复。
    expect(asked.body.optionChecks[0].displayLabel).toContain('来源 USDA_FDC');
    expect(asked.body.optionChecks[0].displayLabel).toContain('覆盖率 80%');
    expect(asked.body.optionChecks[0].displayLabel).not.toContain('相关：');
    expect(asked.body.optionChecks.at(-1)).toMatchObject({
      label: '都不对，我直接说',
      kind: 'FREE',
      inLibrary: null,
      displayLabel: '都不对，我直接说',
    });
    // 选了具体词条：人已经参与选择，复核闸门要清掉。
    expect(draftService.patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INTAKE',
      expect.objectContaining({ candidateReviewGate: null }),
    );
  });

  it('相关 ≤5 且单组：直接列词条，不问收窄', async () => {
    const { tools, candidateService, reviewService } = createTools([], {
      intake: { name: '牛肉' },
    });
    const candidates = beefCandidates().slice(0, 3);
    mockAllRelevant(candidateService, reviewService, candidates);

    const search = await executeTool(tools, 'searchLocalNutrition', {
      keyword: '牛肉',
      state: 'RAW',
    });

    expect(search.body.narrowing.required).toBe(false);
    expect(search.body.narrowing.options).toEqual([]);
    expect(search.body.nextAction).toBe('ASK_USER');
    expect(search.body.listing.options).toHaveLength(4);
    expect(search.body.listing.options.at(-1)).toBe('都不对，我直接说');
    expect(search.body.hint).toContain('直接列');
    expect(search.body.hint).toContain('不要先问收窄');
  });

  it('未指定状态：收窄问题必须包含「生 / 熟」，且不列词条', async () => {
    const { tools, candidateService, reviewService } = createTools([], {
      intake: { name: '牛肉' },
    });
    const candidates = beefCandidates();
    mockAllRelevant(candidateService, reviewService, candidates);

    const search = await executeTool(tools, 'searchLocalNutrition', {
      keyword: '牛肉',
    });

    expect(search.body.state).toBe('RAW');
    expect(search.body.stateSpecified).toBe(false);
    expect(search.body.nextAction).toBe('NARROW_STATE');
    expect(search.body.narrowing.kind).toBe('STATE');
    expect(search.body.narrowing.question).toContain('生');
    expect(search.body.narrowing.question).toContain('熟');
    expect(search.body.narrowing.options).toEqual([
      '生（查生档案）',
      '熟（查熟档案）',
    ]);

    const asked = await executeTool(tools, 'askUser', {
      question: search.body.narrowing.question,
      options: search.body.narrowing.options,
    });
    expect(asked.ok).toBe(true);
    expect(asked.body.optionChecks).toEqual([
      expect.objectContaining({
        label: '生（查生档案）',
        kind: 'STATE',
        inLibrary: null,
        displayLabel: '生（查生档案）',
      }),
      expect.objectContaining({
        label: '熟（查熟档案）',
        kind: 'STATE',
        inLibrary: null,
        displayLabel: '熟（查熟档案）',
      }),
    ]);
    // 这只是确定生熟，还不是挑候选：不能清复核闸门。
    expect(asked.body.optionChecks.some((check: any) => check.aiVerdict)).toBe(
      false,
    );
  });

  it('该组只剩 1 条：直接用它并说明理由，不再问', async () => {
    const { tools, candidateService, reviewService } = createTools([], {
      intake: { name: '牛肉' },
    });
    const candidates = [
      row('ground-1', 'Beef, ground, raw'),
      ...Array.from({ length: 3 }, (_, index) =>
        row(`tenderloin-${index}`, `Beef, tenderloin, raw ${index + 1}`),
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        row(`brisket-${index}`, `Beef, brisket, raw ${index + 1}`),
      ),
    ];
    mockAllRelevant(candidateService, reviewService, candidates);

    const first = await executeTool(tools, 'searchLocalNutrition', {
      keyword: '牛肉',
      state: 'RAW',
    });
    expect(first.body.nextAction).toBe('NARROW_GROUP');

    const narrowed = await executeTool(tools, 'searchLocalNutrition', {
      keyword: '牛肉',
      state: 'RAW',
      group: 'ground',
    });

    expect(narrowed.body.candidates).toHaveLength(1);
    expect(narrowed.body.nextAction).toBe('USE_SINGLE_RELEVANT');
    expect(narrowed.body.listing.single).toBe(true);
    expect(narrowed.body.listing.options).toEqual([]);
    expect(narrowed.body.hint).toContain('不必再问');
    expect(narrowed.body.hint).toContain('理由');
  });

  it('totalCandidates 是截断前的候选总数：50 条候选、前 12 条参与复核与分组', async () => {
    const { tools, candidateService, reviewService } = createTools([], {
      intake: { name: '牛肉' },
    });
    const candidates = Array.from({ length: 50 }, (_, index) =>
      row(`beef-${index}`, `Beef, ground, raw ${index + 1}`),
    );
    mockAllRelevant(candidateService, reviewService, candidates);

    const search = await executeTool(tools, 'searchLocalNutrition', {
      keyword: '牛肉',
      state: 'RAW',
    });

    expect(search.body.totalCandidates).toBe(50);
    expect(search.body.candidateCount).toBe(50);
    expect(search.body.returnedCount).toBe(12);
    expect(search.body.candidates).toHaveLength(12);
    expect(search.body.groups).toEqual([
      { key: 'ground', label: '牛绞肉', count: 12, states: ['RAW'] },
    ]);
  });
  it('熟组词条核实按收窄记录的 state=COOKED，不能回退到默认 RAW', async () => {
    const { tools, candidateService, reviewService } = createTools([], {
      intake: { name: '牛肉' },
    });
    const candidates = [
      row('ground-cooked-1', 'Beef, ground, cooked 1'),
      row('ground-cooked-2', 'Beef, ground, cooked 2'),
    ].map((candidate) => ({ ...candidate, preparationState: 'COOKED' as const }));
    mockAllRelevant(candidateService, reviewService, candidates);

    const search = await executeTool(tools, 'searchLocalNutrition', {
      keyword: '牛肉',
      state: 'COOKED',
    });
    expect(search.body.listing.options).toHaveLength(3);

    // askUser 的库内核实要用这次检索的状态，不能拿默认 RAW 去查熟词条。
    candidateService.findCandidates.mockClear();
    const asked = await executeTool(tools, 'askUser', {
      question: search.body.listing.question,
      options: search.body.listing.options,
    });

    expect(asked.ok).toBe(true);
    expect(candidateService.findCandidates).toHaveBeenCalledWith(
      { name: 'Beef, ground, cooked 1', state: 'COOKED' },
      1,
    );
  });

});
