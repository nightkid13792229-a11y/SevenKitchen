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
  function createAdminController(orderOverrides: Record<string, unknown> = {}) {
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
    const prisma = {
      recipe: { create: recipeCreate },
      recipeItem: { createMany: recipeItemCreateMany },
    };

    const customRecipeService = {
      getOrderByOrderId: jest.fn().mockResolvedValue(order),
      updateOrder: jest.fn().mockResolvedValue({}),
      updateOrderStatus: jest.fn().mockResolvedValue(undefined),
      ['prisma']: prisma,
    };
    const wechatService = {
      sendCustomRecipeOrderNotification: jest.fn().mockResolvedValue({
        success: true,
      }),
    };

    const controller = new AdminCustomRecipeController(
      customRecipeService as any,
      {} as any,
      wechatService as any,
    );

    return { controller, recipeCreate, customRecipeService, wechatService };
  }

  const dto = {
    name: '专属鲜食',
    description: '按档案定制',
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
});

describe('CustomRecipeController · 顾客端编号口径', () => {
  function createCustomerController() {
    const customRecipeService = {
      getOrders: jest.fn().mockResolvedValue({
        orders: [
          {
            orderId: 'CR202609280001',
            dog: { name: '面包' },
            targetGoal: 'MAINTAIN',
            status: 'DELIVERED',
            amount: 300,
            creditAmount: 150,
            creditUsed: 0,
            // 订单存的是食谱主键，业务编号在关联对象上
            recipeId: 'recipe-pk-1',
            recipe: { id: 'recipe-pk-1', recipeId: 'CR1759000000000' },
            createdAt: new Date('2026-09-28'),
          },
        ],
        total: 1,
      }),
      getOrderByOrderId: jest.fn().mockResolvedValue({
        orderId: 'CR202609280001',
        customerId: 'user-1',
        status: 'DELIVERED',
        amount: 300,
        creditAmount: 150,
        creditUsed: 0,
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

    const controller = new CustomRecipeController(
      customRecipeService as any,
      {} as any,
    );

    return { controller };
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
            creditAmount: 150,
            creditUsed: 0,
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
