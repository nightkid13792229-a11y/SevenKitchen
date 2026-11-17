import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecipesController } from '../../../src/interfaces/controllers/recipes.controller';

/**
 * 补剂候选（旧接口）的取重与权限口径。
 *
 * 2026-11-17 更新：控制器在 2026-11-15 起改为委托 `resolveForRecipeRequest`
 * （三口径：参考 / 预分装 / 自购），这份用例原先还在断言更早的 `resolveForRecipe`，
 * 一直红着。这次一并校正到现行契约，并补上「用解析后的业务编号」这条。
 */
describe('RecipesController.getSupplementCandidates', () => {
  function build(options: {
    recipe?: unknown;
    sheet?: unknown;
    user?: unknown;
  } = {}) {
    const planService = {
      resolveForRecipeRequest: jest.fn().mockResolvedValue({ items: [] }),
      toLegacyCandidates: jest.fn().mockImplementation((plan: any) => plan),
    };
    const prisma = {
      dIYSheet: {
        findUnique: jest.fn().mockResolvedValue(options.sheet ?? null),
      },
    };
    const controller = new RecipesController(
      {} as any, // recipeRepository
      {} as any, // diySheetService
      prisma as any, // prisma
      {} as any, // jwtAuthService
      {} as any, // orderService
      {} as any, // allergenVocabulary
      {} as any, // deliveryService
      {} as any, // supplementCandidateService
      planService as any, // supplementPlanService
      {} as any, // recipeCoverImageService
      {} as any, // recipeService
    );
    jest
      .spyOn(controller as any, 'getAccessibleRecipe')
      .mockResolvedValue(
        options.recipe === undefined
          ? ({ id: 'recipe-biz', version: 3 } as any)
          : (options.recipe as any),
      );
    const req = {
      user:
        options.user === undefined
          ? { userId: 'user-1', customerId: 'user-1', role: 'CUSTOMER' }
          : options.user,
    };
    return { controller, planService, prisma, req };
  }

  it('uses the query weight when there is no sheet', async () => {
    const { controller, planService, req } = build();

    await controller.getSupplementCandidates(
      'recipe-biz',
      '3000',
      undefined,
      undefined,
      undefined,
      req,
    );

    expect(planService.resolveForRecipeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeId: 'recipe-biz',
        recipeVersion: 3,
        totalWeightG: 3000,
        diySheetId: undefined,
        userId: 'user-1',
      }),
    );
  });

  it('prefers the saved sheet package plan and verifies its owner', async () => {
    const { controller, planService, req } = build({
      sheet: {
        userId: 'user-1',
        packagePlan: [{ packageSpecG: 100, packageCount: 15 }],
        dailyIntakeG: 999,
        cycleDays: 30,
      },
    });

    await controller.getSupplementCandidates(
      'recipe-biz',
      '3000',
      'sheet-1',
      undefined,
      undefined,
      req,
    );

    expect(planService.resolveForRecipeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        totalWeightG: 1500,
        diySheetId: 'sheet-1',
        userId: 'user-1',
      }),
    );
  });

  it('ignores a sheet that belongs to another user', async () => {
    const { controller, planService, req } = build({
      sheet: {
        userId: 'someone-else',
        packagePlan: [{ packageSpecG: 100, packageCount: 15 }],
        dailyIntakeG: 0,
        cycleDays: 0,
      },
    });

    await controller.getSupplementCandidates(
      'recipe-biz',
      '3000',
      'sheet-1',
      undefined,
      undefined,
      req,
    );

    // 别人的单不参与算重；归属校验交给服务层
    expect(planService.resolveForRecipeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ totalWeightG: 3000, diySheetId: 'sheet-1' }),
    );
  });

  it('用解析后的业务编号去算补剂（入口可能带着已合并的旧编号）', async () => {
    const { controller, planService, req } = build({
      recipe: { id: 'canonical-recipe', version: 5 } as any,
    });

    await controller.getSupplementCandidates(
      'old-merged-recipe',
      '3000',
      undefined,
      undefined,
      undefined,
      req,
    );

    expect(planService.resolveForRecipeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeId: 'canonical-recipe',
        recipeVersion: 5,
      }),
    );
  });

  it('returns 404 when the recipe is not accessible', async () => {
    const { controller, req } = build({ recipe: null });

    await expect(
      controller.getSupplementCandidates(
        'recipe-biz',
        '3000',
        undefined,
        undefined,
        undefined,
        req,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 400 when no batch weight is available', async () => {
    const { controller, req } = build();

    await expect(
      controller.getSupplementCandidates(
        'recipe-biz',
        undefined,
        undefined,
        undefined,
        undefined,
        req,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
