import { DIYSheetStorageService } from '../diy-sheet-storage.service';

/**
 * 已冻结（下过单）的制作单再保存时的行为。
 *
 * 2026-11-19：补剂换款上线后发现——顾客在制作单上把「自己买的那款」换成
 * 同浓度的另一个品牌时，采购清单（名称/用量）一字不差，`sameFrozenContent`
 * 判定"内容没变"直接返回旧单，回包里还是旧选择 → 页面刚提示"已换成 X"，
 * 下一秒自己跳回旧款。补剂自购款不影响分装/生产，冻结单允许原地更新它。
 */
const BASE_SHEET = {
  id: 'sheet-1',
  userId: 'u1',
  recipeId: 'r1',
  recipeName: '鸡胸南瓜',
  dogId: 'd1',
  dogName: '豆豆',
  cycleDays: null,
  perMealG: 100,
  dailyIntakeG: 200,
  packagePlan: [{ packageSpecG: 100, packageCount: 2 }],
  purchaseList: [{ name: '鸡胸', type: 'FOOD', netAmount: 200 }],
  productionSteps: 'steps',
  recipeVersion: 3,
  snapshot: { orderNo: 'X1' },
  snapshotAt: new Date('2026-11-18T00:00:00Z'),
  supplementSelections: [{ recipeItemId: 'ri-1', ingredientId: 'old-product' }],
  createdAt: new Date('2026-11-18T00:00:00Z'),
  updatedAt: new Date('2026-11-18T00:00:00Z'),
};

const baseDto = {
  recipeId: 'r1',
  recipeName: '鸡胸南瓜',
  dogId: 'd1',
  perMealG: 100,
  dailyIntakeG: 200,
  packagePlan: [{ packageSpecG: 100, packageCount: 2 }],
  purchaseList: [{ name: '鸡胸', type: 'FOOD', netAmount: 200 }],
  productionSteps: 'steps',
  recipeVersion: 3,
};

function makeService() {
  const prisma = {
    recipe: { findFirst: jest.fn().mockResolvedValue({ recipeId: 'r1' }) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ dogs: [{ id: 'd1', name: '豆豆' }] }),
    },
    dIYSheet: {
      findFirst: jest.fn().mockResolvedValue({ ...BASE_SHEET }),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...BASE_SHEET, ...data }),
        ),
      create: jest.fn(),
    },
  };

  return { prisma, service: new DIYSheetStorageService(prisma as never) };
}

describe('已冻结的制作单 · 补剂自购款', () => {
  it('只换了自购款：原地更新选择，不新建单', async () => {
    const { prisma, service } = makeService();
    const nextSelections = [{ recipeItemId: 'ri-1', ingredientId: 'new-product' }];

    const res = await service.create('u1', {
      ...baseDto,
      supplementSelections: nextSelections,
    } as never);

    expect(prisma.dIYSheet.create).not.toHaveBeenCalled();
    expect(prisma.dIYSheet.update).toHaveBeenCalledWith({
      where: { id: 'sheet-1' },
      data: { supplementSelections: nextSelections },
    });
    expect(res.supplementSelections).toEqual(nextSelections);
  });

  it('选择没变：不写库，也不新建单', async () => {
    const { prisma, service } = makeService();

    const res = await service.create('u1', {
      ...baseDto,
      supplementSelections: BASE_SHEET.supplementSelections,
    } as never);

    expect(prisma.dIYSheet.update).not.toHaveBeenCalled();
    expect(prisma.dIYSheet.create).not.toHaveBeenCalled();
    expect(res.supplementSelections).toEqual(BASE_SHEET.supplementSelections);
  });
});
