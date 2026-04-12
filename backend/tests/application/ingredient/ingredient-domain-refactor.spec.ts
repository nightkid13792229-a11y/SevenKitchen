import { Test, TestingModule } from '@nestjs/testing';
import {
  IngredientService,
  INGREDIENT_REPOSITORY,
} from '../../../src/application/ingredient/ingredient.service';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from '../../../src/domain/ingredient/enums';

describe('IngredientService domain refactor', () => {
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

  it('creates a standard ingredient without requiring procurement fields', async () => {
    const nutritionProfile = {
      items: [
        {
          nutrientCode: 'CA',
          nutrientName: '钙',
          value: 240,
          unit: 'mg',
          basisType: 'PER_100_G',
          basisQuantity: 100,
          sourceType: 'MANUAL',
          sourceName: '内部整理',
          confidenceLevel: 'HIGH',
          isKeyNutrient: true,
          notes: '测试数据',
        },
      ],
    };

    const result = await service.createIngredient({
      name: '碳酸钙',
      type: IngredientType.SUPPLEMENT,
      procurementStrategy: IngredientProcurementStrategy.DAILY_PURCHASE,
      notes: '仅维护逻辑原料字段',
      baseUnit: BaseUnit.PCS,
      baseUnitDisplayName: '粒',
      properties: {
        category_type: 'MINERAL',
        add_timing: 'BEFORE_MEAL',
      },
      nutritionProfile,
      tagIds: ['tag-1'],
    } as any);

    expect(result.baseUnitDisplayName).toBe('粒');
    expect(result.nutritionProfile).toEqual({
      meta: { rawBasisType: 'PER_100_G' },
      macros: {
        energyKcal: null,
        moisture: null,
        crudeProtein: null,
        crudeFat: null,
        ash: null,
        carbohydrate: null,
        fiber: null,
        solubleFiber: null,
        insolubleFiber: null,
      },
      minerals: {
        calcium: 240,
        phosphorus: null,
        potassium: null,
        sodium: null,
        magnesium: null,
        chloride: null,
        iron: null,
        zinc: null,
        copper: null,
        manganese: null,
        selenium: null,
        iodine: null,
      },
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    });
    expect(result.purchaseUnit).toBe('pcs');
    expect(result.purchaseToBaseRatio).toBe(1);
    expect(result.currentPricePerPurchaseUnit).toBe(0);
    expect(ingredientRepository.save).toHaveBeenCalledWith(
      expect.anything(),
      ['tag-1'],
    );
  });
});
