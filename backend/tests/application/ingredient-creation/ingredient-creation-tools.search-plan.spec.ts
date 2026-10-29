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
  chosenRecordId: 'd6705357-d14b-48c0-81b0-d6cd347f7a88',
  chosenRecordName: 'Egg, white, raw, fresh',
  rationale: '英文名在 USDA 更统一',
};

function createHarness(payload: Record<string, unknown> = {}) {
  const draft = {
    id: DRAFT_ID,
    name: '鸡蛋清',
    type: 'FOOD',
    step: 'INTAKE',
    payload,
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
    { findCandidates: jest.fn(), listNutritionNames: jest.fn() } as unknown as IngredientCreationCandidateService,
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
  chosenRecordId: null,
  chosenRecordName: null,
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
      chosenRecordName: 'Egg, white, raw, fresh',
    });
    expect(draftService.patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INTAKE',
      expect.objectContaining({
        searchPlan: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });

  it('目标库不在白名单 → 拒绝，且不写草稿', async () => {
    const { tools, draftService } = createHarness();

    const result = await call(tools, 'proposeSearchPlan', {
      ...VALID_ARGS,
      libraries: ['USDA', 'GOOGLE'],
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('GOOGLE');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('没有方案就写原料卡 → 拒绝，且不动草稿', async () => {
    const { tools, draftService } = createHarness();

    const result = await call(tools, 'writeIngredient', {
      fields: { name: '鸡蛋清' },
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('检索方案');
    expect(draftService.patch).not.toHaveBeenCalled();
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
