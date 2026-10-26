import {
  BadRequestException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientDraftAgentService } from '../../../src/application/ingredient-creation/ingredient-draft-agent.service';
import { IngredientCreationAuditService } from '../../../src/application/ingredient-creation/ingredient-creation-audit.service';
import { IngredientCreationAuthorizeService } from '../../../src/application/ingredient-creation/ingredient-creation-authorize.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
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
    // 这四项不在旧控制器的手挑白名单里：只要控制器又退回「逐字段挑」，
    // 下面断言 input.ingredient 时就会红。
    brand: '××水产',
    weightG: 150,
    purchaseToBaseRatio: 1000,
    productionLossRate: 1.05,
    procurementStrategy: 'DAILY_PURCHASE',
    addTiming: 'BEFORE_MEAL',
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
  let authorizeService: ServiceMock;
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
      runDomain: jest.fn(),
      latestChecks: jest.fn(),
    };
    authorizeService = {
      authorize: jest.fn(),
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
        {
          provide: IngredientCreationAuthorizeService,
          useValue: authorizeService,
        },
        { provide: IngredientCreationAuditService, useValue: auditService },
        {
          provide: IngredientCreationIntakeService,
          useValue: { classify: jest.fn() },
        },
        {
          provide: IngredientDraftAgentService,
          useValue: { run: jest.fn() },
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

    it('GET drafts/:id 原样返回审核页需要的 payload（原料卡 / 档案 / 证据 / 终检）', async () => {
      const payload = {
        ingredient: {
          name: '鸡肝',
          nameEn: 'Chicken liver',
          type: 'FOOD' as const,
          category: 'MEAT_ORGAN' as const,
          baseUnit: 'G' as const,
          unitDisplayLabel: '克',
          cfctClass: '禽肉类及制品',
          edibleYieldRate: 0.95,
          manualFields: ['edibleYieldPercent' as const],
        },
        profiles: [
          {
            preparationState: 'RAW' as const,
            sourceRecordId: 'src-primary',
            entries: [evidenceEntry],
            notes: null,
          },
        ],
        evidence: [evidenceEntry],
        checks: { blocking: [], exceptionable: [], warnings: [] },
      };
      draftService.get.mockResolvedValue(
        createDraft({ step: 'INGREDIENT', payload }),
      );

      const response = await http()
        .get(`${BASE_PATH}/drafts/draft-1`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);

      expect(draftService.get).toHaveBeenCalledWith('draft-1');
      expect(response.body.data.payload).toEqual(payload);
      expect(response.body.data.payload.ingredient.manualFields).toEqual([
        'edibleYieldPercent',
      ]);
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

    it('PATCH drafts/:id 保留 ingredient.manualFields（人工改动标记不被 whitelist 剥掉）', async () => {
      draftService.patch.mockResolvedValue(
        createDraft({ step: 'INGREDIENT', payload: {} }),
      );

      await authorizedPatch('/drafts/draft-1')
        .send({
          step: 'INGREDIENT',
          payload: {
            ingredient: {
              name: '鸡肝',
              nameEn: 'Chicken liver',
              type: 'FOOD',
              category: 'MEAT_ORGAN',
              baseUnit: 'G',
              unitDisplayLabel: '克',
              cfctClass: '禽肉类及制品',
              edibleYieldRate: 0.95,
              manualFields: ['name', 'edibleYieldPercent'],
            },
          },
        })
        .expect(200);

      expect(draftService.patch).toHaveBeenCalledTimes(1);
      const payload = draftService.patch.mock.calls[0][2];
      // 人工标记是 AI 工具跳过覆盖的唯一依据，绝不能在这一层丢掉。
      expect(payload.ingredient).toMatchObject({
        name: '鸡肝',
        category: 'MEAT_ORGAN',
        edibleYieldRate: 0.95,
        manualFields: ['name', 'edibleYieldPercent'],
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

  describe('按域核验', () => {
    it('POST checks 固定用 USER + 当前登录人触发，前端传 trigger 会被丢掉', async () => {
      const run = {
        id: 'run-1',
        draftId: 'draft-1',
        domain: 'INGREDIENT',
        trigger: 'USER',
        rulesVersion: 'ingredient-card-v1',
        payloadHash: 'hash-1',
        result: { blocking: [], exceptionable: [], warnings: [] },
        counts: { blocking: 0, exceptionable: 0, warning: 0 },
        createdBy: 'admin-1',
        createdAt: '2026-10-26T08:00:00.000Z',
      };
      checkService.runDomain.mockResolvedValue(run);

      const response = await authorizedPost('/drafts/draft-1/checks')
        .send({ domain: 'INGREDIENT', trigger: 'AGENT' })
        .expect(201);

      expect(checkService.runDomain).toHaveBeenCalledWith(
        'draft-1',
        'INGREDIENT',
        'USER',
        'admin-1',
      );
      expect(response.body.data).toEqual(run);
    });

    it('POST checks 域不在词表里 → 400', async () => {
      await authorizedPost('/drafts/draft-1/checks')
        .send({ domain: 'OVEN' })
        .expect(400);

      expect(checkService.runDomain).not.toHaveBeenCalled();
    });

    it('GET checks 返回两域报告与过期判定', async () => {
      const view = {
        ingredient: null,
        nutrition: null,
        fresh: { ingredient: false, nutrition: false },
      };
      checkService.latestChecks.mockResolvedValue(view);

      const response = await http()
        .get(`${BASE_PATH}/drafts/draft-1/checks`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);

      expect(checkService.latestChecks).toHaveBeenCalledWith('draft-1');
      expect(response.body.data).toEqual(view);
    });
  });

  describe('commit', () => {
    it('带全量旧 body 也能通过，且 body 的 ingredient / profiles 被忽略', async () => {
      authorizeService.authorize.mockResolvedValue({
        ingredientId: 'ing-1',
        nutritionFoodIds: ['nf-1', 'nf-2'],
        auditId: 'audit-1',
        authorizedAt: '2026-10-26T08:00:00.000Z',
      });

      const response = await authorizedPost('/drafts/draft-1/commit')
        .send(commitBody)
        .expect(201);

      expect(authorizeService.authorize).toHaveBeenCalledTimes(1);
      expect(authorizeService.authorize).toHaveBeenCalledWith({
        draftId: 'draft-1',
        userId: 'admin-1',
        primaryProfileIndex: 0,
      });
      expect(response.body.data).toEqual({
        ingredientId: 'ing-1',
        nutritionFoodIds: ['nf-1', 'nf-2'],
        auditId: 'audit-1',
        authorizedAt: '2026-10-26T08:00:00.000Z',
      });
    });

    it('请求体里的 ingredient / profiles 不进入授权入参（写入只认草稿）', async () => {
      authorizeService.authorize.mockResolvedValue({
        ingredientId: 'ing-1',
        nutritionFoodIds: ['nf-1'],
        auditId: 'audit-1',
        authorizedAt: '2026-10-26T08:00:00.000Z',
      });

      await authorizedPost('/drafts/draft-1/commit')
        .send({
          ...commitBody,
          ingredient: {
            ...commitBody.ingredient,
            name: '另一份没被核验的原料',
          },
          profiles: [
            {
              ...commitBody.profiles[0],
              sourceRecordId: 'body-src',
            },
          ],
        })
        .expect(201);

      const input = authorizeService.authorize.mock.calls[0][0];
      expect(input).toEqual({
        draftId: 'draft-1',
        userId: 'admin-1',
        primaryProfileIndex: 0,
      });
      expect(input).not.toHaveProperty('ingredient');
      expect(input).not.toHaveProperty('profiles');
    });

    it('没有新鲜核验报告 → 400，reasons 原样透出（不再直写正式表）', async () => {
      const reasons = [
        {
          code: 'CHECK_MISSING',
          domain: 'INGREDIENT',
          detail: '原料域还没有核验报告，先跑一次核验',
        },
        {
          code: 'CHECK_MISSING',
          domain: 'NUTRITION',
          detail: '营养域还没有核验报告，先跑一次核验',
        },
      ];
      authorizeService.authorize.mockRejectedValue(
        new BadRequestException({
          message: '授权前还有未满足的条件',
          reasons,
        }),
      );

      const response = await authorizedPost('/drafts/draft-1/commit')
        .send(commitBody)
        .expect(400);

      expect(authorizeService.authorize).toHaveBeenCalledTimes(1);
      expect(response.body.message).toBe('授权前还有未满足的条件');
      expect(response.body.reasons).toEqual(reasons);
    });

    it('闸门报 CHECK_BLOCKING 时 400，且不调用提交', async () => {
      const reasons = [
        {
          code: 'CHECK_BLOCKING',
          domain: 'INGREDIENT',
          detail: '原料域还有 1 个拦死项：UNIT_NOT_ALLOWED',
        },
      ];
      authorizeService.authorize.mockRejectedValue(
        new BadRequestException({
          message: '授权前还有未满足的条件',
          reasons,
        }),
      );

      const response = await authorizedPost('/drafts/draft-1/commit')
        .send(commitBody)
        .expect(400);

      expect(response.body.reasons).toEqual(reasons);
      expect(authorizeService.authorize).toHaveBeenCalledTimes(1);
    });

    it('只传 primaryProfileIndex 即可提交（轻量 DTO）', async () => {
      authorizeService.authorize.mockResolvedValue({
        ingredientId: 'ing-1',
        nutritionFoodIds: ['nf-1'],
        auditId: 'audit-1',
        authorizedAt: '2026-10-26T08:00:00.000Z',
      });

      await authorizedPost('/drafts/draft-1/commit')
        .send({ primaryProfileIndex: 0 })
        .expect(201);

      expect(authorizeService.authorize).toHaveBeenCalledWith({
        draftId: 'draft-1',
        userId: 'admin-1',
        primaryProfileIndex: 0,
      });
    });

    it('commit 缺 primaryProfileIndex → 400，且不调授权服务', async () => {
      await authorizedPost('/drafts/draft-1/commit').send({}).expect(400);

      expect(authorizeService.authorize).not.toHaveBeenCalled();
    });
  });

  describe('authorize', () => {
    it('POST authorize 走同一闸门，返回提交结果 + authorizedAt', async () => {
      authorizeService.authorize.mockResolvedValue({
        ingredientId: 'ing-1',
        nutritionFoodIds: ['nf-1'],
        auditId: 'audit-1',
        authorizedAt: '2026-10-26T08:00:00.000Z',
      });

      const response = await authorizedPost('/drafts/draft-1/authorize')
        .send(commitBody)
        .expect(201);

      expect(authorizeService.authorize).toHaveBeenCalledWith({
        draftId: 'draft-1',
        userId: 'admin-1',
        primaryProfileIndex: 0,
      });
      expect(response.body.data).toEqual({
        ingredientId: 'ing-1',
        nutritionFoodIds: ['nf-1'],
        auditId: 'audit-1',
        authorizedAt: '2026-10-26T08:00:00.000Z',
      });
    });

    it('POST authorize 只传 primaryProfileIndex 即可（轻量 DTO）', async () => {
      authorizeService.authorize.mockResolvedValue({
        ingredientId: 'ing-1',
        nutritionFoodIds: ['nf-1'],
        auditId: 'audit-1',
        authorizedAt: '2026-10-26T08:00:00.000Z',
      });

      await authorizedPost('/drafts/draft-1/authorize')
        .send({ primaryProfileIndex: 0 })
        .expect(201);

      expect(authorizeService.authorize).toHaveBeenCalledWith({
        draftId: 'draft-1',
        userId: 'admin-1',
        primaryProfileIndex: 0,
      });
    });

    it('POST authorize 缺 primaryProfileIndex → 400，且不调授权服务', async () => {
      await authorizedPost('/drafts/draft-1/authorize').send({}).expect(400);

      expect(authorizeService.authorize).not.toHaveBeenCalled();
    });

    it('POST authorize 未过闸门 → 400，reasons 原样透出', async () => {
      const reasons = [
        {
          code: 'CHECK_EXCEPTIONABLE',
          domain: 'INGREDIENT',
          detail: '原料域有可例外项没有登记理由：EDIBLE_RANGE',
        },
      ];
      authorizeService.authorize.mockRejectedValue(
        new BadRequestException({
          message: '授权前还有未满足的条件',
          reasons,
        }),
      );

      const response = await authorizedPost('/drafts/draft-1/authorize')
        .send(commitBody)
        .expect(400);

      expect(response.body.reasons).toEqual(reasons);
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
