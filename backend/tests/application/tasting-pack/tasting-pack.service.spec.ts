/**
 * 试吃装商品 · 单元测试
 *
 * 最要紧的一条是**私有食谱护栏**：
 * 顾客花钱定制的私有食谱（PRIVATE_CUSTOM）绝不能被组进对外售卖的商品，
 * 否则就是把这位顾客的定制配方卖给了别人。这条必须由代码强制，不能靠自觉。
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { TastingPackService } from '../../../src/application/tasting-pack/tasting-pack.service';

function buildPrismaMock() {
  return {
    tastingPack: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    tastingPackItem: { deleteMany: jest.fn(), createMany: jest.fn() },
    tastingPackStockBatch: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(),
  };
}

function buildConfigServiceMock(overrides: Record<string, any> = {}) {
  return {
    getConfig: jest.fn().mockResolvedValue({
      enabled: true,
      tastingMultiplier: 1.25,
      priceRoundingMode: 'CEIL_TO_1',
      costBasisMode: 'LIVE',
      maxSetsPerOrder: 5,
      lowStockThreshold: 10,
      defaultRestockSets: 20,
      shelfLifeMonths: 6,
      defaultBagsPerRecipe: 2,
      defaultPackSpecG: 80,
      allowForceSchedule: true,
      updatedAt: null,
      ...overrides,
    }),
  };
}

function buildRecipe(overrides: Record<string, any> = {}) {
  return {
    id: 'pk-1',
    recipeId: 'recipe-1',
    name: '小米鳕鱼鸡胸',
    version: 3,
    coverImageUrl: 'https://cdn.example.com/a.jpg',
    sellingPoint: '好吸收',
    ...overrides,
  };
}

function buildService(params: {
  prisma?: any;
  recipes?: Record<string, any>;
  stock?: any;
  pricing?: any;
  snapshotRepo?: any;
  /** 覆盖试吃装设置，用来验证不同定价口径 */
  config?: Record<string, any>;
}) {
  const prisma = params.prisma ?? buildPrismaMock();
  const recipes = params.recipes ?? { 'recipe-1': buildRecipe() };
  // 只暴露"取已公开最新版本"：私有食谱与只有草稿的食谱都返回 null，
  // 这正是服务层要依赖的语义（拿不到可售版本就不许组货）
  const recipeRepository = {
    findLatestPublicById: jest.fn(async (id: string) => recipes[id] ?? null),
  };
  const stockService =
    params.stock ??
    ({
      getAvailableSets: jest.fn().mockResolvedValue(999),
      getWeightedUnitCost: jest.fn().mockResolvedValue(null),
      listOverviews: jest.fn().mockResolvedValue([]),
    } as any);
  const pricingService =
    params.pricing ??
    ({
      quote: jest.fn().mockResolvedValue({
        unitPrice: 70,
        unitListPrice: 112,
        unitCost: 56,
        liveUnitCost: 56,
        costBasis: 'LIVE',
        sets: 1,
        amountProduct: 70,
        amountShipping: 30,
        amountTotal: 100,
        totalNetFoodWeightG: 800,
        totalPacks: 10,
        totalWeightWithPackagingG: 1500,
        perRecipe: [],
        costBreakdown: {
          costIngredients: 40,
          costPackaging: 8,
          costLabor: 6,
          costOverhead: 2,
          totalProductCost: 56,
        },
        pricingParams: {
          tastingMultiplier: 1.25,
          priceRoundingMode: 'CEIL_TO_1',
          targetMargin: 0.5,
          ingredientSourcePlan: 'MARKET_PREMIUM',
        },
      }),
    } as any);

  const snapshotRepo =
    params.snapshotRepo ??
    ({
      create: jest.fn().mockImplementation(async ({ requestParams, pricingResult }: any) => ({
        id: 'snapshot-1',
        requestParams,
        pricingResult,
      })),
    } as any);

  const configService = params.config
    ? { getConfig: jest.fn().mockResolvedValue(params.config) }
    : buildConfigServiceMock();

  const service = new TastingPackService(
    prisma as any,
    configService as any,
    pricingService,
    stockService,
    recipeRepository as any,
    snapshotRepo,
  );

  return {
    service,
    prisma,
    recipeRepository,
    stockService,
    pricingService,
    snapshotRepo,
  };
}

describe('试吃装商品 · 组货护栏', () => {
  it('没有已公开版本的食谱不能组进对外售卖的试吃装（含顾客定制的私有食谱）', async () => {
    // 私有定制食谱与"只有草稿修订版"的食谱都取不到已公开版本 -> 返回 null
    const { service } = buildService({
      recipes: { 'recipe-1': buildRecipe() },
    });

    await expect(
      service.create({
        name: '尝鲜装',
        items: [{ recipeId: 'recipe-1' }, { recipeId: 'recipe-private' }],
      }),
    ).rejects.toThrow('没有已公开的版本，不能组进对外售卖的试吃装');
  });

  it('组货时取的是已公开的最新版本，而不是可能带着"修订"字样的草稿版', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPack.create.mockImplementation(({ data }: any) => ({
      id: 'pack-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
      items: (data.items?.create ?? []).map((item: any, index: number) => ({
        id: `item-${index}`,
        ...item,
      })),
    }));

    const { service, recipeRepository } = buildService({
      prisma,
      recipes: { 'recipe-1': buildRecipe({ name: '萝卜绿豆鸭胸猪里脊', version: 1 }) },
    });

    const pack = await service.create({
      name: '尝鲜装',
      items: [{ recipeId: 'recipe-1' }],
    });

    expect(recipeRepository.findLatestPublicById).toHaveBeenCalledWith('recipe-1');
    expect(pack.items[0].name).toBe('萝卜绿豆鸭胸猪里脊');
  });

  it('同一道菜不能重复配置', async () => {
    const { service } = buildService({});

    await expect(
      service.create({
        name: '尝鲜装',
        items: [{ recipeId: 'recipe-1' }, { recipeId: 'recipe-1' }],
      }),
    ).rejects.toThrow('同一道菜不能重复配置');
  });

  it('至少一道菜，最多 12 道', async () => {
    const { service } = buildService({});

    await expect(
      service.create({ name: '尝鲜装', items: [] }),
    ).rejects.toThrow('至少要配一道菜');

    const many = Array.from({ length: 13 }, (_, i) => ({
      recipeId: `recipe-${i}`,
    }));
    await expect(
      service.create({ name: '尝鲜装', items: many }),
    ).rejects.toThrow('最多配 12 道菜');
  });

  it('名称、规格、限购、手动价的边界都要拦住', async () => {
    const { service } = buildService({});

    await expect(
      service.create({ name: '   ', items: [{ recipeId: 'recipe-1' }] }),
    ).rejects.toThrow('名称不能为空');

    await expect(
      service.create({
        name: '尝鲜装',
        bagsPerRecipe: 0,
        items: [{ recipeId: 'recipe-1' }],
      }),
    ).rejects.toThrow('每道菜袋数必须是 1~20 的整数');

    await expect(
      service.create({
        name: '尝鲜装',
        packSpecG: 5,
        items: [{ recipeId: 'recipe-1' }],
      }),
    ).rejects.toThrow('每袋克重必须是 10~1000 的整数');

    await expect(
      service.create({
        name: '尝鲜装',
        manualPrice: -1,
        items: [{ recipeId: 'recipe-1' }],
      }),
    ).rejects.toThrow('手动定价必须大于 0');

    await expect(
      service.create({
        name: '尝鲜装',
        maxSetsOverride: 100,
        items: [{ recipeId: 'recipe-1' }],
      }),
    ).rejects.toThrow('单次限购必须是 1~50 的整数');
  });

  it('新建的商品默认是草稿，不会直接对外', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPack.create.mockImplementation(({ data }: any) => ({
      id: 'pack-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
      items: (data.items?.create ?? []).map((item: any, index: number) => ({
        id: `item-${index}`,
        ...item,
      })),
    }));

    const { service } = buildService({ prisma });

    const pack = await service.create({
      name: '五种口味尝鲜装',
      items: [{ recipeId: 'recipe-1' }],
    });

    expect(pack.status).toBe('DRAFT');
    expect(pack.code).toMatch(/^TP[2-9A-HJ-NP-Z]{6}$/);
    expect(pack.totalPacks).toBe(2);
    expect(pack.totalNetWeightG).toBe(160);
  });

  it('没有配菜的商品不能上架', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPack.findUnique.mockResolvedValue({
      id: 'pack-1',
      items: [],
    });
    const { service } = buildService({ prisma });

    await expect(service.publish('pack-1')).rejects.toThrow(
      '没有配菜的试吃装不能上架',
    );
  });

  it('有库存记录的商品不能删除，只能下架', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackStockBatch.count.mockResolvedValue(3);
    const { service } = buildService({ prisma });

    await expect(service.remove('pack-1')).rejects.toThrow(ConflictException);
    await expect(service.remove('pack-1')).rejects.toThrow('请改为「下架」');
  });
});

describe('试吃装商品 · 下单前校验', () => {
  function buildPurchasablePrisma(overrides: Record<string, any> = {}) {
    const prisma = buildPrismaMock();
    prisma.tastingPack.findUnique.mockResolvedValue({
      id: 'pack-1',
      status: 'ACTIVE',
      bagsPerRecipe: 2,
      packSpecG: 80,
      maxSetsOverride: null,
      manualPrice: null,
      items: [{ recipeId: 'recipe-1' }],
      ...overrides,
    });
    return prisma;
  }

  it('已下架的商品不能下单', async () => {
    const prisma = buildPurchasablePrisma({ status: 'INACTIVE' });
    const { service } = buildService({ prisma });

    await expect(
      service.assertPurchasable({ tastingPackId: 'pack-1', sets: 1 }),
    ).rejects.toThrow('该试吃装已下架');
  });

  it('超过单次限购要拦住，商品级覆盖优先于全局值', async () => {
    const prisma = buildPurchasablePrisma({ maxSetsOverride: 2 });
    const { service } = buildService({ prisma });

    await expect(
      service.assertPurchasable({ tastingPackId: 'pack-1', sets: 3 }),
    ).rejects.toThrow('单次最多购买 2 套');

    await expect(
      service.assertPurchasable({ tastingPackId: 'pack-1', sets: 1 }),
    ).resolves.toMatchObject({ maxSetsPerOrder: 2 });
  });

  it('库存不足时区分「售罄」与「只剩 N 套」', async () => {
    const prisma = buildPurchasablePrisma();
    const stockService = {
      getAvailableSets: jest.fn().mockResolvedValue(0),
      getWeightedUnitCost: jest.fn().mockResolvedValue(null),
    };
    const { service } = buildService({ prisma, stock: stockService });

    await expect(
      service.assertPurchasable({ tastingPackId: 'pack-1', sets: 1 }),
    ).rejects.toThrow('已售罄');

    stockService.getAvailableSets.mockResolvedValue(2);
    const two = buildService({ prisma, stock: stockService });
    await expect(
      two.service.assertPurchasable({ tastingPackId: 'pack-1', sets: 3 }),
    ).rejects.toThrow('只剩 2 套');
  });

  it('把商品规格正确翻译成定价输入', () => {
    const { service } = buildService({});

    const specs = service.buildSpecs({
      bagsPerRecipe: 2,
      packSpecG: 80,
      items: [{ recipeId: 'a' }, { recipeId: 'b' }],
    });

    expect(specs).toEqual([
      { recipeId: 'a', packageCount: 2, packageSpecG: 80 },
      { recipeId: 'b', packageCount: 2, packageSpecG: 80 },
    ]);
  });
});

describe('试吃装商品 · 生成购买报价（下单前最后一步）', () => {
  it('报价会把价格写进快照，并回传快照 ID 供下单锁价', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPack.findFirst.mockResolvedValue({
      id: 'pack-1',

      code: 'TPABC123',

      name: '五种口味尝鲜装',

      status: 'ACTIVE',

      bagsPerRecipe: 2,

      packSpecG: 80,

      maxSetsOverride: null,

      manualPrice: null,

      sortOrder: 0,

      createdAt: new Date('2026-09-26T00:00:00.000Z'),

      updatedAt: new Date('2026-09-26T00:00:00.000Z'),

      items: [{ recipeId: 'recipe-1', recipeSnapshot: { name: '小米鳕鱼鸡胸' } }],
    });
    prisma.tastingPack.findUnique.mockResolvedValue({
      id: 'pack-1',

      code: 'TPABC123',

      name: '五种口味尝鲜装',

      status: 'ACTIVE',

      bagsPerRecipe: 2,

      packSpecG: 80,

      maxSetsOverride: null,

      manualPrice: null,

      sortOrder: 0,

      createdAt: new Date('2026-09-26T00:00:00.000Z'),

      updatedAt: new Date('2026-09-26T00:00:00.000Z'),

      items: [{ recipeId: 'recipe-1', recipeSnapshot: { name: '小米鳕鱼鸡胸' } }],
    });

    const { service, snapshotRepo, pricingService } = buildService({ prisma });

    const quote = await service.createPurchaseQuote({
      idOrCode: 'TPABC123',
      sets: 2,
      addressId: 'addr-1',
      customerId: 'customer-1',
    });

    expect(quote.snapshotId).toBe('snapshot-1');
    expect(quote.sets).toBe(2);
    // 报价服务确实按 2 套算（金额由定价服务给出，这里断言入参口径）
    expect(pricingService.quote).toHaveBeenCalledWith(
      expect.objectContaining({ sets: 2 }),
    );
    expect(quote.amountProduct).toBe(70);

    const createArg = snapshotRepo.create.mock.calls[0][0];
    expect(createArg.customerId).toBe('customer-1');
    // 下单时靠这个 kind 分流到"现货订单"而不是鲜食订单
    expect(createArg.requestParams.kind).toBe('TASTING_PACK');
    expect(createArg.requestParams.tastingPackId).toBe('pack-1');
    expect(createArg.requestParams.sets).toBe(2);
    expect(createArg.requestParams.addressId).toBe('addr-1');
    // 快照里带上了商品快照，下单后即使商品改名也不影响老订单展示
    expect(createArg.pricingResult.packSnapshot.name).toBe('五种口味尝鲜装');
    expect(createArg.pricingResult.packSnapshot.dishes).toEqual([
      { recipeId: 'recipe-1', name: '小米鳕鱼鸡胸', coverImageUrl: null },
    ]);
    // 15 分钟有效，与鲜食一致
    const ttlMs = createArg.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(14 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it('售罄时根本生成不了报价（不给出无法兑现的价格）', async () => {
    const prisma = buildPrismaMock();
    const pack = {

      id: 'pack-1',

      code: 'TPABC123',

      name: '尝鲜装',

      status: 'ACTIVE',

      bagsPerRecipe: 2,

      packSpecG: 80,

      maxSetsOverride: null,

      manualPrice: null,

      sortOrder: 0,

      createdAt: new Date('2026-09-26T00:00:00.000Z'),

      updatedAt: new Date('2026-09-26T00:00:00.000Z'),

      items: [{ recipeId: 'recipe-1', recipeSnapshot: { name: '某菜' } }],
    };
    prisma.tastingPack.findFirst.mockResolvedValue(pack);
    prisma.tastingPack.findUnique.mockResolvedValue(pack);

    const stock = {
      getAvailableSets: jest.fn().mockResolvedValue(0),
      getWeightedUnitCost: jest.fn().mockResolvedValue(null),
    };
    const { service, snapshotRepo } = buildService({ prisma, stock });

    await expect(
      service.createPurchaseQuote({
        idOrCode: 'TPABC123',
        sets: 1,
        customerId: 'customer-1',
      }),
    ).rejects.toThrow('已售罄');

    expect(snapshotRepo.create).not.toHaveBeenCalled();
  });
});


describe('试吃装定价 · 成本基数可切换（后台配置）', () => {
  function packFixture() {
    return {
      id: 'pack-1',
      code: 'TPABC123',
      name: '五种口味尝鲜装',
      status: 'ACTIVE',
      bagsPerRecipe: 2,
      packSpecG: 80,
      maxSetsOverride: null,
      manualPrice: null,
      sortOrder: 0,
      createdAt: new Date('2026-09-26T00:00:00.000Z'),
      updatedAt: new Date('2026-09-26T00:00:00.000Z'),
      items: [{ recipeId: 'recipe-1', recipeSnapshot: { name: '小米鳕鱼鸡胸' } }],
    };
  }

  it('默认（按今天的原料价）：即使库存里有成本，也不拿它定价', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPack.findFirst.mockResolvedValue(packFixture());

    const stock = {
      getAvailableSets: jest.fn().mockResolvedValue(99),
      // 库存里明明有 ¥40 的批次成本
      getWeightedUnitCost: jest.fn().mockResolvedValue(40),
    };
    const { service, pricingService } = buildService({
      prisma,
      stock,
      config: {
        enabled: true,
        tastingMultiplier: 1.25,
        priceRoundingMode: 'CEIL_TO_1',
        costBasisMode: 'LIVE',
        maxSetsPerOrder: 5,
        lowStockThreshold: 10,
        defaultRestockSets: 20,
        shelfLifeMonths: 6,
        defaultBagsPerRecipe: 2,
        defaultPackSpecG: 80,
        allowForceSchedule: true,
      },
    });

    await service.getShelfItem('TPABC123');

    expect(pricingService.quote).toHaveBeenCalledWith(
      expect.objectContaining({ stockUnitCost: null }),
    );
    // 按今日原料价时连库存成本都不用查，省一次数据库往返
    expect(stock.getWeightedUnitCost).not.toHaveBeenCalled();
  });

  it('切到「库存批次成本」时，用库存加权成本定价', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPack.findFirst.mockResolvedValue(packFixture());

    const stock = {
      getAvailableSets: jest.fn().mockResolvedValue(99),
      getWeightedUnitCost: jest.fn().mockResolvedValue(56),
    };
    const { service, pricingService } = buildService({
      prisma,
      stock,
      config: {
        enabled: true,
        tastingMultiplier: 1.25,
        priceRoundingMode: 'CEIL_TO_1',
        costBasisMode: 'STOCK_BATCH',
        maxSetsPerOrder: 5,
        lowStockThreshold: 10,
        defaultRestockSets: 20,
        shelfLifeMonths: 6,
        defaultBagsPerRecipe: 2,
        defaultPackSpecG: 80,
        allowForceSchedule: true,
      },
    });

    await service.getShelfItem('TPABC123');

    expect(stock.getWeightedUnitCost).toHaveBeenCalledWith('pack-1');
    expect(pricingService.quote).toHaveBeenCalledWith(
      expect.objectContaining({ stockUnitCost: 56 }),
    );
  });
});
