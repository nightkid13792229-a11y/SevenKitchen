import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';

describe('RecipeDesignerService.restoreFromAgentSnapshot', () => {
  it('恢复草稿字段和明细，并递增内容版本', async () => {
    const tx = {
      designRecipeItem: { deleteMany: jest.fn().mockResolvedValue({}) },
      designRecipe: {
        update: jest.fn().mockResolvedValue({ contentRevision: 6 }),
      },
    };
    const service = Object.create(RecipeDesignerService.prototype) as any;
    service.getDraft = jest.fn().mockResolvedValue({});
    service.prisma = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };

    const result = await service.restoreFromAgentSnapshot(
      'draft-1',
      {
        name: '运行前名称',
        totalWeightG: 500,
        productionStepsJson: [{ sortOrder: 1, instruction: '混合' }],
        items: [
          {
            nutritionFoodId: 'nf-1',
            ingredientId: 'ing-1',
            weightG: 100,
            includeInAssessment: true,
            preparationMethod: '生/去皮',
            supplementTargets: null,
            sortOrder: 0,
          },
        ],
      },
      { userId: 'u1', role: 'ADMIN' },
    );

    expect(result).toEqual({ contentRevision: 6 });
    expect(tx.designRecipeItem.deleteMany).toHaveBeenCalledWith({
      where: { designRecipeId: 'draft-1' },
    });
    const update = tx.designRecipe.update.mock.calls[0][0];
    expect(update.data.contentRevision).toEqual({ increment: 1 });
    expect(update.data.name).toBe('运行前名称');
    expect(update.data.items.create[0]).toMatchObject({
      nutritionFoodId: 'nf-1',
      ingredientId: 'ing-1',
      weightG: 100,
      preparationMethod: '生/去皮',
    });
  });
});
