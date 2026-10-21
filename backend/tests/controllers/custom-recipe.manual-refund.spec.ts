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
 * 后台 · 手工补退款接口（2026-10-21）
 *
 * 生产单 CR202610201196 在**修复前**被取消：取消时只认 PAID，
 * 制作中的单不退钱 —— 结果 status=CANCELLED、refundStatus=null、钱已收。
 * 而订单一旦取消，后台的「取消订单」按钮就没了，**没有任何入口能补退**。
 *
 * 这里锁的是控制器边界：
 *   · 管理员可以对"已取消但已收款"的单发起原路退款（可带原因）；
 *   · 没收到钱的单返回 400，且不调用支付服务；
 *   · 已成功/处理中的退款由 helper 幂等复用，不会重复打款；
 *   · 退款失败（未开启线上退款等）原样抛给页面，不能吞成成功；
 *   · 员工（STAFF）403。
 */
describe('AdminCustomRecipeController · 手工补退款接口', () => {
  const route = '/api/v1/admin/custom-recipe/orders/CR202610201196/refund';

  let app: INestApplication;
  let customRecipeService: { getOrderByOrderId: jest.Mock };
  let wechatPaymentService: { createCustomRecipeRefund: jest.Mock };

  /**
   * 生产单 CR202610201196 的真实形态：
   * 已取消、钱已确认到账、退款状态为空（取消时没退）。
   */
  const legacyCancelledPaidOrder = () => ({
    id: 'cr-uuid-1',
    orderId: 'CR202610201196',
    status: CustomRecipeStatus.CANCELLED,
    paymentConfirmedAt: new Date('2026-10-20T08:00:00.000Z'),
    paymentTransactionId: 'wx-tx-20261020',
    refundStatus: null,
  });

  const refundResult = () => ({
    outRefundNo: 'CRR1759000000000001',
    refundId: 'wx-refund-1',
    status: 'PROCESSING',
    amount: 300,
    reused: false,
  });

  beforeAll(async () => {
    customRecipeService = { getOrderByOrderId: jest.fn() };
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
      /**
       * 只替换登录守卫：真实 AdminGuard 必须留下，
       * 否则"员工 403"测的是替身而不是线上行为。
       */
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
      .mockResolvedValue(legacyCancelledPaidOrder());
    wechatPaymentService.createCustomRecipeRefund
      .mockReset()
      .mockResolvedValue(refundResult());
  });

  function post(body: unknown, role = 'ADMIN') {
    return request(app.getHttpServer())
      .post(route)
      .set('Authorization', 'Bearer test-token')
      .set('x-test-role', role)
      .send(body as object);
  }

  it('★ 管理员补退款：对已取消的已付款单发起原路退款，并回退款状态', async () => {
    const res = await post({ reason: '取消时漏退，人工补退' }).expect(201);

    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({
      orderId: 'CR202610201196',
      status: 'PROCESSING',
      amount: 300,
      outRefundNo: 'CRR1759000000000001',
      refundId: 'wx-refund-1',
      reused: false,
    });

    expect(
      wechatPaymentService.createCustomRecipeRefund,
    ).toHaveBeenCalledTimes(1);
    expect(
      wechatPaymentService.createCustomRecipeRefund,
    ).toHaveBeenCalledWith({
      orderId: 'CR202610201196',
      reason: '取消时漏退，人工补退',
    });
  });

  it('原因可省略，省略时用可追溯的默认原因', async () => {
    await post({}).expect(201);

    expect(
      wechatPaymentService.createCustomRecipeRefund,
    ).toHaveBeenCalledWith({
      orderId: 'CR202610201196',
      reason: '后台手工补退款',
    });
  });

  it('★ 没收到钱的单返回 400，且不会调用支付服务', async () => {
    customRecipeService.getOrderByOrderId.mockResolvedValue({
      ...legacyCancelledPaidOrder(),
      paymentConfirmedAt: null,
      paymentTransactionId: null,
    });

    const res = await post({}).expect(400);

    expect(JSON.stringify(res.body)).toContain('尚未支付');
    expect(
      wechatPaymentService.createCustomRecipeRefund,
    ).not.toHaveBeenCalled();
  });

  it('★ 已退成功/处理中的单幂等复用，不重复打款（reused=true 一并回给页面）', async () => {
    wechatPaymentService.createCustomRecipeRefund.mockResolvedValueOnce({
      outRefundNo: 'CRR1759000000000002',
      refundId: 'wx-refund-2',
      status: 'SUCCESS',
      amount: 300,
      reused: true,
    });

    const res = await post({}).expect(201);

    expect(res.body.data.status).toBe('SUCCESS');
    expect(res.body.data.reused).toBe(true);
    // helper 自己被调用了一次，但它内部会判定"已成功"直接复用——
    // 这里断言的是接口没有绕过 helper 自己再发一次退款请求
    expect(
      wechatPaymentService.createCustomRecipeRefund,
    ).toHaveBeenCalledTimes(1);
  });

  it('★ 退款失败（未开启线上退款等）原样抛给页面，不吞成成功', async () => {
    wechatPaymentService.createCustomRecipeRefund.mockRejectedValueOnce(
      new BadRequestException(
        '线上退款未启用，请先在后台支付配置中开启；或由客服在微信商户后台手工退款',
      ),
    );

    const res = await post({}).expect(400);

    expect(JSON.stringify(res.body)).toContain('线上退款未启用');
  });

  it('订单不存在返回 404，且不会调用支付服务', async () => {
    customRecipeService.getOrderByOrderId.mockResolvedValue(null);

    await post({}).expect(404);

    expect(
      wechatPaymentService.createCustomRecipeRefund,
    ).not.toHaveBeenCalled();
  });

  it('★ 员工（STAFF）返回 403，既不退款也不查订单', async () => {
    await post({ reason: '我想退' }, 'STAFF').expect(403);

    expect(
      wechatPaymentService.createCustomRecipeRefund,
    ).not.toHaveBeenCalled();
  });

  it('未登录返回 401', async () => {
    await request(app.getHttpServer()).post(route).send({}).expect(401);

    expect(
      wechatPaymentService.createCustomRecipeRefund,
    ).not.toHaveBeenCalled();
  });
});
