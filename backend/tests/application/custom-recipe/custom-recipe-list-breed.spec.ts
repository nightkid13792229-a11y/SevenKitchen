/**
 * 定制订单列表的品种名（2026-10-24）
 *
 * Dog 表只有 breedId，没有 Prisma 关联；列表卡要显示"豆豆 · 柯基 · 11.2kg"，
 * 服务层按 breedId 批量查 dog_breed 并挂到 dog.breedName。
 * 这条守卫锁两件事：
 *   1. 真的补上了名字（不是 undefined）；
 *   2. 只查一次（不是每单查一次，列表 N 单会变成 N+1）。
 */

import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';

describe('CustomRecipeService · 列表品种名', () => {
  it('按 dog.breedId 批量补上 breedName，且只查一次', async () => {
    const prisma = {
      customRecipeOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cr-1',
            orderId: 'CR202610240001',
            dog: { breedId: 'breed-1', customBreedName: null },
          },
          {
            id: 'cr-2',
            orderId: 'CR202610240002',
            dog: { breedId: 'breed-1', customBreedName: null },
          },
        ]),
        count: jest.fn().mockResolvedValue(2),
      },
      dogBreed: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'breed-1', name: '柯基' }]),
      },
    };

    const service = new CustomRecipeService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.getOrders({} as any);

    expect(result.orders.map((order: any) => order.dog.breedName)).toEqual([
      '柯基',
      '柯基',
    ]);
    expect(prisma.dogBreed.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.dogBreed.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['breed-1'] } },
      select: { id: true, name: true },
    });
  });
});
