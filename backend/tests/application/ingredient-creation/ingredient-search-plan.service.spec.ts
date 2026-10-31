import { BadRequestException } from '@nestjs/common';
import { IngredientSearchPlanService } from '../../../src/application/ingredient-creation/ingredient-search-plan.service';
import type { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import type { IngredientCreationDraft } from '../../../src/application/ingredient-creation/ingredient-creation.types';

const DRAFT_ID = 'draft-1';
const NOW = new Date('2026-10-29T14:00:00.000Z');

function pendingPlan(overrides: Record<string, unknown> = {}) {
  return {
    status: 'PENDING' as const,
    keywords: [{ term: '鸡蛋清', language: 'zh' }],
    libraries: ['CFCT', 'USDA'],
    findings: 'CFCT 0 条；USDA 3 条',
    libraryReports: [],
    candidates: [
      {
        recordId: 'r1',
        name: '鸡蛋清',
        sourceType: 'CFCT',
        state: '生',
        profileState: 'RAW',
        coverage: 60,
        reason: '',
      },
    ],
    selections: [],
    rationale: '英文名更统一',
    proposedAt: NOW.toISOString(),
    approvedAt: null,
    approvedBy: null,
    editedByUser: false,
    ...overrides,
  };
}

function createHarness(plan: Record<string, unknown> | null) {
  const draft = {
    id: DRAFT_ID,
    name: '鸡蛋清',
    type: 'FOOD',
    step: 'INTAKE',
    payload: plan ? { searchPlan: plan } : {},
    createdBy: 'admin-1',
    createdAt: NOW,
    updatedAt: NOW,
  } as unknown as IngredientCreationDraft;

  const patch = jest.fn(
    async (_id: string, step: string, next: Record<string, unknown>) => {
      Object.assign(draft.payload, next);
      return { ...draft, step } as IngredientCreationDraft;
    },
  );

  const draftService = {
    get: jest.fn(async () => draft),
    patch,
  };

  const service = new IngredientSearchPlanService(
    draftService as unknown as IngredientCreationDraftService,
  );

  return { service, draftService, patch, draft };
}

describe('IngredientSearchPlanService', () => {
  it('确认方案 → 落成已确认，记下确认人', async () => {
    const { service, patch } = createHarness(pendingPlan());

    const plan = await service.confirm(
      DRAFT_ID,
      { selectedRecordIds: ['r1'] },
      { userId: 'admin-1', now: NOW },
    );

    expect(plan).toMatchObject({
      status: 'APPROVED',
      approvedBy: 'admin-1',
      approvedAt: NOW.toISOString(),
    });
    expect(patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INTAKE',
      expect.objectContaining({
        searchPlan: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
  });

  it('人改了关键词 → 落库的是改后的', async () => {
    const { service } = createHarness(pendingPlan());

    const plan = await service.confirm(
      DRAFT_ID,
      {
        keywords: [{ term: '蛋清', language: 'zh' }],
        selectedRecordIds: ['r1'],
      },
      { userId: 'admin-1', now: NOW },
    );

    expect(plan.keywords).toEqual([{ term: '蛋清', language: 'zh' }]);
    expect(plan.editedByUser).toBe(true);
  });

  it('多选两条（不同库）→ selections 两条', async () => {
    const { service } = createHarness(
      pendingPlan({
        candidates: [
          {
            recordId: 'r1',
            name: '鸡蛋清',
            sourceType: 'CFCT',
            state: '生',
            profileState: 'RAW',
            coverage: 60,
            reason: '',
          },
          {
            recordId: 'r2',
            name: '卵白',
            sourceType: 'MEXT',
            state: '生',
            profileState: 'RAW',
            coverage: 78.3,
            reason: '',
          },
        ],
      }),
    );

    const plan = await service.confirm(
      DRAFT_ID,
      { selectedRecordIds: ['r1', 'r2'] },
      { userId: 'admin-1', now: NOW },
    );

    expect(plan.selections.map((item) => item.recordId)).toEqual(['r1', 'r2']);
    expect(plan.status).toBe('APPROVED');
  });

  it('没有待确认的方案 → 400 中文原因', async () => {
    const { service, patch } = createHarness(null);

    await expect(
      service.confirm(
        DRAFT_ID,
        { selectedRecordIds: ['r1'] },
        { userId: 'admin-1', now: NOW },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(patch).not.toHaveBeenCalled();
  });

  it('已经确认过 → 400，不重复覆盖审计字段', async () => {
    const { service, patch } = createHarness(
      pendingPlan({ status: 'APPROVED', approvedBy: 'admin-1' }),
    );

    await expect(
      service.confirm(
        DRAFT_ID,
        { selectedRecordIds: ['r1'] },
        { userId: 'admin-1', now: NOW },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(patch).not.toHaveBeenCalled();
  });

  it('改成非法目标库 → 400', async () => {
    const { service } = createHarness(pendingPlan());

    await expect(
      service.confirm(
        DRAFT_ID,
        { libraries: ['GOOGLE'], selectedRecordIds: ['r1'] },
        { userId: 'admin-1', now: NOW },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
