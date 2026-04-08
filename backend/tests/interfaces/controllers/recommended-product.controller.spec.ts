import { Test } from '@nestjs/testing';
import { RecommendedProductService } from 'src/application/ingredient/recommended-product.service';
import { RecommendedProductController } from 'src/interfaces/controllers/recommended-product.controller';

describe('RecommendedProductController DIY semantics', () => {
  let controller: RecommendedProductController;
  const recommendedProductService = {
    batchFindActive: jest.fn().mockResolvedValue({
      'ingredient-1': [
        {
          id: 'diy-1',
          ingredientId: 'ingredient-1',
          name: '家庭补剂 60粒',
          purchaseLink: { url: 'https://a.example' },
        },
      ],
    }),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RecommendedProductController],
      providers: [
        {
          provide: RecommendedProductService,
          useValue: recommendedProductService,
        },
      ],
    }).compile();

    controller = moduleRef.get(RecommendedProductController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns DIY recommended products only from /api/v1/recommended-products', async () => {
    const response = await controller.batchFind('ingredient-1');

    expect(response.code).toBe(0);
    expect(response.data['ingredient-1'][0].name).toBe('家庭补剂 60粒');
    expect(recommendedProductService.batchFindActive).toHaveBeenCalledWith([
      'ingredient-1',
    ]);
  });
});
