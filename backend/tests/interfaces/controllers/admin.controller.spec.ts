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

  describe('getOrderDetail', () => {
    it('returns address details in the admin order response', async () => {
      const order = {
        id: 'order-1',
        customerId: 'customer-1',
        dogId: 'dog-1',
        addressId: 'address-1',
        address: {
          id: 'address-1',
          recipientName: '张三',
          phone: '13800000000',
          region: {
            province: '上海市',
            city: '上海市',
            district: '浦东新区',
          },
          detail: '世纪大道100号',
        },
        status: 'PENDING_PAYMENT',
        type: 'FRESH_FOOD',
        targetProductionDate: null,
        totalAmount: 128,
        amountProduct: 118,
        amountShipping: 10,
        amountTotal: 128,
        items: [],
        pricingBreakdownSnapshot: null,
        trackingNumber: null,
        carrierCode: null,
        shippedAt: null,
        completedAt: null,
        cancelledAt: null,
        cancellationReason: null,
        cancelledBy: null,
        paymentMethod: null,
        transactionId: null,
        paidAt: null,
        paymentStatus: null,
        createdAt: new Date('2026-04-12T10:00:00.000Z'),
        adminRemark: null,
      };

      const mockOrderService = {
        getOrderById: jest.fn().mockResolvedValue(order),
      };

      const controller = new AdminController(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockOrderService as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const result = await controller.getOrderDetail('order-1');

      expect(mockOrderService.getOrderById).toHaveBeenCalledWith('order-1');
      expect(result.code).toBe(0);
      expect(result.data?.address).toEqual({
        id: 'address-1',
        recipientName: '张三',
        phone: '13800000000',
        region: {
          province: '上海市',
          city: '上海市',
          district: '浦东新区',
        },
        regionText: '上海市 上海市 浦东新区',
        detailAddress: '世纪大道100号',
      });
    });
  });
});
