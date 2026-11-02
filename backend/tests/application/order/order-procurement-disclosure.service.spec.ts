import { OrderProcurementDisclosureService } from 'src/order/order-procurement-disclosure.service';

describe('OrderProcurementDisclosureService', () => {
  const ingredients = [
    { id: 'ingredient-chicken', name: '鸡胸' },
    { id: 'ingredient-rice', name: '糙米' },
  ];

  function buildService(overrides: {
    lists?: any[];
    records?: any[];
    purchaseItems?: any[];
    skus?: any[];
    fallbackRecords?: any[];
  }) {
    const prisma = {
      purchaseList: {
        findMany: jest.fn().mockResolvedValue(overrides.lists ?? []),
      },
      purchaseRecord: {
        findMany: jest.fn().mockResolvedValue(overrides.records ?? []),
      },
      purchaseItem: {
        findMany: jest.fn().mockResolvedValue(overrides.purchaseItems ?? []),
      },
      procurementSku: {
        findMany: jest.fn().mockResolvedValue(overrides.skus ?? []),
      },
      $queryRaw: jest.fn().mockResolvedValue(overrides.fallbackRecords ?? []),
    } as any;

    return {
      service: new OrderProcurementDisclosureService(prisma),
      prisma,
    };
  }

  it('还没生成采购清单时返回 NOT_STARTED', async () => {
    const { service } = buildService({ lists: [] });

    const result = await service.build({
      orderId: 'order-1',
      ingredients,
    });

    expect(result).toEqual({
      status: 'NOT_STARTED',
      completedAt: null,
      items: [],
    });
  });

  it('采购清单未完成时返回 IN_PROGRESS，不暴露任何采购信息', async () => {
    const { service } = buildService({
      lists: [{ id: 'list-1', status: 'PENDING', completedAt: null }],
    });

    const result = await service.build({
      orderId: 'order-1',
      ingredients,
    });

    expect(result).toEqual({
      status: 'IN_PROGRESS',
      completedAt: null,
      items: [],
    });
  });

  it('本单采购的原料展示渠道和采购产品名', async () => {
    const { service } = buildService({
      lists: [
        {
          id: 'list-1',
          status: 'COMPLETED',
          completedAt: new Date('2026-11-05T10:00:00.000Z'),
        },
      ],
      records: [
        {
          ingredientId: 'ingredient-chicken',
          purchaseChannel: '山姆会员店',
          procurementSkuName: '鸡胸 生鲜鸡大胸',
          procurementSkuId: 'sku-1',
          purchasedAt: new Date('2026-11-05T02:00:00.000Z'),
        },
      ],
      purchaseItems: [
        { ingredientId: 'ingredient-chicken', stockDeductedQuantity: 0 },
      ],
    });

    const result = await service.build({
      orderId: 'order-1',
      ingredients,
    });

    expect(result?.status).toBe('COMPLETED');
    expect(result?.completedAt).toBe('2026-11-05');
    expect(result?.items).toEqual([
      {
        ingredientId: 'ingredient-chicken',
        ingredientName: '鸡胸',
        source: 'ORDER_PURCHASE',
        channel: '山姆会员店',
        productName: '鸡胸 生鲜鸡大胸',
        purchasedAt: '2026-11-05',
      },
    ]);
  });

  it('走库存的原料给最近一次真实采购，并标记 FROM_INVENTORY', async () => {
    const { service } = buildService({
      lists: [
        {
          id: 'list-1',
          status: 'COMPLETED',
          completedAt: new Date('2026-11-05T10:00:00.000Z'),
        },
      ],
      records: [],
      purchaseItems: [
        { ingredientId: 'ingredient-rice', stockDeductedQuantity: 300 },
      ],
      fallbackRecords: [
        {
          ingredientId: 'ingredient-rice',
          purchaseChannel: '沃尔玛',
          procurementSkuName: '有机糙米',
          procurementSkuId: 'sku-rice',
          purchasedAt: new Date('2026-10-28T02:00:00.000Z'),
        },
      ],
    });

    const result = await service.build({
      orderId: 'order-1',
      ingredients,
    });

    expect(result?.items).toEqual([
      {
        ingredientId: 'ingredient-rice',
        ingredientName: '糙米',
        source: 'FROM_INVENTORY',
        channel: '沃尔玛',
        productName: '有机糙米',
        purchasedAt: '2026-10-28',
      },
    ]);
  });

  it('既没有本单记录、也没有库存抵扣的原料不展示', async () => {
    const { service } = buildService({
      lists: [
        {
          id: 'list-1',
          status: 'COMPLETED',
          completedAt: new Date('2026-11-05T10:00:00.000Z'),
        },
      ],
      records: [],
      purchaseItems: [],
    });

    const result = await service.build({
      orderId: 'order-1',
      ingredients,
    });

    expect(result?.items).toEqual([]);
  });

  it('采购记录没有商品名时回落到商品当前名', async () => {
    const { service } = buildService({
      lists: [
        {
          id: 'list-1',
          status: 'COMPLETED',
          completedAt: new Date('2026-11-05T10:00:00.000Z'),
        },
      ],
      records: [
        {
          ingredientId: 'ingredient-chicken',
          purchaseChannel: '山姆会员店',
          procurementSkuName: null,
          procurementSkuId: 'sku-1',
          purchasedAt: new Date('2026-11-05T02:00:00.000Z'),
        },
      ],
      skus: [{ id: 'sku-1', name: '泰森 鲜鸡大胸' }],
    });

    const result = await service.build({
      orderId: 'order-1',
      ingredients,
    });

    expect(result?.items[0].productName).toBe('泰森 鲜鸡大胸');
  });

  it('有已完成也有未完成清单时状态为 IN_PROGRESS，但已完成的照常展示', async () => {
    const { service } = buildService({
      lists: [
        {
          id: 'list-1',
          status: 'COMPLETED',
          completedAt: new Date('2026-11-05T10:00:00.000Z'),
        },
        { id: 'list-2', status: 'PENDING', completedAt: null },
      ],
      records: [
        {
          ingredientId: 'ingredient-chicken',
          purchaseChannel: '山姆会员店',
          procurementSkuName: '鸡胸 生鲜鸡大胸',
          procurementSkuId: 'sku-1',
          purchasedAt: new Date('2026-11-05T02:00:00.000Z'),
        },
      ],
    });

    const result = await service.build({
      orderId: 'order-1',
      ingredients,
    });

    expect(result?.status).toBe('IN_PROGRESS');
    expect(result?.items).toHaveLength(1);
  });
});
