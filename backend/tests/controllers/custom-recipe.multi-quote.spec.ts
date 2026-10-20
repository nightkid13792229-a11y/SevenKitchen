import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CustomRecipeController } from '../../src/interfaces/controllers/custom-recipe/custom-recipe.controller';
import { CustomRecipeService } from '../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../src/application/custom-recipe/custom-recipe-config.service';
import { CustomRecipePricingService } from '../../src/application/custom-recipe/custom-recipe-pricing.service';
import { CustomRecipeViewService } from '../../src/application/custom-recipe/custom-recipe-view.service';
import { CustomRecipeDeliveryService } from '../../src/application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeAftersaleService } from '../../src/application/custom-recipe/custom-recipe-aftersale.service';
import { WechatPaymentService } from '../../src/application/payment/wechat-payment.service';
import { AuthGuard } from '../../src/interfaces/auth/auth.guard';
import {
  DEFAULT_MULTI_RECIPE_DISCOUNTS,
  type CustomRecipeConfigDto,
} from '../../src/application/custom-recipe/custom-recipe-config.service';

/**
 * 定制报价接口 · HTTP 契约（2026-10-20 多份购买 · 第一阶段）
 *
 * 报价是支付金额的唯一来源，所以这里锁死三件事：
 *   · 3 份必须得到 900 原价 / 72 优惠 / 828 应付，不能出现 827.99；
 *   · 6 份、缺参、非数字、非整数一律 400，不能落到报价服务；
 *   · 接口挂在顾客端控制器上，沿用现有登录守卫。
 */
describe('CustomRecipeController · 多份报价接口', () => {
  let app: INestApplication;
  let getConfig: jest.Mock;

  const baseConfig = {
    feeAmount: 300,
    maxRecipeQuantity: 5,
    // 多份报价用例默认打开开关；关闭场景在下面单独覆盖
    multiRecipeEnabled: true,
    multiRecipeDiscounts: DEFAULT_MULTI_RECIPE_DISCOUNTS.map((item) => ({
      ...item,
    })),
  } as unknown as CustomRecipeConfigDto;

  beforeAll(async () => {
    getConfig = jest.fn().mockResolvedValue(baseConfig);

    const moduleRef = await Test.createTestingModule({
      controllers: [CustomRecipeController],
      providers: [
        CustomRecipePricingService,
        { provide: CustomRecipeConfigService, useValue: { getConfig } },
        { provide: CustomRecipeService, useValue: {} },
        { provide: WechatPaymentService, useValue: {} },
        { provide: CustomRecipeViewService, useValue: {} },
        { provide: CustomRecipeDeliveryService, useValue: {} },
        { provide: CustomRecipeAftersaleService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) {
            throw new UnauthorizedException('Unauthorized');
          }
          req.user = { userId: 'user-1' };
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
    getConfig.mockReset().mockResolvedValue(baseConfig);
  });

  it('3 份返回 900 原价、72 优惠、8% 折扣与 828 应付', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/quote?quantity=3')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data).toEqual({
      quantity: 3,
      unitAmount: 300,
      originalAmount: 900,
      discountRate: 0.08,
      discountAmount: 72,
      payableAmount: 828,
    });
  });

  it('5 份返回 1500 原价、180 优惠、12% 折扣与 1320 应付', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/quote?quantity=5')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data).toEqual({
      quantity: 5,
      unitAmount: 300,
      originalAmount: 1500,
      discountRate: 0.12,
      discountAmount: 180,
      payableAmount: 1320,
    });
  });

  it('多份开关关闭时 quantity > 1 返回 400，不返回折扣报价', async () => {
    getConfig.mockResolvedValue({
      ...baseConfig,
      multiRecipeEnabled: false,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/quote?quantity=5')
      .set('Authorization', 'Bearer test-token')
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('多份购买暂未开放');
  });

  it('多份开关关闭时 1 份仍可正常报价且没有折扣', async () => {
    getConfig.mockResolvedValue({
      ...baseConfig,
      multiRecipeEnabled: false,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/quote?quantity=1')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(res.body.data).toEqual({
      quantity: 1,
      unitAmount: 300,
      originalAmount: 300,
      discountRate: 0,
      discountAmount: 0,
      payableAmount: 300,
    });
  });

  it('6 份返回 400（业务硬上限 5）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/quote?quantity=6')
      .set('Authorization', 'Bearer test-token')
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('份数');
  });

  it('缺少 quantity 返回 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/quote')
      .set('Authorization', 'Bearer test-token')
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('份数');
  });

  it('非数字 quantity 返回 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/quote?quantity=abc')
      .set('Authorization', 'Bearer test-token')
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('份数');
  });

  it('非整数 quantity 返回 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/quote?quantity=3.5')
      .set('Authorization', 'Bearer test-token')
      .expect(400);
  });

  it('0 份返回 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/quote?quantity=0')
      .set('Authorization', 'Bearer test-token')
      .expect(400);
  });

  it('按后台当前最多份数拒绝（配置为 2 时 3 份也返回 400）', async () => {
    getConfig.mockResolvedValue({ ...baseConfig, maxRecipeQuantity: 2 });

    const res = await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/quote?quantity=3')
      .set('Authorization', 'Bearer test-token')
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('1~2');
  });

  it('未登录返回 401，不会返回报价', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/quote?quantity=3')
      .expect(401);
  });

  it('控制器整体沿用现有 AuthGuard（报价路由没有单独放开）', () => {
    const guards =
      Reflect.getMetadata('__guards__', CustomRecipeController) ?? [];
    expect(guards).toContain(AuthGuard);
  });
});
