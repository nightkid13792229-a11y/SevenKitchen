import {
  BadRequestException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationAuditService } from '../../../src/application/ingredient-creation/ingredient-creation-audit.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationCommitService } from '../../../src/application/ingredient-creation/ingredient-creation-commit.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationIntakeService } from '../../../src/application/ingredient-creation/ingredient-creation-intake.service';
import { IngredientCreationMergeService } from '../../../src/application/ingredient-creation/ingredient-creation-merge.service';
import { IngredientCreationOnlineService } from '../../../src/application/ingredient-creation/ingredient-creation-online.service';
import type {
  FinalCheckResult,
  IngredientCreationDraft,
  MergePlan,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import { JwtAuthService } from '../../../src/interfaces/auth/jwt.service';
import { AuthGuard } from '../../../src/interfaces/auth/auth.guard';
import { IngredientCreationController } from '../../../src/interfaces/controllers/ingredient-creation.controller';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';

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

describe('IngredientCreationController', () => {
  let app: INestApplication;
  let controller: IngredientCreationController;
  let draftService: ServiceMock;
  let candidateService: ServiceMock;
  let onlineService: ServiceMock;
  let mergeService: ServiceMock;
  let checkService: ServiceMock;
  let commitService: ServiceMock;
  let auditService: ServiceMock;
  let jwtAuthService: { validateToken: jest.Mock };

  beforeEach(async () => {
    draftService = {
      create: jest.fn(),
      get: jest.fn(),
      patch: jest.fn(),
      listUnfinished: jest.fn(),
    };
    candidateService = {
      findCandidates: jest.fn(),
    };
    onlineService = {
      searchOnline: jest.fn(),
    };
    mergeService = {
      createMergePlan: jest.fn(),
      resolveConflict: jest.fn(),
    };
    checkService = {
      runCheck: jest.fn(),
      assertCommitAllowed: jest.fn(),
    };
    commitService = {
      commit: jest.fn(),
    };
    auditService = {
      getByIngredientId: jest.fn(),
    };
    jwtAuthService = {
      validateToken: jest.fn().mockReturnValue({
        userId: 'admin-1',
        customerId: 'admin-1',
        role: 'ADMIN',
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [IngredientCreationController],
      providers: [
        { provide: IngredientCreationDraftService, useValue: draftService },
        {
          provide: IngredientCreationCandidateService,
          useValue: candidateService,
        },
        {
          provide: IngredientCreationOnlineService,
          useValue: onlineService,
        },
        { provide: IngredientCreationMergeService, useValue: mergeService },
        { provide: IngredientCreationCheckService, useValue: checkService },
        { provide: IngredientCreationCommitService, useValue: commitService },
        { provide: IngredientCreationAuditService, useValue: auditService },
        {
          provide: IngredientCreationIntakeService,
          useValue: { classify: jest.fn() },
        },
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
    it('GET drafts 返回当前登录人的未完成草稿摘要', async () => {
      const updatedAt = new Date('2026-10-22T03:04:05.000Z');
      draftService.listUnfinished.mockResolvedValue([
        {
          draftId: 'draft-1',
          name: '鸡肝',
          step: 'SOURCES',
          updatedAt,
          intake: { nameEn: 'Chicken liver' },
        },
      ]);

      const response = await http()
        .get(`${BASE_PATH}/drafts`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);

      expect(draftService.listUnfinished).toHaveBeenCalledWith('admin-1');
      expect(response.body.data).toEqual([
        {
          draftId: 'draft-1',
          name: '鸡肝',
          step: 'SOURCES',
          updatedAt: updatedAt.toISOString(),
          intake: { nameEn: 'Chicken liver' },
        },
      ]);
    });

    it('GET drafts 未带令牌 → 401', async () => {
      await http().get(`${BASE_PATH}/drafts`).expect(401);

      expect(draftService.listUnfinished).not.toHaveBeenCalled();
    });

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

    it('PATCH drafts/:id 剥掉 payload.proposalHistory，保留 profiles', async () => {
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
                entries: [evidenceEntry],
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

    it('PATCH drafts/:id 保留 intake.notes，不被 whitelist 剥掉', async () => {
      draftService.patch.mockResolvedValue(
        createDraft({
          step: 'SOURCES',
          payload: {
            intake: {
              name: '鸡肝',
              nameEn: 'Chicken liver',
              aliases: [],
              confusables: [],
              category: 'MEAT_ORGAN',
              requiredStates: ['RAW'],
              suggestedStates: ['COOKED'],
              notes: '用户原话',
            },
          },
        }),
      );

      await authorizedPatch('/drafts/draft-1')
        .send({
          step: 'SOURCES',
          payload: {
            intake: {
              name: '鸡肝',
              nameEn: 'Chicken liver',
              category: 'MEAT_ORGAN',
              requiredStates: ['RAW'],
              suggestedStates: ['COOKED'],
              notes: '用户原话',
            },
          },
        })
        .expect(200);

      expect(draftService.patch).toHaveBeenCalledTimes(1);
      const [, step, payload] = draftService.patch.mock.calls[0];
      expect(step).toBe('SOURCES');
      // 备注是 ① 站的人工输入，必须原样落到草稿 payload；whitelist 一旦漏声明
      // 就会静默剥掉，页面上看不出任何报错，事后也查不到用户写了什么。
      expect(payload).toMatchObject({
        intake: {
          name: '鸡肝',
          nameEn: 'Chicken liver',
          category: 'MEAT_ORGAN',
          notes: '用户原话',
        },
      });
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

    it('PATCH drafts/:id 的 profiles 形状非法 → 400', async () => {
      await authorizedPatch('/drafts/draft-1')
        .send({
          step: 'PROFILE',
          payload: {
            profiles: [
              {
                preparationState: 'FRIED',
                sourceRecordId: 'src-primary',
                entries: [evidenceEntry],
              },
            ],
          },
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
    it('merge 只转发给缝合服务一次', async () => {
      mergeService.createMergePlan.mockResolvedValue(mergePlan);

      const response = await authorizedPost('/drafts/draft-1/merge')
        .send({
          primarySourceRecordId: 'src-primary',
          supplementalSourceRecordIds: ['src-supplemental'],
        })
        .expect(201);

      expect(mergeService.createMergePlan).toHaveBeenCalledTimes(1);
      expect(mergeService.createMergePlan).toHaveBeenCalledWith('draft-1', {
        primarySourceRecordId: 'src-primary',
        supplementalSourceRecordIds: ['src-supplemental'],
      });
      expect(response.body.data).toEqual(mergePlan);
    });

    it('merge/resolve 只转发人工裁决，不碰提案历史', async () => {
      const resolved: MergePlan = { ...mergePlan, conflicts: [] };
      mergeService.resolveConflict.mockResolvedValue(resolved);

      const response = await authorizedPost('/drafts/draft-1/merge/resolve')
        .send({ fieldPath: 'minerals.iron', sourceRecordId: 'src-primary' })
        .expect(201);

      expect(mergeService.resolveConflict).toHaveBeenCalledTimes(1);
      expect(mergeService.resolveConflict).toHaveBeenCalledWith('draft-1', {
        fieldPath: 'minerals.iron',
        sourceRecordId: 'src-primary',
      });
      expect(draftService.patch).not.toHaveBeenCalled();
      expect(response.body.data).toEqual(resolved);
    });
  });

  describe('check', () => {
    it('check 只调用终检服务一次', async () => {
      const result: FinalCheckResult = {
        blocking: [],
        exceptionable: [],
        warnings: [],
      };
      checkService.runCheck.mockResolvedValue(result);

      const response = await authorizedPost('/drafts/draft-1/check').expect(
        201,
      );

      expect(checkService.runCheck).toHaveBeenCalledTimes(1);
      expect(checkService.runCheck).toHaveBeenCalledWith('draft-1');
      expect(response.body.data).toEqual(result);
    });
  });

  describe('commit', () => {
    it('先做提交前置检查，再调用 commit 服务一次', async () => {
      checkService.assertCommitAllowed.mockResolvedValue(undefined);
      commitService.commit.mockResolvedValue({
        ingredientId: 'ing-1',
        nutritionFoodIds: ['nf-1', 'nf-2'],
        auditId: 'audit-1',
      });

      const response = await authorizedPost('/drafts/draft-1/commit')
        .send(commitBody)
        .expect(201);

      expect(checkService.assertCommitAllowed).toHaveBeenCalledTimes(1);
      expect(checkService.assertCommitAllowed).toHaveBeenCalledWith('draft-1');
      expect(commitService.commit).toHaveBeenCalledTimes(1);
      expect(
        checkService.assertCommitAllowed.mock.invocationCallOrder[0],
      ).toBeLessThan(commitService.commit.mock.invocationCallOrder[0]);

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

    it('终检有 blocking 时 commit 服务一次都不调用', async () => {
      const blocking = [{ code: 'UNIT_NOT_ALLOWED', message: '单位不合法' }];
      checkService.assertCommitAllowed.mockRejectedValue(
        new BadRequestException({
          message: '终检存在阻断项，不能提交',
          blocking,
        }),
      );

      const response = await authorizedPost('/drafts/draft-1/commit')
        .send(commitBody)
        .expect(400);

      expect(commitService.commit).not.toHaveBeenCalled();
      expect(response.body.blocking).toEqual(blocking);
    });

    it('同一 preparationState 出现两份 → 400，且不调用任何服务', async () => {
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

      expect(checkService.assertCommitAllowed).not.toHaveBeenCalled();
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

    it('entry 的 finalValue 是字符串 → 400，不做隐式转换', async () => {
      await authorizedPost('/drafts/draft-1/commit')
        .send({
          ...commitBody,
          profiles: [
            {
              ...commitBody.profiles[0],
              entries: [{ ...evidenceEntry, finalValue: '20.4' }],
            },
          ],
        })
        .expect(400);

      expect(commitService.commit).not.toHaveBeenCalled();
    });

    it('entry 的 fieldPath 不是字符串 → 400', async () => {
      await authorizedPost('/drafts/draft-1/commit')
        .send({
          ...commitBody,
          profiles: [
            {
              ...commitBody.profiles[0],
              entries: [{ ...evidenceEntry, fieldPath: 123 }],
            },
          ],
        })
        .expect(400);

      expect(commitService.commit).not.toHaveBeenCalled();
    });

    it('entry 是 null → 400，不落 500', async () => {
      await authorizedPost('/drafts/draft-1/commit')
        .send({
          ...commitBody,
          profiles: [
            {
              ...commitBody.profiles[0],
              entries: [null],
            },
          ],
        })
        .expect(400);

      expect(commitService.commit).not.toHaveBeenCalled();
    });

    it('缺失字段用 null 仍然放行', async () => {
      checkService.assertCommitAllowed.mockResolvedValue(undefined);
      commitService.commit.mockResolvedValue({
        ingredientId: 'ing-1',
        nutritionFoodIds: ['nf-1'],
        auditId: 'audit-1',
      });

      const nullEntry = {
        fieldPath: 'macros.crudeProtein',
        finalValue: null,
        unit: 'g',
        status: 'DIRECT',
        sourceRecordId: null,
        sourceValue: null,
        sourceUnit: null,
        formula: null,
        confirmedBy: null,
        confirmedAt: null,
      };

      await authorizedPost('/drafts/draft-1/commit')
        .send({
          ingredient: commitBody.ingredient,
          profiles: [
            {
              preparationState: 'RAW',
              sourceRecordId: 'src-primary',
              entries: [nullEntry],
              notes: null,
            },
          ],
          primaryProfileIndex: 0,
        })
        .expect(201);

      expect(commitService.commit).toHaveBeenCalledTimes(1);
      expect(
        commitService.commit.mock.calls[0][0].profiles[0].entries[0],
      ).toMatchObject({
        finalValue: null,
        sourceRecordId: null,
        sourceValue: null,
        sourceUnit: null,
      });
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
});
