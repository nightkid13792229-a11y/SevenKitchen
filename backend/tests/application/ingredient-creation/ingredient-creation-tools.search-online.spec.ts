import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationOnlineService } from '../../../src/application/ingredient-creation/ingredient-creation-online.service';
import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const DRAFT_ID = 'draft-1';
const RUN_ID = 'run-1';

function createHarness(
  searchOnline: jest.Mock,
  payload: Record<string, unknown> = {},
) {
  const draft = {
    id: DRAFT_ID,
    name: '兔肝',
    type: 'FOOD',
    step: 'INTAKE',
    payload,
    createdBy: 'admin-1',
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  };

  const draftService = {
    get: jest.fn(async () => draft),
    patch: jest.fn(async (_id: string, _step: string, next: Record<string, unknown>) => {
      Object.assign(draft.payload, next);
      return draft;
    }),
  };

  const tools = new IngredientCreationToolsService(
    {} as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    {} as unknown as IngredientCreationCheckService,
    {} as unknown as PrismaService,
    undefined,
    undefined,
    { searchOnline, searchOnlineLibrary: searchOnline } as unknown as IngredientCreationOnlineService,
  );

  return { tools, draftService };
}

describe('searchOnline · 本地 0 命中时的线上兜底', () => {
  it('把线上命中返回给模型，并把这次尝试记进草稿', async () => {
    const searchOnline = jest.fn(async () => ({
      candidates: [
        {
          sourceRecordId: 'online-1',
          sourceType: 'MANUAL',
          foodName: 'Rabbit, liver, raw',
          foodNameEn: 'Rabbit, liver, raw',
          preparationState: 'RAW',
          sourceUrl: 'https://example.test/rabbit-liver',
          fetchedAt: '2026-11-01T00:00:00.000Z',
          isOnline: true,
        },
      ],
      attemptedHosts: ['example.test'],
      rejectedHosts: [],
      discoveryStatus: 'OK' as const,
    }));
    const { tools, draftService } = createHarness(searchOnline);

    const result = await tools.execute({
      runId: RUN_ID,
      draftId: DRAFT_ID,
      name: 'searchOnline',
      args: {
        groups: [{ library: 'USDA', terms: ['兔肝', 'rabbit liver'] }],
        state: 'RAW',
      },
    });

    expect(result.ok).toBe(true);
    expect(searchOnline).toHaveBeenCalledWith({
      library: 'USDA',
      terms: ['兔肝', 'rabbit liver'],
      state: 'RAW',
    });
    const body = JSON.parse(result.content) as {
      total: number;
      groups: Array<{ library: string; matches: Array<{ id: string; name: string }> }>;
    };
    expect(body.total).toBe(1);
    expect(body.groups[0].matches[0]).toMatchObject({
      id: 'online-1',
      name: 'Rabbit, liver, raw',
    });
    expect(draftService.patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INTAKE',
      expect.objectContaining({
        onlineReport: [
          expect.objectContaining({
            library: 'USDA',
            name: '兔肝',
            total: 1,
            state: 'RAW',
          }),
        ],
      }),
    );
  });

  it('线上也 0 命中 → 提示先问用户，不要拿近似品凑数', async () => {
    const searchOnline = jest.fn(async () => ({
      candidates: [],
      attemptedHosts: ['example.test'],
      rejectedHosts: [],
      discoveryStatus: 'OK' as const,
    }));
    const { tools } = createHarness(searchOnline);

    const result = await tools.execute({
      runId: RUN_ID,
      draftId: DRAFT_ID,
      name: 'searchOnline',
      args: {
        groups: [{ library: 'USDA', terms: ['兔肝', 'rabbit liver'] }],
        state: 'RAW',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.content).toContain('不要拿近似原料凑数');
  });

  it('线上通道不可用 → 明确说“不可用”，不能当成 0 命中', async () => {
    const searchOnline = jest.fn(async () => ({
      candidates: [],
      attemptedHosts: [],
      rejectedHosts: [],
      discoveryStatus: 'UNAVAILABLE' as const,
    }));
    const { tools } = createHarness(searchOnline);

    const result = await tools.execute({
      runId: RUN_ID,
      draftId: DRAFT_ID,
      name: 'searchOnline',
      args: {
        groups: [{ library: 'USDA', terms: ['兔肝', 'rabbit liver'] }],
        state: 'RAW',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.content).toContain('不可用');
    expect(result.content).not.toContain('线上白名单也没有找到');
  });

  it('state 不是 RAW/COOKED → 拒绝', async () => {
    const searchOnline = jest.fn();
    const { tools } = createHarness(searchOnline);

    const result = await tools.execute({
      runId: RUN_ID,
      draftId: DRAFT_ID,
      name: 'searchOnline',
      args: {
        groups: [{ library: 'USDA', terms: ['兔肝'] }],
        state: 'DRY',
      },
    });

    expect(result.ok).toBe(false);
    expect(searchOnline).not.toHaveBeenCalled();
  });
});
