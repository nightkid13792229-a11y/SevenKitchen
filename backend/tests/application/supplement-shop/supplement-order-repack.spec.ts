import { SupplementOrderService } from '../../../src/application/supplement-shop/supplement-order.service';

/**
 * 三口径拆分（2026-11-15）：下单校验只认「预分装池」。
 *
 * 以前下单要求 ingredientId 命中候选列表，而候选是 diyEnabled 且 上架 的交集，
 * 于是「已上架但没开 DIY 推荐」的补剂永远买不到。现在只认池子。
 */
describe('SupplementOrderService · repack pool validation', () => {
  const sheet = {
    id: 'sheet-1',
    userId: 'u1',
    recipeId: 'recipe-1',
    recipeVersion: 6,
    packagePlan: [{ packageSpecG: 88, packageCount: 14 }],
    dailyIntakeG: null,
    cycleDays: null,
  };

  function build(plan: any) {
    const prisma: any = {
      dIYSheet: { findUnique: jest.fn().mockResolvedValue(sheet) },
    };
    const planService: any = {
      resolveForRecipeRequest: jest.fn().mockResolvedValue(plan),
      pickRepackOption: (pool: any[], ingredientId: string) =>
        (pool ?? []).find((option) => option.ingredientId === ingredientId) ??
        null,
    };
    const service = new SupplementOrderService(
      prisma,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      planService,
    );
    return { service, planService };
  }

  function planWith(options: any[]) {
    return {
      totalWeightG: 1232,
      weightSource: 'DIY_SHEET',
      recipeVersion: 6,
      items: [
        {
          recipeItemId: 'item-1',
          sourceIngredientId: 'kelp-powder',
          name: '海藻粉',
          preparationMethod: null,
          addTimingLabel: null,
          sortOrder: 0,
          reference: {
            ingredientId: 'kelp-powder',
            name: '海藻粉',
            brand: 'NOW FOODS',
            productModel: '450mcg碘/平勺',
            displayUnit: '平勺',
            amount: 1.709,
            unit: '平勺',
            status: 'OK',
            targets: [
              {
                fieldPath: 'minerals.iodine',
                label: '碘',
                unit: 'μg',
                targetValuePerKg: 624.13,
              },
            ],
          },
          recommendedProducts: [],
          repackPool: options,
        },
      ],
    };
  }

  it('下单行命中预分装池时按池里的用量通过', async () => {
    const { service } = build(
      planWith([
        {
          ingredientId: 'kelp-capsule',
          name: '海带粉胶囊',
          brand: 'NOW FOODS',
          productModel: '325mcg碘/粒',
          displayUnit: '粒',
          unit: '粒',
          amount: 2.366,
          available: true,
          unavailableReason: null,
          isDefault: true,
          concentrations: [
            { fieldPath: 'minerals.iodine', value: 325, unit: 'μg' },
          ],
        },
      ]),
    );

    const result = await (service as any).resolveServerDosageLines(
      {
        diySheetId: 'sheet-1',
        lines: [{ recipeItemId: 'item-1', ingredientId: 'kelp-capsule' }],
      },
      'u1',
    );

    expect(result.lines).toEqual([
      { ingredientId: 'kelp-capsule', amount: 2.366 },
    ]);
    expect(result.byIngredient.get('kelp-capsule')[0]).toMatchObject({
      selectionSource: 'REPACK',
      unit: '粒',
    });
  });

  it('下单行不在预分装池时拒绝并提示刷新', async () => {
    const { service } = build(
      planWith([
        {
          ingredientId: 'kelp-capsule',
          name: '海带粉胶囊',
          brand: null,
          productModel: null,
          displayUnit: '粒',
          unit: '粒',
          amount: 2.366,
          available: true,
          unavailableReason: null,
          isDefault: true,
          concentrations: [],
        },
      ]),
    );

    await expect(
      (service as any).resolveServerDosageLines(
        {
          diySheetId: 'sheet-1',
          lines: [{ recipeItemId: 'item-1', ingredientId: 'not-in-pool' }],
        },
        'u1',
      ),
    ).rejects.toThrow('补剂已下架，请刷新制作单');
  });

  it('池里有但不可用（档案缺项）时拒绝，不静默替换', async () => {
    const { service } = build(
      planWith([
        {
          ingredientId: 'kelp-capsule',
          name: '海带粉胶囊',
          brand: null,
          productModel: null,
          displayUnit: '粒',
          unit: '粒',
          amount: null,
          available: false,
          unavailableReason: '缺少配方目标的有效成分浓度',
          isDefault: true,
          concentrations: [],
        },
      ]),
    );

    await expect(
      (service as any).resolveServerDosageLines(
        {
          diySheetId: 'sheet-1',
          lines: [{ recipeItemId: 'item-1', ingredientId: 'kelp-capsule' }],
        },
        'u1',
      ),
    ).rejects.toThrow('缺少配方目标的有效成分浓度');
  });
});
