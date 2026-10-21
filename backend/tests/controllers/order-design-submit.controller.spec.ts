import {
  BadRequestException,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { OrderDesignSubmitService } from '../../src/application/custom-recipe/order-design-submit.service';
import { CustomRecipeService } from '../../src/application/custom-recipe/custom-recipe.service';
import { WechatService } from '../../src/infrastructure/wechat/wechat.service';
import { AuthGuard } from '../../src/interfaces/auth/auth.guard';
import { OrderDesignSubmitController } from '../../src/interfaces/controllers/custom-recipe/order-design-submit.controller';
import { StaffGuard } from '../../src/interfaces/guards/role.guard';

const CONTROLLER_SOURCE = resolve(
  process.cwd(),
  'src/interfaces/controllers/custom-recipe/order-design-submit.controller.ts',
);

const ORDER_ID = 'CR202610220001';

/**
 * 后台 · 订单设计最终提交（2026-10-22 · Task 4）
 *
 * 这里锁控制器边界：
 *   · 仅管理员能触发最终交付（员工 403，不调用 service）；
 *   · 成功只发**一条**交付通知，payload 与 deliver-batch 完全一致；
 *   · 通知或接收人查询失败不影响已完成的交付；
 *   · 重复提交（service 回 replayed=true）不再发第二条通知；
 *   · service 的 400 原样透出，不变成 500。
 */
describe('OrderDesignSubmitController · 订单设计最终提交', () => {
  const route = `/api/v1/admin/custom-recipe/orders/${ORDER_ID}/submit-designs`;

  let app: INestApplication;
  let submitService: {
    submitOrderDesigns: jest.Mock;
    assertLegacyDeliveryAllowed: jest.Mock;
  };
  let customRecipeService: { getOrderByOrderId: jest.Mock };
  let wechatService: { sendCustomRecipeOrderNotification: jest.Mock };

  const submitResult = (overrides: Record<string, unknown> = {}) => ({
    orderId: ORDER_ID,
    batchId: 'batch-1',
    version: 1,
    deliveredAt: new Date('2026-10-22T03:00:00.000Z'),
    autoCompleteAt: new Date('2026-10-29T03:00:00.000Z'),
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
    replayed: false,
    ...overrides,
  });

  beforeAll(async () => {
    submitService = {
      submitOrderDesigns: jest.fn(),
      assertLegacyDeliveryAllowed: jest.fn(),
    };
    customRecipeService = {
      getOrderByOrderId: jest.fn().mockResolvedValue({
        orderId: ORDER_ID,
        customer: { wechatOpenid: 'openid-1' },
      }),
    };
    wechatService = {
      sendCustomRecipeOrderNotification: jest
        .fn()
        .mockResolvedValue({ success: true }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [OrderDesignSubmitController],
      providers: [
        { provide: OrderDesignSubmitService, useValue: submitService },
        { provide: CustomRecipeService, useValue: customRecipeService },
        { provide: WechatService, useValue: wechatService },
      ],
    })
      /**
       * 只替换登录守卫：真实 AdminGuard 必须留下，
       * 否则「员工不能最终交付」这条用例测的就是替身而不是线上行为。
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
    submitService.submitOrderDesigns
      .mockReset()
      .mockResolvedValue(submitResult());
    submitService.assertLegacyDeliveryAllowed.mockReset();
    customRecipeService.getOrderByOrderId.mockClear();
    wechatService.sendCustomRecipeOrderNotification
      .mockReset()
      .mockResolvedValue({ success: true });
  });

  function post(role = 'ADMIN', body: unknown = {}) {
    return request(app.getHttpServer())
      .post(route)
      .set('Authorization', 'Bearer test-token')
      .set('x-test-role', role)
      .send(body as object);
  }

  it('管理员提交成功：透传订单号与操作人，返回批次摘要 + DELIVERED', async () => {
    const res = await post().expect(201);

    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({
      orderId: ORDER_ID,
      batchId: 'batch-1',
      version: 1,
      recipeCount: 2,
      status: 'DELIVERED',
    });
    expect(submitService.submitOrderDesigns).toHaveBeenCalledWith(
      ORDER_ID,
      'admin-1',
    );
  });

  it('★ 员工不能最终交付：403，且不调用提交服务、不发通知', async () => {
    await post('STAFF').expect(403);

    expect(submitService.submitOrderDesigns).not.toHaveBeenCalled();
    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).not.toHaveBeenCalled();
  });

  it('★ 只发一条交付通知，payload 与 deliver-batch 完全一致', async () => {
    await post().expect(201);

    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).toHaveBeenCalledTimes(1);
    expect(
      wechatService.sendCustomRecipeOrderNotification.mock.calls[0],
    ).toEqual(['openid-1', ORDER_ID, 'DELIVERED', 'CR1759100000001']);
  });

  it('通知发送失败不影响提交结果（批次已经交付成功）', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    wechatService.sendCustomRecipeOrderNotification.mockRejectedValueOnce(
      new Error('微信订阅消息失败'),
    );

    const res = await post().expect(201);

    expect(res.body.data.status).toBe('DELIVERED');
    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('查通知接收人失败也不影响提交结果', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    customRecipeService.getOrderByOrderId.mockRejectedValueOnce(
      new Error('订单查询失败'),
    );

    const res = await post().expect(201);

    expect(res.body.data.status).toBe('DELIVERED');
    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('★ 重复提交（replayed=true）返回当前批次摘要，不再发第二条通知', async () => {
    submitService.submitOrderDesigns.mockResolvedValue(
      submitResult({ replayed: true }),
    );

    const res = await post().expect(201);

    expect(res.body.data.replayed).toBe(true);
    expect(res.body.data.batchId).toBe('batch-1');
    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).not.toHaveBeenCalled();
  });

  it('未就绪份数不足时把 service 的 400 原样透出，且不发通知', async () => {
    submitService.submitOrderDesigns.mockRejectedValueOnce(
      new BadRequestException('本单共 2 份，还有 1 份未加入待提交'),
    );

    const res = await post().expect(400);

    expect(JSON.stringify(res.body)).toContain('未加入待提交');
    expect(
      wechatService.sendCustomRecipeOrderNotification,
    ).not.toHaveBeenCalled();
  });

  it('路由挂 AdminGuard，控制器类级只要求登录 + 员工', () => {
    const source = readFileSync(CONTROLLER_SOURCE, 'utf8');

    expect(source).toMatch(
      /@Post\('orders\/:orderId\/submit-designs'\)\s+@UseGuards\(AdminGuard\)/,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, OrderDesignSubmitController),
    ).toEqual([AuthGuard, StaffGuard]);
  });
});
