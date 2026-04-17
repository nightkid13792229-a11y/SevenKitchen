import { Test, TestingModule } from '@nestjs/testing';
import {
  INGREDIENT_REPOSITORY,
  IngredientService,
} from '../../../src/application/ingredient/ingredient.service';
import { Ingredient } from '../../../src/domain/ingredient';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from '../../../src/domain/ingredient/enums';

describe('IngredientService nutrition profile compatibility', () => {
  let service: IngredientService;

  const ingredientRepository = {
    findById: jest.fn(),
    findByIds: jest.fn(),
    findAll: jest.fn(),
    findByType: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    updatePrice: jest.fn(),
    updateEffectivePrice: jest.fn(),
    delete: jest.fn(),
    setTags: jest.fn(),
    getTags: jest.fn(),
  };

  const existingLegacyProfile = {
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

  const createExistingIngredient = (nutritionProfile = existingLegacyProfile) =>
    new Ingredient(
      'ingredient-1',
      '碳酸钙',
      IngredientType.SUPPLEMENT,
      IngredientProcurementStrategy.DAILY_PURCHASE,
      false,
      false,
      null,
      '已有原料',
      null,
      null,
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
      nutritionProfile,
    );

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientService,
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: ingredientRepository,
        },
      ],
    }).compile();

    service = module.get(IngredientService);
    jest.clearAllMocks();
    ingredientRepository.save.mockImplementation(async (ingredient: any) => ingredient);
  });

  it('preserves explicit legacy items[] payload on update', async () => {
    const updatedLegacyProfile = {
      items: [
        {
          nutrientCode: 'I',
          nutrientName: '碘',
          value: 150,
          unit: 'mg',
          basisType: 'PER_100_G' as const,
          basisQuantity: 100,
          sourceType: 'LABEL',
          sourceName: '新标签',
          confidenceLevel: 'MEDIUM',
          isKeyNutrient: true,
          notes: '更新后数据',
        },
      ],
    };

    ingredientRepository.findById.mockResolvedValue(createExistingIngredient());

    const result = await service.updateIngredient('ingredient-1', {
      nutritionProfile: updatedLegacyProfile,
    });

    expect(result.nutritionProfile).toEqual(updatedLegacyProfile);
    expect(ingredientRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        nutritionProfile: updatedLegacyProfile,
      }),
      undefined,
    );
  });

  it('keeps existing legacy items[] when update omits nutritionProfile', async () => {
    ingredientRepository.findById.mockResolvedValue(createExistingIngredient());

    const result = await service.updateIngredient('ingredient-1', {
      notes: '只改备注',
    });

    expect(result.nutritionProfile).toEqual(existingLegacyProfile);
    expect(ingredientRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        nutritionProfile: existingLegacyProfile,
      }),
      undefined,
    );
  });
});
