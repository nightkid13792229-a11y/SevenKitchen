import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProcurementSkuService } from '../../../src/application/ingredient/procurement-sku.service';
import { RecommendedProductService } from '../../../src/application/ingredient/recommended-product.service';
import { IngredientType } from '../../../src/domain/ingredient/enums';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('Ingredient single-layer guards', () => {
  const mockPrismaService = {
    recommendedProduct: {
      create: jest.fn(),
    },
    procurementSku: {
      create: jest.fn(),
    },
    ingredient: {
      findUnique: jest.fn(),
    },
  } as any;

  let recommendedProductService: RecommendedProductService;
  let procurementSkuService: ProcurementSkuService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendedProductService,
        ProcurementSkuService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    recommendedProductService = module.get(RecommendedProductService);
    procurementSkuService = module.get(ProcurementSkuService);
    jest.clearAllMocks();
  });

  it('rejects recommended products for supplement ingredients', async () => {
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'supplement-1',
      type: IngredientType.SUPPLEMENT,
    });

    await expect(
      recommendedProductService.create('supplement-1', {
        name: '维生素E推荐商品',
        brand: 'NOW FOODS',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrismaService.recommendedProduct.create).not.toHaveBeenCalled();
  });

  it('rejects procurement skus for packaging ingredients', async () => {
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'packaging-1',
      type: IngredientType.PACKAGING,
    });

    await expect(
      procurementSkuService.create('packaging-1', {
        name: '4号泡沫箱 SKU',
        purchaseChannel: '盒马',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrismaService.procurementSku.create).not.toHaveBeenCalled();
  });
});
