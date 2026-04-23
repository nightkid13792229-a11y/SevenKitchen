import { BadRequestException } from '@nestjs/common';
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
      false,
      false,
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

  it('converts duplicate ingredient identity errors into a readable bad request', async () => {
    const repository = new PrismaIngredientRepository(prisma as any);
    const ingredient = new Ingredient(
      'ingredient-duplicate',
      '牛霖',
      IngredientType.FOOD,
      IngredientProcurementStrategy.DAILY_PURCHASE,
      false,
      false,
      '',
      '',
      null,
      '测试原料',
      BaseUnit.G,
      '克',
      '克',
      1,
      0,
      0,
      null,
      null,
      null,
      null,
      null,
      {
        cfct_class: '畜肉及制品',
        edible_yield_rate: 0.95,
        main_nutrients_desc: '',
      },
      null,
    );
    prisma.ingredient.upsert.mockRejectedValue(
      Object.assign(
        new Error(
          'Unique constraint failed on the fields: (`name`, `brand`, `product_model`)',
        ),
        {
          code: 'P2002',
          meta: {
            target: ['name', 'brand', 'product_model'],
          },
        },
      ),
    );

    await repository.save(ingredient).catch((error) => {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toContain('已存在名称、品牌、规格相同的标准原料');
    });
  });
});
