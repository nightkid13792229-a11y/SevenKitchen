import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CustomRecipeController } from '../../src/interfaces/controllers/custom-recipe/custom-recipe.controller';
import { CustomRecipeService } from '../../src/application/custom-recipe/custom-recipe.service';
import { WechatPaymentService } from '../../src/application/payment/wechat-payment.service';
import { CustomRecipeViewService } from '../../src/application/custom-recipe/custom-recipe-view.service';
import { CustomRecipeDeliveryService } from '../../src/application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeAftersaleService } from '../../src/application/custom-recipe/custom-recipe-aftersale.service';
import { CustomRecipeConfigService } from '../../src/application/custom-recipe/custom-recipe-config.service';
import { CustomRecipePricingService } from '../../src/application/custom-recipe/custom-recipe-pricing.service';
import { AuthGuard } from '../../src/interfaces/auth/auth.guard';

/**
 * 定制下单接口 · DTO 透传与校验（2026-10-20 多份购买 · 第一阶段）
 *
 * 服务层测试（custom-recipe-multi-order.spec.ts）保证了下单逻辑本身；
 * 这里补的是「请求从 HTTP 进来时」的两件事：
 *   · recipeQuantity / requestedProteinCodes 必须真的透传给 createOrder，
 *     否则 DTO 加了字段也是死字段；
 *   · recipeQuantity = 6 必须在 ValidationPipe 就被拦成 400，不能落到服务层。
 */
describe('CustomRecipeController · 多份下单 DTO', () => {
  let app: INestApplication;
  let createOrder: jest.Mock;

  const validBody = {
    dogId: 'dog-1',
    targetGoal: 'MAINTAIN',
    syncToHealthProfile: false,
  };

  beforeAll(async () => {
    createOrder = jest.fn().mockResolvedValue({
      orderId: 'CR202610200001',
      status: 'PENDING_PAYMENT',
      createdAt: new Date('2026-10-20T10:00:00.000Z'),
      scheduledDate: new Date('2026-10-21T00:00:00.000Z'),
      estimatedDeliveryDate: new Date('2026-10-23T00:00:00.000Z'),
      amount: 828,
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [CustomRecipeController],
      providers: [
        {
          provide: CustomRecipeService,
          useValue: {
            createOrder,
            getPaymentTimeoutMinutes: jest.fn().mockResolvedValue(30),
          },
        },
        { provide: WechatPaymentService, useValue: {} },
        { provide: CustomRecipeViewService, useValue: {} },
        { provide: CustomRecipeDeliveryService, useValue: {} },
        { provide: CustomRecipeAftersaleService, useValue: {} },
        // 2026-10-20：控制器新增了报价接口依赖，本文件只测下单，给空实现即可
        { provide: CustomRecipeConfigService, useValue: {} },
        CustomRecipePricingService,
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          // 控制器从 req.user.userId 取顾客；登录本身不在本测试范围
          context.switchToHttp().getRequest().user = { userId: 'user-1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    createOrder.mockClear();
  });

  it('把份数与肉类偏好透传给 createOrder', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/custom-recipe/orders')
      .send({
        ...validBody,
        recipeQuantity: 3,
        requestedProteinCodes: ['CHICKEN', 'BEEF', 'SALMON'],
      })
      .expect(201);

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'user-1',
        dogId: 'dog-1',
        recipeQuantity: 3,
        requestedProteinCodes: ['CHICKEN', 'BEEF', 'SALMON'],
      }),
    );
  });

  it('recipeQuantity 为 6 时返回 400，且不进入服务层', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/custom-recipe/orders')
      .send({ ...validBody, recipeQuantity: 6 })
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('recipeQuantity');
    expect(createOrder).not.toHaveBeenCalled();
  });
});
