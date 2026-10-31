import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import type { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import type { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import type { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const DRAFT_ID = 'draft-1';
const RUN_ID = 'run-1';

const VALID_ARGS = {
  keywords: [
    { term: '鸡蛋清', language: 'zh' },
    { term: 'egg white', language: 'en' },
  ],
  libraries: ['CFCT', 'USDA'],
  findings: 'CFCT 0 条；USDA 3 条（raw / dried）',
  candidates: [
    {
      recordId: 'd6705357-d14b-48c0-81b0-d6cd347f7a88',
      name: 'Egg, white, raw, fresh',
      sourceType: 'USDA',
      state: '生',
      profileState: 'RAW',
      coverage: 52,
      reason: '英文名统一',
    },
  ],
  rationale: '英文名在 USDA 更统一',
};

function createHarness(
  payload: Record<string, unknown> = {},
  names: Array<{ id: string; name: string; sourceType: string }> = [],
) {
  const draft = {
    id: DRAFT_ID,
    name: '鸡蛋清',
    type: 'FOOD',
    step: 'INTAKE',
    payload: {
      searchReport: [
        {
          library: 'USDA',
          terms: ['egg white'],
          total: 1,
          at: '2026-10-29T00:00:00.000Z',
        },
      ],
      ...payload,
    },
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-29T00:00:00.000Z'),
    updatedAt: new Date('2026-10-29T00:00:00.000Z'),
  };

  const draftService = {
    get: jest.fn(async () => draft),
    patch: jest.fn(async (_id: string, _step: string, next: Record<string, unknown>) => {
      Object.assign(draft.payload, next);
      return draft;
    }),
  };

  const prisma = {
    nutritionSourceRecord: {
      findUnique: jest.fn(async () => ({
        id: 'd6705357-d14b-48c0-81b0-d6cd347f7a88',
        status: 'ACTIVE',
        sourceType: 'USDA',
        foodName: 'Egg, white, raw, fresh',
        foodNameEn: 'Egg, white, raw, fresh',
        normalizedNutrition: {},
      })),
    },
  };

  const tools = new IngredientCreationToolsService(
    {
      findCandidates: jest.fn(async () => ({ candidates: [] })),
      listNutritionNames: jest.fn(async () => ({
        total: names.length,
        names,
        keywords: ['鸡蛋清'],
      })),
      searchByLibrary: jest.fn(async ({ library }: { library: string }) => ({
        library,
        total: names.length,
        hits: names.map((entry) => ({
          id: entry.id,
          name: entry.name,
          sourceType: entry.sourceType,
          sourceKey: entry.id,
          dataType: null,
          filledFieldCount: 10,
        })),
      })),
    } as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    { runCheck: jest.fn() } as unknown as IngredientCreationCheckService,
    prisma as unknown as PrismaService,
    undefined,
  );

  return { tools, draftService, prisma };
}

async function call(
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
    body: JSON.parse(execution.content) as Record<string, unknown>,
  };
}

const APPROVED_PLAN = {
  status: 'APPROVED',
  keywords: [{ term: '鸡蛋清', language: 'zh' }],
  libraries: ['USDA'],
  findings: '',
  libraryReports: [],
  candidates: [],
  selections: [],
  rationale: '',
  proposedAt: '2026-10-29T00:00:00.000Z',
  approvedAt: '2026-10-29T00:00:01.000Z',
  approvedBy: 'admin-1',
  editedByUser: false,
};

describe('IngredientCreationToolsService · 检索方案', () => {
  it('提交方案 → 落成待确认，并让本轮停下来等确认', async () => {
    const { tools, draftService } = createHarness();

    const result = await call(tools, 'proposeSearchPlan', VALID_ARGS);

    expect(result.ok).toBe(true);
    expect(result.pendingPlan).toMatchObject({
      status: 'PENDING',
      libraries: ['CFCT', 'USDA'],
      candidates: [
        expect.objectContaining({ name: 'Egg, white, raw, fresh' }),
      ],
    });
    expect(draftService.patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INTAKE',
      expect.objectContaining({
        searchPlan: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });

  it('工具定义要求每条候选带 profileState 与 reason，且不再有单主选字段', () => {
    const { tools } = createHarness();
    const definition = tools
      .getDefinitions()
      .find((tool) => tool.function.name === 'proposeSearchPlan');

    const parameters = definition?.function.parameters as {
      properties: Record<string, any>;
    };
    const candidates = parameters.properties.candidates;

    expect(candidates.maxItems).toBe(12);
    expect(candidates.items.required).toEqual(
      expect.arrayContaining(['recordId', 'name', 'state', 'profileState', 'reason']),
    );
    expect(candidates.items.properties.profileState.enum).toEqual(['RAW', 'COOKED']);
    expect(parameters.properties.chosenRecordId).toBeUndefined();
    expect(parameters.properties.chosenRecordName).toBeUndefined();
  });

  it('没有按库检索过 → 拒绝交方案', async () => {
    const { tools } = createHarness({ searchReport: [] });

    const result = await call(tools, 'proposeSearchPlan', VALID_ARGS);

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('searchLibraries');
  });

  it('候选记录不存在 → 拒绝', async () => {
    const { tools, prisma } = createHarness();
    (
      prisma.nutritionSourceRecord.findUnique as jest.Mock
    ).mockResolvedValueOnce(null);

    const result = await call(tools, 'proposeSearchPlan', VALID_ARGS);

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('不存在');
  });

  it('来源库与覆盖率由服务端补，模型给的不作数', async () => {
    const { tools, prisma } = createHarness();
    (
      prisma.nutritionSourceRecord.findUnique as jest.Mock
    ).mockResolvedValueOnce({
      id: 'd6705357-d14b-48c0-81b0-d6cd347f7a88',
      status: 'ACTIVE',
      sourceType: 'USDA',
      foodName: 'Egg, white, raw, fresh',
      normalizedNutrition: { macros: { crudeProtein: 10 } },
    });

    const result = await call(tools, 'proposeSearchPlan', {
      ...VALID_ARGS,
      candidates: [
        {
          ...VALID_ARGS.candidates[0],
          sourceType: 'CFCT',
          coverage: 99,
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.pendingPlan).toMatchObject({
      candidates: [
        expect.objectContaining({
          sourceType: 'USDA',
          coverage: 1.7,
        }),
      ],
    });
  });

  it('目标库不在白名单 → 拒绝，且不写草稿', async () => {
    const { tools, draftService } = createHarness();

    const result = await call(tools, 'proposeSearchPlan', {
      ...VALID_ARGS,
      libraries: ['USDA', 'GOOGLE'],
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('GOOGLE');
    // 零命中不记「查到过候选」的记号，但检索流水照样要记（汇报块要用）。
    const patches = draftService.patch.mock.calls.map(
      (call) => call[2] as Record<string, unknown>,
    );
    expect(patches.some((payload) => 'searchProbe' in payload)).toBe(false);
  });

  it('没有方案就写原料卡 → 拒绝，且不动草稿', async () => {
    const { tools, draftService } = createHarness();

    const result = await call(tools, 'writeIngredient', {
      fields: { name: '鸡蛋清' },
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('检索方案');
    // 零命中不记「查到过候选」的记号，但检索流水照样要记（汇报块要用）。
    const patches = draftService.patch.mock.calls.map(
      (entry) => entry[2] as Record<string, unknown>,
    );
    expect(patches.some((payload) => 'searchProbe' in payload)).toBe(false);
  });

  it('方案还是待确认 → 同样拒绝写原料卡', async () => {
    const { tools } = createHarness({
      searchPlan: { ...APPROVED_PLAN, status: 'PENDING' },
    });

    const result = await call(tools, 'writeIngredient', {
      fields: { name: '鸡蛋清' },
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('检索方案');
  });

  it('方案已确认 → 可以写原料卡', async () => {
    const { tools, draftService } = createHarness({
      searchPlan: APPROVED_PLAN,
    });

    const result = await call(tools, 'writeIngredient', {
      fields: { nameEn: 'Egg white' },
    });

    expect(result.ok).toBe(true);
    expect(draftService.patch).toHaveBeenCalled();
  });

  it('没有方案就写营养 → 拒绝，而且不会去查来源记录', async () => {
    const { tools, draftService, prisma } = createHarness();

    const result = await call(tools, 'writeNutrition', {
      entries: [
        {
          fieldPath: 'macros.energyKcal',
          value: 52,
          unit: 'kcal',
          sourceRecordId: 'd6705357-d14b-48c0-81b0-d6cd347f7a88',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('检索方案');
    expect(draftService.patch).not.toHaveBeenCalled();
    expect(prisma.nutritionSourceRecord.findUnique).not.toHaveBeenCalled();
  });
});

describe('IngredientCreationToolsService · 查到候选后不许用提问代替方案', () => {
  const NAMES = [
    { id: 'rec-1', name: 'Egg, white, raw, fresh', sourceType: 'USDA' },
    { id: 'rec-2', name: 'Egg, white, dried', sourceType: 'USDA' },
  ];

  it('查名字命中 → 在草稿上记下「查到过候选」', async () => {
    const { tools, draftService } = createHarness({}, NAMES);

    await call(tools, 'searchLibraries', {
      groups: [{ library: 'CFCT', terms: ['鸡蛋清'] }],
    });

    expect(draftService.patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INTAKE',
      expect.objectContaining({
        searchProbe: expect.objectContaining({ hitAt: expect.any(String) }),
      }),
    );
  });

  it('零命中不记记号（否则连澄清问题都问不了）', async () => {
    const { tools, draftService } = createHarness({}, []);

    await call(tools, 'searchLibraries', {
      groups: [{ library: 'CFCT', terms: ['不存在的名字'] }],
    });

    // 零命中不记「查到过候选」的记号，但检索流水照样要记（汇报块要用）。
    const patches = draftService.patch.mock.calls.map(
      (entry) => entry[2] as Record<string, unknown>,
    );
    expect(patches.some((payload) => 'searchProbe' in payload)).toBe(false);
  });

  it('查到候选、还没交方案 → 拒绝提问', async () => {
    const { tools, draftService } = createHarness({
      searchProbe: { hitAt: '2026-10-29T00:00:00.000Z' },
    });

    const result = await call(tools, 'askUser', {
      question: '要建哪一种？',
      options: ['生鲜', '干燥'],
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('检索方案');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('还没查到候选 → 允许提问澄清', async () => {
    const { tools } = createHarness();

    const result = await call(tools, 'askUser', {
      question: '你说的是哪个部位？',
      options: ['里脊', '五花'],
    });

    expect(result.ok).toBe(true);
    expect(result.pendingQuestion).toBeTruthy();
  });

  it('方案已确认 → 提问恢复可用', async () => {
    const { tools } = createHarness({
      searchProbe: { hitAt: '2026-10-29T00:00:00.000Z' },
      searchPlan: APPROVED_PLAN,
    });

    const result = await call(tools, 'askUser', {
      question: '要不要再补一份熟档案？',
      options: ['要', '不用'],
    });

    expect(result.ok).toBe(true);
  });
});
