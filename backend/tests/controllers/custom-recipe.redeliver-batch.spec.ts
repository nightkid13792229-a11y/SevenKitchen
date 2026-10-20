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

/**
 * 后台 · 按选中份重新交付接口（2026-10-21 · 多份售后改稿）
 *
 * 这里锁的是**控制器边界**（批次内容刷新在
 * `custom-recipe-redeliver-batch.spec.ts` 里穷举过）：
 *   · 选中 2 份 → 调 service，返回新版本 + DELIVERED；
 *   · 只发一条交付通知，链接用**第一份被选中**的食谱业务编号；
 *   · 空数组 / 非数组 / 空白字符串 / 超过 5 份 → 进 service 之前就 400；
 *   · 非管理员 403；
 *   · 通知或接收人查询失败不影响已完成的重新交付。
 */
describe('AdminCustomRecipeController · 按份重新交付接口', () => {
  const route =
    '/api/v1/admin/custom-recipe/orders/CR202610210001/redeliver-batch';

  let app: INestApplication;
  let deliveryService: { redeliverBatchItems: jest.Mock };
  let customRecipeService: { getOrderByOrderId: jest.Mock };
  let wechatService: { sendCustomRecipeOrderNotification: jest.Mock };

  const redeliverResult = () => ({
    orderId: 'CR202610210001',
    batchId: 'batch-2',
    version: 2,
    deliveredAt: new Date('2026-10-21T02:00:00.000Z'),
    autoCompleteAt: new Date('2026-10-28T02:00:00.000Z'),
    recipeCount: 3,
    selectedItemIds: ['item-3', 'item-1'],
    selectedRecipes: [
      {
        deliveryItemId: 'item-3',
        recipeId: 'CR1759100000003',
        recipeName: '鸭肉西兰花',
        itemCodes: ['RECIPE', 'SHOPPING_SOP'],
      },
      {
        deliveryItemId: 'item-1',
        recipeId: 'CR1759100000001',
        recipeName: '鸡肉南瓜',
        itemCodes: ['RECIPE'],
      },
    ],
    legacyRecipeId: 'recipe-pk-1',
  });

  beforeAll(async () => {
    deliveryService = { redeliverBatchItems: jest.fn() };
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
    deliveryService.redeliverBatchItems
      .mockReset()
      .mockResolvedValue(redeliverResult());
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

  it('★ 选中 2 份：调用服务并返回新版本 + DELIVERED', async () => {
    const res = await post({ deliveryItemIds: ['item-3', 'item-1'] }).expect(
      201,
    );

    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({
      orderId: 'CR202610210001',
      batchId: 'batch-2',
      version: 2,
      recipeCount: 3,
      selectedItemIds: ['item-3', 'item-1'],
      status: 'DELIVERED',
    });
    expect(res.body.data.selectedRecipes).toHaveLength(2);

    expect(deliveryService.redeliverBatchItems).toHaveBeenCalledTimes(1);
    expect(deliveryService.redeliverBatchItems).toHaveBeenCalledWith({
      orderIdOrId: 'CR202610210001',
      deliveryItemIds: ['item-3', 'item-1'],
      deliveredBy: 'admin-1',
    });
  });

  it('★ 只发一条交付通知，链接用第一份被选中的食谱业务编号', async () => {
    await post({ deliveryItemIds: ['item-3', 'item-1'] }).expect(201);

    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).toHaveBeenCalledTimes(1);
    expect(
      wechatService.sendCustomRecipeOrderNotification.mock.calls[0],
    ).toEqual(['openid-1', 'CR202610210001', 'DELIVERED', 'CR1759100000003']);
  });

  it('service 的 400 原样放出去（不会变成 500，也不发通知）', async () => {
    deliveryService.redeliverBatchItems.mockRejectedValueOnce(
      new BadRequestException('选中的食谱不在本次交付里，请刷新页面后重新选择'),
    );

    const res = await post({
      deliveryItemIds: ['item-1', 'item-别的订单'],
    }).expect(400);

    expect(JSON.stringify(res.body)).toContain('不在本次交付里');
    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).not.toHaveBeenCalled();
  });

  it('缺 deliveryItemIds 返回 400，且不会调用服务', async () => {
    const res = await post({}).expect(400);

    expect(JSON.stringify(res.body)).toContain('deliveryItemIds');
    expect(deliveryService.redeliverBatchItems).not.toHaveBeenCalled();
  });

  it('空数组返回 400，且不会调用服务', async () => {
    await post({ deliveryItemIds: [] }).expect(400);
    expect(deliveryService.redeliverBatchItems).not.toHaveBeenCalled();
  });

  it('非数组 / 含空字符串的 deliveryItemIds 返回 400', async () => {
    await post({ deliveryItemIds: 'item-1' }).expect(400);
    await post({ deliveryItemIds: ['item-1', '  '] }).expect(400);
    expect(deliveryService.redeliverBatchItems).not.toHaveBeenCalled();
  });

  it('超过 5 份返回 400（业务硬上限），不进入服务', async () => {
    const res = await post({
      deliveryItemIds: ['1', '2', '3', '4', '5', '6'],
    }).expect(400);

    expect(JSON.stringify(res.body)).toContain('最多重新交付 5 份');
    expect(deliveryService.redeliverBatchItems).not.toHaveBeenCalled();
  });

  it('非管理员返回 403，既不重交也不发通知', async () => {
    await post({ deliveryItemIds: ['item-1'] }, 'STAFF').expect(403);

    expect(deliveryService.redeliverBatchItems).not.toHaveBeenCalled();
    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).not.toHaveBeenCalled();
  });

  it('通知发送失败不影响重新交付结果', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    wechatService.sendCustomRecipeOrderNotification.mockRejectedValueOnce(
      new Error('微信订阅消息失败'),
    );

    const res = await post({ deliveryItemIds: ['item-1'] }).expect(201);

    expect(res.body.data.status).toBe('DELIVERED');
    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('查通知接收人失败也不影响重新交付结果（不把已交付报成 500）', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    customRecipeService.getOrderByOrderId.mockRejectedValueOnce(
      new Error('订单查询失败'),
    );

    const res = await post({ deliveryItemIds: ['item-1'] }).expect(201);

    expect(res.body.data.status).toBe('DELIVERED');
    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
