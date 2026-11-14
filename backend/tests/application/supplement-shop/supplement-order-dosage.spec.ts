import { BadRequestException } from '@nestjs/common';
import { SupplementOrderService } from '../../../src/application/supplement-shop/supplement-order.service';

/**
 * 三口径拆分（2026-11-15）后：下单行只认「预分装池」，
 * 不再按旧的 candidates / defaultIngredient / fallbackAmount 结构解析。
 */
function repackOption(overrides: Record<string, any> = {}) {
  return {
    ingredientId: 'ing-citrate',
    name: '柠檬酸钙粉',
    brand: 'NOW FOODS',
    productModel: '600mg钙/3克',
    displayUnit: 'g',
    unit: 'g',
    amount: 12.3,
    available: true,
    unavailableReason: null,
    isDefault: true,
    concentrations: [
      { fieldPath: 'minerals.calcium', value: 353, unit: 'mg' },
    ],
    ...overrides,
  };
}

function planItem(overrides: Record<string, any> = {}) {
  return {
    recipeItemId: 'item-1',
    sourceIngredientId: 'ing-caco3',
    name: '碳酸钙粉',
    preparationMethod: '随餐',
    addTimingLabel: null,
    sortOrder: 0,
    reference: {
      ingredientId: 'ing-caco3',
      name: '碳酸钙粉',
      brand: null,
      productModel: null,
      displayUnit: 'g',
      amount: 18.6,
      unit: 'g',
      status: 'OK',
      targets: [
        {
          fieldPath: 'minerals.calcium',
          label: '钙',
          unit: 'mg',
          targetValuePerKg: 2192,
        },
      ],
    },
    recommendedProducts: [],
    repackPool: [repackOption()],
    ...overrides,
  };
}

describe('SupplementOrderService · server dosage lines', () => {
  function build(options: { sheet?: any; plan?: any } = {}) {
    const prisma = {
      dIYSheet: {
        findUnique: jest.fn().mockResolvedValue(
          options.sheet ?? {
            id: 'sheet-1',
            userId: 'user-1',
            recipeId: 'recipe-1',
            recipeVersion: 3,
            packagePlan: [{ packageSpecG: 100, packageCount: 15 }],
            dailyIntakeG: 0,
            cycleDays: 0,
          },
        ),
      },
      recipe: {
        findFirst: jest.fn().mockResolvedValue({ version: 3 }),
      },
    };
    const planService = {
      resolveForRecipeRequest: jest.fn().mockResolvedValue(
        options.plan ?? {
          totalWeightG: 1500,
          weightSource: 'DIY_SHEET',
          recipeVersion: 3,
          items: [planItem()],
        },
      ),
      pickRepackOption: (pool: any[], ingredientId: string) =>
        (pool ?? []).find((option) => option.ingredientId === ingredientId) ??
        null,
    };
    const service = new SupplementOrderService(
      prisma as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      planService as any,
    );
    return { service, prisma, planService };
  }

  it('returns null for the legacy protocol', async () => {
    const { service } = build();
    await expect(
      (service as any).resolveServerDosageLines({
        lines: [{ ingredientId: 'ing-caco3', amount: 10 }],
      }),
    ).resolves.toBeNull();
  });

  it('rejects mixed old/new lines', async () => {
    const { service } = build();
    await expect(
      (service as any).resolveServerDosageLines({
        diySheetId: 'sheet-1',
        lines: [
          { ingredientId: 'ing-caco3', recipeItemId: 'item-1' },
          { ingredientId: 'ing-citrate', amount: 10 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('computes the selected repack amount on the server', async () => {
    const { service, planService } = build();

    const result = await (service as any).resolveServerDosageLines(
      {
        diySheetId: 'sheet-1',
        lines: [{ ingredientId: 'ing-citrate', recipeItemId: 'item-1' }],
      },
      'user-1',
    );

    expect(planService.resolveForRecipeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeId: 'recipe-1',
        recipeVersion: 3,
        totalWeightG: 1500,
      }),
    );
    expect(result.lines).toEqual([{ ingredientId: 'ing-citrate', amount: 12.3 }]);
    const snapshot = result.byIngredient.get('ing-citrate')[0];
    expect(snapshot.selectionSource).toBe('REPACK');
    expect(snapshot.sourceIngredientId).toBe('ing-caco3');
    expect(snapshot.concentrations).toEqual([
      { fieldPath: 'minerals.calcium', value: 353, unit: 'mg' },
    ]);
  });

  it('rejects a product that is not in the repack pool', async () => {
    const { service } = build();

    await expect(
      (service as any).resolveServerDosageLines(
        {
          diySheetId: 'sheet-1',
          lines: [{ ingredientId: 'ing-bone', recipeItemId: 'item-1' }],
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps the ratio fallback for source rows without nutrient targets', async () => {
    const { service } = build({
      plan: {
        totalWeightG: 1500,
        weightSource: 'DIY_SHEET',
        recipeVersion: 3,
        items: [
          planItem({
            sourceIngredientId: 'ing-psyllium',
            reference: {
              ingredientId: 'ing-psyllium',
              name: '洋车前子壳粉',
              brand: null,
              productModel: null,
              displayUnit: 'g',
              amount: 15,
              unit: 'g',
              status: 'NO_TARGETS',
              targets: [],
            },
            repackPool: [
              repackOption({
                ingredientId: 'ing-psyllium',
                name: '洋车前子壳粉',
                amount: 15,
                concentrations: [],
              }),
            ],
          }),
        ],
      },
    });

    const result = await (service as any).resolveServerDosageLines(
      {
        diySheetId: 'sheet-1',
        lines: [{ ingredientId: 'ing-psyllium', recipeItemId: 'item-1' }],
      },
      'user-1',
    );

    expect(result.lines).toEqual([{ ingredientId: 'ing-psyllium', amount: 15 }]);
    expect(
      result.byIngredient.get('ing-psyllium')[0].selectionSource,
    ).toBe('RATIO');
  });

  it('rejects a stale recipe row', async () => {
    const { service } = build({
      plan: { totalWeightG: 1500, weightSource: 'DIY_SHEET', recipeVersion: 3, items: [] },
    });
    await expect(
      (service as any).resolveServerDosageLines(
        {
          diySheetId: 'sheet-1',
          lines: [{ ingredientId: 'ing-citrate', recipeItemId: 'item-1' }],
        },
        'user-1',
      ),
    ).rejects.toThrow('食谱已更新');
  });
});
