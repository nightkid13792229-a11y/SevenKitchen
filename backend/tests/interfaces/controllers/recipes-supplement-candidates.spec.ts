import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecipesController } from '../../../src/interfaces/controllers/recipes.controller';

describe('RecipesController.getSupplementCandidates', () => {
  function build(options: {
    recipe?: unknown;
    sheet?: unknown;
    user?: unknown;
  } = {}) {
    const candidateService = {
      resolveForRecipe: jest.fn().mockResolvedValue({ items: [] }),
    };
    const prisma = {
      dIYSheet: {
        findUnique: jest.fn().mockResolvedValue(options.sheet ?? null),
      },
    };
    const controller = new RecipesController(
      {} as any,
      {} as any,
      {} as any,
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      candidateService as any,
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
    return { controller, candidateService, prisma, req };
  }

  it('uses the query weight when there is no sheet', async () => {
    const { controller, candidateService, req } = build();

    await controller.getSupplementCandidates(
      'recipe-biz',
      '3000',
      undefined,
      undefined,
      undefined,
      req,
    );

    expect(candidateService.resolveForRecipe).toHaveBeenCalledWith({
      recipeBusinessId: 'recipe-biz',
      recipeVersion: 3,
      totalWeightG: 3000,
      weightSource: 'QUERY',
      audience: 'CUSTOMER',
    });
  });

  it('prefers the saved sheet package plan and verifies its owner', async () => {
    const { controller, candidateService, req } = build({
      sheet: {
        userId: 'user-1',
        packagePlan: [
          { packageSpecG: 100, packageCount: 15 },
        ],
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

    expect(candidateService.resolveForRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        totalWeightG: 1500,
        weightSource: 'DIY_SHEET',
      }),
    );
  });

  it('ignores a sheet that belongs to another user', async () => {
    const { controller, candidateService, req } = build({
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

    expect(candidateService.resolveForRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ weightSource: 'QUERY', totalWeightG: 3000 }),
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
