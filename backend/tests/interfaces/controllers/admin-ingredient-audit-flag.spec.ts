jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

import { AdminController } from '../../../src/interfaces/controllers/admin.controller';

/**
 * 原料列表的「创建记录」入口要靠 `hasCreationAudit` 判断显示 / 隐藏；
 * 这个标记必须按 ingredientId 精确对应，不能让所有原料都显示入口。
 */
describe('AdminController.getAllIngredients creation audit flag', () => {
  function buildIngredient(id: string, name: string) {
    return {
      id,
      name,
      type: 'FOOD',
      brand: null,
      productModel: null,
      purchaseChannel: null,
      diyEnabled: true,
      procurementEnabled: true,
      notes: null,
      baseUnit: 'G',
      baseUnitDisplayName: '克',
      unitDisplayLabel: '克',
      procurementStrategy: 'DAILY_PURCHASE',
      purchaseUnit: null,
      purchaseToBaseRatio: null,
      currentPricePerPurchaseUnit: 0,
      getEffectivePricePerPurchaseUnit: () => 0,
      getUnitCost: () => 0,
      weightG: null,
      maxCapacityG: null,
      safetyStock: null,
      reorderPoint: null,
      targetStock: null,
      properties: {},
      nutritionProfile: null,
    };
  }

  it('给有审计记录的原料标 hasCreationAudit=true，没有的标 false', async () => {
    const ingredientService = {
      getAllIngredients: jest
        .fn()
        .mockResolvedValue([
          buildIngredient('ing-ai', 'AI 建的鸡肝'),
          buildIngredient('ing-manual', '手工建的鸡心'),
        ]),
    };
    const prisma = {
      ingredient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ing-ai',
            createdAt: new Date('2026-10-22T00:00:00.000Z'),
            updatedAt: new Date('2026-10-22T00:00:00.000Z'),
            recommendedProducts: [],
            procurementSkus: [],
            nutritionFoodMappings: [],
            tags: [],
          },
          {
            id: 'ing-manual',
            createdAt: new Date('2026-10-22T00:00:00.000Z'),
            updatedAt: new Date('2026-10-22T00:00:00.000Z'),
            recommendedProducts: [],
            procurementSkus: [],
            nutritionFoodMappings: [],
            tags: [],
          },
        ]),
      },
      ingredientCreationAudit: {
        findMany: jest.fn().mockResolvedValue([{ ingredientId: 'ing-ai' }]),
      },
    };

    const controller = new AdminController(
      ingredientService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await controller.getAllIngredients();

    expect(prisma.ingredientCreationAudit.findMany).toHaveBeenCalledWith({
      where: { ingredientId: { in: ['ing-ai', 'ing-manual'] } },
      select: { ingredientId: true },
    });
    const rows = result.data as Array<{
      id: string;
      hasCreationAudit: boolean;
    }>;
    expect(rows.find((row) => row.id === 'ing-ai')?.hasCreationAudit).toBe(
      true,
    );
    expect(rows.find((row) => row.id === 'ing-manual')?.hasCreationAudit).toBe(
      false,
    );
  });
});
