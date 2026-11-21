import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const DRAFT_ID = 'draft-1';
const RUN_ID = 'run-1';

const SEARCH_PLAN = {
  status: 'APPROVED',
  keywords: [{ term: '鸡蛋清', language: 'zh' }],
  libraries: ['CFCT'],
  libraryReports: [],
  candidates: [],
  selections: [],
  findings: '',
  rationale: '',
  proposedAt: '2026-10-31T00:00:00.000Z',
  approvedAt: '2026-10-31T00:00:01.000Z',
  approvedBy: 'admin-1',
  editedByUser: false,
};

function createHarness(
  payload: Record<string, unknown> = {},
  options: { normalizedNutrition?: unknown } = {},
) {
  const draft = {
    id: DRAFT_ID,
    name: '鸡蛋清',
    type: 'FOOD',
    step: 'INGREDIENT',
    payload: { searchPlan: SEARCH_PLAN, ...payload },
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-31T00:00:00.000Z'),
    updatedAt: new Date('2026-10-31T00:00:00.000Z'),
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
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        status: 'ACTIVE',
        sourceType: 'CFCT',
        foodName: `来源 ${where.id}`,
        foodNameEn: null,
        // 没有 meta.sampleState：推不出生熟。
        normalizedNutrition: options.normalizedNutrition ?? {
          macros: { crudeProtein: 10 },
        },
      })),
    },
  };

  const tools = new IngredientCreationToolsService(
    { findCandidates: jest.fn() } as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    { runCheck: jest.fn() } as unknown as IngredientCreationCheckService,
    prisma as unknown as PrismaService,
  );

  return { tools, draftService, draft };
}

async function write(
  tools: IngredientCreationToolsService,
  args: Record<string, unknown>,
) {
  return tools.execute({
    runId: RUN_ID,
    draftId: DRAFT_ID,
    name: 'writeNutrition',
    args,
  });
}

describe('writeNutrition · 显式状态与「一份档案一个来源」', () => {
  it('新建档案时用显式 preparationState，不再依赖来源推导', async () => {
    const { tools, draftService } = createHarness();

    const result = await write(tools, {
      preparationState: 'RAW',
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 10,
          unit: 'g',
          sourceRecordId: 'rec-1',
        },
      ],
    });

    expect(result.ok).toBe(true);
    const patched = draftService.patch.mock.calls.at(-1)?.[2] as {
      profiles?: Array<{ preparationState: string }>;
    };
    expect(patched.profiles?.[0]?.preparationState).toBe('RAW');
  });

  it('未传 preparationState 且来源推不出 → 仍按旧逻辑报错', async () => {
    const { tools } = createHarness();

    const result = await write(tools, {
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 10,
          unit: 'g',
          sourceRecordId: 'rec-1',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('生还是熟');
  });

  it('同一批 entries 混两个来源 → 拒绝', async () => {
    const { tools } = createHarness();

    const result = await write(tools, {
      preparationState: 'RAW',
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 10,
          unit: 'g',
          sourceRecordId: 'rec-1',
        },
        {
          fieldPath: 'macros.moisture',
          value: 80,
          unit: 'g',
          sourceRecordId: 'rec-2',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('一份档案只能有一个来源');
  });

  it('写入已有档案但来源不一致 → 拒绝', async () => {
    const { tools } = createHarness({
      profiles: [
        {
          preparationState: 'RAW',
          sourceRecordId: 'rec-1',
          entries: [],
          notes: '',
        },
      ],
    });

    const result = await write(tools, {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 10,
          unit: 'g',
          sourceRecordId: 'rec-2',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('一份档案只能有一个来源');
  });
});

describe('writeNutrition · 来源数值与人工值保护', () => {
  it('写入值与来源不一致 → 拒绝，并写出两边数值', async () => {
    const { tools } = createHarness(
      {},
      { normalizedNutrition: { macros: { crudeProtein: 25 } } },
    );

    const result = await write(tools, {
      preparationState: 'RAW',
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 45,
          unit: 'g',
          sourceRecordId: 'rec-1',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('45');
    expect(String(result.error)).toContain('25');
  });

  it('来源口径不是每 100g → 拒绝', async () => {
    const { tools } = createHarness(
      {},
      {
        normalizedNutrition: {
          meta: { rawBasisType: 'PER_SERVING' },
          macros: { crudeProtein: 10 },
        },
      },
    );

    const result = await write(tools, {
      preparationState: 'RAW',
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 10,
          unit: 'g',
          sourceRecordId: 'rec-1',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('每 100g');
  });

  it('来源里没有这个字段 → 拒绝', async () => {
    const { tools } = createHarness(
      {},
      { normalizedNutrition: { macros: { crudeFat: 5 } } },
    );

    const result = await write(tools, {
      preparationState: 'RAW',
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 10,
          unit: 'g',
          sourceRecordId: 'rec-1',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('没有字段');
  });

  it('人工改过的字段 → 跳过，不覆盖也不落库', async () => {
    const manualEntry = {
      fieldPath: 'macros.crudeProtein',
      finalValue: 21.2,
      unit: 'g',
      status: 'MANUAL',
      sourceRecordId: 'rec-1',
      sourceValue: 21.2,
      sourceUnit: 'g',
      formula: null,
      confirmedBy: 'HUMAN_REVIEW',
      confirmedAt: '2026-11-21T00:00:00.000Z',
    };
    const { tools, draftService } = createHarness({
      profiles: [
        {
          preparationState: 'RAW',
          sourceRecordId: 'rec-1',
          entries: [manualEntry],
          notes: '',
        },
      ],
    });

    const result = await write(tools, {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 10,
          unit: 'g',
          sourceRecordId: 'rec-1',
        },
      ],
    });

    expect(result.ok).toBe(true);
    const content = JSON.parse(String(result.content));
    expect(content.skipped).toEqual([
      { fieldPath: 'macros.crudeProtein', reason: 'MANUAL' },
    ]);
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('重复写同一个值：不重写证据行、不刷新基线、不 patch 草稿', async () => {
    const existingEntry = {
      fieldPath: 'macros.crudeProtein',
      finalValue: 10,
      unit: 'g',
      status: 'DIRECT',
      sourceRecordId: 'rec-1',
      sourceValue: 10,
      sourceUnit: 'g',
      formula: null,
      confirmedBy: null,
      confirmedAt: '2026-11-20T00:00:00.000Z',
    };
    const { tools, draftService } = createHarness(
      {
        profiles: [
          {
            preparationState: 'RAW',
            sourceRecordId: 'rec-1',
            entries: [existingEntry],
            notes: '',
          },
        ],
      },
      { normalizedNutrition: { macros: { crudeProtein: 10 } } },
    );

    const result = await write(tools, {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 10,
          unit: 'g',
          sourceRecordId: 'rec-1',
        },
      ],
    });

    expect(result.ok).toBe(true);
    // 内容没变，就不该 patch：否则 payload 哈希会变、核验报告被无谓作废。
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('人工格即使来源口径不是每 100g，也先跳过而不是报口径错', async () => {
    const manualEntry = {
      fieldPath: 'macros.crudeProtein',
      finalValue: 21.2,
      unit: 'g',
      status: 'MANUAL',
      sourceRecordId: 'rec-1',
      sourceValue: 21.2,
      sourceUnit: 'g',
      formula: null,
      confirmedBy: 'HUMAN_REVIEW',
      confirmedAt: '2026-11-21T00:00:00.000Z',
    };
    const { tools } = createHarness(
      {
        profiles: [
          {
            preparationState: 'RAW',
            sourceRecordId: 'rec-1',
            entries: [manualEntry],
            notes: '',
          },
        ],
      },
      {
        normalizedNutrition: {
          meta: { rawBasisType: 'PER_SERVING', sampleState: 'RAW' },
          macros: { crudeProtein: 21.2 },
        },
      },
    );

    const result = await write(tools, {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 21.2,
          unit: 'g',
          sourceRecordId: 'rec-1',
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(String(result.content)).skipped).toEqual([
      { fieldPath: 'macros.crudeProtein', reason: 'MANUAL' },
    ]);
  });

  it('来源按每 1g 记录时，×100 后与档案值比较：一致就写入，证据记可比值', async () => {
    const { tools, draftService } = createHarness(
      {},
      {
        normalizedNutrition: {
          meta: { rawBasisType: 'PER_1_G', sampleState: 'RAW' },
          macros: { crudeProtein: 0.1 },
        },
      },
    );

    const result = await write(tools, {
      preparationState: 'RAW',
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 10,
          unit: 'g',
          sourceRecordId: 'rec-1',
        },
      ],
    });

    expect(result.ok).toBe(true);
    const patched = draftService.patch.mock.calls.at(-1)?.[2] as {
      profiles?: Array<{
        entries?: Array<{ sourceValue: number | null; sourceUnit: string | null }>;
      }>;
    };
    // 证据行记「可比值」（每 100g），否则页面会显示 0.1 g → 10 g 的假差异。
    expect(patched.profiles?.[0]?.entries?.[0]).toMatchObject({
      sourceValue: 10,
      sourceUnit: 'g',
    });
  });

  it('每 1g 的来源换算后对不上 → 拒绝，错误里写换算后的值', async () => {
    const { tools } = createHarness(
      {},
      {
        normalizedNutrition: {
          meta: { rawBasisType: 'PER_1_G', sampleState: 'RAW' },
          macros: { crudeProtein: 0.1 },
        },
      },
    );

    const result = await write(tools, {
      preparationState: 'RAW',
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 12,
          unit: 'g',
          sourceRecordId: 'rec-1',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('12');
    expect(String(result.error)).toContain('10');
  });

  it('人工值优先：即使 AI 写的数与来源不一致，也先跳过而不是报错', async () => {
    const manualEntry = {
      fieldPath: 'macros.crudeProtein',
      finalValue: 21.2,
      unit: 'g',
      status: 'MANUAL',
      sourceRecordId: 'rec-1',
      sourceValue: 21.2,
      sourceUnit: 'g',
      formula: null,
      confirmedBy: 'HUMAN_REVIEW',
      confirmedAt: '2026-11-21T00:00:00.000Z',
    };
    const { tools } = createHarness({
      profiles: [
        {
          preparationState: 'RAW',
          sourceRecordId: 'rec-1',
          entries: [manualEntry],
          notes: '',
        },
      ],
    });

    const result = await write(tools, {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 12,
          unit: 'g',
          sourceRecordId: 'rec-1',
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(String(result.content)).skipped).toEqual([
      { fieldPath: 'macros.crudeProtein', reason: 'MANUAL' },
    ]);
  });

  it('写入成功时把来源值写进证据行', async () => {
    const { tools, draftService } = createHarness(
      {},
      { normalizedNutrition: { macros: { crudeProtein: 10 } } },
    );

    const result = await write(tools, {
      preparationState: 'RAW',
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 10,
          unit: 'g',
          sourceRecordId: 'rec-1',
        },
      ],
    });

    expect(result.ok).toBe(true);
    const patched = draftService.patch.mock.calls.at(-1)?.[2] as {
      profiles?: Array<{ entries: Array<Record<string, unknown>> }>;
      aiBaseline?: {
        profiles?: Record<string, Record<string, unknown>>;
      };
    };
    expect(patched.profiles?.[0]?.entries[0]).toMatchObject({
      fieldPath: 'macros.crudeProtein',
      finalValue: 10,
      sourceValue: 10,
      sourceUnit: 'g',
      status: 'DIRECT',
    });
    expect(
      patched.aiBaseline?.profiles?.['rec-1']?.['macros.crudeProtein'],
    ).toMatchObject({ value: 10, unit: 'g' });
  });
});
