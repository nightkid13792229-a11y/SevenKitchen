import { Test, TestingModule } from '@nestjs/testing';
import { RecommendedProductService } from '../../../src/application/ingredient/recommended-product.service';
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
});
