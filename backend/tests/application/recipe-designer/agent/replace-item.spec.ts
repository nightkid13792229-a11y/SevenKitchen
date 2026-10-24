import { BadRequestException } from '@nestjs/common';
import { RecipeDesignerService } from 'src/application/recipe-designer/recipe-designer.service';

function makeService(options: { duplicate?: { id: string } | null } = {}) {
  const service = Object.create(RecipeDesignerService.prototype) as any;

  // replaceItem 保留旧项的这些值；预处理也由服务原样带回。
  service.assertItemEditableByUser = jest.fn().mockResolvedValue({
    id: 'draft-1',
    weightG: 100,
    sortOrder: 2,
    includeInAssessment: true,
    nutritionFoodId: 'nf-1',
    ingredientId: 'ing-1',
    totalWeightG: 900,
    preparationMethod: '生',
    preparationNote: null,
    preparationSource: 'AUTO',
  });
  service.resolveDesignItemIngredientId = jest.fn().mockResolvedValue('ing-2');
  service.resolveDesignItemPreparationMethod = jest
    .fn()
    .mockResolvedValue('生');
  service.buildPreparationCreateData = jest.fn().mockReturnValue({
    preparationMethod: '生',
    preparationSource: 'AUTO',
  });
  service.isIngredientIdSupplement = jest.fn().mockResolvedValue(false);
  service.parsePreparationSourceInput = jest.fn().mockReturnValue('AUTO');

  const created = { id: 'item-2', name: '鸡胸肉' };
  const tx = {
    designRecipeItem: {
      delete: jest.fn().mockResolvedValue({ id: 'item-1' }),
      create: jest.fn().mockResolvedValue(created),
    },
    designRecipe: {
      update: jest.fn().mockResolvedValue({ id: 'draft-1' }),
    },
  };
  const findFirst = jest
    .fn()
    .mockResolvedValue(options.duplicate ? options.duplicate : null);
  const transaction = jest.fn(
    async (callback: (client: typeof tx) => unknown) => callback(tx),
  );

  service.prisma = {
    designRecipeItem: { findFirst },
    $transaction: transaction,
  };

  return { service, tx, transaction, findFirst };
}

describe('RecipeDesignerService.replaceItem', () => {
  it('替换原料时在同一事务里删除旧项、创建新项并递增一次 contentRevision', async () => {
    const { service, tx, transaction, findFirst } = makeService();

    const result = await service.replaceItem(
      'item-1',
      { nutritionFoodId: 'nf-2' },
      { userId: 'u1', role: 'STAFF' },
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        designRecipeId: 'draft-1',
        nutritionFoodId: 'nf-2',
        id: { not: 'item-1' },
      },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.designRecipeItem.delete).toHaveBeenCalledWith({
      where: { id: 'item-1' },
    });
    expect(tx.designRecipeItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          designRecipeId: 'draft-1',
          nutritionFoodId: 'nf-2',
          ingredientId: 'ing-2',
          weightG: 100,
          sortOrder: 2,
          includeInAssessment: true,
          preparationMethod: '生',
          preparationSource: 'AUTO',
        }),
        select: expect.any(Object),
      }),
    );
    expect(tx.designRecipe.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: { contentRevision: { increment: 1 } },
    });
    expect(result).toEqual({ id: 'item-2', name: '鸡胸肉' });
  });

  it('同一草稿已有该营养档案时拒绝替换，且不开启事务', async () => {
    const { service, transaction } = makeService({
      duplicate: { id: 'item-9' },
    });

    await expect(
      service.replaceItem(
        'item-1',
        { nutritionFoodId: 'nf-2' },
        { userId: 'u1', role: 'STAFF' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction).not.toHaveBeenCalled();
  });
});
