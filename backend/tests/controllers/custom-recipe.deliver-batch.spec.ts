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
import { OrderDesignSubmitService } from '../../src/application/custom-recipe/order-design-submit.service';
import { WechatPaymentService } from '../../src/application/payment/wechat-payment.service';
import { PrismaService } from '../../src/infrastructure/prisma.service';
import { WechatService } from '../../src/infrastructure/wechat/wechat.service';
import { AuthGuard } from '../../src/interfaces/auth/auth.guard';

/**
 * 后台 · 多份订单批量交付接口（2026-10-21 · 第二阶段 Task 1）
 *
 * 这里锁的是**控制器边界**，不是交付业务本身（业务在
 * `custom-recipe-delivery-batch.spec.ts` 里穷举过）：
 *   · 2 份一次交付成功，返回批次摘要 + DELIVERED；
 *   · 份数不对时把 service 的 400 原样放出去，不能变成 500；
 *   · 缺参 / 空数组 / 超过 5 份在进 service 之前就 400；
 *   · 非管理员 403；
 *   · 只发一条微信交付通知，链接用第一份的业务编号；
 *   · 通知发送失败不影响已完成的交付。
 */
describe('AdminCustomRecipeController · 批量交付接口', () => {
  const route =
    '/api/v1/admin/custom-recipe/orders/CR202610210001/deliver-batch';

  let app: INestApplication;
  let deliveryService: { deliverBatch: jest.Mock; deliver: jest.Mock };
  let customRecipeService: { getOrderByOrderId: jest.Mock };
  let wechatService: { sendCustomRecipeOrderNotification: jest.Mock };
  let legacyGuard: { assertLegacyDeliveryAllowed: jest.Mock };

  const batchResult = () => ({
    orderId: 'CR202610210001',
    batchId: 'batch-1',
    version: 1,
    deliveredAt: new Date('2026-10-21T02:00:00.000Z'),
    autoCompleteAt: new Date('2026-10-28T02:00:00.000Z'),
    recipeCount: 2,
    recipes: [
      {
        recipeId: 'CR1759100000001',
        recipeName: '鸡肉南瓜',
        itemCodes: ['RECIPE', 'SHOPPING_SOP'],
      },
      {
        recipeId: 'CR1759100000002',
        recipeName: '鸭肉西兰花',
        itemCodes: ['RECIPE'],
      },
    ],
    legacyRecipeId: 'recipe-pk-1',
  });

  beforeAll(async () => {
    deliveryService = { deliverBatch: jest.fn(), deliver: jest.fn() };
    legacyGuard = { assertLegacyDeliveryAllowed: jest.fn() };
    customRecipeService = {
      getOrderByOrderId: jest.fn().mockResolvedValue({
        orderId: 'CR202610210001',
        customer: { wechatOpenid: 'openid-1' },
      }),
    };
    wechatService = {
      sendCustomRecipeOrderNotification: jest
        .fn()
        .mockResolvedValue({ success: true }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminCustomRecipeController],
      providers: [
        { provide: CustomRecipeService, useValue: customRecipeService },
        { provide: CustomRecipeConfigService, useValue: {} },
        { provide: WechatService, useValue: wechatService },
        { provide: WechatPaymentService, useValue: {} },
        { provide: CustomRecipeDeliveryService, useValue: deliveryService },
        { provide: CustomRecipeAftersaleService, useValue: {} },
        { provide: CustomRecipeViewService, useValue: {} },
        { provide: OrderDesignSubmitService, useValue: legacyGuard },
        { provide: PrismaService, useValue: {} },
      ],
    })
      /**
       * 只替换登录守卫：真实 AdminGuard 必须留下，
       * 否则「非管理员 403」这条用例测的就是替身而不是线上行为。
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
    deliveryService.deliverBatch.mockReset().mockResolvedValue(batchResult());
    deliveryService.deliver.mockReset();
    legacyGuard.assertLegacyDeliveryAllowed.mockReset();
    customRecipeService.getOrderByOrderId.mockClear();
    wechatService.sendCustomRecipeOrderNotification
      .mockReset()
      .mockResolvedValue({ success: true });
  });

  function post(body: unknown, role = 'ADMIN') {
    return request(app.getHttpServer())
      .post(route)
      .set('Authorization', 'Bearer test-token')
      .set('x-test-role', role)
      .send(body as object);
  }

  it('★ 2 份一次交付成功：返回批次摘要与 DELIVERED，操作人一并透传', async () => {
    const res = await post({ recipeIds: ['r1', 'r2'] }).expect(201);

    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({
      orderId: 'CR202610210001',
      batchId: 'batch-1',
      version: 1,
      recipeCount: 2,
      status: 'DELIVERED',
    });
    expect(res.body.data.recipes).toHaveLength(2);

    // 老订单（没有设计槽位）照旧走订单页交付：先过拦截检查再交付
    expect(legacyGuard.assertLegacyDeliveryAllowed).toHaveBeenCalledWith(
      'CR202610210001',
    );
    expect(deliveryService.deliverBatch).toHaveBeenCalledTimes(1);
    expect(deliveryService.deliverBatch).toHaveBeenCalledWith({
      orderIdOrId: 'CR202610210001',
      recipeIds: ['r1', 'r2'],
      deliveredBy: 'admin-1',
    });
  });

  it('★ 只发一条交付通知，链接用第一份食谱的业务编号', async () => {
    await post({ recipeIds: ['r1', 'r2'] }).expect(201);

    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).toHaveBeenCalledTimes(1);
    expect(
      wechatService.sendCustomRecipeOrderNotification.mock.calls[0],
    ).toEqual(['openid-1', 'CR202610210001', 'DELIVERED', 'CR1759100000001']);
  });

  it('份数不对时把 service 的 400 原样放出去（不会变成 500，也不发通知）', async () => {
    deliveryService.deliverBatch.mockRejectedValueOnce(
      new BadRequestException(
        '本单需要交付 2 份食谱，实际提供了 5 份；多份订单必须一次性交齐',
      ),
    );

    const res = await post({
      recipeIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
    }).expect(400);

    expect(JSON.stringify(res.body)).toContain('需要交付 2 份');
    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).not.toHaveBeenCalled();
  });

  it('缺 recipeIds 返回 400，且不会调用交付服务', async () => {
    const res = await post({}).expect(400);

    expect(JSON.stringify(res.body)).toContain('recipeIds');
    expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
  });

  it('空数组返回 400，且不会调用交付服务', async () => {
    await post({ recipeIds: [] }).expect(400);
    expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
  });

  it('非数组 / 含空字符串的 recipeIds 返回 400', async () => {
    await post({ recipeIds: 'r1' }).expect(400);
    await post({ recipeIds: ['r1', '  '] }).expect(400);
    expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
  });

  it('超过 5 份返回 400（业务硬上限），不进入交付服务', async () => {
    const res = await post({
      recipeIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
    }).expect(400);

    expect(JSON.stringify(res.body)).toContain('最多交付 5 份');
    expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
  });

  it('非管理员返回 403，既不交付也不发通知', async () => {
    await post({ recipeIds: ['r1', 'r2'] }, 'STAFF').expect(403);

    expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).not.toHaveBeenCalled();
  });

  it('通知发送失败不影响交付结果（订单已经交付成功）', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    wechatService.sendCustomRecipeOrderNotification.mockRejectedValueOnce(
      new Error('微信订阅消息失败'),
    );

    const res = await post({ recipeIds: ['r1', 'r2'] }).expect(201);

    expect(res.body.data.status).toBe('DELIVERED');
    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('查通知接收人失败也不影响交付结果（不把已交付报成 500）', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    customRecipeService.getOrderByOrderId.mockRejectedValueOnce(
      new Error('订单查询失败'),
    );

    const res = await post({ recipeIds: ['r1', 'r2'] }).expect(201);

    expect(res.body.data.status).toBe('DELIVERED');
    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  describe('新版订单设计流程 · 旧交付入口不得绕行', () => {
    const newFlowMessage =
      '该订单已使用新版「订单设计」流程，请到订单设计工作台点击「提交设计」整批提交（POST /api/v1/admin/custom-recipe/orders/CR202610210001/submit-designs）';

    it('★ deliver-batch 被 400 拦截，并明确指向 submit-designs', async () => {
      legacyGuard.assertLegacyDeliveryAllowed.mockRejectedValueOnce(
        new BadRequestException(newFlowMessage),
      );

      const res = await post({ recipeIds: ['r1', 'r2'] }).expect(400);

      expect(JSON.stringify(res.body)).toContain('submit-designs');
      expect(JSON.stringify(res.body)).toContain('提交设计');
      expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
      expect(
        wechatService.sendCustomRecipeOrderNotification,
      ).not.toHaveBeenCalled();
    });

    it('★ deliver-recipe 同样被 400 拦截，不能从订单页单份交付', async () => {
      legacyGuard.assertLegacyDeliveryAllowed.mockRejectedValueOnce(
        new BadRequestException(newFlowMessage),
      );

      const res = await request(app.getHttpServer())
        .post(
          '/api/v1/admin/custom-recipe/orders/CR202610210001/deliver-recipe',
        )
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'ADMIN')
        .send({ recipeId: 'r1' })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('submit-designs');
      expect(deliveryService.deliver).not.toHaveBeenCalled();
      expect(
        wechatService.sendCustomRecipeOrderNotification,
      ).not.toHaveBeenCalled();
    });

    it('老订单（无设计槽位）的 deliver-recipe 保持原有交付行为', async () => {
      deliveryService.deliver.mockResolvedValueOnce({
        orderId: 'CR202610210001',
        recipeBizId: 'CR1759100000001',
        recipeName: '鸡肉南瓜',
        version: 1,
        redelivered: false,
        deliveryId: 'delivery-1',
        autoCompleteAt: null,
        itemCodes: ['RECIPE'],
      });

      const res = await request(app.getHttpServer())
        .post(
          '/api/v1/admin/custom-recipe/orders/CR202610210001/deliver-recipe',
        )
        .set('Authorization', 'Bearer test-token')
        .set('x-test-role', 'ADMIN')
        .send({ recipeId: 'r1' })
        .expect(201);

      expect(res.body.data).toMatchObject({
        orderId: 'CR202610210001',
        recipeBizId: 'CR1759100000001',
        status: 'DELIVERED',
      });
      expect(legacyGuard.assertLegacyDeliveryAllowed).toHaveBeenCalledWith(
        'CR202610210001',
      );
      expect(deliveryService.deliver).toHaveBeenCalledWith({
        orderIdOrId: 'CR202610210001',
        recipeIdOrBizId: 'r1',
        deliveredBy: 'admin-1',
      });
      expect(
        wechatService.sendCustomRecipeOrderNotification,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
