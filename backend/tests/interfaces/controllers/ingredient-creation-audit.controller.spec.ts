import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { IngredientCreationAuditService } from '../../../src/application/ingredient-creation/ingredient-creation-audit.service';
import { IngredientDraftAgentService } from '../../../src/application/ingredient-creation/ingredient-draft-agent.service';
import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationAuthorizeService } from '../../../src/application/ingredient-creation/ingredient-creation-authorize.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationIntakeService } from '../../../src/application/ingredient-creation/ingredient-creation-intake.service';
import { IngredientCreationMergeService } from '../../../src/application/ingredient-creation/ingredient-creation-merge.service';
import { IngredientCreationOnlineService } from '../../../src/application/ingredient-creation/ingredient-creation-online.service';
import { AuthGuard } from '../../../src/interfaces/auth/auth.guard';
import { JwtAuthService } from '../../../src/interfaces/auth/jwt.service';
import { IngredientCreationController } from '../../../src/interfaces/controllers/ingredient-creation.controller';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';

const BASE_PATH = '/api/v1/admin/ingredient-creation';
const ADMIN_TOKEN = 'admin-token';

describe('IngredientCreationController audits', () => {
  let app: INestApplication;
  let auditService: { getByIngredientId: jest.Mock };
  const validateToken = jest.fn(() => ({
    userId: 'admin-1',
    customerId: 'admin-1',
    role: 'ADMIN',
  }));

  beforeEach(async () => {
    auditService = { getByIngredientId: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [IngredientCreationController],
      providers: [
        {
          provide: IngredientCreationDraftService,
          useValue: { create: jest.fn(), get: jest.fn(), patch: jest.fn() },
        },
        {
          provide: IngredientCreationCandidateService,
          useValue: { findCandidates: jest.fn() },
        },
        {
          provide: IngredientCreationMergeService,
          useValue: { createMergePlan: jest.fn(), resolveConflict: jest.fn() },
        },
        {
          provide: IngredientCreationOnlineService,
          useValue: { search: jest.fn() },
        },
        {
          provide: IngredientCreationCheckService,
          useValue: { runCheck: jest.fn(), assertCommitAllowed: jest.fn() },
        },
        {
          provide: IngredientCreationAuthorizeService,
          useValue: { authorize: jest.fn() },
        },
        {
          provide: IngredientCreationAuditService,
          useValue: auditService,
        },
        {
          provide: IngredientCreationIntakeService,
          useValue: { classify: jest.fn() },
        },
        {
          provide: IngredientDraftAgentService,
          useValue: { run: jest.fn() },
        },
        { provide: JwtAuthService, useValue: { validateToken } },
        AuthGuard,
        AdminGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function http() {
    return request(app.getHttpServer());
  }

  it('未登录访问创建记录 → 401', async () => {
    await http().get(`${BASE_PATH}/audits/ing-1`).expect(401);
  });

  it('按 ingredientId 返回创建记录（提案、改动、提交人）', async () => {
    auditService.getByIngredientId.mockResolvedValue({
      id: 'audit-1',
      draftId: 'draft-1',
      ingredientId: 'ing-1',
      nutritionFoodIds: ['nf-1', 'nf-2'],
      proposals: [{ kind: 'MERGE', createdAt: '2026-10-22T00:00:00.000Z' }],
      changes: { fields: [], exceptions: [] },
      committedBy: 'admin-1',
      committedAt: '2026-10-22T12:00:00.000Z',
    });

    const response = await http()
      .get(`${BASE_PATH}/audits/ing-1`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .expect(200);

    expect(auditService.getByIngredientId).toHaveBeenCalledWith('ing-1');
    expect(response.body.code).toBe(0);
    expect(response.body.data).toMatchObject({
      ingredientId: 'ing-1',
      nutritionFoodIds: ['nf-1', 'nf-2'],
      committedBy: 'admin-1',
      committedAt: '2026-10-22T12:00:00.000Z',
    });
  });

  it('没有创建记录 → 404', async () => {
    auditService.getByIngredientId.mockRejectedValue(
      new NotFoundException('Ingredient creation audit ing-2 not found'),
    );

    await http()
      .get(`${BASE_PATH}/audits/ing-2`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .expect(404);
  });
});
