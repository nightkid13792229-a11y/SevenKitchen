import { BadRequestException } from '@nestjs/common';
import { CustomRecipeController } from '../../src/interfaces/controllers/custom-recipe/custom-recipe.controller';

/**
 * 顾客端 · 多份交付读取与确认（2026-10-21 · 第二阶段 Task 3）
 *
 * ## 这组测试锁的是**接口形状**
 *
 * 多份订单和老订单在库里是两套交付记录（批次 / 单份），顾客端必须
 * **同一批接口**同时服务两者，而且老订单的响应**一个字都不能变** ——
 * 否则线上老小程序会跟着坏。
 *
 * 因此这里逐字段断言：
 *   · 多份订单详情：`deliveryBatch` 摘要（N 份、业务编号、不背快照），老 `delivery` 保持 null；
 *   · 老订单详情：`delivery` 原样，`deliveryBatch` 为 null；
 *   · 多份交付内容：N 份各自的内容快照；
 *   · 老交付内容：原字段与 `autoCompleteAt` 都不变；
 *   · 确认收到：批次一次确认整批，幂等；
 *   · 归属校验：别人的订单三个接口都进不去。
 */
describe('CustomRecipeController · 顾客端多份交付', () => {
  const batchOrder = () => ({
    id: 'order-pk-batch',
    orderId: 'CR202610210001',
    customerId: 'user-1',
    dogId: 'dog-1',
    dog: {
      id: 'dog-1',
      name: '豆豆',
      breedId: 'breed-1',
      breedName: '柯基',
      customBreedName: null,
      birthday: new Date('2024-01-01T00:00:00.000Z'),
      currentWeightKg: 11.2,
      bcsScore: 5,
      activityLevel: 'NORMAL',
      mealsPerDay: 2,
    },
    status: 'DELIVERED',
    amount: 570,
    recipeQuantity: 2,
    recipe: {
      id: 'recipe-pk-1',
      recipeId: 'CR1759100000001',
      name: '鸡肉南瓜',
      coverImageUrl: 'https://cdn.example.com/1.jpg',
    },
    deliveries: [],
    allergies: [],
    medicalConditions: [],
    preferredIngredients: [],
    dislikedIngredients: [],
    additionalNotes: null,
    attachments: [],
    createdAt: new Date('2026-10-20T02:00:00.000Z'),
    deliveredAt: new Date('2026-10-21T02:00:00.000Z'),
    autoCompleteAt: new Date('2026-10-28T02:00:00.000Z'),
  });

  const latestBatch = () => ({
    id: 'batch-1',
    version: 1,
    deliveredAt: new Date('2026-10-21T02:00:00.000Z'),
    confirmedAt: null,
    items: [
      {
        id: 'item-1',
        items: ['RECIPE', 'SHOPPING_SOP'],
        recipe: {
          recipeId: 'CR1759100000001',
          name: '鸡肉南瓜',
          coverImageUrl: 'https://cdn.example.com/1.jpg',
        },
      },
      {
        id: 'item-2',
        items: ['RECIPE'],
        recipe: {
          recipeId: 'CR1759100000002',
          name: '鸭肉西兰花',
          coverImageUrl: null,
        },
      },
    ],
  });

  const batchContent = () => ({
    id: 'batch-1',
    version: 1,
    deliveredAt: new Date('2026-10-21T02:00:00.000Z'),
    confirmedAt: null,
    items: [
      {
        id: 'item-1',
        items: ['RECIPE', 'SHOPPING_SOP'],
        contentSnapshot: {
          schemaVersion: 1,
          recipe: { name: '鸡肉南瓜', items: [{ name: '鸡胸肉' }] },
        },
        recipe: {
          recipeId: 'CR1759100000001',
          name: '鸡肉南瓜',
          coverImageUrl: 'https://cdn.example.com/1.jpg',
        },
      },
      {
        id: 'item-2',
        items: ['RECIPE'],
        contentSnapshot: {
          schemaVersion: 1,
          recipe: { name: '鸭肉西兰花', items: [{ name: '鸭胸肉' }] },
        },
        recipe: {
          recipeId: 'CR1759100000002',
          name: '鸭肉西兰花',
          coverImageUrl: null,
        },
      },
    ],
  });

  const legacyDelivery = () => ({
    id: 'delivery-1',
    version: 1,
    deliveredAt: new Date('2026-10-18T02:00:00.000Z'),
    confirmedAt: null,
    items: ['RECIPE', 'NUTRITION_REPORT'],
    contentSnapshot: {
      schemaVersion: 1,
      recipe: { name: '单份专属鲜食', items: [{ name: '鸡胸肉' }] },
    },
  });

  function createController(
    overrides: {
      order?: Record<string, unknown>;
      batch?: unknown;
      batchContent?: unknown;
      legacy?: unknown;
      confirm?: unknown;
    } = {},
  ) {
    const customRecipeService = {
      getOrderByOrderId: jest
        .fn()
        .mockResolvedValue(overrides.order ?? batchOrder()),
      signOrderMedia: jest.fn().mockImplementation(async (value: any) => value),
      getPaymentTimeoutMinutes: jest.fn().mockResolvedValue(30),
      getAftersaleWindowDays: jest.fn().mockResolvedValue(7),
      getRequireCustomerConfirm: jest.fn().mockResolvedValue(true),
    };

    const viewService = {
      buildCustomerView: jest.fn().mockResolvedValue({
        status: { code: 'DELIVERED', label: '已交付', tone: 'info' },
        actions: [],
        progress: { current: 'DELIVERED', timeline: [] },
      }),
    };

    const deliveryService = {
      findLatestBatchForOrder: jest
        .fn()
        .mockResolvedValue(overrides.batch ?? null),
      findBatchForCustomer: jest
        .fn()
        .mockResolvedValue(overrides.batchContent ?? null),
      findForCustomer: jest.fn().mockResolvedValue(overrides.legacy ?? null),
      confirmReceipt: jest.fn().mockResolvedValue({
        confirmed: true,
        alreadyConfirmed: false,
      }),
    };
    if (overrides.confirm !== undefined) {
      deliveryService.confirmReceipt.mockResolvedValue(overrides.confirm);
    }

    const controller = new CustomRecipeController(
      customRecipeService as any,
      {} as any,
      viewService as any,
      deliveryService as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return {
      controller,
      customRecipeService,
      viewService,
      deliveryService,
    };
  }

  const req = { user: { userId: 'user-1' } } as any;

  // ==================== 订单详情 ====================

  describe('订单详情', () => {
    it('★ 多份订单：返回 deliveryBatch 摘要（N 份、业务编号、含交付物），不含快照', async () => {
      const { controller, viewService } = createController({
        batch: latestBatch(),
      });

      const res: any = await controller.getOrderDetail(req, 'CR202610210001');

      expect(res.data.deliveryBatch).toEqual({
        id: 'batch-1',
        version: 1,
        deliveredAt: new Date('2026-10-21T02:00:00.000Z'),
        confirmedAt: null,
        autoCompleteAt: new Date('2026-10-28T02:00:00.000Z'),
        items: [
          {
            deliveryItemId: 'item-1',
            recipeId: 'CR1759100000001',
            recipeName: '鸡肉南瓜',
            recipeCoverImageUrl: 'https://cdn.example.com/1.jpg',
            itemCodes: ['RECIPE', 'SHOPPING_SOP'],
          },
          {
            deliveryItemId: 'item-2',
            recipeId: 'CR1759100000002',
            recipeName: '鸭肉西兰花',
            recipeCoverImageUrl: null,
            itemCodes: ['RECIPE'],
          },
        ],
      });

      // ★ 老字段保持原样：多份订单没有老的单份交付记录 → null
      expect(res.data.delivery).toBeNull();

      // ★ 定制对象档案与份数（2026-10-24）：详情页要显示给顾客核对
      expect(res.data.dogBreedName).toBe('柯基');
      expect(res.data.dogWeightKg).toBe(11.2);
      expect(res.data.dogBcsScore).toBe(5);
      expect(res.data.dogActivityLevel).toBe('NORMAL');
      expect(res.data.dogMealsPerDay).toBe(2);
      expect(res.data.recipeQuantity).toBe(2);

      // ★ 摘要里不能带内容快照（几十 KB × N 份）
      const serialized = JSON.stringify(res.data.deliveryBatch);
      expect(serialized).not.toContain('contentSnapshot');
      expect(serialized).not.toContain('content');

      // 渲染契约要把批次算进「有没有交付 / 有没有待确认」
      expect(viewService.buildCustomerView).toHaveBeenCalledWith(
        expect.objectContaining({
          hasAnyDelivery: true,
          hasUnconfirmedDelivery: true,
        }),
      );
    });

    it('多份批次已确认后：待确认标志为 false（按钮不再出现）', async () => {
      const { controller, viewService } = createController({
        batch: {
          ...latestBatch(),
          confirmedAt: new Date('2026-10-22T02:00:00.000Z'),
        },
      });

      await controller.getOrderDetail(req, 'CR202610210001');

      expect(viewService.buildCustomerView).toHaveBeenCalledWith(
        expect.objectContaining({
          hasAnyDelivery: true,
          hasUnconfirmedDelivery: false,
        }),
      );
    });

    it('★ 老订单：delivery 字段形状不变，deliveryBatch 为 null', async () => {
      const legacy = {
        id: 'delivery-1',
        version: 1,
        deliveredAt: new Date('2026-10-18T02:00:00.000Z'),
        confirmedAt: null,
        items: ['RECIPE', 'NUTRITION_REPORT'],
      };
      const order = {
        ...batchOrder(),
        id: 'order-pk-legacy',
        orderId: 'CR202610180001',
        recipeQuantity: 1,
        deliveries: [legacy],
      };
      const { controller } = createController({ order, batch: null });

      const res: any = await controller.getOrderDetail(req, 'CR202610180001');

      expect(res.data.delivery).toEqual({
        id: 'delivery-1',
        version: 1,
        deliveredAt: new Date('2026-10-18T02:00:00.000Z'),
        confirmedAt: null,
        itemCodes: ['RECIPE', 'NUTRITION_REPORT'],
        autoCompleteAt: new Date('2026-10-28T02:00:00.000Z'),
      });
      expect(res.data.deliveryBatch).toBeNull();
    });

    it('订单不存在返回业务错误（而不是 500）', async () => {
      const { controller, customRecipeService } = createController();
      customRecipeService.getOrderByOrderId.mockResolvedValueOnce(null);

      await expect(
        controller.getOrderDetail(req, 'CR404'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ==================== 交付内容 ====================

  describe('交付内容', () => {
    it('★ 多份订单：返回 2 份各自的内容快照，不再走老单份接口', async () => {
      const content = batchContent();
      const { controller, deliveryService } = createController({
        batchContent: content,
      });

      const res: any = await controller.getOrderDelivery(req, 'CR202610210001');

      expect(res.data).toMatchObject({
        batchId: 'batch-1',
        version: 1,
        deliveredAt: new Date('2026-10-21T02:00:00.000Z'),
        confirmedAt: null,
        // 批次级 = 各份交付物的并集（去重）
        itemCodes: ['RECIPE', 'SHOPPING_SOP'],
      });
      expect(res.data.items).toHaveLength(2);
      expect(res.data.items[0]).toEqual({
        id: 'item-1',
        recipeId: 'CR1759100000001',
        recipeName: '鸡肉南瓜',
        recipeCoverImageUrl: 'https://cdn.example.com/1.jpg',
        itemCodes: ['RECIPE', 'SHOPPING_SOP'],
        content: content.items[0].contentSnapshot,
      });
      expect(res.data.items[1]).toMatchObject({
        id: 'item-2',
        recipeId: 'CR1759100000002',
        recipeName: '鸭肉西兰花',
        recipeCoverImageUrl: null,
        itemCodes: ['RECIPE'],
      });
      // 每份快照必须是**各自**的，不能共用一份
      expect(res.data.items[0].content).not.toEqual(res.data.items[1].content);

      expect(deliveryService.findForCustomer).not.toHaveBeenCalled();
    });

    it('交付内容支持 ?version=N 回看指定批次', async () => {
      const { controller, deliveryService } = createController({
        batchContent: batchContent(),
      });

      await controller.getOrderDelivery(req, 'CR202610210001', '2');

      expect(deliveryService.findBatchForCustomer).toHaveBeenCalledWith({
        orderId: 'order-pk-batch',
        version: 2,
      });
    });

    it('★ 老订单：响应形状一个字都不变（含 autoCompleteAt）', async () => {
      const legacy = legacyDelivery();
      const { controller } = createController({
        batchContent: null,
        legacy,
      });

      const res: any = await controller.getOrderDelivery(req, 'CR202610210001');

      expect(res.data).toEqual({
        id: 'delivery-1',
        version: 1,
        deliveredAt: new Date('2026-10-18T02:00:00.000Z'),
        confirmedAt: null,
        // 2026-10-24：交付页预选 DIY / 成品下单要用这只狗
        dogId: 'dog-1',
        itemCodes: ['RECIPE', 'NUTRITION_REPORT'],
        content: legacy.contentSnapshot,
        autoCompleteAt: new Date('2026-10-28T02:00:00.000Z'),
      });
      // 多份专属字段不能出现在老响应里
      expect(res.data).not.toHaveProperty('batchId');
      expect(res.data).not.toHaveProperty('items');
    });

    it('既没有批次也没有老交付记录 → 404 文案不变', async () => {
      const { controller } = createController({
        batchContent: null,
        legacy: null,
      });

      await expect(
        controller.getOrderDelivery(req, 'CR202610210001'),
      ).rejects.toThrow('这张订单还没有交付内容');
    });
  });

  // ==================== 确认收到 ====================

  describe('确认收到', () => {
    it('★ 多份订单一次确认整批：透传渠道，返回 confirmed', async () => {
      const { controller, deliveryService } = createController({
        confirm: { confirmed: true, alreadyConfirmed: false },
      });

      const res: any = await controller.confirmReceipt(req, 'CR202610210001');

      expect(res.data).toEqual({
        confirmed: true,
        alreadyConfirmed: false,
      });
      expect(deliveryService.confirmReceipt).toHaveBeenCalledWith({
        orderIdOrId: 'CR202610210001',
        channel: 'CUSTOMER',
      });
    });

    it('★ 幂等：重复确认返回 alreadyConfirmed=true，不报错', async () => {
      const { controller } = createController({
        confirm: { confirmed: true, alreadyConfirmed: true },
      });

      const res: any = await controller.confirmReceipt(req, 'CR202610210001');

      expect(res.data).toEqual({
        confirmed: true,
        alreadyConfirmed: true,
      });
    });
  });

  // ==================== 归属校验 ====================

  describe('★ 归属校验：别人的订单三个接口都进不去', () => {
    const otherReq = { user: { userId: 'user-2' } } as any;

    it('订单详情', async () => {
      const { controller, deliveryService } = createController({
        batch: latestBatch(),
      });

      await expect(
        controller.getOrderDetail(otherReq, 'CR202610210001'),
      ).rejects.toThrow('无权访问此订单');

      expect(deliveryService.findLatestBatchForOrder).not.toHaveBeenCalled();
    });

    it('交付内容', async () => {
      const { controller, deliveryService } = createController({
        batchContent: batchContent(),
      });

      await expect(
        controller.getOrderDelivery(otherReq, 'CR202610210001'),
      ).rejects.toThrow('无权访问此订单');

      expect(deliveryService.findBatchForCustomer).not.toHaveBeenCalled();
    });

    it('确认收到', async () => {
      const { controller, deliveryService } = createController();

      await expect(
        controller.confirmReceipt(otherReq, 'CR202610210001'),
      ).rejects.toThrow('无权操作此订单');

      expect(deliveryService.confirmReceipt).not.toHaveBeenCalled();
    });
  });
});
