/**
 * 试吃装备货生产 · 单元测试
 *
 * 这里覆盖**算错就会亏钱或卖不出货**的几处：
 *  ① 建议入库套数（"实际产出 ÷ 每套用量"）—— 少除一次计划套数就会把 10 套算成 1 套
 *  ② 状态机顺序：没采购不能排产、没排产不能入库、已入库不能重复入库
 *  ③ 用料快照在建单时冻结（事后改商品不影响在执行中的单）
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { TastingPackProductionService } from '../../../src/application/tasting-pack/tasting-pack-production.service';

function buildPrismaMock() {
  return {
    tastingPackProductionPlan: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    tastingPack: { findMany: jest.fn().mockResolvedValue([]) },
    purchaseList: { findUnique: jest.fn(), delete: jest.fn() },
  };
}

function buildDeps(overrides: Record<string, any> = {}) {
  const prisma = overrides.prisma ?? buildPrismaMock();
  const packService =
    overrides.packService ??
    ({
      getForAdmin: jest.fn().mockResolvedValue({
        id: 'pack-1',
        bagsPerRecipe: 2,
        packSpecG: 80,
        items: [
          { recipeId: 'r1', name: '菜一' },
          { recipeId: 'r2', name: '菜二' },
        ],
      }),
    } as any);
  const pricingService =
    overrides.pricingService ??
    ({
      buildStockRequirement: jest.fn().mockResolvedValue({
        sets: 10,
        totalNetFoodWeightG: 8000,
        totalPacks: 100,
        ingredientDetails: [{ ingredientId: 'i1', name: '鸡胸', cost: 30 }],
        perRecipe: [
          { recipeId: 'r1', recipeName: '菜一', netWeightG: 1600, packageCount: 20, packageSpecG: 80 },
          { recipeId: 'r2', recipeName: '菜二', netWeightG: 1600, packageCount: 20, packageSpecG: 80 },
        ],
      }),
      loadPackContext: jest.fn(),
    } as any);
  const stockService = overrides.stockService ?? ({ stockIn: jest.fn() } as any);
  const configService =
    overrides.configService ??
    ({
      getConfig: jest.fn().mockResolvedValue({
        enabled: true,
        tastingMultiplier: 1.25,
        maxSetsPerOrder: 5,
        lowStockThreshold: 10,
        defaultRestockSets: 20,
        shelfLifeMonths: 6,
        defaultBagsPerRecipe: 2,
        defaultPackSpecG: 80,
        allowForceSchedule: true,
      }),
    } as any);
  const productionService =
    overrides.productionService ??
    ({ createStockProductionBatch: jest.fn(), listProductionBatchesByDate: jest.fn() } as any);
  const purchasingService =
    overrides.purchasingService ??
    ({ generatePurchaseListFromTastingPackPlan: jest.fn() } as any);

  const service = new TastingPackProductionService(
    prisma as any,
    packService,
    pricingService,
    stockService,
    configService,
    productionService,
    purchasingService,
  );

  return {
    service,
    prisma,
    packService,
    pricingService,
    stockService,
    configService,
    productionService,
    purchasingService,
  };
}

describe('备货生产 · 建议入库套数', () => {
  it('按"每套用量"算，而不是把整单用量当一套', () => {
    const { service } = buildDeps({});

    // 计划做 10 套：每道菜整单 1600g（= 10 套 × 160g）
    const dishPlan = [
      { recipeId: 'r1', netWeightG: 1600, packageCount: 20, packageSpecG: 80 },
      { recipeId: 'r2', netWeightG: 1600, packageCount: 20, packageSpecG: 80 },
    ];
    const units = [
      { recipeSnapshot: { id: 'r1' }, actualOutputG: 1600, totalProductionG: 1600 },
      { recipeSnapshot: { id: 'r2' }, actualOutputG: 1600, totalProductionG: 1600 },
    ];

    expect(service.suggestStockInSets(units, dishPlan, 10)).toBe(10);
  });

  it('取最小的那道菜：少一道菜就配不成一套', () => {
    const { service } = buildDeps({});
    const dishPlan = [
      { recipeId: 'r1', netWeightG: 1000, packageCount: 10, packageSpecG: 100 },
      { recipeId: 'r2', netWeightG: 1000, packageCount: 10, packageSpecG: 100 },
    ];
    // r1 做了 10 套的量，r2 只做了 7 套的量 → 最多只能凑 7 套
    const units = [
      { recipeSnapshot: { id: 'r1' }, actualOutputG: 1000, totalProductionG: 1000 },
      { recipeSnapshot: { id: 'r2' }, actualOutputG: 700, totalProductionG: 700 },
    ];

    expect(service.suggestStockInSets(units, dishPlan, 10)).toBe(7);
  });

  it('同一道菜多锅时把产量累加', () => {
    const { service } = buildDeps({});
    const dishPlan = [
      { recipeId: 'r1', netWeightG: 600, packageCount: 10, packageSpecG: 60 },
    ];
    const units = [
      { recipeSnapshot: { id: 'r1' }, actualOutputG: 300, totalProductionG: 300 },
      { recipeSnapshot: { id: 'r1' }, actualOutputG: 300, totalProductionG: 300 },
    ];

    // 每套 60g，共 600g → 10 套
    expect(service.suggestStockInSets(units, dishPlan, 10)).toBe(10);
  });

  it('实际产出为 0 时建议 0 套，不硬凑', () => {
    const { service } = buildDeps({});
    const dishPlan = [
      { recipeId: 'r1', netWeightG: 1600, packageCount: 20, packageSpecG: 80 },
    ];
    const units = [
      { recipeSnapshot: { id: 'r1' }, actualOutputG: 0, totalProductionG: 1600 },
    ];

    expect(service.suggestStockInSets(units, dishPlan, 10)).toBe(0);
  });
});

describe('备货生产 · 状态机顺序', () => {
  function planRow(overrides: Record<string, any> = {}) {
    return {
      id: 'plan-1',
      planNo: 'BP-20260926-AAAAA',
      tastingPackId: 'pack-1',
      sets: 10,
      plannedDate: new Date('2026-09-26T12:00:00'),
      status: 'PLANNED',
      purchaseListId: null,
      productionBatchId: null,
      stockedSets: null,
      stockedAt: null,
      cancelledReason: null,
      note: null,
      dishPlanSnapshot: [],
      ingredientRequirementSnapshot: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      tastingPack: { name: '尝鲜装', code: 'TPABC' },
      ...overrides,
    };
  }

  it('已取消的备货单不能生成采购清单', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackProductionPlan.findUnique.mockResolvedValue(
      planRow({ status: 'CANCELLED' }),
    );
    const { service } = buildDeps({ prisma });

    await expect(
      service.generatePurchaseList('plan-1', 'admin-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('同一张备货单不能生成两次采购清单', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackProductionPlan.findUnique.mockResolvedValue(
      planRow({ status: 'PURCHASING', purchaseListId: 'pl-1' }),
    );
    const { service } = buildDeps({ prisma });

    await expect(
      service.generatePurchaseList('plan-1', 'admin-1'),
    ).rejects.toThrow('已经生成过采购清单');
  });

  it('拿不到操作人时拒绝生成采购清单（否则对不上账）', async () => {
    const { service } = buildDeps({});
    await expect(service.generatePurchaseList('plan-1', '')).rejects.toThrow(
      '无法识别当前操作人',
    );
  });

  it('还没生成采购清单就排产会被拦住', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackProductionPlan.findUnique.mockResolvedValue(planRow());
    const { service } = buildDeps({ prisma });

    await expect(service.schedule('plan-1', {})).rejects.toThrow(
      '请先生成采购清单',
    );
  });

  it('采购没完成不能排产；强制排产可以绕过（但要允许）', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackProductionPlan.findUnique.mockResolvedValue(
      planRow({ status: 'PURCHASING', purchaseListId: 'pl-1' }),
    );
    prisma.purchaseList.findUnique.mockResolvedValue({ status: 'PENDING' });

    const productionService = {
      createStockProductionBatch: jest.fn().mockResolvedValue({
        id: 'batch-1',
        packagingUnits: [],
      }),
      listProductionBatchesByDate: jest.fn(),
    };
    const pricingService = {
      buildStockRequirement: jest.fn(),
      loadPackContext: jest.fn().mockResolvedValue([]),
    };
    const { service } = buildDeps({ prisma, productionService, pricingService });

    await expect(service.schedule('plan-1', {})).rejects.toThrow(
      '采购清单还没完成',
    );

    // 强制排产：跳过检查（dishPlan 为空会抛"缺少用料计划"，说明已经越过采购检查）
    await expect(
      service.schedule('plan-1', { force: true }),
    ).rejects.toThrow('缺少用料计划');
  });

  it('设置里关掉"允许强制排产"时，强制也被拒绝', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackProductionPlan.findUnique.mockResolvedValue(
      planRow({ status: 'PURCHASING', purchaseListId: 'pl-1' }),
    );
    const configService = {
      getConfig: jest.fn().mockResolvedValue({ allowForceSchedule: false }),
    };
    const { service } = buildDeps({ prisma, configService });

    await expect(
      service.schedule('plan-1', { force: true }),
    ).rejects.toThrow('不允许跳过采购检查');
  });

  it('还没排产不能入库', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackProductionPlan.findUnique.mockResolvedValue(
      planRow({ status: 'PURCHASING', purchaseListId: 'pl-1' }),
    );
    const { service } = buildDeps({ prisma });

    await expect(service.stockIn('plan-1', {})).rejects.toThrow('还没排产');
  });

  it('已入库不能重复入库', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackProductionPlan.findUnique.mockResolvedValue(
      planRow({ status: 'STOCKED', productionBatchId: 'batch-1', stockedSets: 10 }),
    );
    const { service } = buildDeps({ prisma });

    await expect(service.stockIn('plan-1', {})).rejects.toThrow('已经入库');
  });

  it('已排产/已入库的备货单不能取消', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackProductionPlan.findUnique.mockResolvedValue(
      planRow({ status: 'STOCKED', stockedSets: 10 }),
    );
    const { service } = buildDeps({ prisma });

    await expect(service.cancelPlan('plan-1', '不想做了')).rejects.toThrow(
      '已入库的备货单不能取消',
    );
  });
});

describe('备货生产 · 建单冻结用料', () => {
  it('建单时把用料与每道菜产量一并冻结下来', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackProductionPlan.create.mockImplementation(
      ({ data }: any) => ({
        id: 'plan-1',
        planNo: 'BP-20260926-BBBBB',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
        tastingPack: { name: '尝鲜装', code: 'TPABC' },
      }),
    );
    const { service, pricingService } = buildDeps({ prisma });

    const plan = await service.createPlan({
      tastingPackId: 'pack-1',
      sets: 10,
      plannedDate: '2026-09-26',
    });

    expect(pricingService.buildStockRequirement).toHaveBeenCalledWith({
      specs: [
        { recipeId: 'r1', packageCount: 2, packageSpecG: 80 },
        { recipeId: 'r2', packageCount: 2, packageSpecG: 80 },
      ],
      sets: 10,
    });
    expect(plan.status).toBe('PLANNED');
    expect(plan.dishes).toHaveLength(2);
    expect(plan.ingredientCount).toBe(1);
    expect(plan.estimatedIngredientCost).toBe(30);
    expect(plan.planNo).toMatch(/^BP-\d{8}-[2-9A-HJ-NP-Z]{5}$/);
  });

  it('备货套数必须是正整数，日期必须可解析', async () => {
    const { service } = buildDeps({});

    await expect(
      service.createPlan({
        tastingPackId: 'pack-1',
        sets: 0,
        plannedDate: '2026-09-26',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createPlan({
        tastingPackId: 'pack-1',
        sets: 10,
        plannedDate: '不是日期',
      }),
    ).rejects.toThrow('计划生产日期格式无效');
  });

  it('没有配菜的商品不能备货', async () => {
    const packService = {
      getForAdmin: jest.fn().mockResolvedValue({
        id: 'pack-1',
        bagsPerRecipe: 2,
        packSpecG: 80,
        items: [],
      }),
    };
    const { service } = buildDeps({ packService });

    await expect(
      service.createPlan({
        tastingPackId: 'pack-1',
        sets: 10,
        plannedDate: '2026-09-26',
      }),
    ).rejects.toThrow('还没有配菜');
  });
});
