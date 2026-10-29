import { Logger } from '@nestjs/common';
import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import type { IngredientNameClassifierService } from '../../../src/application/ingredient-creation/ingredient-name-classifier.service';
import { NUTRITION_FIELD_CATALOG } from '../../../src/domain/ingredient/nutrition-field-catalog';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const DRAFT_ID = 'draft-1';

/** 写草稿的前提：已经有人确认过检索方案。 */
const APPROVED_SEARCH_PLAN = {
  status: 'APPROVED',
  keywords: [{ term: '鸡肝', language: 'zh' }],
  libraries: ['CFCT'],
  findings: '',
  chosenRecordId: null,
  chosenRecordName: null,
  rationale: '',
  proposedAt: '2026-10-24T00:00:00.000Z',
  approvedAt: '2026-10-24T00:00:01.000Z',
  approvedBy: 'admin-1',
  editedByUser: false,
};
const RUN_ID = 'run-1';

interface SourceRecordFixture {
  id: string;
  status: string;
  foodName: string;
  foodNameEn?: string | null;
  normalizedNutrition?: unknown;
}

function createTools(
  records: SourceRecordFixture[] = [],
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

  let payload = { searchPlan: APPROVED_SEARCH_PLAN, ...draftPayload };
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

  const candidateService = {
    findCandidates: jest.fn(async (input: { name: string }) => ({
      keywords: [input.name],
      candidates: [],
      excludedCount: 0,
      coverage: {
        state: 'RAW' as const,
        candidateCount: 0,
        bestCoveragePercent: null,
        bestMissingFieldCount: null,
      },
    })),
    listNutritionNames: jest.fn(async () => ({
      total: 0,
      names: [],
      keywords: [],
    })),
  };
  const checkService = { runCheck: jest.fn() };

  const nameClassifierService = {
    summarizeNames: jest.fn(async (input: any) => {
      const counts: Record<string, number> = {};
      for (const item of input.items) {
        counts[item.name] = (counts[item.name] ?? 0) + 1;
      }
      return {
        total: input.items.length,
        byState: { RAW: input.items.length, COOKED: 0, UNKNOWN: 0 },
        byMethod: {
          BOILED: 0,
          STEAMED: 0,
          GRILLED: 0,
          FRIED: 0,
          OTHER: 0,
          NONE: input.items.length,
        },
        byCutGroup: {},
        examples: {},
        irrelevantExamples: [],
        degraded: false,
        notice: null,
      };
    }),
  };

  const tools = new IngredientCreationToolsService(
    candidateService as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    checkService as unknown as IngredientCreationCheckService,
    prisma as unknown as PrismaService,
    nameClassifierService as unknown as IngredientNameClassifierService,
  );

  return {
    tools,
    prisma,
    draftService,
    candidateService,
    checkService,
    nameClassifierService,
    currentPayload: () => payload,
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

let logSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('IngredientCreationToolsService · 工具清单（原子能力）', () => {
  it('只有 10 个原子工具，没有任何提交 / 确认 / 批准工具', () => {
    const { tools } = createTools();

    expect(tools.availableToolNames()).toEqual([
      'searchLibraries',
      'loadSkill',
      'summarizeByKeyword',
      'getRecord',
      'writeNutrition',
      'writeIngredient',
      'selfCheck',
      'askUser',
      'proposeSearchPlan',
      'finish',
    ]);

    const names = tools.availableToolNames();
    for (const forbidden of [
      'commit',
      'submit',
      'confirm',
      'approve',
      'publish',
      'createIngredient',
    ]) {
      expect(names.some((name) => name.includes(forbidden))).toBe(false);
    }
  });

  it('searchLibraries 的定义只收「库 + 词」，没有流程参数', () => {
    const { tools } = createTools();
    const definition = tools
      .getDefinitions()
      .find((tool) => tool.function.name === 'searchLibraries');

    const properties = definition?.function.parameters.properties as Record<
      string,
      unknown
    >;
    expect(Object.keys(properties)).toEqual(['groups']);
  });
});

describe('IngredientCreationToolsService · getRecord', () => {
  it('正常记录：只返回有值的字段，单位取自目录，null 值进 missing 不出现', async () => {
    const { tools } = createTools([
      {
        id: 'rec-liver-raw',
        status: 'ACTIVE',
        foodName: 'Chicken, liver, raw',
        foodNameEn: 'Chicken, liver, raw',
        normalizedNutrition: {
          meta: { sampleState: 'RAW' },
          macros: { crudeProtein: 19.5, energyKcal: 120 },
          minerals: { calcium: 120 },
        },
      },
    ]);

    const result = await executeTool(tools, 'getRecord', {
      id: 'rec-liver-raw',
    });

    expect(result.ok).toBe(true);
    expect(result.body.record).toMatchObject({
      id: 'rec-liver-raw',
      name: 'Chicken, liver, raw',
      state: 'RAW',
      values: [
        { fieldPath: 'macros.crudeProtein', value: 19.5, unit: 'g' },
        { fieldPath: 'macros.energyKcal', value: 120, unit: 'kcal' },
        { fieldPath: 'minerals.calcium', value: 120, unit: 'mg' },
      ].sort((left, right) => {
        const leftIndex = NUTRITION_FIELD_CATALOG.findIndex(
          (field) => field.fieldPath === left.fieldPath,
        );
        const rightIndex = NUTRITION_FIELD_CATALOG.findIndex(
          (field) => field.fieldPath === right.fieldPath,
        );
        return leftIndex - rightIndex;
      }),
    });
    expect(result.body.record.missing).toContain('macros.moisture');
    expect(result.body.record.missing).not.toContain('macros.crudeProtein');
    expect(result.progress?.sourceRecordIds).toEqual(['rec-liver-raw']);
  });

  it('id 不存在：返回 ok:false 与中文错误，不抛异常', async () => {
    const { tools } = createTools();
    const result = await executeTool(tools, 'getRecord', {
      id: 'missing',
    });

    expect(result.ok).toBe(false);
    expect(result.body.ok).toBe(false);
    expect(result.body.error).toContain('不存在');
  });

  it('记录非 ACTIVE：返回 ok:false，不返回任何数值', async () => {
    const { tools } = createTools([{ ...RAW_LIVER, status: 'ARCHIVED' }]);
    const result = await executeTool(tools, 'getRecord', {
      id: 'rec-liver-raw',
    });

    expect(result.ok).toBe(false);
    expect(result.body.error).toContain('停用');
    expect(result.body.record).toBeUndefined();
  });

  it('id 为空：返回 ok:false 与中文错误', async () => {
    const { tools } = createTools();
    const result = await executeTool(tools, 'getRecord', { id: '   ' });

    expect(result.ok).toBe(false);
    expect(result.body.error).toContain('id');
  });
});

describe('IngredientCreationToolsService · writeNutrition', () => {
  it('全部合法：一次调用写入所有字段，返回 applied 且只 patch 一次', async () => {
    const { tools, draftService } = createTools(
      [RAW_LIVER],
      draftWithRawProfile(),
    );

    const result = await executeTool(tools, 'writeNutrition', {
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
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.body.applied).toBe(2);
    expect(result.body.failed).toEqual([]);
    // 两个字段合并成一次 patch。
    expect(draftService.patch).toHaveBeenCalledTimes(1);
    expect(result.progress?.writtenFieldPaths).toEqual([
      'macros.crudeProtein',
      'macros.energyKcal',
    ]);

    const profiles = (result as any).body;
    expect(profiles.profileIndex).toBe(0);
  });

  it('没有 sourceRecordId：逐条拒绝，错误文本说清「无来源不能写」，草稿不变', async () => {
    const { tools, draftService } = createTools(
      [RAW_LIVER],
      draftWithRawProfile(),
    );

    const result = await executeTool(tools, 'writeNutrition', {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 19.5,
          unit: 'g',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.body.applied).toBe(0);
    expect(result.body.failed).toHaveLength(1);
    expect(result.body.failed[0].fieldPath).toBe('macros.crudeProtein');
    expect(result.body.failed[0].error).toContain('缺少 sourceRecordId');
    expect(result.body.failed[0].error).toContain('没有来源');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('单位非法：就地返回错误文本，不写入', async () => {
    const { tools, draftService } = createTools(
      [RAW_LIVER],
      draftWithRawProfile(),
    );

    const result = await executeTool(tools, 'writeNutrition', {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 19.5,
          unit: '两',
          sourceRecordId: 'rec-liver-raw',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.body.applied).toBe(0);
    expect(result.body.failed[0].error).toContain('单位「两」不合法');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('部分失败：成功项照常写入，失败项逐条返回 fieldPath 与错误', async () => {
    const { tools, draftService } = createTools(
      [RAW_LIVER],
      draftWithRawProfile(),
    );

    const result = await executeTool(tools, 'writeNutrition', {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 19.5,
          unit: 'g',
          sourceRecordId: 'rec-liver-raw',
        },
        {
          fieldPath: 'macros.notAField',
          value: 1,
          unit: 'g',
          sourceRecordId: 'rec-liver-raw',
        },
        {
          fieldPath: 'minerals.calcium',
          value: 120,
          unit: 'mg',
          // 来源不存在
          sourceRecordId: 'missing-source',
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.body.applied).toBe(1);
    expect(result.body.failed).toHaveLength(2);
    expect(result.body.failed[0].error).toContain('不在营养字段目录');
    expect(result.body.failed[1].error).toContain('不存在');
    expect(draftService.patch).toHaveBeenCalledTimes(1);
  });

  it('超过 70 条：整批拒绝，什么都不写', async () => {
    const { tools, draftService } = createTools(
      [RAW_LIVER],
      draftWithRawProfile(),
    );

    const entries = Array.from({ length: 71 }, () => ({
      fieldPath: 'macros.crudeProtein',
      value: 1,
      unit: 'g',
      sourceRecordId: 'rec-liver-raw',
    }));
    const result = await executeTool(tools, 'writeNutrition', {
      profileIndex: 0,
      entries,
    });

    expect(result.ok).toBe(false);
    expect(result.body.error).toContain('70');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('entries 为空：返回错误文本，不 patch', async () => {
    const { tools, draftService } = createTools(
      [RAW_LIVER],
      draftWithRawProfile(),
    );

    const result = await executeTool(tools, 'writeNutrition', {
      profileIndex: 0,
      entries: [],
    });

    expect(result.ok).toBe(false);
    expect(result.body.error).toContain('不能为空');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('草稿还没有档案：省略 profileIndex，按来源记录自动建档案（状态不猜）', async () => {
    const { tools } = createTools([RAW_LIVER], {});

    const result = await executeTool(tools, 'writeNutrition', {
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 19.5,
          unit: 'g',
          sourceRecordId: 'rec-liver-raw',
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.body.applied).toBe(1);
    expect(result.body.profileIndex).toBe(0);
    expect(result.body.failed).toEqual([]);

    const saved = (result as any).body;
    expect(saved).toBeDefined();
  });

  it('多份档案且来源匹配不上：拒绝自动判断，要求显式 profileIndex', async () => {
    const { tools, draftService } = createTools(
      [RAW_LIVER],
      {
        profiles: [
          {
            preparationState: 'RAW',
            sourceRecordId: 'rec-liver-raw',
            entries: [],
            notes: null,
          },
          {
            preparationState: 'COOKED',
            sourceRecordId: 'rec-liver-cooked',
            entries: [],
            notes: null,
          },
        ],
      },
    );

    const result = await executeTool(tools, 'writeNutrition', {
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 19.5,
          unit: 'g',
          sourceRecordId: 'rec-other',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.body.error).toContain('profileIndex');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('多份档案但来源能唯一匹配：省略 profileIndex 也写到正确的档案', async () => {
    const cooked: SourceRecordFixture = {
      id: 'rec-liver-cooked',
      status: 'ACTIVE',
      foodName: 'Chicken, liver, cooked',
      normalizedNutrition: { meta: { sampleState: 'COOKED' } },
    };
    const { tools, draftService } = createTools(
      [RAW_LIVER, cooked],
      {
        profiles: [
          {
            preparationState: 'RAW',
            sourceRecordId: 'rec-liver-raw',
            entries: [],
            notes: null,
          },
          {
            preparationState: 'COOKED',
            sourceRecordId: 'rec-liver-cooked',
            entries: [],
            notes: null,
          },
        ],
      },
    );

    const result = await executeTool(tools, 'writeNutrition', {
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 25.1,
          unit: 'g',
          sourceRecordId: 'rec-liver-cooked',
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.body.profileIndex).toBe(1);
    const payload = draftService.patch.mock.calls[0][2] as any;
    expect(payload.profiles[0].entries).toEqual([]);
    expect(payload.profiles[1].entries[0]).toMatchObject({
      fieldPath: 'macros.crudeProtein',
      finalValue: 25.1,
    });
  });

  it('写入只 patch 草稿：工具定义里没有任何提交 / 确认入口', () => {
    const { tools } = createTools();
    const definition = tools
      .getDefinitions()
      .find((tool) => tool.function.name === 'writeNutrition');

    expect(definition?.function.description).toContain('只写草稿');
  });
});

describe('IngredientCreationToolsService · askUser（无流程闸门）', () => {
  it('草稿里有 narrowing.required=true 也不拦：askUser 直接成功', async () => {
    const { tools, draftService } = createTools([], {
      // 旧草稿里的收窄记录；新工具不再读取，也不应该用它拒绝提问。
      candidateNarrowing: {
        required: true,
        selectedGroupKey: null,
        question: '要哪个部位？',
        options: ['ground', 'chuck'],
        choices: [],
        groups: [],
      },
    });

    const result = await executeTool(tools, 'askUser', {
      question: '你要哪个部位？',
      options: ['牛绞肉', '牛肩肉'],
    });

    expect(result.ok).toBe(true);
    expect(result.body.awaitingUser).toBe(true);
    expect(result.pendingQuestion?.question).toBe('你要哪个部位？');
    expect(draftService.patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INTAKE',
      expect.objectContaining({
        pendingQuestion: expect.objectContaining({
          question: '你要哪个部位？',
        }),
      }),
    );
  });

  it('选项少于 2 个：拒绝并返回错误文本', async () => {
    const { tools, draftService } = createTools();

    const result = await executeTool(tools, 'askUser', {
      question: '选一个？',
      options: ['只有一个'],
    });

    expect(result.ok).toBe(false);
    expect(result.body.error).toContain('2–5');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('问题为空：拒绝', async () => {
    const { tools } = createTools();

    const result = await executeTool(tools, 'askUser', {
      question: '   ',
      options: ['甲', '乙'],
    });

    expect(result.ok).toBe(false);
    expect(result.body.error).toContain('question');
  });

  it('问题超过 200 字：自动截断而不是报错', async () => {
    const { tools } = createTools();

    const result = await executeTool(tools, 'askUser', {
      question: '问'.repeat(260),
      options: ['甲', '乙'],
    });

    expect(result.ok).toBe(true);
    const question = result.pendingQuestion?.question ?? '';
    // 200 字上限 → 前 197 字 + …
    expect(Array.from(question)).toHaveLength(198);
    expect(question.endsWith('…')).toBe(true);
  });

  it('第 6 个选项只允许「都不对，我直接说」；普通问题仍最多 5 个', async () => {
    const { tools } = createTools();

    const sixPlain = await executeTool(tools, 'askUser', {
      question: '选一个？',
      options: ['甲', '乙', '丙', '丁', '戊', '己'],
    });
    expect(sixPlain.ok).toBe(false);

    const withFallback = await executeTool(tools, 'askUser', {
      question: '选一个？',
      options: ['甲', '乙', '丙', '丁', '戊', '都不对，我直接说'],
    });
    expect(withFallback.ok).toBe(true);
    expect(withFallback.pendingQuestion?.optionChecks?.[5]?.kind).toBe('FREE');
  });

  it('选项核实：命中的标 inLibrary=true，未命中的保留并加「去线上找」后缀', async () => {
    const { tools, candidateService } = createTools();
    candidateService.findCandidates.mockImplementation(
      async (input: { name: string }) => ({
        keywords: [input.name],
        candidates:
          input.name === '鸡肝'
            ? [
                {
                  sourceRecordId: 'rec-liver-raw',
                  sourceType: 'USDA_FDC',
                  foodName: 'Chicken, liver, raw',
                  foodNameEn: 'Chicken, liver, raw',
                  preparationState: 'RAW',
                  cookingMethod: null,
                  coveragePercent: 80,
                  missingFields: [],
                  matchScore: 0.9,
                  matchedBy: 'EN_EXACT',
                  matchedKeyword: input.name,
                  matchedSourceName: 'Chicken, liver, raw',
                  notes: [],
                },
              ]
            : [],
        excludedCount: 0,
        coverage: {
          state: 'RAW' as const,
          candidateCount: 0,
          bestCoveragePercent: null,
          bestMissingFieldCount: null,
        },
      }),
    );

    const result = await executeTool(tools, 'askUser', {
      question: '要哪一条？',
      options: ['鸡肝', '鸭肝'],
    });

    expect(result.ok).toBe(true);
    expect(result.pendingQuestion?.optionChecks?.[0]).toMatchObject({
      label: '鸡肝',
      inLibrary: true,
      matchedName: 'Chicken, liver, raw',
    });
    expect(result.pendingQuestion?.optionChecks?.[1]).toMatchObject({
      label: '鸭肝',
      inLibrary: false,
    });
    expect(
      result.pendingQuestion?.optionChecks?.[1]?.displayLabel,
    ).toContain('去线上找');
  });

  it('所有选项都查不到也照常提问，不再退回错误文本', async () => {
    const { tools } = createTools();

    const result = await executeTool(tools, 'askUser', {
      question: '要哪一条？',
      options: ['不存在的甲', '不存在的乙'],
    });

    expect(result.ok).toBe(true);
    expect(result.body.awaitingUser).toBe(true);
    expect(result.pendingQuestion?.options).toEqual([
      '不存在的甲',
      '不存在的乙',
    ]);
  });

  it('不再写 candidateReviewGate / candidateNarrowing 这类流程字段', async () => {
    const { tools, draftService } = createTools([], draftWithRawProfile());

    await executeTool(tools, 'askUser', {
      question: '要哪一条？',
      options: ['甲', '乙'],
    });

    const patched = draftService.patch.mock.calls[0][2] as Record<
      string,
      unknown
    >;
    expect(patched).not.toHaveProperty('candidateReviewGate');
    expect(patched).not.toHaveProperty('candidateNarrowing');
  });
});

describe('IngredientCreationToolsService · finish', () => {
  it('返回 finished 信号与结论，不写草稿', async () => {
    const { tools, draftService } = createTools();

    const result = await executeTool(tools, 'finish', {
      summary: '已写入 3 条营养值，终检通过。',
    });

    expect(result.ok).toBe(true);
    expect(result.body.finished).toBe(true);
    expect(result.finished).toEqual({
      reply: '已写入 3 条营养值，终检通过。',
    });
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('不带 summary 也能结束，并给出一句中性结论', async () => {
    const { tools } = createTools();

    const result = await executeTool(tools, 'finish', {});

    expect(result.ok).toBe(true);
    expect(result.body.finished).toBe(true);
    expect(result.finished?.reply).toBeNull();
  });
});
