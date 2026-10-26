import { BadRequestException } from '@nestjs/common';
import { SupplementOrderService } from '../../../src/application/supplement-shop/supplement-order.service';

function candidateItem(overrides: Record<string, any> = {}) {
  const dosage = {
    status: 'OK',
    amount: 12.3,
    unit: 'g',
    targets: [{ fieldPath: 'minerals.calcium', label: '钙', unit: 'mg', targetValuePerKg: 2192 }],
    concentrations: [{ fieldPath: 'minerals.calcium', value: 353, unit: 'mg' }],
    missingFieldPaths: [],
  };
  return {
    recipeItemId: 'item-1',
    sourceIngredientId: 'ing-caco3',
    source: 'EQUIVALENCE_GROUP',
    group: { id: 'g1', code: 'CALCIUM', name: '钙 · 矿物盐', status: 'APPROVED' },
    defaultIngredient: {
      ingredientId: 'ing-caco3',
      name: '碳酸钙粉',
      displayUnit: 'g',
      physicalForm: 'POWDER',
      diyEnabled: true,
      supplementRetailEnabled: false,
      selectable: false,
      unavailableReason: '未开启对外售卖',
      dosage: { ...dosage, amount: 18.6 },
    },
    candidates: [
      {
        ingredientId: 'ing-citrate',
        name: '柠檬酸钙粉',
        brand: 'NOW FOODS',
        productModel: '600mg钙/3克',
        purchaseChannel: null,
        purchaseLink: null,
        imageUrl: null,
        physicalForm: 'POWDER',
        displayUnit: 'g',
        isDefault: false,
        selectable: true,
        unavailableReason: null,
        dosage,
      },
    ],
    fallbackAmount: null,
    unavailableReason: null,
    preparationMethod: '随餐',
    addTimingLabel: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe('SupplementOrderService · server dosage lines', () => {
  function build(options: {
    sheet?: any;
    resolved?: any;
  } = {}) {
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
    const candidateService = {
      resolveForRecipe: jest.fn().mockResolvedValue(
        options.resolved ?? {
          totalWeightG: 1500,
          weightSource: 'DIY_SHEET',
          items: [candidateItem()],
        },
      ),
    };
    const service = new SupplementOrderService(
      prisma as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      undefined,
      candidateService as any,
    );
    return { service, prisma, candidateService };
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

  it('computes the selected group member amount on the server', async () => {
    const { service, candidateService } = build();

    const result = await (service as any).resolveServerDosageLines(
      {
        diySheetId: 'sheet-1',
        lines: [{ ingredientId: 'ing-citrate', recipeItemId: 'item-1' }],
      },
      'user-1',
    );

    expect(candidateService.resolveForRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeBusinessId: 'recipe-1',
        recipeVersion: 3,
        totalWeightG: 1500,
      }),
    );
    expect(result.lines).toEqual([
      { ingredientId: 'ing-citrate', amount: 12.3 },
    ]);
    const snapshot = result.byIngredient.get('ing-citrate')[0];
    expect(snapshot.selectionSource).toBe('EQUIVALENCE_GROUP');
    expect(snapshot.sourceIngredientId).toBe('ing-caco3');
    expect(snapshot.concentrations).toEqual([
      { fieldPath: 'minerals.calcium', value: 353, unit: 'mg' },
    ]);
  });

  it('rejects a member that is not a candidate for this row', async () => {
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

  it('uses the ratio fallback only for the source ingredient', async () => {
    const { service } = build({
      resolved: {
        totalWeightG: 1500,
        weightSource: 'DIY_SHEET',
        items: [
          candidateItem({
            source: 'DEFAULT_ONLY',
            group: null,
            candidates: [],
            fallbackAmount: 15,
            defaultIngredient: {
              ingredientId: 'ing-caco3',
              name: '洋车前子壳粉',
              displayUnit: 'g',
              physicalForm: 'POWDER',
              diyEnabled: true,
              supplementRetailEnabled: true,
              selectable: true,
              unavailableReason: null,
              dosage: {
                status: 'NO_TARGETS',
                amount: null,
                unit: 'g',
                targets: [],
                concentrations: [],
                missingFieldPaths: [],
              },
            },
          }),
        ],
      },
    });

    const result = await (service as any).resolveServerDosageLines(
      {
        diySheetId: 'sheet-1',
        lines: [{ ingredientId: 'ing-caco3', recipeItemId: 'item-1' }],
      },
      'user-1',
    );

    expect(result.lines).toEqual([{ ingredientId: 'ing-caco3', amount: 15 }]);
    expect(
      result.byIngredient.get('ing-caco3')[0].selectionSource,
    ).toBe('RATIO');
  });

  it('rejects a sheet that belongs to another user and a stale recipe row', async () => {
    const { service } = build({
      sheet: {
        id: 'sheet-1',
        userId: 'someone-else',
        recipeId: 'recipe-1',
        recipeVersion: 3,
        packagePlan: [],
        dailyIntakeG: 100,
        cycleDays: 7,
      },
    });
    await expect(
      (service as any).resolveServerDosageLines(
        {
          diySheetId: 'sheet-1',
          lines: [{ ingredientId: 'ing-citrate', recipeItemId: 'item-1' }],
        },
        'user-1',
      ),
    ).rejects.toThrow('不属于当前用户');

    const stale = build({
      resolved: { totalWeightG: 1500, weightSource: 'DIY_SHEET', items: [] },
    });
    await expect(
      (stale.service as any).resolveServerDosageLines(
        {
          diySheetId: 'sheet-1',
          lines: [{ ingredientId: 'ing-citrate', recipeItemId: 'item-1' }],
        },
        'user-1',
      ),
    ).rejects.toThrow('食谱已更新');
  });
});
