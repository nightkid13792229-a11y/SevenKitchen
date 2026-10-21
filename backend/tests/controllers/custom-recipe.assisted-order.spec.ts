/**
 * 后台代客下单接口测试（2026-10-21 · 代客定制食谱订单 Task 3）
 *
 * 用**真实守卫**（AdminGuard / StaffGuard），只替换登录守卫：
 *   · 未登录 → 401；
 *   · STAFF → 403（代客下单会创建订单并登记线下收款，仅管理员）；
 *   · ADMIN → 201，参数映射后交给 AssistedOrderService；
 *   · DTO 校验失败 → 400，且不调用 service；
 *   · service 抛出的 400/404 原样透传，不能变成 500；
 *   · 全程不调用任何微信支付/退款/订阅消息能力 —— 线下收款只登记。
 */

import {
  BadRequestException,
  ExecutionContext,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminCustomRecipeController } from '../../src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller';
import { AssistedOrderService } from '../../src/application/custom-recipe/assisted-order.service';
import { CustomRecipeService } from '../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../src/application/custom-recipe/custom-recipe-config.service';
import { CustomRecipeDeliveryService } from '../../src/application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeAftersaleService } from '../../src/application/custom-recipe/custom-recipe-aftersale.service';
import { CustomRecipeViewService } from '../../src/application/custom-recipe/custom-recipe-view.service';
import { PrismaService } from '../../src/infrastructure/prisma.service';
import { WechatService } from '../../src/infrastructure/wechat/wechat.service';
import { WechatPaymentService } from '../../src/application/payment/wechat-payment.service';
import { AuthGuard } from '../../src/interfaces/auth/auth.guard';

describe('AdminCustomRecipeController · 代客下单接口', () => {
  const BASE = '/api/v1/admin/custom-recipe/orders/assisted';

  let app: INestApplication;
  let assistedOrderService: { create: jest.Mock };
  let wechatService: Record<string, jest.Mock>;
  let wechatPaymentService: Record<string, jest.Mock>;

  /** service 返回的摘要（控制器应原样包进 ApiResponseDto.success） */
  const summary = {
    id: 'order-uuid-1',
    orderId: 'CR202610210001',
    status: 'PAID',
    amount: 500,
    actualPaidAmount: 500,
    paymentChannel: 'OFFLINE_WECHAT',
    recipeQuantity: 2,
    assistedForGuest: true,
    healthSync: { synced: true },
  };

  const validBody = () => ({
    customerId: 'guest-1',
    dogId: 'dog-1',
    targetGoal: 'MAINTAIN',
    recipeQuantity: 2,
    requestedProteinCodes: ['CHICKEN', 'BEEF'],
    allergies: [],
    allergyText: '',
    allergyStatus: 'NO_ALLERGY',
    currentFoodMain: 'DRY',
    changeReasons: ['HEALTHIER'],
    stomachConditions: [],
    additionalNotes: '希望少油',
    payment: {
      collected: true,
      channel: 'OFFLINE_WECHAT',
      amount: 500,
      externalRef: 'wx-20261021-001',
      overrideReason: '老客户优惠',
    },
  });

  beforeAll(async () => {
    assistedOrderService = { create: jest.fn() };
    wechatService = {
      sendCustomRecipePaidNotice: jest.fn(),
      sendSubscribeMessage: jest.fn(),
    };
    wechatPaymentService = {
      createCustomRecipePayment: jest.fn(),
      createCustomRecipeRefund: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminCustomRecipeController],
      providers: [
        { provide: CustomRecipeService, useValue: {} },
        { provide: CustomRecipeConfigService, useValue: {} },
        { provide: WechatService, useValue: wechatService },
        { provide: WechatPaymentService, useValue: wechatPaymentService },
        { provide: CustomRecipeDeliveryService, useValue: {} },
        { provide: CustomRecipeAftersaleService, useValue: {} },
        { provide: CustomRecipeViewService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: AssistedOrderService, useValue: assistedOrderService },
      ],
    })
      // 只替登录守卫；AdminGuard / StaffGuard 必须是真的
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) {
            throw new UnauthorizedException('Unauthorized');
          }
          const role = String(
            req.headers['x-test-role'] ?? 'ADMIN',
          ).toUpperCase();
          req.user = {
            userId: role === 'ADMIN' ? 'admin-1' : 'staff-1',
            customerId: role === 'ADMIN' ? 'admin-1' : 'staff-1',
            role,
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    assistedOrderService.create.mockReset();
    assistedOrderService.create.mockResolvedValue({ ...summary });
    Object.values(wechatService).forEach((fn) => fn.mockClear());
    Object.values(wechatPaymentService).forEach((fn) => fn.mockClear());
  });

  function post(body: unknown, role?: 'ADMIN' | 'STAFF') {
    const req = request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', 'Bearer test-token');
    if (role) {
      req.set('x-test-role', role);
    }
    return req.send(body as object);
  }

  it('★ 未登录 → 401，不创建订单', async () => {
    await request(app.getHttpServer()).post(BASE).send(validBody()).expect(401);

    expect(assistedOrderService.create).not.toHaveBeenCalled();
  });

  it('★ STAFF → 403（代客下单仅管理员），不创建订单', async () => {
    const res = await post(validBody(), 'STAFF').expect(403);

    expect(JSON.stringify(res.body)).toContain('管理员');
    expect(assistedOrderService.create).not.toHaveBeenCalled();
  });

  it('★ 管理员代客下单成功：参数映射 + 操作人留痕 + 返回摘要', async () => {
    const res = await post(validBody(), 'ADMIN').expect(201);

    expect(res.body.code).toBe(0);
    expect(res.body.data).toEqual(summary);

    expect(assistedOrderService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'guest-1',
        dogId: 'dog-1',
        targetGoal: 'MAINTAIN',
        recipeQuantity: 2,
        requestedProteinCodes: ['CHICKEN', 'BEEF'],
        allergyStatus: 'NO_ALLERGY',
        currentFoodMain: 'DRY',
        changeReasons: ['HEALTHIER'],
        payment: {
          collected: true,
          channel: 'OFFLINE_WECHAT',
          amount: 500,
          externalRef: 'wx-20261021-001',
          overrideReason: '老客户优惠',
        },
      }),
      'admin-1',
    );
  });

  it('★ 所有微信支付/退款/订阅消息能力一次都不调用（线下收款只登记）', async () => {
    await post(validBody(), 'ADMIN').expect(201);

    Object.values(wechatService).forEach((fn) =>
      expect(fn).not.toHaveBeenCalled(),
    );
    Object.values(wechatPaymentService).forEach((fn) =>
      expect(fn).not.toHaveBeenCalled(),
    );
  });

  it('★ 缺少顾客/狗狗 → 400，不调用 service', async () => {
    const missingCustomer = validBody();
    delete (missingCustomer as any).customerId;
    await post(missingCustomer, 'ADMIN').expect(400);

    const missingDog = validBody();
    delete (missingDog as any).dogId;
    await post(missingDog, 'ADMIN').expect(400);

    expect(assistedOrderService.create).not.toHaveBeenCalled();
  });

  it('★ 缺少收款信息 / 收款渠道非法 → 400，不调用 service', async () => {
    const missingPayment = validBody();
    delete (missingPayment as any).payment;
    await post(missingPayment, 'ADMIN').expect(400);

    const badChannel = validBody();
    badChannel.payment.channel = 'WECHAT_ONLINE';
    await post(badChannel, 'ADMIN').expect(400);

    expect(assistedOrderService.create).not.toHaveBeenCalled();
  });

  it('★ 份数超过 5 → 400（DTO 层拦截），不调用 service', async () => {
    const body = validBody();
    body.recipeQuantity = 6;

    await post(body, 'ADMIN').expect(400);

    expect(assistedOrderService.create).not.toHaveBeenCalled();
  });

  it('★ service 的业务错误（实收不一致没原因）透传为 400', async () => {
    assistedOrderService.create.mockRejectedValue(
      new BadRequestException('实收金额与系统报价不一致时，必须填写原因'),
    );

    const res = await post(validBody(), 'ADMIN').expect(400);

    expect(JSON.stringify(res.body)).toContain('必须填写原因');
  });

  it('★ service 的 404（顾客不存在）原样透传', async () => {
    assistedOrderService.create.mockRejectedValue(
      new NotFoundException('顾客不存在'),
    );

    await post(validBody(), 'ADMIN').expect(404);
  });
});
