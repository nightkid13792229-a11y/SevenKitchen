import { Ingredient } from '../../../src/domain/ingredient';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from '../../../src/domain/ingredient/enums';
import { PrismaIngredientRepository } from '../../../src/infrastructure/repositories/prisma-ingredient.repository';

describe('PrismaIngredientRepository nutrition profile compatibility', () => {
  const legacyProfile = {
    items: [
      {
        nutrientCode: 'CA',
        nutrientName: '钙',
        value: 240,
        unit: 'mg',
        basisType: 'PER_100_G' as const,
        basisQuantity: 100,
        sourceType: 'MANUAL',
        sourceName: '内部整理',
        confidenceLevel: 'HIGH',
        isKeyNutrient: true,
        notes: '旧版数据',
      },
    ],
  };

  const prisma = {
    ingredient: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ingredientTagAssignment: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves legacy items[] through save persistence round-trip', async () => {
    const repository = new PrismaIngredientRepository(prisma as any);
    const ingredient = new Ingredient(
      'ingredient-1',
      '碳酸钙',
      IngredientType.SUPPLEMENT,
      IngredientProcurementStrategy.DAILY_PURCHASE,
      null,
      null,
      null,
      '测试原料',
      BaseUnit.PCS,
      '粒',
      'bottle',
      1,
      10,
      10,
      null,
      null,
      null,
      null,
      null,
      { category_type: 'MINERAL' },
      legacyProfile,
    );

    prisma.ingredient.upsert.mockImplementation(async ({ create }) => ({
      ...create,
      createdAt: new Date('2026-04-12T10:00:00.000Z'),
      updatedAt: new Date('2026-04-12T10:00:00.000Z'),
    }));

    const result = await repository.save(ingredient);

    expect(prisma.ingredient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          nutritionProfile: legacyProfile,
        }),
        update: expect.objectContaining({
          nutritionProfile: legacyProfile,
        }),
      }),
    );
    expect(result.nutritionProfile).toEqual(legacyProfile);
  });
});
