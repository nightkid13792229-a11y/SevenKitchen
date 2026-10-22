import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCommitService } from '../../../src/application/ingredient-creation/ingredient-creation-commit.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import type {
  FinalCheckResult,
  IngredientCreationDraft,
  MergePlan,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import { runFinalCheck } from '../../../src/domain/ingredient-creation/final-check';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { JwtAuthService } from '../../../src/interfaces/auth/jwt.service';
import { AuthGuard } from '../../../src/interfaces/auth/auth.guard';
import { IngredientCreationController } from '../../../src/interfaces/controllers/ingredient-creation.controller';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';

jest.mock('../../../src/domain/ingredient-creation/final-check', () => ({
  runFinalCheck: jest.fn(),
}));

const runFinalCheckMock = runFinalCheck as jest.MockedFunction<
  typeof runFinalCheck
>;

const BASE_PATH = '/api/v1/admin/ingredient-creation';
const ADMIN_TOKEN = 'admin-token';

type ServiceMock = Record<string, jest.Mock>;

function createDraft(
  overrides: Partial<IngredientCreationDraft> = {},
): IngredientCreationDraft {
  return {
    id: 'draft-1',
    name: '鸡肝',
    type: 'FOOD',
    step: 'SOURCES',
    payload: {},
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-22T00:00:00.000Z'),
    updatedAt: new Date('2026-10-22T00:00:00.000Z'),
    ...overrides,
  };
}

const mergePlan: MergePlan = {
  primarySourceRecordId: 'src-primary',
  rows: [
    {
      fieldPath: 'macros.crudeProtein',
      value: 20,
      unit: 'g',
      status: 'DIRECT',
      sourceRecordId: 'src-primary',
      sourceValue: 20,
      sourceUnit: 'g',
    },
  ],
  conflicts: [],
  missingFields: [],
};

const evidenceEntry = {
  fieldPath: 'macros.crudeProtein',
  finalValue: 20,
  unit: 'g',
  status: 'DIRECT' as const,
  sourceRecordId: 'src-primary',
  sourceValue: 20,
  sourceUnit: 'g',
  formula: null,
  confirmedBy: null,
  confirmedAt: null,
};

describe('IngredientCreationController', () => {
  let app: INestApplication;
  let controller: IngredientCreationController;
  let draftService: ServiceMock;
  let candidateService: ServiceMock;
  let commitService: ServiceMock;
  let prisma: {
    nutritionSourceRecord: { findMany: jest.Mock };
  };
  let jwtAuthService: { validateToken: jest.Mock };

  beforeEach(async () => {
    draftService = {
      create: jest.fn(),
      get: jest.fn(),
      patch: jest.fn(),
      appendProposal: jest.fn(),
    };
    candidateService = {
      findCandidates: jest.fn(),
    };
    commitService = {
      commit: jest.fn(),
    };
    prisma = {
      nutritionSourceRecord: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    jwtAuthService = {
      validateToken: jest.fn().mockReturnValue({
        userId: 'admin-1',
        customerId: 'admin-1',
        role: 'ADMIN',
      }),
    };
    runFinalCheckMock.mockReset();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [IngredientCreationController],
      providers: [
        { provide: IngredientCreationDraftService, useValue: draftService },
        {
          provide: IngredientCreationCandidateService,
          useValue: candidateService,
        },
        { provide: IngredientCreationCommitService, useValue: commitService },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtAuthService, useValue: jwtAuthService },
        AuthGuard,
        AdminGuard,
      ],
    }).compile();

    controller = moduleRef.get(IngredientCreationController);
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function http() {
    return request(app.getHttpServer());
  }

  function authorizedPost(path: string) {
    return http()
      .post(`${BASE_PATH}${path}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
  }

  function authorizedPatch(path: string) {
    return http()
      .patch(`${BASE_PATH}${path}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
  }

  describe('权限', () => {
    it('未带令牌访问 drafts → 401', async () => {
      await http().get(`${BASE_PATH}/drafts/draft-1`).expect(401);
    });

    it('带令牌时通过 AuthGuard 与 AdminGuard', async () => {
      draftService.get.mockResolvedValue(createDraft());

      const response = await http()
        .get(`${BASE_PATH}/drafts/draft-1`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);

      expect(response.body.code).toBe(0);
    });
  });

  describe('drafts', () => {
    it('POST drafts 返回 draftId 与 step=INTAKE', async () => {
      draftService.create.mockResolvedValue(
        createDraft({ step: 'INTAKE', payload: {} }),
      );

      const response = await authorizedPost('/drafts')
        .send({ name: '鸡肝' })
        .expect(201);

      expect(draftService.create).toHaveBeenCalledWith({
        name: '鸡肝',
        type: 'FOOD',
        createdBy: 'admin-1',
      });
      expect(response.body.data).toEqual({
        draftId: 'draft-1',
        step: 'INTAKE',
      });
    });

    it('GET drafts/:id 找不到草稿 → 404', async () => {
      draftService.get.mockRejectedValue(
        new NotFoundException('Ingredient creation draft missing not found'),
      );

      await http()
        .get(`${BASE_PATH}/drafts/missing`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(404);
    });

    it('PATCH drafts/:id 剥掉 payload.proposalHistory，服务收到的 payload 没有该键', async () => {
      draftService.patch.mockResolvedValue(
        createDraft({
          step: 'PROFILE',
          payload: {
            intake: {
              name: '鸡肝',
              nameEn: 'Chicken liver',
              aliases: [],
              confusables: [],
              category: 'MEAT_ORGAN',
              requiredStates: ['RAW'],
              suggestedStates: ['COOKED'],
            },
          },
        }),
      );

      const response = await authorizedPatch('/drafts/draft-1')
        .send({
          step: 'PROFILE',
          payload: {
            intake: {
              name: '鸡肝',
              category: 'MEAT_ORGAN',
            },
            profiles: [
              {
                preparationState: 'RAW',
                sourceRecordId: 'src-primary',
                entries: [],
                notes: null,
              },
            ],
            proposalHistory: [
              { kind: 'MERGE', createdAt: '2026-10-22T00:00:00.000Z' },
            ],
          },
        })
        .expect(200);

      expect(draftService.patch).toHaveBeenCalledTimes(1);
      const [, step, payload] = draftService.patch.mock.calls[0];
      expect(step).toBe('PROFILE');
      expect(payload).not.toHaveProperty('proposalHistory');
      expect(payload).toMatchObject({
        intake: { name: '鸡肝', category: 'MEAT_ORGAN' },
      });
      // 终检的覆盖判断需要草稿里的档案状态，DTO 不能把它当未知键剥掉。
      expect(payload.profiles).toHaveLength(1);
      expect(response.body.data.step).toBe('PROFILE');
    });

    it('PATCH drafts/:id 非法 category → 400', async () => {
      await authorizedPatch('/drafts/draft-1')
        .send({
          step: 'PROFILE',
          payload: { intake: { category: 'NOT_A_CATEGORY' } },
        })
        .expect(400);

      expect(draftService.patch).not.toHaveBeenCalled();
    });
  });

  describe('candidates', () => {
    it('非法 state → 400，且不调用候选服务', async () => {
      await authorizedPost('/drafts/draft-1/candidates')
        .send({ name: '鸡肝', state: 'FRIED' })
        .expect(400);

      expect(candidateService.findCandidates).not.toHaveBeenCalled();
    });

    it('草稿不存在 → 404，且不调用候选服务', async () => {
      draftService.get.mockRejectedValue(
        new NotFoundException('Ingredient creation draft missing not found'),
      );

      await authorizedPost('/drafts/missing/candidates')
        .send({ name: '鸡肝', state: 'RAW' })
        .expect(404);

      expect(candidateService.findCandidates).not.toHaveBeenCalled();
    });

    it('合法 state 时转发给候选服务并返回 excludedCount/coverage', async () => {
      draftService.get.mockResolvedValue(createDraft());
      const result = {
        candidates: [],
        excludedCount: 2,
        coverage: {
          state: 'RAW',
          candidateCount: 0,
          bestCoveragePercent: null,
          bestMissingFieldCount: null,
        },
      };
      candidateService.findCandidates.mockResolvedValue(result);

      const response = await authorizedPost('/drafts/draft-1/candidates')
        .send({ name: '鸡肝', nameEn: 'Chicken liver', state: 'RAW' })
        .expect(201);

      expect(candidateService.findCandidates).toHaveBeenCalledTimes(1);
      expect(candidateService.findCandidates).toHaveBeenCalledWith({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'RAW',
      });
      expect(response.body.data).toEqual(result);
    });
  });

  describe('merge', () => {
    it('把 normalizedNutrition 适配成 SourceNutrition 并返回 MergePlan', async () => {
      draftService.get.mockResolvedValue(createDraft());
      draftService.patch.mockResolvedValue(createDraft());
      prisma.nutritionSourceRecord.findMany.mockResolvedValue([
        {
          id: 'src-primary',
          sourceType: 'USDA',
          normalizedNutrition: {
            meta: { rawBasisType: 'PER_100_G', sampleState: 'RAW' },
            macros: { crudeProtein: 20 },
          },
        },
        {
          id: 'src-supplemental',
          sourceType: 'CNF',
          normalizedNutrition: {
            meta: { rawBasisType: 'PER_100_G' },
            macros: { crudeFat: 5 },
          },
        },
      ]);

      const response = await authorizedPost('/drafts/draft-1/merge')
        .send({
          primarySourceRecordId: 'src-primary',
          supplementalSourceRecordIds: ['src-supplemental'],
        })
        .expect(201);

      const plan = response.body.data as MergePlan;
      expect(plan.primarySourceRecordId).toBe('src-primary');
      const protein = plan.rows.find(
        (row) => row.fieldPath === 'macros.crudeProtein',
      );
      const fat = plan.rows.find((row) => row.fieldPath === 'macros.crudeFat');
      expect(protein).toMatchObject({ status: 'DIRECT', value: 20 });
      expect(fat).toMatchObject({ status: 'FILLED', value: 5 });
      expect(draftService.patch).toHaveBeenCalledWith('draft-1', 'SOURCES', {
        mergePlan: plan,
      });
    });

    it('merge/resolve 的领域层普通 Error 映射成 400', async () => {
      draftService.get.mockResolvedValue(
        createDraft({ payload: { mergePlan } }),
      );

      const response = await authorizedPost('/drafts/draft-1/merge/resolve')
        .send({ fieldPath: 'minerals.iron', sourceRecordId: 'src-primary' })
        .expect(400);

      expect(response.body.message).toContain('No unresolved conflict');
      expect(draftService.patch).not.toHaveBeenCalled();
    });
  });

  describe('check', () => {
    it('只调用一次 runFinalCheck，不在控制器里重算', async () => {
      draftService.get.mockResolvedValue(
        createDraft({
          payload: {
            intake: {
              name: '鸡肝',
              nameEn: 'Chicken liver',
              aliases: [],
              confusables: [],
              category: 'MEAT_ORGAN',
              requiredStates: ['RAW'],
              suggestedStates: ['COOKED'],
            },
            profiles: [
              { preparationState: 'RAW' },
              { preparationState: 'COOKED' },
            ],
            mergePlan,
          } as never,
        }),
      );
      prisma.nutritionSourceRecord.findMany.mockResolvedValue([
        {
          id: 'src-primary',
          sourceType: 'USDA',
          normalizedNutrition: {
            meta: { rawBasisType: 'PER_100_G', sampleState: 'RAW' },
            macros: { crudeProtein: 20 },
          },
        },
      ]);
      const checkResult: FinalCheckResult = {
        blocking: [],
        exceptionable: [],
        warnings: [],
      };
      runFinalCheckMock.mockReturnValue(checkResult);

      const response = await authorizedPost('/drafts/draft-1/check').expect(
        201,
      );

      expect(runFinalCheckMock).toHaveBeenCalledTimes(1);
      expect(draftService.get).toHaveBeenCalledTimes(1);
      expect(response.body.data).toEqual(checkResult);

      const input = runFinalCheckMock.mock.calls[0][0];
      expect(input.entries).toHaveLength(1);
      expect(input.entries[0]).toMatchObject({
        fieldPath: 'macros.crudeProtein',
        finalValue: 20,
        unit: 'g',
      });
      expect(input.coverage).toEqual({
        required: ['RAW'],
        present: ['RAW', 'COOKED'],
      });
    });
  });

  describe('commit', () => {
    const commitBody = {
      ingredient: {
        name: '鸡肝',
        type: 'FOOD',
        baseUnit: 'G',
        unitDisplayLabel: '克',
        cfctClass: '畜肉类',
        edibleYieldRate: 0.95,
      },
      profiles: [
        {
          preparationState: 'RAW',
          sourceRecordId: 'src-primary',
          entries: [evidenceEntry],
          notes: null,
        },
        {
          preparationState: 'COOKED',
          sourceRecordId: 'src-cooked',
          entries: [{ ...evidenceEntry, sourceRecordId: 'src-cooked' }],
          notes: null,
        },
      ],
      primaryProfileIndex: 0,
    };

    it('只调用一次 commit 服务，并传 userId', async () => {
      commitService.commit.mockResolvedValue({
        ingredientId: 'ing-1',
        nutritionFoodIds: ['nf-1', 'nf-2'],
        auditId: 'audit-1',
      });

      const response = await authorizedPost('/drafts/draft-1/commit')
        .send(commitBody)
        .expect(201);

      expect(commitService.commit).toHaveBeenCalledTimes(1);
      const input = commitService.commit.mock.calls[0][0];
      expect(input).toMatchObject({
        draftId: 'draft-1',
        userId: 'admin-1',
        primaryProfileIndex: 0,
        ingredient: {
          name: '鸡肝',
          type: 'FOOD',
          baseUnit: 'G',
          unitDisplayLabel: '克',
        },
      });
      expect(input.profiles).toHaveLength(2);
      expect(response.body.data).toEqual({
        ingredientId: 'ing-1',
        nutritionFoodIds: ['nf-1', 'nf-2'],
        auditId: 'audit-1',
      });
    });

    it('同一 preparationState 出现两份 → 400，且不调用 commit 服务', async () => {
      const duplicatedBody = {
        ...commitBody,
        profiles: [
          commitBody.profiles[0],
          { ...commitBody.profiles[1], preparationState: 'RAW' },
        ],
      };

      await authorizedPost('/drafts/draft-1/commit')
        .send(duplicatedBody)
        .expect(400);

      expect(commitService.commit).not.toHaveBeenCalled();
    });

    it('commit 缺 ingredient 字段 → 400', async () => {
      await authorizedPost('/drafts/draft-1/commit')
        .send({
          profiles: commitBody.profiles,
          primaryProfileIndex: 0,
        })
        .expect(400);

      expect(commitService.commit).not.toHaveBeenCalled();
    });

    it('profiles 为空 → 400', async () => {
      await authorizedPost('/drafts/draft-1/commit')
        .send({
          ingredient: commitBody.ingredient,
          profiles: [],
          primaryProfileIndex: 0,
        })
        .expect(400);

      expect(commitService.commit).not.toHaveBeenCalled();
    });
  });

  // 控制器方法可以直接调用（绕过管道）时也要剥掉 proposalHistory —— 服务层兜底之外的显式防线。
  it('直接调用 updateDraft 时也会剥掉 proposalHistory', async () => {
    draftService.patch.mockResolvedValue(createDraft());

    await controller.updateDraft('draft-1', {
      step: 'PROFILE',
      payload: {
        intake: { category: 'MEAT_ORGAN' },
        proposalHistory: [
          { kind: 'MERGE', createdAt: '2026-10-22T00:00:00.000Z' },
        ],
      },
    } as never);

    const payload = draftService.patch.mock.calls[0][2];
    expect(payload).not.toHaveProperty('proposalHistory');
  });

  // 第二道防线在服务层：即便有人绕过 HTTP/管道直接调 patch，也不能覆盖 AI 提案历史。
  it('草稿服务 patch 的兜底也会剥掉 proposalHistory', async () => {
    const rawQuery = jest.fn().mockResolvedValue([]);
    const service = new IngredientCreationDraftService({
      $queryRaw: rawQuery,
    } as never);

    await expect(
      service.patch('draft-1', 'PROFILE', {
        intake: {
          name: '鸡肝',
          nameEn: 'Chicken liver',
          aliases: [],
          confusables: [],
          category: 'MEAT_ORGAN',
          requiredStates: ['RAW'],
          suggestedStates: ['COOKED'],
        },
        proposalHistory: [
          { kind: 'MERGE', createdAt: '2026-10-22T00:00:00.000Z' },
        ],
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    const serializedPayload = JSON.parse(rawQuery.mock.calls[0][1] as string);
    expect(serializedPayload).not.toHaveProperty('proposalHistory');
    expect(serializedPayload).toMatchObject({
      intake: { name: '鸡肝', category: 'MEAT_ORGAN' },
    });
  });
});
