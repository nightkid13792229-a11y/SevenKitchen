import { AdminCustomRecipeController } from '../../src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller';
import { CustomRecipeController } from '../../src/interfaces/controllers/custom-recipe/custom-recipe.controller';
import { CustomRecipeStatus } from '@prisma/client';

/**
 * 食谱定制 · 控制层回归（2026-09-28）
 *
 * 三个真实缺陷：
 *   1. 交付时把食谱写成 PUBLIC，且不写 customerOwnerId ——
 *      按某只狗病情做的食谱会出现在所有人的公开列表里；
 *   2. 交付只接受 PAID，导致「确认付款 → 开始制作 → 提交食谱」这条
 *      自然动线必定失败；
 *   3. 顾客端回的 recipeId 是 Recipe 主键，而打开食谱按业务编号查 ——
 *      "查看定制食谱"在**生产上已实测 404**。
 */
describe('CustomRecipeController · 交付与编号口径', () => {
  function createAdminController(
    orderOverrides: Record<string, unknown> = {},
    globalConfigService?: any,
  ) {
    const order = {
      id: 'cr-uuid-1',
      orderId: 'CR202609280001',
      status: CustomRecipeStatus.PAID,
      customerId: 'user-1',
      customer: { wechatOpenid: 'openid-1' },
      ...orderOverrides,
    };

    const recipeCreate = jest.fn().mockResolvedValue({
      id: 'recipe-pk-1',
      recipeId: 'CR1759000000000',
      version: 1,
    });
    const recipeItemCreateMany = jest.fn().mockResolvedValue({});
    const recipeUpdate = jest.fn().mockResolvedValue({});
    const recipeUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      recipe: {
        create: recipeCreate,
        update: recipeUpdate,
        updateMany: recipeUpdateMany,
      },
      recipeItem: { createMany: recipeItemCreateMany },
    };

    const customRecipeService = {
      // 批次 1.5：视图服务要用（售后窗口天数、是否要求确认收货）
      getAftersaleWindowDays: jest.fn().mockResolvedValue(30),
      getRequireCustomerConfirm: jest.fn().mockResolvedValue(true),
      getPaymentTimeoutMinutes: jest.fn().mockResolvedValue(30),
      getOrderByOrderId: jest.fn().mockResolvedValue(order),
      signOrderMedia: jest.fn().mockImplementation(async (value: any) => value),
      updateOrder: jest.fn().mockResolvedValue({}),
      updateOrderStatus: jest.fn().mockResolvedValue(undefined),
      ['prisma']: prisma,
    };
    const wechatService = {
      sendCustomRecipeOrderNotification: jest.fn().mockResolvedValue({
        success: true,
      }),
    };
    /**
     * 2026-10-04：后台取消"已付款"订单要先原路退款（老板口径 3），
     * 所以控制器多了支付服务这个依赖。
     */
    const wechatPaymentService = {
      createCustomRecipeRefund: jest.fn().mockResolvedValue({
        status: 'PROCESSING',
      }),
    };
    const deliveryService = {
      deliver: jest.fn().mockResolvedValue({
        deliveryId: 'delivery-1',
        autoCompleteAt: null,
      }),
    };

    const controller = new AdminCustomRecipeController(
      customRecipeService as any,
      {} as any,
      wechatService as any,
      wechatPaymentService as any,
      deliveryService as any,
      undefined,
      undefined,
      undefined,
      globalConfigService,
    );

    return {
      controller,
      recipeCreate,
      recipeUpdate,
      recipeUpdateMany,
      customRecipeService,
      wechatService,
      wechatPaymentService,
    };
  }

  /**
   * 口径 2（2026-10-04）：改状态接口开始按角色区分 ——
   * 「开始制作」客服可以做，「取消订单」只有管理员能做，所以测试要带上身份。
   */
  const adminReq = { user: { userId: 'admin-1', role: 'ADMIN' } } as any;

  const dto = {
    name: '专属鲜食',    description: '按档案定制',
    nutritionStandard: 'FEDIAF_2025',
    nutritionTarget: { energy_density_kcal_per_kg: 3600 },
    items: [],
    productionSteps: '1. 切块',
  } as any;

  it('交付的食谱是私有定制食谱，而不是公开食谱', async () => {
    const { controller, recipeCreate } = createAdminController();

    await controller.createRecipe('CR202609280001', dto);

    const data = recipeCreate.mock.calls[0][0].data;
    expect(data.status).toBe('PRIVATE_CUSTOM');
    expect(data.isCustomRecipe).toBe(true);
    // 不写 customerOwnerId 的话，主人自己也打不开
    expect(data.customerOwnerId).toBe('user-1');
    expect(data.customOrderId).toBe('cr-uuid-1');
  });

  it('★ 新建食谱的生产损耗率读全局配置（不再读 CustomRecipeConfig）', async () => {
    const globalConfigService = {
      getGlobalConfig: jest
        .fn()
        .mockResolvedValue({ productionLossRate: 1.13 }),
    };
    const { controller, recipeCreate } = createAdminController(
      {},
      globalConfigService,
    );

    await controller.createRecipe('CR202609280001', dto);

    expect(globalConfigService.getGlobalConfig).toHaveBeenCalledTimes(1);
    expect(recipeCreate.mock.calls[0][0].data.productionLossRate).toBe(1.13);
  });

  it('全局配置缺失 / 值不合法 / 读取抛错 → 回落 1.07', async () => {
    const configs = [
      undefined,
      {
        getGlobalConfig: jest
          .fn()
          .mockResolvedValue({ productionLossRate: 0.9 }),
      },
      {
        getGlobalConfig: jest
          .fn()
          .mockRejectedValue(new Error('数据库连接失败')),
      },
    ];

    for (const globalConfigService of configs) {
      const { controller, recipeCreate } = createAdminController(
        {},
        globalConfigService,
      );

      await controller.createRecipe('CR202609280001', dto);

      expect(recipeCreate.mock.calls[0][0].data.productionLossRate).toBe(1.07);
    }
  });

  it('★ 新建食谱只写新行，不回写已有食谱（迁移不回溯改数）', async () => {
    const globalConfigService = {
      getGlobalConfig: jest
        .fn()
        .mockResolvedValue({ productionLossRate: 1.13 }),
    };
    const { controller, recipeUpdate, recipeUpdateMany } =
      createAdminController({}, globalConfigService);

    await controller.createRecipe('CR202609280001', dto);

    expect(recipeUpdate).not.toHaveBeenCalled();
    expect(recipeUpdateMany).not.toHaveBeenCalled();
  });

  it('营养标准用后台选的，而不是永远写死', async () => {
    const { controller, recipeCreate } = createAdminController();

    await controller.createRecipe('CR202609280001', dto);

    expect(recipeCreate.mock.calls[0][0].data.nutritionStandard).toBe(
      'FEDIAF_2025',
    );
  });

  it('「已付款」和「制作中」两个状态都能交付', async () => {
    for (const status of [
      CustomRecipeStatus.PAID,
      CustomRecipeStatus.IN_PROGRESS,
    ]) {
      const { controller, recipeCreate } = createAdminController({ status });
      await controller.createRecipe('CR202609280001', dto);
      expect(recipeCreate).toHaveBeenCalledTimes(1);
    }
  });

  it('未付款的单不能交付，且提示要说清原因', async () => {
    const { controller, recipeCreate } = createAdminController({
      status: CustomRecipeStatus.PENDING_PAYMENT,
    });

    await expect(
      controller.createRecipe('CR202609280001', dto),
    ).rejects.toThrow(/无法创建食谱/);
    expect(recipeCreate).not.toHaveBeenCalled();
  });

  it('交付通知里传的是业务编号（传主键顾客点开就是 404）', async () => {
    const { controller, wechatService } = createAdminController();

    await controller.createRecipe('CR202609280001', dto);

    const call =
      wechatService.sendCustomRecipeOrderNotification.mock.calls[0];
    expect(call[3]).toBe('CR1759000000000');
  });

  it('「确认收款」对已交付的单会被拒绝（原先可以把已交付打回已付款）', async () => {
    const { controller } = createAdminController({
      status: CustomRecipeStatus.DELIVERED,
    });

    await expect(
      controller.confirmPayment('CR202609280001'),
    ).rejects.toThrow(/无需确认收款/);
  });

  it('改状态会把取消原因透传给 service', async () => {
    const { controller, customRecipeService } = createAdminController();

    await controller.updateStatus(
      adminReq,
      'CR202609280001',
      CustomRecipeStatus.CANCELLED,
      '顾客改主意',
    );

    expect(customRecipeService.updateOrderStatus).toHaveBeenCalledWith(
      'CR202609280001',
      CustomRecipeStatus.CANCELLED,
      { reason: '顾客改主意' },
    );
  });

  // ---------- 2026-10-04：后台取消已付款单必须先退款（老板口径 3） ----------

  it('取消一张已付款的订单会先原路退款，再改状态', async () => {
    const { controller, wechatPaymentService, customRecipeService } =
      createAdminController();

    await controller.updateStatus(
      adminReq,
      'CR202609280001',
      CustomRecipeStatus.CANCELLED as any,
      '顾客要求取消',
    );

    expect(wechatPaymentService.createCustomRecipeRefund).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'CR202609280001' }),
    );
    expect(customRecipeService.updateOrderStatus).toHaveBeenCalledWith(
      'CR202609280001',
      CustomRecipeStatus.CANCELLED,
      { reason: '顾客要求取消' },
    );
  });

  it('取消一张待付款的订单不触发退款（本来就没收到钱）', async () => {
    const { controller, wechatPaymentService } = createAdminController({
      status: CustomRecipeStatus.PENDING_PAYMENT,
    });

    await controller.updateStatus(
      adminReq,
      'CR202609280001',
      CustomRecipeStatus.CANCELLED as any,
    );

    expect(wechatPaymentService.createCustomRecipeRefund).not.toHaveBeenCalled();
  });

  /**
   * 2026-10-21 修：制作中（IN_PROGRESS）同样是"钱已收、货未交"。
   *
   * 原来只认 PAID，于是后台取消制作中的单**不退款** ——
   * 生产单 CR202610201196 有 paymentConfirmedAt / paymentTransactionId，
   * 取消后 refundStatus 仍为 null。
   */
  it('★ 取消一张制作中的订单也会先原路退款，再改状态', async () => {
    const { controller, wechatPaymentService, customRecipeService } =
      createAdminController({
        status: CustomRecipeStatus.IN_PROGRESS,
        // 生产单 CR202610201196 的证据形态：钱已确认，状态在制作中
        paymentConfirmedAt: new Date('2026-10-20T08:00:00.000Z'),
        paymentTransactionId: 'wx-tx-20261020',
      });

    await controller.updateStatus(
      adminReq,
      'CR202609280001',
      CustomRecipeStatus.CANCELLED as any,
      '顾客要求取消',
    );

    expect(wechatPaymentService.createCustomRecipeRefund).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'CR202609280001' }),
    );
    // 必须先退款成功，再取消；顺序反了就会出现"取消了钱没退"
    expect(
      wechatPaymentService.createCustomRecipeRefund.mock.invocationCallOrder[0],
    ).toBeLessThan(
      customRecipeService.updateOrderStatus.mock.invocationCallOrder[0],
    );
    expect(customRecipeService.updateOrderStatus).toHaveBeenCalledWith(
      'CR202609280001',
      CustomRecipeStatus.CANCELLED,
      { reason: '顾客要求取消' },
    );
  });

  it('★ 退款失败时后台取消不生效（订单保持原状）', async () => {
    const { controller, wechatPaymentService, customRecipeService } =
      createAdminController({ status: CustomRecipeStatus.IN_PROGRESS });

    wechatPaymentService.createCustomRecipeRefund.mockRejectedValueOnce(
      new Error('线上退款未启用'),
    );

    await expect(
      controller.updateStatus(
        adminReq,
        'CR202609280001',
        CustomRecipeStatus.CANCELLED as any,
      ),
    ).rejects.toThrow('线上退款未启用');

    expect(customRecipeService.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('★ 退款返回失败状态（ABNORMAL）时同样不取消订单', async () => {
    const { controller, wechatPaymentService, customRecipeService } =
      createAdminController({ status: CustomRecipeStatus.IN_PROGRESS });

    // 微信可能是"不抛错但返回失败状态"，不能当成功
    wechatPaymentService.createCustomRecipeRefund.mockResolvedValueOnce({
      status: 'ABNORMAL',
    });

    await expect(
      controller.updateStatus(
        adminReq,
        'CR202609280001',
        CustomRecipeStatus.CANCELLED as any,
      ),
    ).rejects.toThrow('退款未成功');

    expect(customRecipeService.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('★ 状态仍停在待付款但已有付款确认时间：也退款（防止状态漂移漏退）', async () => {
    const { controller, wechatPaymentService } = createAdminController({
      status: CustomRecipeStatus.PENDING_PAYMENT,
      paymentConfirmedAt: new Date('2026-10-20T08:00:00.000Z'),
    });

    await controller.updateStatus(
      adminReq,
      'CR202609280001',
      CustomRecipeStatus.CANCELLED as any,
    );

    expect(wechatPaymentService.createCustomRecipeRefund).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'CR202609280001' }),
    );
  });

  it('已交付/已完成的单取消不触发退款（口径不变）', async () => {
    for (const status of [
      CustomRecipeStatus.DELIVERED,
      CustomRecipeStatus.COMPLETED,
    ]) {
      const { controller, wechatPaymentService } = createAdminController({
        status,
        paymentConfirmedAt: new Date('2026-10-20T08:00:00.000Z'),
      });

      await controller.updateStatus(
        adminReq,
        'CR202609280001',
        CustomRecipeStatus.CANCELLED as any,
      );

      expect(
        wechatPaymentService.createCustomRecipeRefund,
      ).not.toHaveBeenCalled();
    }
  });

  it('非法状态值返回业务错误（400），而不是透传给数据库变成 500', async () => {
    const { controller, customRecipeService } = createAdminController();

    await expect(
      controller.updateStatus(adminReq, 'CR202609280001', 'NOT_A_STATUS' as any),
    ).rejects.toThrow('状态值不合法');

    expect(customRecipeService.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('口径 2：客服可以开始制作，但取消订单会被拒绝（仅管理员）', async () => {
    const staffReq = { user: { userId: 'staff-1', role: 'STAFF' } } as any;

    const start = createAdminController({
      status: CustomRecipeStatus.PAID,
    });
    await start.controller.updateStatus(
      staffReq,
      'CR202609280001',
      CustomRecipeStatus.IN_PROGRESS as any,
    );
    expect(start.customRecipeService.updateOrderStatus).toHaveBeenCalledWith(
      'CR202609280001',
      CustomRecipeStatus.IN_PROGRESS,
      expect.anything(),
    );

    const cancel = createAdminController();
    await expect(
      cancel.controller.updateStatus(
        staffReq,
        'CR202609280001',
        CustomRecipeStatus.CANCELLED as any,
      ),
    ).rejects.toThrow('取消订单需要管理员权限');
    expect(cancel.customRecipeService.updateOrderStatus).not.toHaveBeenCalled();
    expect(
      cancel.wechatPaymentService.createCustomRecipeRefund,
    ).not.toHaveBeenCalled();
  });
});

describe('CustomRecipeController · 顾客端编号口径', () => {
  function createCustomerController() {
    const customRecipeService = {
      // 批次 1.5：视图服务要用（售后窗口天数、是否要求确认收货）
      getAftersaleWindowDays: jest.fn().mockResolvedValue(30),
      getRequireCustomerConfirm: jest.fn().mockResolvedValue(true),
      getPaymentTimeoutMinutes: jest.fn().mockResolvedValue(30),
      getOrders: jest.fn().mockResolvedValue({
        orders: [
          {
            orderId: 'CR202609280001',
            dog: { name: '面包' },
            targetGoal: 'MAINTAIN',
            status: 'DELIVERED',
            amount: 300,
            // 订单存的是食谱主键，业务编号在关联对象上
            recipeId: 'recipe-pk-1',
            recipe: { id: 'recipe-pk-1', recipeId: 'CR1759000000000' },
            createdAt: new Date('2026-09-28'),
          },
        ],
        total: 1,
      }),
      /**
       * 2026-10-04：订单列表/详情新增"支付截止时间"，
       * 控制器要向 service 取一次支付时限才能算出来。
       */
      getPaymentTimeoutMinutes: jest.fn().mockResolvedValue(30),
      signOrderMedia: jest.fn().mockImplementation(async (value: any) => value),
      getOrderByOrderId: jest.fn().mockResolvedValue({
        id: 'order-pk-1',
        orderId: 'CR202609280001',
        customerId: 'user-1',
        status: 'DELIVERED',
        amount: 300,
        recipeId: 'recipe-pk-1',
        recipe: {
          id: 'recipe-pk-1',
          recipeId: 'CR1759000000000',
          name: '专属鲜食',
          coverImageUrl: null,
        },
        allergies: [],
        medicalConditions: [],
        preferredIngredients: [],
        dislikedIngredients: [],
        additionalNotes: null,
        attachments: [],
        createdAt: new Date('2026-09-28'),
      }),
      ['prisma']: { dog: { findFirst: jest.fn() } },
    };

    /**
     * 2026-10-21：订单详情会额外查一次多份交付批次（老订单返回 null）。
     * 本文件只测编号口径，给最小替身即可。
     */
    const deliveryService = {
      findLatestBatchForOrder: jest.fn().mockResolvedValue(null),
    };

    /**
     * 第三个参数是 2026-10-16（批次 1.5）加的视图服务 ——
     * 它负责组装 `renderable` 三件套（状态中文 / 动作 / 进度）。
     * 本文件测的是"业务编号回得对不对"，所以给它一个最小替身即可；
     * 三件套本身的逻辑在 `custom-recipe-action-resolver.spec.ts` 里
     * 用纯函数穷举测过，不在这里重复。
     */
    const viewService = {
      buildCustomerView: jest.fn().mockResolvedValue({
        status: { code: 'PAID', label: '已付款', tone: 'info' },
        actions: [],
        progress: { current: 'PAID', timeline: [] },
      }),
    };

    const controller = new CustomRecipeController(
      customRecipeService as any,
      {} as any,
      viewService as any,
      deliveryService as any,
      // 2026-10-20：报价接口新增的两个依赖，本文件用不到
      {} as any,
      {} as any,
      {} as any,
    );

    return { controller, viewService, deliveryService };
  }

  // 控制器第一个参数是 @Req()，它读的是 req.user
  const req = { user: { userId: 'user-1', customerId: 'user-1' } } as any;

  it('订单列表回的是业务编号，小程序才能打开食谱', async () => {
    const { controller } = createCustomerController();

    const res: any = await controller.getMyOrders(req);

    expect(res.data.orders[0].recipeId).toBe('CR1759000000000');
  });

  it('订单详情回的是业务编号', async () => {
    const { controller } = createCustomerController();

    const res: any = await controller.getOrderDetail(
      req,
      'CR202609280001',
    );

    expect(res.data.recipeId).toBe('CR1759000000000');
  });

  it('没有交付食谱时回 null，而不是回一个打不开的主键', async () => {
    const { controller } = createCustomerController();
    (controller as any).customRecipeService.getOrders = jest
      .fn()
      .mockResolvedValue({
        orders: [
          {
            orderId: 'CR202609280002',
            dog: { name: '面包' },
            targetGoal: 'MAINTAIN',
            status: 'PAID',
            amount: 300,
            recipeId: null,
            recipe: null,
            createdAt: new Date('2026-09-28'),
          },
        ],
        total: 1,
      });

    const res: any = await controller.getMyOrders(req);

    expect(res.data.orders[0].recipeId).toBeNull();
  });
});
