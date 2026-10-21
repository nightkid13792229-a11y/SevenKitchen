import {
  BadRequestException,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminCustomRecipeController } from '../../src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller';
import { CustomRecipeService } from '../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../src/application/custom-recipe/custom-recipe-config.service';
import { CustomRecipeDeliveryService } from '../../src/application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeAftersaleService } from '../../src/application/custom-recipe/custom-recipe-aftersale.service';
import { CustomRecipeViewService } from '../../src/application/custom-recipe/custom-recipe-view.service';
import { WechatPaymentService } from '../../src/application/payment/wechat-payment.service';
import { PrismaService } from '../../src/infrastructure/prisma.service';
import { WechatService } from '../../src/infrastructure/wechat/wechat.service';
import { AuthGuard } from '../../src/interfaces/auth/auth.guard';
import { CustomRecipeStatus } from '@prisma/client';

/**
 * 后台 · 线下退款并取消接口（2026-10-21 · 代客定制食谱订单 Task 5）。
 *
 * 背景（必须防住的 bug）：代客单线下收款、订单却是 PAID。
 * 原来的后台取消/补退款都会调用微信原路退款 —— 微信里根本没有这笔支付。
 *
 * 边界锁定：
 *   · 线下单走新的 `/offline-refund`，只登记、不调微信；
 *   · 线下单走旧「取消订单」或「补退款」会被 400 挡住（引导去登记）；
 *   · 线上单行为不变，仍然走原路退款；
 *   · 员工 403、参数非法 400、已取消/已登记幂等拒绝。
 */
describe('AdminCustomRecipeController · 线下退款并取消', () => {
  const offlineRoute =
    '/api/v1/admin/custom-recipe/orders/CR202610210001/offline-refund';
  const statusRoute =
    '/api/v1/admin/custom-recipe/orders/CR202610210001/status';
  const refundRoute =
    '/api/v1/admin/custom-recipe/orders/CR202610210001/refund';

  let app: INestApplication;
  let customRecipeService: {
    getOrderByOrderId: jest.Mock;
    registerOfflineRefund: jest.Mock;
    updateOrderStatus: jest.Mock;
  };
  let wechatPaymentService: { createCustomRecipeRefund: jest.Mock };

  /** 线下已收款的代客单 */
  const offlinePaidOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 'cr-uuid-1',
    orderId: 'CR202610210001',
    status: CustomRecipeStatus.PAID,
    amount: 300,
    actualPaidAmount: 280,
    paymentConfirmedAt: new Date('2026-10-21T02:00:00.000Z'),
    paymentTransactionId: null,
    paymentChannel: 'OFFLINE_WECHAT',
    orderSource: 'ASSISTED',
    offlineRefundedAt: null,
    ...overrides,
  });

  const offlineRefundResult = () => ({
    orderId: 'CR202610210001',
    status: 'CANCELLED',
    refundChannel: 'OFFLINE',
    amount: 280,
    method: 'OFFLINE_WECHAT',
    note: '微信转账退回',
    offlineRefundedAt: '2026-10-21T03:00:00.000Z',
    cancelledAt: '2026-10-21T03:00:00.000Z',
    cancellationReason: '线下退款登记：线下微信退款 ¥280.00（微信转账退回）',
    releasedCapacity: 2,
    operatorId: 'admin-1',
  });

  beforeAll(async () => {
    customRecipeService = {
      getOrderByOrderId: jest.fn(),
      registerOfflineRefund: jest.fn(),
      updateOrderStatus: jest.fn(),
    };
    wechatPaymentService = { createCustomRecipeRefund: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminCustomRecipeController],
      providers: [
        { provide: CustomRecipeService, useValue: customRecipeService },
        { provide: CustomRecipeConfigService, useValue: {} },
        { provide: WechatService, useValue: {} },
        { provide: WechatPaymentService, useValue: wechatPaymentService },
        { provide: CustomRecipeDeliveryService, useValue: {} },
        { provide: CustomRecipeAftersaleService, useValue: {} },
        { provide: CustomRecipeViewService, useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    })
      /** 只替换登录守卫，真实 AdminGuard 留下（否则测不到员工 403） */
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) {
            throw new UnauthorizedException('Unauthorized');
          }
          const role = String(req.headers['x-test-role'] ?? 'ADMIN').toUpperCase();
          req.user = {
            userId: role === 'ADMIN' ? 'admin-1' : 'staff-1',
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
    customRecipeService.getOrderByOrderId
      .mockReset()
      .mockResolvedValue(offlinePaidOrder());
    customRecipeService.registerOfflineRefund
      .mockReset()
      .mockResolvedValue(offlineRefundResult());
    customRecipeService.updateOrderStatus.mockReset().mockResolvedValue(undefined);
    wechatPaymentService.createCustomRecipeRefund
      .mockReset()
      .mockResolvedValue({ status: 'SUCCESS', amount: 300 });
  });

  function post(route: string, body: unknown, role = 'ADMIN') {
    return request(app.getHttpServer())
      .post(route)
      .set('Authorization', 'Bearer test-token')
      .set('x-test-role', role)
      .send(body as object);
  }

  function patch(route: string, body: unknown, role = 'ADMIN') {
    return request(app.getHttpServer())
      .patch(route)
      .set('Authorization', 'Bearer test-token')
      .set('x-test-role', role)
      .send(body as object);
  }

  // ---------------- 新接口：线下退款登记 ----------------

  it('★ 管理员登记线下退款：返回摘要，且绝不调用微信退款', async () => {
    const res = await post(offlineRoute, {
      amount: 280,
      method: 'OFFLINE_WECHAT',
      note: '微信转账退回',
    }).expect(201);

    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({
      orderId: 'CR202610210001',
      status: 'CANCELLED',
      refundChannel: 'OFFLINE',
      amount: 280,
      method: 'OFFLINE_WECHAT',
      note: '微信转账退回',
      releasedCapacity: 2,
    });

    expect(customRecipeService.registerOfflineRefund).toHaveBeenCalledWith(
      'CR202610210001',
      { amount: 280, method: 'OFFLINE_WECHAT', note: '微信转账退回' },
      'admin-1',
    );
    expect(wechatPaymentService.createCustomRecipeRefund).not.toHaveBeenCalled();
  });

  it('note 可省略', async () => {
    await post(offlineRoute, {
      amount: 100,
      method: 'OTHER',
    }).expect(201);

    expect(customRecipeService.registerOfflineRefund).toHaveBeenCalledWith(
      'CR202610210001',
      { amount: 100, method: 'OTHER', note: undefined },
      'admin-1',
    );
  });

  it('★ 员工（STAFF）返回 403，既不登记也不查订单', async () => {
    await post(
      offlineRoute,
      { amount: 100, method: 'OFFLINE_WECHAT' },
      'STAFF',
    ).expect(403);

    expect(customRecipeService.registerOfflineRefund).not.toHaveBeenCalled();
  });

  it('未登录返回 401', async () => {
    await request(app.getHttpServer())
      .post(offlineRoute)
      .send({ amount: 100, method: 'OFFLINE_WECHAT' })
      .expect(401);

    expect(customRecipeService.registerOfflineRefund).not.toHaveBeenCalled();
  });

  it('★ 参数非法返回 400（金额 <= 0 / 方式不在枚举内），不会进 service', async () => {
    await post(offlineRoute, {
      amount: 0,
      method: 'OFFLINE_WECHAT',
    }).expect(400);

    await post(offlineRoute, {
      amount: 100,
      method: 'WECHAT_ONLINE',
    }).expect(400);

    await post(offlineRoute, {
      method: 'OFFLINE_WECHAT',
    }).expect(400);

    expect(customRecipeService.registerOfflineRefund).not.toHaveBeenCalled();
  });

  it('★ 幂等：service 的"已取消/已登记"拒绝原样回给页面（400）', async () => {
    customRecipeService.registerOfflineRefund.mockRejectedValueOnce(
      new BadRequestException('该订单已取消或已登记线下退款，不能重复登记'),
    );

    const res = await post(offlineRoute, {
      amount: 100,
      method: 'OFFLINE_WECHAT',
    }).expect(400);

    expect(JSON.stringify(res.body)).toContain('已取消或已登记');
  });

  // ---------------- 旧路径：线下单必须被挡住 ----------------

  it('★ 线下单走旧「取消订单」：400 引导去线下退款登记，且不调微信退款', async () => {
    const res = await patch(statusRoute, {
      status: 'CANCELLED',
      reason: '客服取消',
    }).expect(400);

    expect(JSON.stringify(res.body)).toContain('线下退款');
    expect(wechatPaymentService.createCustomRecipeRefund).not.toHaveBeenCalled();
    expect(customRecipeService.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('★ 线下单走旧「补退款」：400 挡住，且不调微信退款', async () => {
    const res = await post(refundRoute, { reason: '客服补退款' }).expect(400);

    expect(JSON.stringify(res.body)).toContain('线下收款订单不能走微信');
    expect(wechatPaymentService.createCustomRecipeRefund).not.toHaveBeenCalled();
  });

  it('线上单行为不变：取消仍先原路退款再取消', async () => {
    customRecipeService.getOrderByOrderId.mockResolvedValue(
      offlinePaidOrder({
        orderSource: 'SELF',
        paymentChannel: 'WECHAT_ONLINE',
        actualPaidAmount: null,
      }),
    );

    await patch(statusRoute, {
      status: 'CANCELLED',
      reason: '顾客要求取消',
    }).expect(200);

    expect(wechatPaymentService.createCustomRecipeRefund).toHaveBeenCalledWith({
      orderId: 'CR202610210001',
      reason: '顾客要求取消',
    });
    expect(customRecipeService.updateOrderStatus).toHaveBeenCalledWith(
      'CR202610210001',
      CustomRecipeStatus.CANCELLED,
      { reason: '顾客要求取消' },
    );
  });

  it('未付款的线下单（还没收到钱）仍可正常取消，不调微信退款', async () => {
    customRecipeService.getOrderByOrderId.mockResolvedValue(
      offlinePaidOrder({
        status: CustomRecipeStatus.PENDING_PAYMENT,
        paymentConfirmedAt: null,
        paymentChannel: null,
        actualPaidAmount: null,
      }),
    );

    await patch(statusRoute, {
      status: 'CANCELLED',
      reason: '顾客不要了',
    }).expect(200);

    expect(wechatPaymentService.createCustomRecipeRefund).not.toHaveBeenCalled();
    expect(customRecipeService.updateOrderStatus).toHaveBeenCalledWith(
      'CR202610210001',
      CustomRecipeStatus.CANCELLED,
      { reason: '顾客不要了' },
    );
  });

  it('线上单补退款行为不变：仍走微信原路退款', async () => {
    customRecipeService.getOrderByOrderId.mockResolvedValue(
      offlinePaidOrder({
        status: CustomRecipeStatus.CANCELLED,
        orderSource: 'SELF',
        paymentChannel: 'WECHAT_ONLINE',
        actualPaidAmount: null,
        paymentTransactionId: 'wx-tx-1',
      }),
    );

    await post(refundRoute, { reason: '补退款' }).expect(201);

    expect(wechatPaymentService.createCustomRecipeRefund).toHaveBeenCalledWith({
      orderId: 'CR202610210001',
      reason: '补退款',
    });
  });
});
