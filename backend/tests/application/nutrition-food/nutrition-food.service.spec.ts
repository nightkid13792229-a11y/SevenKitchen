import { NutritionFoodCategory, NutritionFoodStatus } from '@prisma/client';
import { NutritionFoodService } from '../../../src/application/nutrition-food/nutrition-food.service';

describe('NutritionFoodService USDA import', () => {
  const originalApiKey = process.env.USDA_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.USDA_API_KEY = originalApiKey;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('stores imported USDA nutrients as structured NutritionProfileV2 metadata, not legacy flat keys', async () => {
    process.env.USDA_API_KEY = 'test-usda-key';
    const prisma = {
      nutritionFood: {
        create: jest.fn((params) =>
          Promise.resolve({
            id: 'nutrition-food-1',
            name: params.data.name,
            nameEn: null,
            category: params.data.category,
            dataSource: params.data.dataSource,
            externalId: params.data.externalId,
            version: 1,
            status: NutritionFoodStatus.PENDING,
            nutritionData: params.data.nutritionData,
            notes: null,
            createdBy: params.data.createdBy,
            verifiedBy: null,
            verifiedAt: null,
            createdAt: new Date('2026-05-11T00:00:00.000Z'),
            updatedAt: new Date('2026-05-11T00:00:00.000Z'),
            mappings: [],
          }),
        ),
      },
    } as any;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        fdcId: 173904,
        foodNutrients: [
          {
            nutrient: { id: 1008, name: 'Energy', unitName: 'kcal' },
            amount: 379,
          },
          {
            nutrient: {
              id: 1114,
              name: 'Vitamin D (D2 + D3)',
              unitName: 'µg',
            },
            amount: 2.5,
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const service = new NutritionFoodService(prisma);
    await service.importFromUSDA(
      '173904',
      'Oats',
      NutritionFoodCategory.GRAIN,
      'user-1',
    );

    const nutritionData =
      prisma.nutritionFood.create.mock.calls[0][0].data.nutritionData;

    expect(nutritionData).toMatchObject({
      meta: {
        rawBasisType: 'PER_100_G',
        sourceType: 'USDA',
        sourceKind: 'FOOD_DATABASE',
        sourceCode: 'USDA_FDC',
        sourceProvider: 'USDA FoodData Central',
      },
      macros: { energyKcal: 379 },
      vitamins: { vitaminD: 100 },
    });
    expect(nutritionData).not.toHaveProperty('energy_kcal');
    expect(nutritionData.meta.sourceForms['vitamins.vitaminD']).toMatchObject({
      sourceNutrientId: 1114,
      originalUnit: 'µg',
      canonicalUnit: 'IU',
    });
  });
});
