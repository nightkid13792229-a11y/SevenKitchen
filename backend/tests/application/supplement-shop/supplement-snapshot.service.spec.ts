import { BadRequestException } from '@nestjs/common';
import { SupplementSnapshotService } from '../../../src/application/supplement-shop/supplement-snapshot.service';

function buildTx(overrides: any = {}) {
  const order = {
    id: 'o1',
    userId: 'u1',
    diySheetId: 's1',
    recipeId: 'r1',
    dogId: 'd1',
    items: [
      {
        ingredientId: 'i1',
        name: '海藻粉',
        brand: 'NOW',
        productModel: '227g',
        unit: '平勺',
        requestedAmount: 1,
        packedAmount: 1,
        bags: 2,
      },
    ],
    ...overrides.order,
  };
  const sheet = {
    id: 's1',
    userId: 'u1',
    recipeId: 'r1',
    recipeName: '测试食谱',
    dogId: 'd1',
    dogName: '嘟嘟',
    cycleDays: 7,
    perMealG: 78,
    dailyIntakeG: 156,
    packagePlan: [],
    purchaseList: [],
    productionSteps: '步骤',
    createdAt: new Date('2026-10-19T00:00:00Z'),
    snapshot: null,
    ...overrides.sheet,
  };
  const recipe = {
    id: 'r1',
    recipeId: 'recipe-logical-1',
    version: 3,
    name: '测试食谱',
    items: [
      {
        ingredientId: 'i1',
        ratioPercent: 2,
        exampleWeight: 2,
        preparationMethod: null,
        supplementTargets: [],
        ingredient: {
          id: 'i1',
          name: '海藻粉',
          type: 'SUPPLEMENT',
          baseUnit: 'PCS',
          unitDisplayLabel: '平勺',
        },
      },
      {
        ingredientId: 'i2',
        ratioPercent: 1,
        exampleWeight: 1,
        preparationMethod: null,
        supplementTargets: [],
        ingredient: {
          id: 'i2',
          name: '海带片',
          type: 'SUPPLEMENT',
          baseUnit: 'PCS',
          unitDisplayLabel: '片',
        },
      },
    ],
    ...overrides.recipe,
  };
  return {
    supplementOrder: { findUnique: jest.fn().mockResolvedValue(order) },
    dIYSheet: {
      findUnique: jest.fn().mockResolvedValue(sheet),
      update: jest.fn().mockResolvedValue({}),
    },
    recipe: {
      findUnique: jest.fn().mockResolvedValue(recipe),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    dog: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'd1',
        name: '嘟嘟',
        currentWeightKg: 15,
        mealsPerDay: 2,
      }),
    },
  };
}

describe('SupplementSnapshotService', () => {
  it('冻结整张制作单：食谱/狗狗/已买/未买补剂都在', async () => {
    const tx = buildTx();
    const service = new SupplementSnapshotService({} as any);

    await service.freezeForOrder(tx as any, {
      orderId: 'o1',
      userId: 'u1',
      diySheetId: 's1',
    });

    const data = tx.dIYSheet.update.mock.calls[0][0].data;
    expect(data.recipeVersion).toBe(3);
    expect(data.snapshot.sheet.recipeName).toBe('测试食谱');
    expect(data.snapshot.recipe.items).toHaveLength(2);
    expect(data.snapshot.dog.name).toBe('嘟嘟');
    expect(data.snapshot.supplementLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ingredientId: 'i1', purchased: true, bags: 2 }),
        expect.objectContaining({ ingredientId: 'i2', purchased: false }),
      ]),
    );
  });

  it('已冻结不覆盖', async () => {
    const tx = buildTx({
      sheet: { snapshot: { version: 1 }, snapshotAt: new Date() },
    });
    const service = new SupplementSnapshotService({} as any);

    await service.freezeForOrder(tx as any, {
      orderId: 'o1',
      userId: 'u1',
      diySheetId: 's1',
    });

    expect(tx.dIYSheet.update).not.toHaveBeenCalled();
  });

  it('制作单不属于当前用户 → 拒绝', async () => {
    const tx = buildTx({ sheet: { userId: 'other' } });
    const service = new SupplementSnapshotService({} as any);

    await expect(
      service.freezeForOrder(tx as any, {
        orderId: 'o1',
        userId: 'u1',
        diySheetId: 's1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('订单食谱与制作单不一致 → 拒绝', async () => {
    const tx = buildTx({ order: { recipeId: 'r2' } });
    const service = new SupplementSnapshotService({} as any);

    await expect(
      service.freezeForOrder(tx as any, {
        orderId: 'o1',
        userId: 'u1',
        diySheetId: 's1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
