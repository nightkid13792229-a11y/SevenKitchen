import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderDesignSubmitService } from '../../../src/application/custom-recipe/order-design-submit.service';
import { CustomRecipeDeliveryService } from '../../../src/application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

type AnyRow = Record<string, any>;

const ORDER_ID = 'CR202610220001';

function buildOrder(overrides: AnyRow = {}): AnyRow {
  return {
    id: 'order-uuid',
    orderId: ORDER_ID,
    customerId: 'customer-1',
    dogId: 'dog-1',
    status: 'IN_PROGRESS',
    recipeQuantity: 2,
    autoCompleteAt: new Date('2026-10-29T02:00:00.000Z'),
    ...overrides,
  };
}

function buildSlot(index: number, overrides: AnyRow = {}): AnyRow {
  return {
    id: `design-${index}`,
    orderId: 'order-uuid',
    dogId: 'dog-1',
    status: 'READY',
    recipeId: `recipe-pk-${index}`,
    ...overrides,
  };
}

function buildBatchResult(overrides: AnyRow = {}): AnyRow {
  return {
    orderId: ORDER_ID,
    batchId: 'batch-new',
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
    ...overrides,
  };
}

function buildLatestBatch(overrides: AnyRow = {}): AnyRow {
  return {
    id: 'batch-1',
    version: 1,
    deliveredAt: new Date('2026-10-22T03:00:00.000Z'),
    items: [
      {
        recipeId: 'recipe-pk-1',
        items: ['RECIPE', 'SHOPPING_SOP'],
        recipe: { recipeId: 'CR1759100000001', name: '鸡肉南瓜' },
      },
      {
        recipeId: 'recipe-pk-2',
        items: ['RECIPE'],
        recipe: { recipeId: 'CR1759100000002', name: '鸭肉西兰花' },
      },
    ],
    ...overrides,
  };
}

describe('OrderDesignSubmitService · 订单设计最终提交', () => {
  let service: OrderDesignSubmitService;

  const prisma = {
    customRecipeOrder: {
      findUnique: jest.fn(),
    },
    orderRecipeDesign: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    customRecipeDeliveryBatch: {
      findFirst: jest.fn(),
    },
  } as any;

  const customRecipeService = {
    resolveOrderRef: jest.fn(),
  };

  const deliveryService = {
    deliverBatch: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderDesignSubmitService,
        { provide: PrismaService, useValue: prisma },
        { provide: CustomRecipeService, useValue: customRecipeService },
        { provide: CustomRecipeDeliveryService, useValue: deliveryService },
      ],
    }).compile();

    service = moduleRef.get(OrderDesignSubmitService);
    jest.clearAllMocks();

    customRecipeService.resolveOrderRef.mockResolvedValue({
      id: 'order-uuid',
      orderId: ORDER_ID,
    });
    prisma.customRecipeOrder.findUnique.mockResolvedValue(buildOrder());
    prisma.orderRecipeDesign.findMany.mockResolvedValue([
      buildSlot(1),
      buildSlot(2),
    ]);
    prisma.orderRecipeDesign.count.mockResolvedValue(0);
    prisma.orderRecipeDesign.updateMany.mockResolvedValue({ count: 2 });
    prisma.customRecipeDeliveryBatch.findFirst.mockResolvedValue(null);
    deliveryService.deliverBatch.mockResolvedValue(buildBatchResult());
  });

  describe('成功路径', () => {
    it('★ 2 份 READY：把 2 个私密食谱 id 交给 deliverBatch，成功后把槽位标为 DELIVERED 并返回批次摘要', async () => {
      const result = await service.submitOrderDesigns(ORDER_ID, 'admin-1');

      expect(deliveryService.deliverBatch).toHaveBeenCalledTimes(1);
      expect(deliveryService.deliverBatch).toHaveBeenCalledWith({
        orderIdOrId: ORDER_ID,
        recipeIds: ['recipe-pk-1', 'recipe-pk-2'],
        deliveredBy: 'admin-1',
      });

      expect(prisma.orderRecipeDesign.updateMany).toHaveBeenCalledTimes(1);
      const update = prisma.orderRecipeDesign.updateMany.mock.calls[0][0];
      expect(update.where.id.in).toEqual(['design-1', 'design-2']);
      expect(update.data.status).toBe('DELIVERED');
      expect(update.data.updatedAt).toBeInstanceOf(Date);

      expect(result).toMatchObject({
        orderId: ORDER_ID,
        batchId: 'batch-new',
        version: 1,
        recipeCount: 2,
        legacyRecipeId: 'recipe-pk-1',
        replayed: false,
      });
      expect(result.recipes.map((recipe) => recipe.recipeId)).toEqual([
        'CR1759100000001',
        'CR1759100000002',
      ]);
    });

    it('接受订单 uuid（由 resolveOrderRef 换成对外单号后再交付）', async () => {
      await service.submitOrderDesigns('order-uuid', 'admin-1');

      expect(customRecipeService.resolveOrderRef).toHaveBeenCalledWith(
        'order-uuid',
      );
      expect(deliveryService.deliverBatch).toHaveBeenCalledWith(
        expect.objectContaining({ orderIdOrId: ORDER_ID }),
      );
    });

    it('不重新发布食谱：服务不依赖设计器发布能力，交付只用槽位上已有的 recipeId', async () => {
      await service.submitOrderDesigns(ORDER_ID, 'admin-1');

      // 这里的断言是「交付参数只来自槽位」——多一份少一份都不行
      expect(deliveryService.deliverBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          recipeIds: ['recipe-pk-1', 'recipe-pk-2'],
        }),
      );
    });
  });

  describe('不完整 / 非法输入：整批拒绝，不能先交一部分', () => {
    it('缺少份数时拒绝，且不会调用交付服务', async () => {
      prisma.orderRecipeDesign.findMany.mockResolvedValue([buildSlot(1)]);

      await expect(
        service.submitOrderDesigns(ORDER_ID, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
      expect(prisma.orderRecipeDesign.updateMany).not.toHaveBeenCalled();
    });

    it('还有草稿没加入待提交时拒绝（份数够但状态不是 READY）', async () => {
      prisma.orderRecipeDesign.findMany.mockResolvedValue([
        buildSlot(1),
        buildSlot(2, { status: 'EDITING', recipeId: null }),
      ]);

      const error = await service
        .submitOrderDesigns(ORDER_ID, 'admin-1')
        .catch((err) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(String(error.message)).toContain('加入待提交');
      expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
    });

    it('没有订单设计槽位时拒绝，并提示老订单走订单页交付', async () => {
      prisma.orderRecipeDesign.findMany.mockResolvedValue([]);

      const error = await service
        .submitOrderDesigns(ORDER_ID, 'admin-1')
        .catch((err) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(String(error.message)).toContain('订单设计');
      expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
    });

    it('★ 跨订单槽位：不属于本单的槽位整批拒绝，不进入交付', async () => {
      prisma.orderRecipeDesign.findMany.mockResolvedValue([
        buildSlot(1),
        buildSlot(2, { orderId: 'other-order-uuid' }),
      ]);

      const error = await service
        .submitOrderDesigns(ORDER_ID, 'admin-1')
        .catch((err) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(String(error.message)).toContain('不属于');
      expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
      expect(prisma.orderRecipeDesign.updateMany).not.toHaveBeenCalled();
    });

    it('★ 跨狗狗槽位：狗狗与订单不一致时整批拒绝', async () => {
      prisma.orderRecipeDesign.findMany.mockResolvedValue([
        buildSlot(1),
        buildSlot(2, { dogId: 'dog-2' }),
      ]);

      await expect(
        service.submitOrderDesigns(ORDER_ID, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
    });

    it('同一道食谱出现在两份槽位里时拒绝（最终 N 份必须各不相同）', async () => {
      prisma.orderRecipeDesign.findMany.mockResolvedValue([
        buildSlot(1, { recipeId: 'recipe-pk-same' }),
        buildSlot(2, { recipeId: 'recipe-pk-same' }),
      ]);

      const error = await service
        .submitOrderDesigns(ORDER_ID, 'admin-1')
        .catch((err) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(String(error.message)).toContain('不同');
      expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
    });

    it('READY 槽位缺少私密食谱 id 时拒绝', async () => {
      prisma.orderRecipeDesign.findMany.mockResolvedValue([
        buildSlot(1),
        buildSlot(2, { recipeId: null }),
      ]);

      await expect(
        service.submitOrderDesigns(ORDER_ID, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
    });

    it.each(['PENDING_PAYMENT', 'CANCELLED', 'COMPLETED'])(
      '订单状态 %s 不允许提交设计',
      async (status) => {
        prisma.customRecipeOrder.findUnique.mockResolvedValue(
          buildOrder({ status }),
        );

        await expect(
          service.submitOrderDesigns(ORDER_ID, 'admin-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
      },
    );

    it('订单不存在时抛 404', async () => {
      customRecipeService.resolveOrderRef.mockRejectedValueOnce(
        new NotFoundException('定制订单不存在'),
      );

      await expect(
        service.submitOrderDesigns('CR-NOT-EXIST', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('★ 交付事务失败时槽位保持原样（不留一半已交付）', async () => {
      deliveryService.deliverBatch.mockRejectedValueOnce(
        new BadRequestException('同一道食谱不能在一个批次里重复交付'),
      );

      await expect(
        service.submitOrderDesigns(ORDER_ID, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.orderRecipeDesign.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('幂等：已交付订单重复提交', () => {
    it('★ 订单与槽位都已 DELIVERED：直接返回当前批次摘要，不重复交付', async () => {
      prisma.customRecipeOrder.findUnique.mockResolvedValue(
        buildOrder({ status: 'DELIVERED' }),
      );
      prisma.orderRecipeDesign.findMany.mockResolvedValue([
        buildSlot(1, { status: 'DELIVERED' }),
        buildSlot(2, { status: 'DELIVERED' }),
      ]);
      prisma.customRecipeDeliveryBatch.findFirst.mockResolvedValue(
        buildLatestBatch(),
      );

      const result = await service.submitOrderDesigns(ORDER_ID, 'admin-1');

      expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
      expect(prisma.orderRecipeDesign.updateMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        orderId: ORDER_ID,
        batchId: 'batch-1',
        version: 1,
        recipeCount: 2,
        legacyRecipeId: 'recipe-pk-1',
        replayed: true,
      });
      expect(result.recipes).toEqual([
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
      ]);
    });

    it('★ 订单已交付但槽位没来得及标记：补标 DELIVERED 并返回批次摘要，不重复交付', async () => {
      prisma.customRecipeOrder.findUnique.mockResolvedValue(
        buildOrder({ status: 'DELIVERED' }),
      );
      prisma.orderRecipeDesign.findMany.mockResolvedValue([
        buildSlot(1, { status: 'DELIVERED' }),
        buildSlot(2, { status: 'READY' }),
      ]);
      prisma.customRecipeDeliveryBatch.findFirst.mockResolvedValue(
        buildLatestBatch(),
      );

      const result = await service.submitOrderDesigns(ORDER_ID, 'admin-1');

      expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
      expect(prisma.orderRecipeDesign.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['design-1', 'design-2'] } },
          data: expect.objectContaining({ status: 'DELIVERED' }),
        }),
      );
      expect(result.replayed).toBe(false);
      expect(result.recipeCount).toBe(2);
    });

    it('订单已交付但待提交的食谱不在已交付批次里时拒绝（不能偷偷替换已交付内容）', async () => {
      prisma.customRecipeOrder.findUnique.mockResolvedValue(
        buildOrder({ status: 'DELIVERED' }),
      );
      prisma.orderRecipeDesign.findMany.mockResolvedValue([
        buildSlot(1),
        buildSlot(2, { recipeId: 'recipe-pk-new' }),
      ]);
      prisma.customRecipeDeliveryBatch.findFirst.mockResolvedValue(
        buildLatestBatch(),
      );

      const error = await service
        .submitOrderDesigns(ORDER_ID, 'admin-1')
        .catch((err) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(deliveryService.deliverBatch).not.toHaveBeenCalled();
      expect(prisma.orderRecipeDesign.updateMany).not.toHaveBeenCalled();
    });

    it('订单已交付但找不到交付批次时拒绝', async () => {
      prisma.customRecipeOrder.findUnique.mockResolvedValue(
        buildOrder({ status: 'DELIVERED' }),
      );
      prisma.orderRecipeDesign.findMany.mockResolvedValue([
        buildSlot(1, { status: 'DELIVERED' }),
        buildSlot(2, { status: 'DELIVERED' }),
      ]);
      prisma.customRecipeDeliveryBatch.findFirst.mockResolvedValue(null);

      await expect(
        service.submitOrderDesigns(ORDER_ID, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('旧交付入口拦截（新流程订单不能从订单页绕行）', () => {
    it('★ 订单有设计槽位时，旧交付入口被拒绝并指向 submit-designs', async () => {
      prisma.orderRecipeDesign.count.mockResolvedValue(2);

      const error = await service
        .assertLegacyDeliveryAllowed(ORDER_ID)
        .catch((err) => err);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(String(error.message)).toContain('submit-designs');
      expect(String(error.message)).toContain('提交设计');
    });

    it('订单没有任何设计槽位（老订单）时放行旧交付入口', async () => {
      prisma.orderRecipeDesign.count.mockResolvedValue(0);

      await expect(
        service.assertLegacyDeliveryAllowed(ORDER_ID),
      ).resolves.toBeUndefined();
    });

    it('拦截时按主键查槽位，兼容 uuid 与对外单号', async () => {
      prisma.orderRecipeDesign.count.mockResolvedValue(1);

      await expect(
        service.assertLegacyDeliveryAllowed('order-uuid'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.orderRecipeDesign.count).toHaveBeenCalledWith({
        where: { orderId: 'order-uuid' },
      });
    });
  });
});
