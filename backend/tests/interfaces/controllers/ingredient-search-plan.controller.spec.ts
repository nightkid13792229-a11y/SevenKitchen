import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { IngredientSearchPlanService } from '../../../src/application/ingredient-creation/ingredient-search-plan.service';
import { IngredientCreationAuditService } from '../../../src/application/ingredient-creation/ingredient-creation-audit.service';
import { IngredientCreationAuthorizeService } from '../../../src/application/ingredient-creation/ingredient-creation-authorize.service';
import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationIntakeService } from '../../../src/application/ingredient-creation/ingredient-creation-intake.service';
import { IngredientCreationMergeService } from '../../../src/application/ingredient-creation/ingredient-creation-merge.service';
import { IngredientCreationOnlineService } from '../../../src/application/ingredient-creation/ingredient-creation-online.service';
import { IngredientDraftAgentService } from '../../../src/application/ingredient-creation/ingredient-draft-agent.service';
import { AuthGuard } from '../../../src/interfaces/auth/auth.guard';
import { JwtAuthService } from '../../../src/interfaces/auth/jwt.service';
import { IngredientCreationController } from '../../../src/interfaces/controllers/ingredient-creation.controller';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';

const CONFIRM_PATH =
  '/api/v1/admin/ingredient-creation/drafts/draft-1/search-plan/confirm';

describe('POST /admin/ingredient-creation/drafts/:id/search-plan/confirm', () => {
  let app: INestApplication;
  let searchPlanService: { confirm: jest.Mock };

  beforeEach(async () => {
    searchPlanService = {
      confirm: jest.fn(async () => ({
        status: 'APPROVED',
        approvedBy: 'admin-1',
      })),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [IngredientCreationController],
      providers: [
        { provide: IngredientCreationDraftService, useValue: {} },
        { provide: IngredientCreationCandidateService, useValue: {} },
        { provide: IngredientCreationOnlineService, useValue: {} },
        { provide: IngredientCreationMergeService, useValue: {} },
        { provide: IngredientCreationCheckService, useValue: {} },
        { provide: IngredientCreationAuthorizeService, useValue: {} },
        { provide: IngredientCreationAuditService, useValue: {} },
        { provide: IngredientCreationIntakeService, useValue: {} },
        { provide: IngredientDraftAgentService, useValue: {} },
        { provide: IngredientSearchPlanService, useValue: searchPlanService },
        {
          provide: JwtAuthService,
          useValue: {
            validateToken: jest.fn().mockReturnValue({
              userId: 'admin-1',
              customerId: 'admin-1',
              role: 'ADMIN',
            }),
          },
        },
        AuthGuard,
        AdminGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function http() {
    return request(app.getHttpServer());
  }

  it('未登录 → 401，且不确认', async () => {
    await http().post(CONFIRM_PATH).send({}).expect(401);

    expect(searchPlanService.confirm).not.toHaveBeenCalled();
  });

  it('登录后把修改项与确认人交给服务，返回方案', async () => {
    const response = await http()
      .post(CONFIRM_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({
        keywords: [{ term: '蛋清', language: 'zh' }],
        libraries: ['USDA'],
      })
      .expect(201);

    expect(searchPlanService.confirm).toHaveBeenCalledWith(
      'draft-1',
      {
        keywords: [{ term: '蛋清', language: 'zh' }],
        libraries: ['USDA'],
        chosenRecordId: undefined,
        chosenRecordName: undefined,
      },
      { userId: 'admin-1' },
    );
    expect(response.body).toMatchObject({
      code: 0,
      message: 'Success',
      data: { status: 'APPROVED' },
    });
  });

  it('目标库不在白名单 → 400', async () => {
    await http()
      .post(CONFIRM_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({ libraries: ['GOOGLE'] })
      .expect(400);

    expect(searchPlanService.confirm).not.toHaveBeenCalled();
  });
});
