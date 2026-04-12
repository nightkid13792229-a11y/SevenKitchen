jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

import { AdminController } from '../../../src/interfaces/controllers/admin.controller';
import { MIXED_BREED_VIRTUAL_ID } from '../../../src/domain/dog/constants';
import { DogSizeCategory, GrowthCurveType } from '../../../src/domain/dog/enums';

describe('AdminController', () => {
  describe('getIngredientById', () => {
    it('returns legacy nutritionProfile items[] as-is for admin reads', async () => {
      const legacyProfile = {
        items: [
          {
            nutrientCode: 'CA',
            nutrientName: '钙',
            value: 240,
            unit: 'mg',
            basisType: 'PER_100_G',
            sourceType: 'MANUAL',
            sourceName: '内部整理',
            confidenceLevel: 'HIGH',
            isKeyNutrient: true,
            notes: '测试数据',
          },
        ],
      };
      const ingredient = {
        id: 'ingredient-1',
        name: '碳酸钙',
        type: 'SUPPLEMENT',
        brand: null,
        productModel: null,
        purchaseChannel: null,
        notes: null,
        baseUnit: 'PCS',
        baseUnitDisplayName: '粒',
        unitDisplayLabel: '粒',
        procurementStrategy: 'DAILY_PURCHASE',
        purchaseUnit: 'bottle',
        purchaseToBaseRatio: 1,
        currentPricePerPurchaseUnit: 10,
        getEffectivePricePerPurchaseUnit: () => 10,
        getUnitCost: () => 10,
        weightG: null,
        maxCapacityG: null,
        safetyStock: null,
        reorderPoint: null,
        targetStock: null,
        properties: { category_type: 'MINERAL' },
        nutritionProfile: legacyProfile,
      };

      const mockIngredientService = {
        getIngredientById: jest.fn().mockResolvedValue(ingredient),
      };
      const mockPrisma = {
        ingredient: {
          findUnique: jest.fn().mockResolvedValue({
            createdAt: new Date('2026-04-12T10:00:00.000Z'),
            updatedAt: new Date('2026-04-12T10:00:00.000Z'),
            tags: [],
            recommendedProducts: [],
          }),
        },
      };

      const controller = new AdminController(
        mockIngredientService as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockPrisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const result = await controller.getIngredientById('ingredient-1');

      expect(mockIngredientService.getIngredientById).toHaveBeenCalledWith(
        'ingredient-1',
      );
      expect(result.data?.nutritionProfile).toEqual(legacyProfile);
    });
  });

  describe('getBreeds', () => {
    it('returns standard breeds sorted by profile count desc with profileCount included', async () => {
      const mockDogBreedRepository = {
        findAll: jest.fn().mockResolvedValue([
          {
            id: 'breed-alpha',
            name: '阿尔法犬',
            aliases: [],
            sizeCategory: DogSizeCategory.SMALL,
            growthCurveType: GrowthCurveType.STANDARD,
            adultAgeMonths: 10,
            seniorAgeYears: 11,
            averageAdultWeightKg: 4.5,
            isCommon: false,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            id: 'breed-bravo',
            name: '布拉沃犬',
            aliases: [],
            sizeCategory: DogSizeCategory.MEDIUM,
            growthCurveType: GrowthCurveType.STANDARD,
            adultAgeMonths: 12,
            seniorAgeYears: 10,
            averageAdultWeightKg: 12.3,
            isCommon: false,
            createdAt: new Date('2026-01-02T00:00:00Z'),
            updatedAt: new Date('2026-01-02T00:00:00Z'),
          },
          {
            id: 'breed-charlie',
            name: '查理犬',
            aliases: [],
            sizeCategory: DogSizeCategory.LARGE,
            growthCurveType: GrowthCurveType.STANDARD,
            adultAgeMonths: 18,
            seniorAgeYears: 8,
            averageAdultWeightKg: 28.6,
            isCommon: false,
            createdAt: new Date('2026-01-03T00:00:00Z'),
            updatedAt: new Date('2026-01-03T00:00:00Z'),
          },
        ]),
      };
      const mockPrisma = {
        dog: {
          groupBy: jest.fn().mockResolvedValue([
            { breedId: 'breed-charlie', _count: { breedId: 12 } },
            { breedId: 'breed-alpha', _count: { breedId: 4 } },
          ]),
        },
      };

      const controller = new AdminController(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockPrisma as any,
        mockDogBreedRepository as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const result = await controller.getBreeds();

      expect(mockPrisma.dog.groupBy).toHaveBeenCalledWith({
        by: ['breedId'],
        where: {
          breedId: {
            not: MIXED_BREED_VIRTUAL_ID,
          },
        },
        _count: {
          breedId: true,
        },
        orderBy: {
          _count: {
            breedId: 'desc',
          },
        },
      });
      expect((result.data ?? []).map((breed: any) => breed.id)).toEqual([
        'breed-charlie',
        'breed-alpha',
        'breed-bravo',
      ]);
      expect((result.data ?? []).map((breed: any) => breed.profileCount)).toEqual([
        12,
        4,
        0,
      ]);
    });
  });
});
