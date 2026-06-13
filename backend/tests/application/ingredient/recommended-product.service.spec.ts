import { Test, TestingModule } from '@nestjs/testing';
import { RecommendedProductService } from '../../../src/application/ingredient/recommended-product.service';
import { IngredientType } from '../../../src/domain/ingredient/enums';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('RecommendedProductService', () => {
  let service: RecommendedProductService;
  const mockPrismaService = {
    recommendedProduct: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ingredient: {
      findUnique: jest.fn(),
    },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendedProductService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get(RecommendedProductService);
    jest.clearAllMocks();
  });

  it('listBrands returns distinct trimmed historical brands', async () => {
    mockPrismaService.recommendedProduct.findMany.mockResolvedValue([
      { brand: ' NOW ' },
      { brand: 'NOW' },
      { brand: null },
      { brand: '  ' },
      { brand: 'Nordic Naturals' },
    ]);

    await expect(service.listBrands()).resolves.toEqual([
      'Nordic Naturals',
      'NOW',
    ]);

    expect(mockPrismaService.recommendedProduct.findMany).toHaveBeenCalledWith({
      where: {
        brand: {
          not: null,
        },
      },
      select: {
        brand: true,
      },
    });
  });

  it('listPurchaseChannels returns distinct trimmed historical channels', async () => {
    mockPrismaService.recommendedProduct.findMany.mockResolvedValue([
      { purchaseChannel: ' 京东 ' },
      { purchaseChannel: '盒马' },
      { purchaseChannel: '京东' },
      { purchaseChannel: '' },
      { purchaseChannel: null },
    ]);

    await expect(service.listPurchaseChannels()).resolves.toEqual([
      '京东',
      '盒马',
    ]);

    expect(mockPrismaService.recommendedProduct.findMany).toHaveBeenCalledWith({
      where: {
        purchaseChannel: {
          not: null,
        },
      },
      select: {
        purchaseChannel: true,
      },
    });
  });

  it('create accepts marketing nutrition highlights as compatibility input', async () => {
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      type: IngredientType.FOOD,
    });
    mockPrismaService.recommendedProduct.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'rp-1',
        ingredientId: data.ingredientId,
        name: data.name,
        brand: data.brand ?? null,
        productModel: data.productModel ?? null,
        purchaseChannel: data.purchaseChannel ?? null,
        purchaseLink: data.purchaseLink ?? null,
        imageUrl: data.imageUrl ?? null,
        activeNutrients: data.activeNutrients ?? null,
        displayUnit: data.displayUnit ?? null,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      }),
    );

    const marketingNutritionHighlights = {
      EPA: { value: 120, unit: 'mg' },
      DHA: { value: 80, unit: 'mg' },
    };

    await expect(
      service.create('ingredient-1', {
        name: '深海鱼油胶囊',
        marketingNutritionHighlights,
      } as any),
    ).resolves.toEqual(
      expect.objectContaining({
        activeNutrients: marketingNutritionHighlights,
        marketingNutritionHighlights,
      }),
    );

    expect(mockPrismaService.recommendedProduct.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ingredientId: 'ingredient-1',
        name: '深海鱼油胶囊',
        activeNutrients: marketingNutritionHighlights,
      }),
    });
  });

  it('create stores mini program purchase links for user-facing purchase jumps', async () => {
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      type: IngredientType.FOOD,
    });
    mockPrismaService.recommendedProduct.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'rp-1',
        ingredientId: data.ingredientId,
        name: data.name,
        purchaseLink: data.purchaseLink ?? null,
        activeNutrients: null,
      }),
    );

    await service.create('ingredient-1', {
      name: '京东牛肉',
      purchaseLink: {
        platform: 'JD',
        mini_program_appid: 'wx91d27dbf599dff74',
        mini_program_path: 'pages/product/detail?id=123',
      },
    });

    expect(mockPrismaService.recommendedProduct.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purchaseLink: {
          platform: 'JD',
          mini_program_appid: 'wx91d27dbf599dff74',
          mini_program_path: 'pages/product/detail?id=123',
        },
      }),
    });
  });

  it('rejects legacy URL-only purchase links for user-facing recommended products', async () => {
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      type: IngredientType.FOOD,
    });

    await expect(
      service.create('ingredient-1', {
        name: '旧口令商品',
        purchaseLink: {
          platform: 'JD',
          url: 'https://jd.example/product',
        },
      }),
    ).rejects.toThrow('小程序商品链接需要配置目标小程序 AppID 和页面路径');

    expect(mockPrismaService.recommendedProduct.create).not.toHaveBeenCalled();
  });
});
