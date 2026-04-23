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
            procurementSkus: [],
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
    it('returns an order financial summary for admins', async () => {
      const financialSummary = {
        orderId: 'order-1',
        amountTotal: 120,
        estimatedCost: 70,
        actualCost: 80,
        actualMargin: 40,
        shortageAdjustmentAmount: -12,
        requiresCustomerPayment: false,
      };
      const mockOrderService = {
        getOrderFinancialSummary: jest.fn().mockResolvedValue(financialSummary),
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

      const result = await controller.getOrderFinancialSummary('order-1');

      expect(mockOrderService.getOrderFinancialSummary).toHaveBeenCalledWith(
        'order-1',
      );
      expect(result.code).toBe(0);
      expect(result.data).toEqual(financialSummary);
    });

    it('creates manual order settlement adjustments for admins', async () => {
      const adjustment = {
        id: 'adjustment-1',
        orderId: 'order-1',
        amount: 18,
        reason: '补收定制分装差价',
        status: 'PENDING',
      };
      const mockOrderService = {
        createOrderSettlementAdjustment: jest
          .fn()
          .mockResolvedValue(adjustment),
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

      const result = await controller.createOrderSettlementAdjustment('order-1', {
        amount: 18,
        reason: '补收定制分装差价',
        visibleToCustomer: true,
      });

      expect(
        mockOrderService.createOrderSettlementAdjustment,
      ).toHaveBeenCalledWith({
        orderId: 'order-1',
        amount: 18,
        reason: '补收定制分装差价',
        adjustmentType: undefined,
        visibleToCustomer: true,
        requiresCustomerPayment: undefined,
        createdBy: 'admin',
        createdById: null,
      });
      expect(result.code).toBe(0);
      expect(result.data).toEqual(adjustment);
    });

    it('updates manual settlement adjustment status for admins', async () => {
      const adjustment = {
        id: 'adjustment-1',
        orderId: 'order-1',
        status: 'SETTLED',
      };
      const mockOrderService = {
        updateOrderSettlementAdjustmentStatus: jest
          .fn()
          .mockResolvedValue(adjustment),
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

      const result = await controller.updateOrderSettlementAdjustmentStatus(
        'order-1',
        'adjustment-1',
        { status: 'SETTLED' },
      );

      expect(
        mockOrderService.updateOrderSettlementAdjustmentStatus,
      ).toHaveBeenCalledWith('order-1', 'adjustment-1', 'SETTLED');
      expect(result.code).toBe(0);
      expect(result.data).toEqual(adjustment);
    });

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

    it('returns dog details on admin order items for the miniapp detail page', async () => {
      const order = {
        id: 'order-1',
        customerId: 'customer-1',
        dogId: 'dog-1',
        addressId: null,
        address: null,
        status: 'PENDING_PAYMENT',
        type: 'FRESH_FOOD',
        targetProductionDate: null,
        totalAmount: 128,
        amountProduct: 118,
        amountShipping: 10,
        amountTotal: 128,
        items: [
          {
            id: 'item-1',
            orderId: 'order-1',
            dogId: 'dog-1',
            recipeSnapshot: { id: 'recipe-1', name: '糙米鸡蛋牛肉' },
            quantityG: 1974,
            packageCount: 21,
            packageSpecG: 94,
            packagePlan: [{ packageSpecG: 94, packageCount: 21 }],
            ingredientSourcePlan: 'WHOLESALE',
            preparationMethod: 'CHOPPED',
            cookingMethod: 'RAW',
            customRequirements: null,
            dailyIntakeG: 282,
          },
        ],
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
      const mockPrisma = {
        dog: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'dog-1',
            name: 'Star',
            breedId: 'breed-1',
            customBreedName: null,
            currentWeightKg: 4.5,
            gender: 'FEMALE',
          }),
        },
      };
      const mockDogBreedRepository = {
        findById: jest.fn().mockResolvedValue({ id: 'breed-1', name: '雪纳瑞（迷你）' }),
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
        mockPrisma as any,
        mockDogBreedRepository as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const result = await controller.getOrderDetail('order-1');

      expect(result.code).toBe(0);
      expect(result.data?.items[0]).toMatchObject({
        dogId: 'dog-1',
        dog: {
          id: 'dog-1',
          name: 'Star',
          breedName: '雪纳瑞（迷你）',
          weightKg: 4.5,
          gender: 'FEMALE',
        },
      });
    });
  });

  describe('supplement DIY image management', () => {
    it('uploads supplement DIY images into the ingredient-diy-images folder', async () => {
      const mockCosService = {
        uploadImage: jest.fn().mockResolvedValue({
          url: 'https://cdn.example.com/ingredient-diy-images/1711111111-abcd1234.jpg',
          key: 'ingredient-diy-images/1711111111-abcd1234.jpg',
        }),
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
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockCosService as any,
      );

      const file = {
        originalname: 'vitamin-e.jpg',
        buffer: Buffer.from('image'),
      } as Express.Multer.File;

      const result = await controller.uploadIngredientDiyImage(file);

      expect(mockCosService.uploadImage).toHaveBeenCalledWith(
        file,
        'vitamin-e.jpg',
        'ingredient-diy-images',
      );
      expect(result.code).toBe(0);
      expect(result.data).toEqual({
        url: 'https://cdn.example.com/ingredient-diy-images/1711111111-abcd1234.jpg',
        key: 'ingredient-diy-images/1711111111-abcd1234.jpg',
      });
    });

    it('deletes supplement DIY images from COS by key', async () => {
      const mockCosService = {
        deleteImage: jest.fn().mockResolvedValue(undefined),
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
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockCosService as any,
      );

      const result = await controller.deleteIngredientDiyImage({
        key: 'ingredient-diy-images/1711111111-abcd1234.jpg',
      });

      expect(mockCosService.deleteImage).toHaveBeenCalledWith(
        'ingredient-diy-images/1711111111-abcd1234.jpg',
      );
      expect(result.code).toBe(0);
      expect(result.data).toEqual({ message: 'Image deleted successfully' });
    });
  });
});
