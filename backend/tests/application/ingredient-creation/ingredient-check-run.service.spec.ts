import { Test, type TestingModule } from '@nestjs/testing';
import {
  CHECK_RULES_VERSION,
  IngredientCheckRunService,
  type CheckRunView,
} from '../../../src/application/ingredient-creation/ingredient-check-run.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientDraftFinalCheckEvaluator } from '../../../src/application/ingredient-creation/ingredient-draft-final-check.evaluator';
import type {
  FinalCheckResult,
  IngredientCreationDraft,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import { hashDraftPayload } from '../../../src/domain/ingredient-creation/draft-payload-hash';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

const CREATED_AT = new Date('2026-10-26T08:00:00.000Z');

type PrismaMock = {
  ingredient: { findMany: jest.Mock };
  ingredientCheckRun: { create: jest.Mock; findFirst: jest.Mock };
};

function createDraft(
  overrides: Partial<IngredientCreationDraft> = {},
): IngredientCreationDraft {
  return {
    id: 'draft-1',
    name: '冷冻三文鱼',
    type: 'FOOD',
    step: 'INGREDIENT',
    payload: {
      ingredient: {
        name: '冷冻三文鱼',
        type: 'FOOD',
        baseUnit: 'G',
        unitDisplayLabel: '克',
      },
    },
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-26T07:00:00.000Z'),
    updatedAt: new Date('2026-10-26T07:00:00.000Z'),
    ...overrides,
  };
}

function checkItem(code: string): FinalCheckResult['blocking'][number] {
  return { code, message: `${code} message`, fieldPath: 'macros.crudeProtein' };
}

function runRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'run-1',
    draftId: 'draft-1',
    domain: 'INGREDIENT',
    trigger: 'USER',
    rulesVersion: CHECK_RULES_VERSION.INGREDIENT,
    payloadHash: 'hash-1',
    result: { blocking: [], exceptionable: [], warnings: [] },
    blockingCount: 0,
    exceptionableCount: 0,
    warningCount: 0,
    createdBy: 'admin-1',
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe('IngredientCheckRunService', () => {
  let service: IngredientCheckRunService;
  let prisma: PrismaMock;
  let draftService: { get: jest.Mock };
  let draft: IngredientCreationDraft;

  beforeEach(async () => {
    draft = createDraft();
    prisma = {
      ingredient: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      ingredientCheckRun: {
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              id: 'run-1',
              createdAt: CREATED_AT,
              ...data,
            }),
          ),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    draftService = {
      get: jest.fn().mockImplementation(() => Promise.resolve(draft)),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientCheckRunService,
        { provide: PrismaService, useValue: prisma },
        { provide: IngredientCreationDraftService, useValue: draftService },
      ],
    }).compile();

    service = moduleRef.get(IngredientCheckRunService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('runDomain · INGREDIENT', () => {
    it('只按 FOOD 类型查重名字，落一条带草稿哈希与计数的报告', async () => {
      prisma.ingredient.findMany.mockResolvedValue([
        { name: '冷冻三文鱼' },
        { name: '冷冻鳕鱼' },
      ]);

      const run = await service.runDomain('draft-1', 'INGREDIENT', 'USER');

      // 查重口径：只查 FOOD（补剂 / 包装同名不算重名），前缀取名字前 3 个字。
      expect(prisma.ingredient.findMany).toHaveBeenCalledWith({
        where: {
          type: 'FOOD',
          name: { contains: '冷冻三', mode: 'insensitive' },
        },
        select: { name: true },
        take: 200,
      });

      expect(run).toMatchObject({
        id: 'run-1',
        draftId: 'draft-1',
        domain: 'INGREDIENT',
        trigger: 'USER',
        rulesVersion: 'ingredient-card-v1',
        payloadHash: hashDraftPayload(draft.payload),
        counts: { blocking: 1, exceptionable: 0, warning: 0 },
        createdBy: 'admin-1',
      });
      expect(run.createdAt).toBe(CREATED_AT.toISOString());
      expect(run.result.blocking.map((item) => item.code)).toEqual([
        'NAME_DUPLICATE',
      ]);

      expect(prisma.ingredientCheckRun.create).toHaveBeenCalledWith({
        data: {
          draftId: 'draft-1',
          domain: 'INGREDIENT',
          trigger: 'USER',
          rulesVersion: 'ingredient-card-v1',
          payloadHash: hashDraftPayload(draft.payload),
          result: {
            blocking: [expect.objectContaining({ code: 'NAME_DUPLICATE' })],
            exceptionable: [],
            warnings: [],
          },
          blockingCount: 1,
          exceptionableCount: 0,
          warningCount: 0,
          createdBy: 'admin-1',
        },
      });
    });

    it('干净草稿零问题，计数全 0 也照样落库', async () => {
      const run = await service.runDomain('draft-1', 'INGREDIENT', 'USER');

      expect(run.counts).toEqual({
        blocking: 0,
        exceptionable: 0,
        warning: 0,
      });
      expect(run.result).toEqual({
        blocking: [],
        exceptionable: [],
        warnings: [],
      });
      expect(prisma.ingredientCheckRun.create).toHaveBeenCalledTimes(1);
    });

    it('原料卡还没填（或名字为空）时不查库，只报 NAME_REQUIRED', async () => {
      draft = createDraft({
        payload: {
          ingredient: {
            name: '   ',
            type: 'FOOD',
            baseUnit: 'G',
            unitDisplayLabel: '克',
          },
        },
      });

      const run = await service.runDomain('draft-1', 'INGREDIENT', 'USER');

      expect(prisma.ingredient.findMany).not.toHaveBeenCalled();
      expect(run.result.blocking.map((item) => item.code)).toEqual([
        'NAME_REQUIRED',
      ]);
      expect(run.counts.blocking).toBe(1);
    });

    it('没有原料卡（payload.ingredient 缺失）也不炸，报 NAME_REQUIRED', async () => {
      draft = createDraft({ payload: {} });

      const run = await service.runDomain('draft-1', 'INGREDIENT', 'USER');

      expect(prisma.ingredient.findMany).not.toHaveBeenCalled();
      expect(run.result.blocking.map((item) => item.code)).toEqual([
        'NAME_REQUIRED',
      ]);
    });

    it('原料卡是脏数据（不是对象）时也按没填处理', async () => {
      draft = createDraft({ payload: { ingredient: 'oops' as never } });

      const run = await service.runDomain('draft-1', 'INGREDIENT', 'USER');

      expect(prisma.ingredient.findMany).not.toHaveBeenCalled();
      expect(run.result.blocking.map((item) => item.code)).toEqual([
        'NAME_REQUIRED',
      ]);
    });

    it('controller 传入的 createdBy 优先于草稿创建人', async () => {
      const run = await service.runDomain(
        'draft-1',
        'INGREDIENT',
        'USER',
        'admin-2',
      );

      expect(run.createdBy).toBe('admin-2');
      expect(prisma.ingredientCheckRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdBy: 'admin-2' }),
        }),
      );
    });

    it('trigger 原样落库（AGENT / USER 都要能区分）', async () => {
      const run = await service.runDomain('draft-1', 'INGREDIENT', 'AGENT');

      expect(run.trigger).toBe('AGENT');
      expect(prisma.ingredientCheckRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ trigger: 'AGENT' }),
        }),
      );
    });
  });

  describe('runDomain · NUTRITION', () => {
    it('直接复用草稿终检结果（不重算），并按 final-check 版本落库', async () => {
      const nutritionResult: FinalCheckResult = {
        blocking: [
          checkItem('MACRO_SUM_OVER_100'),
          checkItem('ENERGY_MISMATCH'),
        ],
        exceptionable: [checkItem('FIBER_MISSING')],
        warnings: [checkItem('ASH_MISSING')],
      };
      const evaluate = jest
        .spyOn(IngredientDraftFinalCheckEvaluator.prototype, 'evaluate')
        .mockResolvedValue(nutritionResult);

      const run = await service.runDomain('draft-1', 'NUTRITION', 'USER');

      expect(evaluate).toHaveBeenCalledTimes(1);
      expect(evaluate).toHaveBeenCalledWith(draft);
      expect(run.domain).toBe('NUTRITION');
      expect(run.rulesVersion).toBe('final-check-v1');
      expect(run.payloadHash).toBe(hashDraftPayload(draft.payload));
      expect(run.result).toEqual(nutritionResult);
      expect(run.counts).toEqual({
        blocking: 2,
        exceptionable: 1,
        warning: 1,
      });
      expect(prisma.ingredientCheckRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            domain: 'NUTRITION',
            rulesVersion: 'final-check-v1',
            result: nutritionResult,
            blockingCount: 2,
            exceptionableCount: 1,
            warningCount: 1,
          }),
        }),
      );
      // 营养域不查原料名字。
      expect(prisma.ingredient.findMany).not.toHaveBeenCalled();
    });
  });

  describe('isFresh', () => {
    it('草稿内容没变就算新鲜，改过一格就作废', async () => {
      const run = await service.runDomain('draft-1', 'INGREDIENT', 'USER');

      expect(service.isFresh(run, draft)).toBe(true);
      // 同一毫秒内的改动也不能骗过它：判定只看内容哈希。
      expect(
        service.isFresh(run, {
          payload: {
            ingredient: {
              name: '冷冻三文鱼 带皮',
              type: 'FOOD',
              baseUnit: 'G',
              unitDisplayLabel: '克',
            },
          },
        }),
      ).toBe(false);
    });
  });

  describe('latestRuns', () => {
    it('两域各取最新一条；没有报告时返回 null', async () => {
      prisma.ingredientCheckRun.findFirst.mockImplementation(
        ({ where }: { where: { domain: string } }) =>
          Promise.resolve(
            where.domain === 'INGREDIENT'
              ? runRow({
                  id: 'run-ingredient',
                  domain: 'INGREDIENT',
                  payloadHash: hashDraftPayload(draft.payload),
                })
              : null,
          ),
      );

      const runs = await service.latestRuns('draft-1');

      expect(runs.INGREDIENT).toMatchObject({
        id: 'run-ingredient',
        domain: 'INGREDIENT',
        createdAt: CREATED_AT.toISOString(),
      });
      expect(runs.NUTRITION).toBeNull();
      expect(prisma.ingredientCheckRun.findFirst).toHaveBeenCalledWith({
        where: { draftId: 'draft-1', domain: 'INGREDIENT' },
        orderBy: { createdAt: 'desc' },
      });
      expect(prisma.ingredientCheckRun.findFirst).toHaveBeenCalledWith({
        where: { draftId: 'draft-1', domain: 'NUTRITION' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('把库里的行映射成完整视图（result / counts / 时间）', async () => {
      const result: FinalCheckResult = {
        blocking: [checkItem('NAME_REQUIRED')],
        exceptionable: [],
        warnings: [],
      };
      prisma.ingredientCheckRun.findFirst.mockImplementation(
        ({ where }: { where: { domain: string } }) =>
          Promise.resolve(
            where.domain === 'NUTRITION'
              ? runRow({
                  id: 'run-nutrition',
                  domain: 'NUTRITION',
                  rulesVersion: CHECK_RULES_VERSION.NUTRITION,
                  result,
                  blockingCount: 1,
                })
              : null,
          ),
      );

      const runs: Record<'INGREDIENT' | 'NUTRITION', CheckRunView | null> =
        await service.latestRuns('draft-1');

      expect(runs.NUTRITION).toEqual({
        id: 'run-nutrition',
        draftId: 'draft-1',
        domain: 'NUTRITION',
        trigger: 'USER',
        rulesVersion: 'final-check-v1',
        payloadHash: 'hash-1',
        result,
        counts: { blocking: 1, exceptionable: 0, warning: 0 },
        createdBy: 'admin-1',
        createdAt: CREATED_AT.toISOString(),
      });
    });
  });
});
