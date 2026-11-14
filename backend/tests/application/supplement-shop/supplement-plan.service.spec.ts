import { SupplementDosageService } from '../../../src/application/supplement-shop/supplement-dosage.service';
import { SupplementPlanService } from '../../../src/application/supplement-shop/supplement-plan.service';

const TARGETS = [
  {
    fieldPath: 'minerals.iodine',
    label: '碘',
    unit: 'μg',
    targetValuePerKg: 624.13,
  },
];

function powder(overrides: Record<string, any> = {}) {
  return {
    id: 'kelp-powder',
    name: '海藻粉',
    type: 'SUPPLEMENT',
    brand: 'NOW FOODS',
    productModel: '450mcg碘/平勺',
    baseUnit: 'PCS',
    unitDisplayLabel: '平勺',
    purchaseUnit: '平勺',
    physicalForm: 'POWDER',
    diyEnabled: true,
    supplementRetailEnabled: false,
    equivalencePriority: 0,
    properties: {},
    nutritionProfile: {
      meta: { rawBasisType: 'PER_SERVING' },
      minerals: { iodine: 450 },
    },
    ...overrides,
  };
}

function capsule(overrides: Record<string, any> = {}) {
  return {
    id: 'kelp-capsule',
    name: '海带粉胶囊',
    type: 'SUPPLEMENT',
    brand: 'NOW FOODS',
    productModel: '325mcg碘/粒',
    baseUnit: 'PCS',
    unitDisplayLabel: '粒',
    purchaseUnit: '粒',
    physicalForm: 'CAPSULE',
    diyEnabled: true,
    supplementRetailEnabled: true,
    equivalencePriority: 0,
    properties: {},
    nutritionProfile: {
      meta: { rawBasisType: 'PER_SERVING' },
      minerals: { iodine: 325 },
    },
    ...overrides,
  };
}

function iodineK(overrides: Record<string, any> = {}) {
  return capsule({
    id: 'iodine-k',
    name: '碘钾片',
    unitDisplayLabel: '片',
    purchaseUnit: '片',
    physicalForm: 'TABLET',
    equivalencePriority: 1,
    nutritionProfile: {
      meta: { rawBasisType: 'PER_SERVING' },
      minerals: { iodine: 225, potassium: 99 },
    },
    ...overrides,
  });
}

function group(members: any[], overrides: Record<string, any> = {}) {
  return {
    id: 'group-iodine',
    code: 'IODINE_NATURAL',
    name: '碘 · 天然',
    status: 'APPROVED',
    isActive: true,
    nutrientKey: 'minerals.iodine',
    nutrientLabel: '碘',
    nutrientUnit: 'μg',
    ingredients: members,
    ...overrides,
  };
}

function createService(prismaOverrides: Record<string, any> = {}) {
  const prisma: any = {
    recipe: { findUnique: jest.fn() },
    dIYSheet: { findUnique: jest.fn() },
    supplementShopConfig: { findUnique: jest.fn().mockResolvedValue({ equivalenceEnabled: true }) },
    supplementEquivalenceGroup: { findMany: jest.fn().mockResolvedValue([]) },
    recommendedProduct: { findMany: jest.fn().mockResolvedValue([]) },
    ...prismaOverrides,
  };
  const recommendedProducts: any = {
    batchFindActive: jest.fn(async (ids: string[]) => {
      if (!ids.length) return {};
      const rows = await prisma.recommendedProduct.findMany({ where: { ingredientId: { in: ids }, isActive: true } });
      const map: Record<string, any[]> = {};
      for (const row of rows || []) {
        (map[row.ingredientId] ||= []).push(row);
      }
      return map;
    }),
  };
  return new SupplementPlanService(prisma, new SupplementDosageService(), recommendedProducts);
}

describe('SupplementPlanService.buildRepackPool', () => {
  it('跨产品开启时，池子只含已上架的组员，默认取第一个可用的', () => {
    const service = createService();
    const pool = service.buildRepackPool({
      reference: powder(),
      group: group([powder(), capsule(), iodineK()]),
      equivalenceEnabled: true,
      targets: TARGETS as any,
      totalWeightG: 1232,
    });

    expect(pool.map((option) => option.ingredientId)).toEqual([
      'kelp-capsule',
      'iodine-k',
    ]);
    expect(pool[0]).toMatchObject({ isDefault: true, available: true });
    expect(pool[0].amount).toBeCloseTo(2.366, 3);
    expect(pool[1].isDefault).toBe(false);
  });

  it('跨产品关闭时只保留参考产品与食谱级旧备选', () => {
    const service = createService();
    const pool = service.buildRepackPool({
      reference: powder(),
      group: group([powder(), capsule(), iodineK()]),
      legacyAlternatives: [capsule()],
      equivalenceEnabled: false,
      targets: TARGETS as any,
      totalWeightG: 1232,
    });

    expect(pool.map((option) => option.ingredientId)).toEqual(['kelp-capsule']);
  });

  it('没有已上架产品时返回空池', () => {
    const service = createService();
    const pool = service.buildRepackPool({
      reference: powder(),
      group: null,
      equivalenceEnabled: true,
      targets: TARGETS as any,
      totalWeightG: 1232,
    });

    expect(pool).toEqual([]);
  });

  it('有可售品但单位不能 1:1 时，标记 available=false 并保留在池里', () => {
    const service = createService();
    const pool = service.buildRepackPool({
      reference: powder(),
      group: group([powder(), capsule({ baseUnit: 'G' })]),
      equivalenceEnabled: true,
      targets: TARGETS as any,
      totalWeightG: 1232,
    });

    expect(pool[0]).toMatchObject({
      available: false,
      unavailableReason: expect.stringContaining('1:1'),
    });
    expect(pool[0].isDefault).toBe(true);
  });
});

describe('SupplementPlanService.computeReference', () => {
  it('参考产品没有碘浓度时，仍然返回参考行，只是用量为空', () => {
    const service = createService();
    const reference = service.computeReference(
      powder({ nutritionProfile: { meta: { rawBasisType: 'PER_SERVING' }, minerals: {} } }),
      TARGETS as any,
      1232,
    );

    expect(reference).toMatchObject({
      ingredientId: 'kelp-powder',
      amount: null,
      status: 'MISSING_CONCENTRATION',
    });
  });

  it('有浓度时按总重换算用量', () => {
    const service = createService();
    const reference = service.computeReference(
      powder(),
      TARGETS as any,
      1232,
    );

    expect(reference.amount).toBeCloseTo(1.709, 3);
    expect(reference.unit).toBe('平勺');
  });
});

describe('SupplementPlanService.resolveForRecipeRequest', () => {
  function recipeRow() {
    return {
      recipeId: 'recipe-1',
      version: 6,
      items: [
        {
          id: 'item-1',
          sortOrder: 0,
          preparationMethod: '充分搅拌',
          supplementTargets: TARGETS,
          ingredient: powder(),
          supplementAlternatives: [],
        },
      ],
    };
  }

  it('带制作单时按制作单冻结的版本解析，并回传同一个版本号', async () => {
    const prisma: any = {
      dIYSheet: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'u1',
          recipeVersion: 6,
          packagePlan: [{ packageSpecG: 88, packageCount: 14 }],
        }),
      },
      recipe: { findUnique: jest.fn().mockResolvedValue(recipeRow()) },
      supplementShopConfig: { findUnique: jest.fn().mockResolvedValue({ equivalenceEnabled: true }) },
      supplementEquivalenceGroup: { findMany: jest.fn().mockResolvedValue([]) },
      recommendedProduct: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = createService(prisma);

    const plan = await service.resolveForRecipeRequest({
      recipeId: 'recipe-1',
      recipeVersion: 6,
      totalWeightG: 1232,
      diySheetId: 'sheet-1',
      userId: 'u1',
    });

    expect(plan.recipeVersion).toBe(6);
    expect(plan.totalWeightG).toBe(1232);
    expect(plan.weightSource).toBe('DIY_SHEET');
    expect(prisma.recipe.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipeId_version: { recipeId: 'recipe-1', version: 6 } },
      }),
    );
  });

  it('制作单不属于当前用户时拒绝', async () => {
    const prisma: any = {
      dIYSheet: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'someone-else',
          recipeVersion: 6,
          packagePlan: [{ packageSpecG: 88, packageCount: 14 }],
        }),
      },
      recipe: { findUnique: jest.fn().mockResolvedValue(recipeRow()) },
      supplementShopConfig: { findUnique: jest.fn().mockResolvedValue({ equivalenceEnabled: true }) },
      supplementEquivalenceGroup: { findMany: jest.fn().mockResolvedValue([]) },
      recommendedProduct: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = createService(prisma);

    await expect(
      service.resolveForRecipeRequest({
        recipeId: 'recipe-1',
        recipeVersion: 6,
        totalWeightG: 1232,
        diySheetId: 'sheet-1',
        userId: 'u1',
      }),
    ).rejects.toThrow('制作单不属于当前用户');
  });

  it('推荐商品按参考产品批量取，且只回传启用项', async () => {
    const prisma: any = {
      dIYSheet: { findUnique: jest.fn() },
      recipe: { findUnique: jest.fn().mockResolvedValue(recipeRow()) },
      supplementShopConfig: { findUnique: jest.fn().mockResolvedValue({ equivalenceEnabled: true }) },
      supplementEquivalenceGroup: { findMany: jest.fn().mockResolvedValue([]) },
      recommendedProduct: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rp-1',
            ingredientId: 'kelp-powder',
            name: 'NOW 海藻粉 227g',
            brand: 'NOW FOODS',
            productModel: '227g/瓶',
            purchaseChannel: '天猫',
            purchaseLink: { platform: 'TAOBAO', url: 'https://example.com' },
            imageUrl: null,
            displayUnit: '瓶',
          },
        ]),
      },
    };
    const service = createService(prisma);

    const plan = await service.resolveForRecipeRequest({
      recipeId: 'recipe-1',
      recipeVersion: 6,
      totalWeightG: 1232,
    });

    expect(plan.items[0].recommendedProducts.map((item) => item.id)).toEqual([
      'rp-1',
    ]);
    expect(prisma.recommendedProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ingredientId: { in: ['kelp-powder'] },
          isActive: true,
        },
      }),
    );
  });
});
