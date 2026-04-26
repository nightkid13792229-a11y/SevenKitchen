jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

import { AdminController } from '../../../src/interfaces/controllers/admin.controller';
import { MIXED_BREED_VIRTUAL_ID } from '../../../src/domain/dog/constants';
import { DogSizeCategory, GrowthCurveType } from '../../../src/domain/dog/enums';

describe('AdminController', () => {
  const buildController = ({
    recipeService = {},
    coverImageService = {},
    prisma = {},
  }: {
    recipeService?: Record<string, any>;
    coverImageService?: Record<string, any>;
    prisma?: Record<string, any>;
  } = {}) =>
    new AdminController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      prisma as any,
      {} as any,
      recipeService as any,
      coverImageService as any,
      {} as any,
      {} as any,
    );

  describe('uploadRecipeNutritionReport', () => {
    it('rejects non-PDF files before uploading to COS', async () => {
      const mockCosService = {
        uploadFile: jest.fn(),
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
        {} as any,
        mockCosService as any,
      );

      const result = await (controller as any).uploadRecipeNutritionReport({
        originalname: 'report.png',
        mimetype: 'image/png',
      } as Express.Multer.File);

      expect(result.code).toBe(400);
      expect(result.message).toContain('PDF');
      expect(mockCosService.uploadFile).not.toHaveBeenCalled();
    });

    it('uploads PDF reports to the recipe nutrition report folder', async () => {
      const mockCosService = {
        uploadFile: jest.fn().mockResolvedValue({
          url: 'https://cdn.example.com/recipe-nutrition-reports/report.pdf',
          key: 'recipe-nutrition-reports/report.pdf',
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
        {} as any,
        mockCosService as any,
      );
      const file = {
        originalname: 'report.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const result = await (controller as any).uploadRecipeNutritionReport(file);

      expect(mockCosService.uploadFile).toHaveBeenCalledWith(
        file,
        'report.pdf',
        'recipe-nutrition-reports',
      );
      expect(result.data).toEqual({
        url: 'https://cdn.example.com/recipe-nutrition-reports/report.pdf',
        key: 'recipe-nutrition-reports/report.pdf',
      });
    });
  });

  describe('recipe cover title rendering', () => {
    const cleanCoverUrl =
      'https://img.sevenkitchen.cloud/recipes/source-clean-cover.jpg';
    const bakedCoverUrl =
      'https://img.sevenkitchen.cloud/recipes/covers/cover-with-title.jpg';

    it('keeps recipe create cover images clean when coverTitle is present', async () => {
      const recipeService = {
        createRecipe: jest.fn().mockResolvedValue({
          id: 'recipe-row-1',
          coverImageUrl: cleanCoverUrl,
          coverTitle: '肿瘤预防',
        }),
      };
      const coverImageService = {
        renderTitleOnCover: jest.fn().mockResolvedValue(bakedCoverUrl),
      };
      const controller = buildController({
        recipeService,
        coverImageService,
      });

      const result = await controller.createRecipe({
        name: '十字花科全谷物三文鱼鸡肉',
        nutritionStandard: 'FEDIAF_2021',
        status: 'PUBLIC',
        coverImageUrl: cleanCoverUrl,
        coverTitle: '肿瘤预防',
        applicableLifeStages: ['ADULT'],
        targetHealthTags: [],
      });

      expect(coverImageService.renderTitleOnCover).not.toHaveBeenCalled();
      expect(recipeService.createRecipe).toHaveBeenCalledWith(
        expect.objectContaining({
          coverImageUrl: cleanCoverUrl,
          coverTitle: '肿瘤预防',
        }),
      );
      expect(result.code).toBe(0);
    });

    it('keeps recipe update cover images clean when coverTitle is present', async () => {
      const recipeService = {
        updateRecipe: jest.fn().mockResolvedValue({
          id: 'recipe-row-1',
          coverImageUrl: cleanCoverUrl,
          coverTitle: '肿瘤预防',
        }),
      };
      const coverImageService = {
        renderTitleOnCover: jest.fn().mockResolvedValue(bakedCoverUrl),
      };
      const controller = buildController({
        recipeService,
        coverImageService,
      });

      const result = await controller.updateRecipe('recipe-row-1', {
        nutritionStandard: 'FEDIAF_2021',
        status: 'PUBLIC',
        coverImageUrl: cleanCoverUrl,
        coverTitle: '肿瘤预防',
        applicableLifeStages: ['ADULT'],
        targetHealthTags: [],
      });

      expect(coverImageService.renderTitleOnCover).not.toHaveBeenCalled();
      expect(recipeService.updateRecipe).toHaveBeenCalledWith(
        'recipe-row-1',
        expect.objectContaining({
          coverImageUrl: cleanCoverUrl,
          coverTitle: '肿瘤预防',
        }),
      );
      expect(result.code).toBe(0);
    });

    it('does not regenerate baked title cover images through the legacy admin endpoint', async () => {
      const prisma = {
        recipe: {
          findMany: jest.fn().mockResolvedValue([
            {
              recipe_id: 'recipe-1',
              version: 1,
              name: '十字花科全谷物三文鱼鸡肉',
              cover_title: '肿瘤预防',
              cover_image_url: cleanCoverUrl,
            },
          ]),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      const coverImageService = {
        renderTitleOnCover: jest.fn().mockResolvedValue(bakedCoverUrl),
      };
      const controller = buildController({
        prisma,
        coverImageService,
      });

      const result = await controller.regenerateCovers({
        recipeIds: ['recipe-1'],
      });

      expect(prisma.recipe.findMany).not.toHaveBeenCalled();
      expect(coverImageService.renderTitleOnCover).not.toHaveBeenCalled();
      expect(prisma.recipe.update).not.toHaveBeenCalled();
      expect(result.data).toEqual({
        total: 0,
        results: [],
        message:
          'Cover title rendering is disabled; use clean coverImageUrl images and display coverTitle in the miniapp UI.',
      });
    });
  });

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

  describe('getAllDogs', () => {
    it('applies admin dog list filters before pagination', async () => {
      const dogRecord = {
        id: 'dog-1',
        ownerId: 'customer-1',
        name: 'Star',
        breedId: 'breed-1',
        customBreedName: null,
        birthday: new Date('2024-01-01T00:00:00.000Z'),
        gender: 'FEMALE',
        isNeutered: true,
        currentWeightKg: 4.5,
        bcsScore: 5,
        activityLevel: 'NORMAL',
        lifeStageOverride: 'NONE',
        sizeClassOverride: null,
        mealsPerDay: 2,
        treatInputMode: 'ESTIMATE_LEVEL',
        treatLevel: 'LOW',
        manualTreatKcal: null,
        medicalHistory: null,
        cachedTargetFoodKcal: 220,
        createdAt: new Date('2026-04-12T10:00:00.000Z'),
      };
      const mockPrisma = {
        dog: {
          findMany: jest.fn().mockResolvedValue([dogRecord]),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      const mockDogBreedRepository = {
        findAll: jest.fn().mockResolvedValue([
          {
            id: 'breed-1',
            name: '雪纳瑞（迷你）',
          },
        ]),
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
        {} as any,
      );

      const result = await (controller as any).getAllDogs(
        '2',
        '10',
        'Star',
        'breed-1',
      );

      const expectedWhere = {
        breedId: 'breed-1',
        OR: [
          { name: { contains: 'Star', mode: 'insensitive' } },
          { id: { contains: 'Star', mode: 'insensitive' } },
        ],
      };
      expect(mockPrisma.dog.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      });
      expect(mockPrisma.dog.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
      expect(result.data).toMatchObject({
        total: 1,
        page: 2,
        pageSize: 10,
        data: [
          {
            id: 'dog-1',
            name: 'Star',
            breedName: '雪纳瑞（迷你）',
          },
        ],
      });
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

    it('returns uploaded preparation photos in admin order detail for the miniapp staff path', async () => {
      const order = {
        id: 'order-1',
        customerId: 'customer-1',
        dogId: 'dog-1',
        addressId: null,
        address: null,
        status: 'IN_PRODUCTION',
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
          findUnique: jest.fn().mockResolvedValue(null),
        },
        packagingUnit: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'unit-1',
              photosRaw: ['https://cdn.example.com/raw-1.jpg'],
              updatedAt: new Date('2026-04-24T10:00:00.000Z'),
            },
          ]),
        },
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
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const result = await controller.getOrderDetail('order-1');

      expect(result.code).toBe(0);
      expect(mockPrisma.packagingUnit.findMany).toHaveBeenCalledWith({
        where: {
          sourceOrderItemIds: {
            hasSome: ['item-1'],
          },
        },
        select: {
          id: true,
          photosRaw: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: 'asc',
        },
      });
      expect(result.data?.productionPhotos).toEqual({
        unitId: 'unit-1',
        photos: ['https://cdn.example.com/raw-1.jpg'],
        uploadedAt: '2026-04-24T10:00:00.000Z',
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

    it('uploads DIY sheet header background images to the dedicated COS folder', async () => {
      const mockCosService = {
        uploadImage: jest.fn().mockResolvedValue({
          url: 'https://cdn.example.com/diy-sheet-header-bg/1711111111-abcd1234.jpg',
          key: 'diy-sheet-header-bg/1711111111-abcd1234.jpg',
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
        {} as any,
        mockCosService as any,
      );

      const file = {
        originalname: 'diy-sheet-header.jpg',
        buffer: Buffer.from('image'),
      } as Express.Multer.File;

      const result = await controller.uploadDiySheetHeaderBg(file);

      expect(mockCosService.uploadImage).toHaveBeenCalledWith(
        file,
        'diy-sheet-header.jpg',
        'diy-sheet-header-bg',
      );
      expect(result.code).toBe(0);
      expect(result.data).toEqual({
        url: 'https://cdn.example.com/diy-sheet-header-bg/1711111111-abcd1234.jpg',
        key: 'diy-sheet-header-bg/1711111111-abcd1234.jpg',
      });
    });
  });
});
