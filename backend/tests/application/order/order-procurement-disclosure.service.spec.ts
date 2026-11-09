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
    ingredientRows?: any[];
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
      ingredient: {
        findMany: jest.fn().mockResolvedValue(overrides.ingredientRows ?? []),
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
        brand: null,
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
        brand: null,
        productName: '有机糙米',
        purchasedAt: '2026-10-28',
      },
    ]);
  });

  it('既没有本单记录、历史上也从没采购过的原料不展示', async () => {
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

  it('本单没记录、但历史上有采购：按最近一次采购展示为「来自库存」', async () => {
    const { service, prisma } = buildService({
      lists: [
        {
          id: 'list-1',
          status: 'COMPLETED',
          completedAt: new Date('2026-11-05T10:00:00.000Z'),
        },
      ],
      records: [],
      fallbackRecords: [
        {
          ingredientId: 'ingredient-rice',
          purchaseChannel: 'WALMART',
          purchaseChannelName: '沃尔玛',
          procurementSkuName: '东北糙米 1kg',
          procurementSkuId: null,
          purchasedAt: new Date('2026-10-20T02:00:00.000Z'),
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
        brand: null,
        productName: '东北糙米 1kg',
        purchasedAt: '2026-10-20',
      },
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('库存兜底带上订单完成时间作为截止，避免把之后补的货算进来', async () => {
    const cutoff = new Date('2026-11-08T14:42:22.000Z');
    const { service } = buildService({
      lists: [
        {
          id: 'list-1',
          status: 'COMPLETED',
          completedAt: new Date('2026-11-05T10:00:00.000Z'),
        },
      ],
      records: [],
    });
    const spy = jest.spyOn(service as any, 'findLatestCompletedRecords');

    await service.build({
      orderId: 'order-1',
      ingredients,
      before: cutoff,
    });

    expect(spy).toHaveBeenCalledWith(expect.any(Array), cutoff);
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
      skus: [{ id: 'sku-1', name: '泰森 鲜鸡大胸', brand: '泰森' }],
    });

    const result = await service.build({
      orderId: 'order-1',
      ingredients,
    });

    expect(result?.items[0].productName).toBe('泰森 鲜鸡大胸');
    expect(result?.items[0].brand).toBe('泰森');
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
  it('补剂没有采购记录时，用订单快照选定的采购商品兜底（渠道/品牌/商品名）', async () => {
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
      skus: [
        {
          id: 'sku-supp',
          name: '海藻粉 450mcg碘/平勺 227g/瓶',
          brand: 'NOW FOODS',
          purchaseChannel: '天猫旗舰店',
        },
      ],
    });

    const result = await service.build({
      orderId: 'order-1',
      ingredients: [
        {
          id: 'ingredient-supp',
          name: '海藻粉',
          type: 'SUPPLEMENT',
          skuId: 'sku-supp',
        },
      ],
    });

    expect(result?.items).toEqual([
      {
        ingredientId: 'ingredient-supp',
        ingredientName: '海藻粉',
        source: 'FROM_INVENTORY',
        channel: '天猫旗舰店',
        brand: 'NOW FOODS',
        productName: '海藻粉 450mcg碘/平勺 227g/瓶',
        purchasedAt: null,
      },
    ]);
  });
  it('补剂快照没带商品时，回落到该补剂自己的商品档案', async () => {
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
      skus: [
        {
          id: 'sku-supp',
          ingredientId: 'ingredient-supp',
          name: '海藻粉 450mcg碘/平勺 227g/瓶',
          brand: 'NOW FOODS',
          purchaseChannel: '天猫旗舰店',
        },
      ],
    });

    const result = await service.build({
      orderId: 'order-1',
      ingredients: [
        { id: 'ingredient-supp', name: '海藻粉', type: 'SUPPLEMENT' },
      ],
    });

    expect(result?.items[0]).toMatchObject({
      ingredientId: 'ingredient-supp',
      channel: '天猫旗舰店',
      brand: 'NOW FOODS',
      productName: '海藻粉 450mcg碘/平勺 227g/瓶',
      purchasedAt: null,
    });
  });
  it('补剂连商品档案都没有时，用原料自己的品牌/规格/渠道兜底', async () => {
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
      skus: [],
      ingredientRows: [
        {
          id: 'ingredient-zinc',
          name: '蛋氨酸锌胶囊',
          brand: 'NOW Foods',
          productModel: 'L-OptiZinc, 30 mg, 100 Veg Capsules',
          purchaseChannel: 'iherb',
        },
      ],
    });

    const result = await service.build({
      orderId: 'order-1',
      ingredients: [
        { id: 'ingredient-zinc', name: '蛋氨酸锌胶囊', type: 'SUPPLEMENT' },
      ],
    });

    expect(result?.items[0]).toMatchObject({
      channel: 'iherb',
      brand: 'NOW Foods',
      productName: 'L-OptiZinc, 30 mg, 100 Veg Capsules',
      purchasedAt: null,
    });
  });
});
