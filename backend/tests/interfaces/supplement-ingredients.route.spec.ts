import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { IngredientSearchPlanService } from '../../src/application/ingredient-creation/ingredient-search-plan.service';
import { IngredientCreationAuditService } from '../../src/application/ingredient-creation/ingredient-creation-audit.service';
import { IngredientCreationAuthorizeService } from '../../src/application/ingredient-creation/ingredient-creation-authorize.service';
import { IngredientCreationCandidateService } from '../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from '../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationIntakeService } from '../../src/application/ingredient-creation/ingredient-creation-intake.service';
import { IngredientCreationMergeService } from '../../src/application/ingredient-creation/ingredient-creation-merge.service';
import { IngredientCreationOnlineService } from '../../src/application/ingredient-creation/ingredient-creation-online.service';
import { IngredientDraftAgentService } from '../../src/application/ingredient-creation/ingredient-draft-agent.service';
import { SupplementLinkPreviewService } from '../../src/application/ingredient-creation/supplement-link-preview.service';
import { ProcurementSkuDraftService } from '../../src/application/purchasing/procurement-sku-draft.service';
import { SupplementIngredientService } from '../../src/application/ingredient-creation/supplement-ingredient.service';
import { IngredientCreationController } from '../../src/interfaces/controllers/ingredient-creation.controller';
import { AuthGuard } from '../../src/interfaces/auth/auth.guard';
import { JwtAuthService } from '../../src/interfaces/auth/jwt.service';
import { AdminGuard } from '../../src/interfaces/guards/role.guard';

/**
 * 补剂建档的路由级验收：不登录进不来、入参不对出 400、正常出 201。
 * 这一层专门钉「控制器真的接上了」，DTO 与服务的单测都覆盖不到。
 */
describe('补剂建档接口', () => {
  let app: INestApplication;
  let supplementService: { create: jest.Mock; listPending: jest.Mock; getEvidence: jest.Mock };
  let previewService: { preview: jest.Mock; searchCandidates: jest.Mock };

  const body = {
    name: '鱼油（Omega-3）',
    unitDisplayLabel: '粒',
    physicalForm: 'CAPSULE',
    purchaseUnit: '瓶',
    purchaseToBaseRatio: 120,
    currentPricePerPurchaseUnit: 398,
    addTiming: 'BEFORE_MIXING',
    productionLossRate: 1.05,
    diyEnabled: true,
    procurementEnabled: true,
    labelCategory: 'FEED_ADDITIVE',
    labelNames: ['鱼油'],
    tagNames: ['油脂类'],
    servingUnitsPerDose: 2,
    servingNutrients: { 'fattyAcids.epa': 650 },
  };

  beforeEach(async () => {
    supplementService = {
      create: jest.fn(async () => ({
        ingredientId: 'ing-1',
        nutritionFoodId: 'nf-1',
        nutritionFoodStatus: 'PENDING',
        evidenceId: 'ev-1',
      })),
      listPending: jest.fn(async () => [
        {
          nutritionFoodId: 'nf-1',
          ingredientId: 'ing-1',
          name: '鱼油（Omega-3）',
          createdAt: '2026-11-07T00:00:00.000Z',
        },
      ]),
      getEvidence: jest.fn(async () => ({
        evidenceId: 'ev-1',
        ingredientId: 'ing-1',
        nutritionFoodId: 'nf-1',
        nutritionFoodStatus: 'PENDING',
        servingUnitsPerDose: 2,
        labelText: 'Serving Size 2 Softgels',
        labelImageUrl: null,
        productUrl: null,
      })),
    };

    previewService = {
      searchCandidates: jest.fn(async () => [
        {
          url: 'https://www.iherb.com/pr/now-foods-zinc-picolinate-50-mg-120-veg-capsules/878',
          name: 'NOW Foods, Zinc Picolinate, 50 mg, 120 Veg Capsules',
          priceUsd: 10.05,
          pricePerServingUsd: 0.08,
        },
      ]),
      preview: jest.fn(async () => ({
        productUrl: 'https://www.iherb.com/pr/x/1',
        productName: '某某鱼油',
        servingUnitsPerDose: 2,
        nutrients: [{ fieldPath: 'fattyAcids.epa', value: 650, unit: 'mg', rawName: 'EPA' }],
        unrecognized: [],
        labelText: 'Serving Size: 2 Softgels',
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
        { provide: IngredientSearchPlanService, useValue: {} },
        { provide: SupplementIngredientService, useValue: supplementService },
        { provide: SupplementLinkPreviewService, useValue: previewService },
        // 2026-11-08：收尾的采购商品截图识别（这些用例不走它）
        { provide: ProcurementSkuDraftService, useValue: { draftFromScreenshotForBaseUnit: jest.fn() } },
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

  const http = () => request(app.getHttpServer());
  const authed = (req: request.Test) => req.set('Authorization', 'Bearer token');

  it('不登录建不了档：401，且服务没被调用', async () => {
    await http().post('/api/v1/admin/ingredient-creation/supplements').send(body).expect(401);
    expect(supplementService.create).not.toHaveBeenCalled();
  });

  it('入参完整时 201，返回原料、档案、证据三个 id，档案待验证', async () => {
    const res = await authed(
      http().post('/api/v1/admin/ingredient-creation/supplements').send(body),
    ).expect(201);

    expect(res.body.code).toBe(0);
    expect(res.body.data).toEqual({
      ingredientId: 'ing-1',
      nutritionFoodId: 'nf-1',
      nutritionFoodStatus: 'PENDING',
      evidenceId: 'ev-1',
    });
    expect(supplementService.create).toHaveBeenCalledWith(
      expect.objectContaining({ servingUnitsPerDose: 2, servingNutrients: { 'fattyAcids.epa': 650 } }),
    );
  });

  it('缺每份几粒时 400，且没有写库', async () => {
    const { servingUnitsPerDose, ...rest } = body;
    void servingUnitsPerDose;

    await authed(
      http().post('/api/v1/admin/ingredient-creation/supplements').send(rest),
    ).expect(400);

    expect(supplementService.create).not.toHaveBeenCalled();
  });

  it('待验证清单能读回来', async () => {
    const res = await authed(
      http().get('/api/v1/admin/ingredient-creation/supplements/pending'),
    ).expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].nutritionFoodId).toBe('nf-1');
  });

  it('标签证据能按原料回查', async () => {
    const res = await authed(
      http().get('/api/v1/admin/ingredient-creation/supplements/ing-1/evidence'),
    ).expect(200);

    expect(res.body.data.servingUnitsPerDose).toBe(2);
    expect(res.body.data.labelText).toBe('Serving Size 2 Softgels');
  });

  it('贴链接能读出初稿：每份几粒与营养素一起回来', async () => {
    const res = await authed(
      http()
        .post('/api/v1/admin/ingredient-creation/supplements/preview-link')
        .send({ url: 'https://www.iherb.com/pr/x/1' }),
    ).expect(201);

    expect(res.body.data.servingUnitsPerDose).toBe(2);
    expect(previewService.preview).toHaveBeenCalledWith('https://www.iherb.com/pr/x/1');
  });

  it('没给链接时 400，且不去抓', async () => {
    await authed(
      http()
        .post('/api/v1/admin/ingredient-creation/supplements/preview-link')
        .send({}),
    ).expect(400);
    expect(previewService.preview).not.toHaveBeenCalled();
  });

  it('按关键词能搜出候选，带标价', async () => {
    const res = await authed(
      http()
        .post('/api/v1/admin/ingredient-creation/supplements/search-candidates')
        .send({ keyword: '锌' }),
    ).expect(201);

    expect(res.body.data[0].name).toContain('Zinc Picolinate');
    expect(previewService.searchCandidates).toHaveBeenCalledWith('锌');
  });

  it('没给关键词时 400，且不去搜', async () => {
    await authed(
      http()
        .post('/api/v1/admin/ingredient-creation/supplements/search-candidates')
        .send({}),
    ).expect(400);
    expect(previewService.searchCandidates).not.toHaveBeenCalled();
  });
});
