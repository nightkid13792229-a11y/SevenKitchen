import { Test } from '@nestjs/testing';
import { IngredientSuggestionsController } from 'src/interfaces/controllers/ingredient-suggestions.controller';
import { IngredientService } from 'src/application/ingredient/ingredient.service';
import { RecommendedProductService } from 'src/application/ingredient/recommended-product.service';
import { ProcurementSkuService } from 'src/application/ingredient/procurement-sku.service';

describe('IngredientSuggestionsController', () => {
  let controller: IngredientSuggestionsController;

  const ingredientService = {
    getAllIngredients: jest.fn(),
  };

  const recommendedProductService = {
    listBrands: jest.fn(),
    listPurchaseChannels: jest.fn(),
  };

  const procurementSkuService = {
    listBrands: jest.fn(),
    listPurchaseChannels: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IngredientSuggestionsController],
      providers: [
        {
          provide: IngredientService,
          useValue: ingredientService,
        },
        {
          provide: RecommendedProductService,
          useValue: recommendedProductService,
        },
        {
          provide: ProcurementSkuService,
          useValue: procurementSkuService,
        },
      ],
    }).compile();

    controller = moduleRef.get(IngredientSuggestionsController);
    jest.clearAllMocks();
  });

  it('returns merged distinct brand suggestions from all historical sources', async () => {
    ingredientService.getAllIngredients.mockResolvedValue([
      { brand: ' NOW ' },
      { brand: null },
      { brand: 'Nordic Naturals' },
    ]);
    recommendedProductService.listBrands.mockResolvedValue([
      'NOW',
      'California Gold Nutrition',
    ]);
    procurementSkuService.listBrands.mockResolvedValue(['iHerb', 'NOW']);

    const response = await controller.getBrandSuggestions();

    expect(response.code).toBe(0);
    expect(response.data).toEqual([
      'California Gold Nutrition',
      'iHerb',
      'Nordic Naturals',
      'NOW',
    ]);
  });

  it('returns merged distinct purchase channel suggestions from all historical sources', async () => {
    ingredientService.getAllIngredients.mockResolvedValue([
      { purchaseChannel: ' 京东 ' },
      { purchaseChannel: null },
      { purchaseChannel: '盒马' },
    ]);
    recommendedProductService.listPurchaseChannels.mockResolvedValue([
      '淘宝',
      '京东',
    ]);
    procurementSkuService.listPurchaseChannels.mockResolvedValue([
      '山姆',
      '盒马',
    ]);

    const response = await controller.getPurchaseChannelSuggestions();

    expect(response.code).toBe(0);
    expect(response.data).toEqual(['京东', '山姆', '淘宝', '盒马']);
  });
});
