import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const DRAFT_ID = 'draft-1';
const RUN_ID = 'run-1';

function createDraft(payload: Record<string, unknown> = {}) {
  const draft = {
    id: DRAFT_ID,
    name: '鸡蛋清',
    type: 'FOOD',
    step: 'INGREDIENT',
    payload,
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-31T00:00:00.000Z'),
    updatedAt: new Date('2026-10-31T00:00:00.000Z'),
  };
  const draftService = {
    get: jest.fn(async () => draft),
    patch: jest.fn(async (_id: string, _step: string, next: unknown) => ({
      ...draft,
      payload: { ...draft.payload, ...(next as Record<string, unknown>) },
    })),
  };
  return { draft, draftService };
}

function createTools(
  searchByLibrary: jest.Mock,
  draftService: unknown,
): IngredientCreationToolsService {
  return new IngredientCreationToolsService(
    { searchByLibrary } as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    { runCheck: jest.fn() } as unknown as IngredientCreationCheckService,
    { nutritionSourceRecord: { findUnique: jest.fn() } } as unknown as PrismaService,
  );
}

describe('searchLibraries · 不筛不排，并把每轮检索记进草稿', () => {
  it('把每个库的词、命中数追加进 searchReport', async () => {
    const { draftService } = createDraft();
    const searchByLibrary = jest.fn(async ({ library }: { library: string }) => ({
      library,
      total: library === 'CFCT' ? 15 : 10,
      hits: [],
    }));
    const tools = createTools(searchByLibrary, draftService);

    await tools.execute({
      runId: RUN_ID,
      draftId: DRAFT_ID,
      name: 'searchLibraries',
      args: {
        groups: [
          { library: 'CFCT', terms: ['鸡蛋白', '鸡蛋清'] },
          { library: 'TFDA', terms: ['雞蛋白'] },
        ],
      },
    });

    expect(draftService.patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INGREDIENT',
      expect.objectContaining({
        searchReport: expect.arrayContaining([
          expect.objectContaining({
            library: 'CFCT',
            terms: ['鸡蛋白', '鸡蛋清'],
            total: 15,
          }),
          expect.objectContaining({ library: 'TFDA', total: 10 }),
        ]),
      }),
    );
  });

  it('多轮检索追加，不覆盖已有记录', async () => {
    const { draftService } = createDraft({
      searchReport: [
        { library: 'CFCT', terms: ['蛋清'], total: 3, at: '2026-10-31T00:00:00.000Z' },
      ],
    });
    const searchByLibrary = jest.fn(async ({ library }: { library: string }) => ({
      library,
      total: 15,
      hits: [],
    }));
    const tools = createTools(searchByLibrary, draftService);

    await tools.execute({
      runId: RUN_ID,
      draftId: DRAFT_ID,
      name: 'searchLibraries',
      args: { groups: [{ library: 'CFCT', terms: ['鸡蛋白'] }] },
    });

    const patch = draftService.patch.mock.calls[0][2] as {
      searchReport: Array<{ terms: string[] }>;
    };
    expect(patch.searchReport).toHaveLength(2);
    expect(patch.searchReport[0].terms).toEqual(['蛋清']);
  });
});

describe('IngredientCreationCandidateService · searchByLibrary', () => {
  function createService(rows: Array<Record<string, unknown>>) {
    const prisma = {
      nutritionSourceRecord: { findMany: jest.fn(async () => rows) },
    };
    return {
      prisma,
      service: new IngredientCreationCandidateService(
        prisma as unknown as PrismaService,
      ),
    };
  }

  it('不按分数过滤：低分记录也返回', async () => {
    const { service } = createService([
      {
        id: 'white-sausage',
        foodName: '蛋清肠',
        foodNameEn: null,
        sourceType: 'CFCT',
        sourceKey: '1',
      },
      {
        id: 'egg-white',
        foodName: '鸡蛋白',
        foodNameEn: null,
        sourceType: 'CFCT',
        sourceKey: '2',
      },
    ]);

    const result = await service.searchByLibrary({
      library: 'CFCT',
      terms: ['鸡蛋白'],
    });

    expect(result.hits.map((hit) => hit.name).sort()).toEqual(
      ['鸡蛋白', '蛋清肠'].sort(),
    );
    expect(result.total).toBe(2);
  });

  it('最多返回 100 条，total 是截断前数量；排序确定', async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({
      id: `rec-${String(index).padStart(3, '0')}`,
      foodName: `鸡蛋白 ${String(index).padStart(3, '0')}`,
      foodNameEn: null,
      sourceType: 'CFCT',
      sourceKey: String(index),
    }));
    const { service } = createService(rows);

    const result = await service.searchByLibrary({
      library: 'CFCT',
      terms: ['鸡蛋白'],
    });

    expect(result.total).toBe(120);
    expect(result.hits).toHaveLength(100);
    expect(result.hits[0].name).toBe('鸡蛋白 000');
  });
});
