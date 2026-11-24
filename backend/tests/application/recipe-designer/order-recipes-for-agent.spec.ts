import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 2026-11-24：Agent 看同订单“已加入待提交 / 已交付”的其它食谱。
 *
 * 只读；不含当前草稿；原料重量取 RecipeItem.exampleWeight（私密快照写入时的克数）。
 */
describe('RecipeDesignerService · getOrderRecipesForAgent', () => {
  const ADMIN_ACCESS = { userId: 'admin-1', role: 'ADMIN' as const };
  let prisma: any;
  let service: RecipeDesignerService;

  beforeEach(() => {
    prisma = {
      customRecipeOrder: { findUnique: jest.fn().mockResolvedValue(null) },
      orderRecipeDesign: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    service = new RecipeDesignerService(prisma as PrismaService, {
      getTargets: jest.fn(),
    } as any);
    jest
      .spyOn(service, 'getDraft')
      .mockResolvedValue({ series: { orderId: 'order-uuid' } } as any);
  });

  it('把同单 READY 与 DELIVERED 的食谱映射成模型摘要', async () => {
    prisma.customRecipeOrder.findUnique.mockResolvedValue({
      orderId: 'CR20261119001',
      recipeQuantity: 3,
    });
    prisma.orderRecipeDesign.findMany.mockResolvedValue([
      {
        status: 'DELIVERED',
        updatedAt: new Date('2026-11-20T02:00:00.000Z'),
        designDraft: { updatedAt: new Date('2026-11-20T03:00:00.000Z') },
        recipe: {
          recipeId: 'recipe-code-1',
          version: 2,
          name: '鸡肉南瓜餐',
          energyDensityKcalPerKg: 1200,
          applicableLifeStages: ['ADULT'],
          seriesLifeStage: 'ADULT',
          productionStepsJson: [
            { sortOrder: 1, instruction: '全部原料混合均匀' },
            { sortOrder: 2, instruction: '冷冻保存' },
          ],
          items: [
            {
              exampleWeight: 800.126,
              ratioPercent: 66.666,
              preparationMethod: '蒸熟',
              ingredient: { name: '鸡胸肉', type: 'FOOD' },
              nutritionFood: {
                displayNameZh: '鸡胸肉（熟）',
                name: 'chicken',
                preparationStateLabel: '熟',
              },
            },
            {
              exampleWeight: 200,
              ratioPercent: 33.334,
              preparationMethod: null,
              ingredient: { name: '南瓜', type: 'FOOD' },
              nutritionFood: null,
            },
          ],
        },
      },
      {
        status: 'READY',
        updatedAt: new Date('2026-11-21T02:00:00.000Z'),
        designDraft: { updatedAt: new Date('2026-11-21T01:00:00.000Z') },
        recipe: {
          recipeId: 'recipe-code-2',
          version: 1,
          name: '鸭肉紫薯餐',
          energyDensityKcalPerKg: 1180,
          applicableLifeStages: [],
          seriesLifeStage: null,
          productionStepsJson: [{ sortOrder: 1, instruction: '混合' }],
          items: [],
        },
      },
      { status: 'READY', updatedAt: new Date(), recipe: null },
    ]);

    const result = await service.getOrderRecipesForAgent('draft-1', ADMIN_ACCESS);

    expect(prisma.orderRecipeDesign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderId: 'order-uuid',
          designDraftId: { not: 'draft-1' },
          status: { in: ['READY', 'DELIVERED'] },
        }),
      }),
    );
    expect(result.orderNo).toBe('CR20261119001');
    expect(result.orderQuantity).toBe(3);
    expect(result.recipes).toHaveLength(2);

    const delivered = result.recipes[0];
    expect(delivered).toMatchObject({
      status: 'DELIVERED',
      statusLabel: '已交付',
      name: '鸡肉南瓜餐',
      lifeStage: 'ADULT',
      recipeCode: 'recipe-code-1',
      version: 2,
      energyDensityKcalPerKg: 1200,
      totalWeightG: 1000.13,
      // 槽位更新 02:00，草稿 03:00 又改过
      hasNewerEdits: true,
    });
    expect(delivered.items[0]).toEqual({
      name: '鸡胸肉（熟）',
      type: 'FOOD',
      weightG: 800.13,
      ratioPercent: 66.67,
      preparationMethod: '蒸熟',
      nutritionProfileName: '鸡胸肉（熟）',
      nutritionPreparationState: '熟',
    });
    expect(delivered.items[1]).toMatchObject({
      name: '南瓜',
      weightG: 200,
      nutritionProfileName: null,
    });
    expect(delivered.steps).toEqual(['全部原料混合均匀', '冷冻保存']);

    expect(result.recipes[1]).toMatchObject({
      status: 'READY',
      statusLabel: '已加入待提交',
      name: '鸭肉紫薯餐',
      hasNewerEdits: false,
      totalWeightG: 0,
    });
  });

  it('不是订单定制设计时返回说明，不查订单表', async () => {
    jest
      .spyOn(service, 'getDraft')
      .mockResolvedValue({ series: { orderId: null } } as any);

    const result = await service.getOrderRecipesForAgent('draft-1', ADMIN_ACCESS);

    expect(result.recipes).toEqual([]);
    expect(result.orderNo).toBeNull();
    expect(result.note).toContain('不是订单定制设计');
    expect(prisma.customRecipeOrder.findUnique).not.toHaveBeenCalled();
  });
});
