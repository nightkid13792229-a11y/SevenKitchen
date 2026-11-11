import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  INGREDIENT_REPOSITORY,
  IngredientService,
} from '../../../src/application/ingredient/ingredient.service';
import { IngredientCostHistoryService } from '../../../src/application/ingredient/ingredient-cost-history.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 删除原料（2026-11-12）。
 *
 * 这条路径以前只有三个字：「删除失败」——
 * 补剂建档会自动生成 `Supplement label profile <id>` 词条 + 一条 RESTRICT 映射，
 * 不解开就永远删不掉（线上 175 条里 157 条卡在这）。
 * 所以这里锁两件事：**该解开的自动档案要解开**、**该拦住的业务引用要讲清楚**。
 */
describe('IngredientService.deleteIngredient', () => {
  const ingredientId = 'ingredient-1';

  const findById = jest.fn();
  const deleteIngredient = jest.fn();

  const recipeItemCount = jest.fn();
  const designRecipeItemCount = jest.fn();
  const purchaseItemCount = jest.fn();
  const recipeSupplementAlternativeCount = jest.fn();
  const supplementPackagingRuleCount = jest.fn();

  const mappingFindMany = jest.fn();
  const mappingDeleteMany = jest.fn();
  const nutritionFoodFindMany = jest.fn();
  const nutritionFoodDeleteMany = jest.fn();

  const prisma: any = {
    recipeItem: { count: recipeItemCount },
    designRecipeItem: { count: designRecipeItemCount },
    purchaseItem: { count: purchaseItemCount },
    recipeSupplementAlternative: { count: recipeSupplementAlternativeCount },
    supplementPackagingRule: { count: supplementPackagingRuleCount },
    nutritionFoodMapping: {
      findMany: mappingFindMany,
      deleteMany: mappingDeleteMany,
    },
    nutritionFood: {
      findMany: nutritionFoodFindMany,
      deleteMany: nutritionFoodDeleteMany,
    },
  };
  prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);

  let service: IngredientService;

  beforeEach(async () => {
    jest.resetAllMocks();

    findById.mockResolvedValue({ id: ingredientId, name: '柠檬酸镁胶囊' });
    deleteIngredient.mockResolvedValue(undefined);
    recipeItemCount.mockResolvedValue(0);
    designRecipeItemCount.mockResolvedValue(0);
    purchaseItemCount.mockResolvedValue(0);
    recipeSupplementAlternativeCount.mockResolvedValue(0);
    supplementPackagingRuleCount.mockResolvedValue(0);
    mappingFindMany.mockResolvedValue([]);
    mappingDeleteMany.mockResolvedValue({ count: 0 });
    nutritionFoodFindMany.mockResolvedValue([]);
    nutritionFoodDeleteMany.mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientService,
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: { findById, delete: deleteIngredient },
        },
        { provide: IngredientCostHistoryService, useValue: { record: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(IngredientService);
  });

  it('档案不存在时报 404，不碰数据库', async () => {
    findById.mockResolvedValue(null);

    await expect(service.deleteIngredient(ingredientId)).rejects.toThrow(
      NotFoundException,
    );
    expect(deleteIngredient).not.toHaveBeenCalled();
  });

  it('没有营养映射时直接删', async () => {
    await service.deleteIngredient(ingredientId);

    expect(mappingDeleteMany).not.toHaveBeenCalled();
    expect(deleteIngredient).toHaveBeenCalledWith(ingredientId);
  });

  it('自动生成的营养词条会被一起摘掉，再删原料', async () => {
    mappingFindMany.mockResolvedValue([{ nutritionFoodId: 'nf-auto' }]);
    nutritionFoodFindMany.mockResolvedValue([{ id: 'nf-auto' }]);

    await service.deleteIngredient(ingredientId);

    expect(mappingDeleteMany).toHaveBeenCalledWith({
      where: { ingredientId },
    });
    expect(nutritionFoodFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: `Supplement label profile ${ingredientId}`,
          mappings: { none: {} },
        }),
      }),
    );
    expect(nutritionFoodDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['nf-auto'] } },
    });
    expect(deleteIngredient).toHaveBeenCalledWith(ingredientId);
  });

  it('人工维护的词条不动：名字对不上就不删', async () => {
    mappingFindMany.mockResolvedValue([{ nutritionFoodId: 'nf-usda' }]);
    nutritionFoodFindMany.mockResolvedValue([]);

    await service.deleteIngredient(ingredientId);

    expect(mappingDeleteMany).toHaveBeenCalled();
    expect(nutritionFoodDeleteMany).not.toHaveBeenCalled();
    expect(deleteIngredient).toHaveBeenCalledWith(ingredientId);
  });

  it('还被配方引用时拒绝删除，并说清楚被什么挡住', async () => {
    recipeItemCount.mockResolvedValue(3);
    mappingFindMany.mockResolvedValue([{ nutritionFoodId: 'nf-auto' }]);

    await expect(service.deleteIngredient(ingredientId)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.deleteIngredient(ingredientId)).rejects.toThrow(
      /3 处配方/,
    );
    expect(deleteIngredient).not.toHaveBeenCalled();
    // 拦住就别动营养档案，避免「删了映射但原料还在」的半截状态
    expect(mappingDeleteMany).not.toHaveBeenCalled();
  });

  it('被采购记录和包装规则同时引用时，两条都要点名', async () => {
    purchaseItemCount.mockResolvedValue(2);
    supplementPackagingRuleCount.mockResolvedValue(1);

    await expect(service.deleteIngredient(ingredientId)).rejects.toThrow(
      /2 条采购记录.*1 条补剂包装规则/,
    );
    expect(deleteIngredient).not.toHaveBeenCalled();
  });

  it('数据库仍报外键冲突时翻译成人话，不抛 500', async () => {
    deleteIngredient.mockRejectedValue(
      Object.assign(new Error('Foreign key constraint failed'), {
        code: 'P2003',
      }),
    );

    await expect(service.deleteIngredient(ingredientId)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.deleteIngredient(ingredientId)).rejects.toThrow(
      /仍被其它数据引用/,
    );
  });
});
