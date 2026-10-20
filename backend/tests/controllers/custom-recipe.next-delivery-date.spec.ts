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
import type { CustomRecipeConfigDto } from '../../src/application/custom-recipe/custom-recipe-config.service';

/**
 * 预估交付日期接口 · 按份数（2026-10-21 · 第二阶段地基）
 *
 * 确认页改份数后要重新问后端「N 份大概哪天交付」，所以：
 *   · quantity 必填校验 1..当前最多份数；
 *   · 多份开关关闭时 >1 仍然拒绝，接口直调不能绕开；
 *   · 不传 quantity 保留原来的单份调用（老页面不掉）。
 */
describe('CustomRecipeController · 按份数预估交付日期', () => {
  let app: INestApplication;
  let getConfig: jest.Mock;
  let getEstimatedDeliveryDate: jest.Mock;

  const baseConfig = {
    deliveryWorkDays: 1,
    maxRecipeQuantity: 5,
    multiRecipeEnabled: true,
  } as unknown as CustomRecipeConfigDto;

  beforeAll(async () => {
    getConfig = jest.fn().mockResolvedValue(baseConfig);
    getEstimatedDeliveryDate = jest.fn().mockResolvedValue({
      quantity: 1,
      scheduledDate: '2026-10-19',
      estimatedDeliveryDate: '2026-10-20',
      deliveryWorkDays: 1,
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [CustomRecipeController],
      providers: [
        CustomRecipePricingService,
        { provide: CustomRecipeConfigService, useValue: { getConfig } },
        {
          provide: CustomRecipeService,
          useValue: { getEstimatedDeliveryDate },
        },
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
    getEstimatedDeliveryDate.mockReset().mockResolvedValue({
      quantity: 1,
      scheduledDate: '2026-10-19',
      estimatedDeliveryDate: '2026-10-20',
      deliveryWorkDays: 1,
    });
  });

  it('quantity=3 时按 3 份向后端排期，并原样返回交期', async () => {
    getEstimatedDeliveryDate.mockResolvedValue({
      quantity: 3,
      scheduledDate: '2026-10-19',
      estimatedDeliveryDate: '2026-10-21',
      deliveryWorkDays: 2,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/next-delivery-date?quantity=3')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(getEstimatedDeliveryDate).toHaveBeenCalledWith(3);
    expect(res.body.data).toEqual({
      quantity: 3,
      scheduledDate: '2026-10-19',
      estimatedDeliveryDate: '2026-10-21',
      deliveryWorkDays: 2,
    });
  });

  it('不传 quantity 时按 1 份算，老调用行为不变', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/next-delivery-date')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(getEstimatedDeliveryDate).toHaveBeenCalledWith(1);
    expect(res.body.data.estimatedDeliveryDate).toBe('2026-10-20');
  });

  it('quantity=6 返回 400，不进入排期', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/next-delivery-date?quantity=6')
      .set('Authorization', 'Bearer test-token')
      .expect(400);

    expect(getEstimatedDeliveryDate).not.toHaveBeenCalled();
  });

  it('多份开关关闭时 quantity=3 返回 400', async () => {
    getConfig.mockResolvedValue({
      ...baseConfig,
      multiRecipeEnabled: false,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/next-delivery-date?quantity=3')
      .set('Authorization', 'Bearer test-token')
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('多份购买暂未开放');
    expect(getEstimatedDeliveryDate).not.toHaveBeenCalled();
  });

  it('多份开关关闭时 quantity=1 仍然可用', async () => {
    getConfig.mockResolvedValue({
      ...baseConfig,
      multiRecipeEnabled: false,
    });

    await request(app.getHttpServer())
      .get('/api/v1/custom-recipe/next-delivery-date?quantity=1')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(getEstimatedDeliveryDate).toHaveBeenCalledWith(1);
  });
});
