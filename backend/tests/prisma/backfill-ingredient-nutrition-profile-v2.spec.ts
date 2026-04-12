import {
  buildNormalizedNutritionProfile,
  runIngredientNutritionProfileV2Backfill,
} from '../../prisma/backfill-ingredient-nutrition-profile-v2';

describe('ingredient nutrition profile v2 backfill', () => {
  it('returns null when input is null', () => {
    expect(buildNormalizedNutritionProfile(null)).toBeNull();
  });

  it('upgrades legacy items[] payload into grouped v2 profile', () => {
    const normalized = buildNormalizedNutritionProfile({
      items: [
        {
          nutrientCode: 'protein',
          nutrientName: '粗蛋白',
          value: 18,
          unit: 'g',
          basisType: 'PER_1_PCS',
        },
        {
          nutrientCode: 'i',
          nutrientName: '碘',
          value: 150,
          unit: 'ug',
          basisType: 'PER_1_PCS',
        },
        {
          nutrientCode: 'mystery',
          nutrientName: '未知营养素',
          value: 3,
          unit: 'mg',
          basisType: 'PER_1_PCS',
          notes: 'legacy note',
        },
      ],
    } as any);

    expect(normalized).toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          rawBasisType: 'PER_SERVING',
        }),
        macros: expect.objectContaining({
          crudeProtein: 18,
        }),
        minerals: expect.objectContaining({
          iodine: 150,
        }),
        customItems: [
          {
            name: '未知营养素',
            value: 3,
            unit: 'mg',
            rawBasisType: 'PER_SERVING',
            note: 'legacy note',
          },
        ],
      }),
    );
  });

  it('fills v2 defaults while keeping an already structured profile equivalent', () => {
    const normalized = buildNormalizedNutritionProfile({
      meta: { rawBasisType: 'PER_100_ML' },
      macros: { crudeProtein: 12 },
      minerals: { iodine: 150 },
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    } as any);

    expect(normalized).toEqual(
      expect.objectContaining({
        meta: { rawBasisType: 'PER_100_ML' },
        macros: expect.objectContaining({
          crudeProtein: 12,
          energyKcal: null,
        }),
        minerals: expect.objectContaining({
          iodine: 150,
          calcium: null,
        }),
        customItems: [],
      }),
    );
  });

  it('keeps dry-run mode side-effect free while counting update/skip totals', async () => {
    const prisma = {
      ingredient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'legacy-1',
            name: '海藻粉',
            nutritionProfile: {
              items: [
                {
                  nutrientCode: 'i',
                  nutrientName: '碘',
                  value: 150,
                  unit: 'ug',
                  basisType: 'PER_100_G',
                },
              ],
            },
          },
          {
            id: 'v2-1',
            name: '鱼油',
            nutritionProfile: {
              meta: { rawBasisType: 'PER_100_G' },
              macros: {},
              minerals: { iodine: 150 },
              vitamins: {},
              fattyAcids: {},
              aminoAcids: {},
              customItems: [],
            },
          },
          {
            id: 'null-1',
            name: '泡沫箱',
            nutritionProfile: null,
          },
        ]),
        update: jest.fn(),
      },
    };

    const result = await runIngredientNutritionProfileV2Backfill({
      prisma: prisma as any,
      apply: false,
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
    });

    expect(prisma.ingredient.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      apply: 0,
      update: 1,
      skip: 2,
      error: 0,
    });
  });

  it('persists migrated v2 profiles only when apply mode is enabled', async () => {
    const prisma = {
      ingredient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'legacy-1',
            name: '海藻粉',
            nutritionProfile: {
              items: [
                {
                  nutrientCode: 'i',
                  nutrientName: '碘',
                  value: 150,
                  unit: 'ug',
                  basisType: 'PER_100_G',
                },
              ],
            },
          },
        ]),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    const result = await runIngredientNutritionProfileV2Backfill({
      prisma: prisma as any,
      apply: true,
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
    });

    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'legacy-1' },
      data: {
        nutritionProfile: expect.objectContaining({
          meta: expect.objectContaining({ rawBasisType: 'PER_100_G' }),
          minerals: expect.objectContaining({ iodine: 150 }),
        }),
      },
    });
    expect(result).toEqual({
      apply: 1,
      update: 1,
      skip: 0,
      error: 0,
    });
  });

  it('treats mixed legacy basis types as a migration error', async () => {
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };
    const prisma = {
      ingredient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'legacy-1',
            name: '海藻粉',
            nutritionProfile: {
              items: [
                {
                  nutrientCode: 'i',
                  nutrientName: '碘',
                  value: 150,
                  unit: 'ug',
                  basisType: 'PER_100_G',
                },
                {
                  nutrientCode: 'protein',
                  nutrientName: '粗蛋白',
                  value: 18,
                  unit: 'g',
                  basisType: 'PER_1_PCS',
                },
              ],
            },
          },
        ]),
        update: jest.fn(),
      },
    };

    const result = await runIngredientNutritionProfileV2Backfill({
      prisma: prisma as any,
      apply: false,
      logger,
    });

    expect(prisma.ingredient.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      apply: 0,
      update: 0,
      skip: 0,
      error: 1,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('mixed legacy basis types'),
    );
  });

  it('treats duplicate mapped nutrients as a migration error', async () => {
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };
    const prisma = {
      ingredient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'legacy-1',
            name: '海藻粉',
            nutritionProfile: {
              items: [
                {
                  nutrientCode: 'i',
                  nutrientName: '碘',
                  value: 150,
                  unit: 'ug',
                  basisType: 'PER_100_G',
                },
                {
                  nutrientCode: 'iodine',
                  nutrientName: '碘',
                  value: 160,
                  unit: 'ug',
                  basisType: 'PER_100_G',
                },
              ],
            },
          },
        ]),
        update: jest.fn(),
      },
    };

    const result = await runIngredientNutritionProfileV2Backfill({
      prisma: prisma as any,
      apply: false,
      logger,
    });

    expect(prisma.ingredient.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      apply: 0,
      update: 0,
      skip: 0,
      error: 1,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('duplicate mapped nutrients'),
    );
  });
});
