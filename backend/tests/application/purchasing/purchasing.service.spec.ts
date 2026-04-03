import { Test } from '@nestjs/testing';
import { ProcurementSkuService } from 'src/application/ingredient/procurement-sku.service';
import { RecommendedProductService } from 'src/application/ingredient/recommended-product.service';
import { INGREDIENT_REPOSITORY } from 'src/application/ingredient/ingredient.service';
import { ORDER_REPOSITORY } from 'src/application/order/order.service';
import { PurchasingService } from 'src/application/purchasing/purchasing.service';
import {
  PURCHASE_LIST_REPOSITORY,
  PURCHASE_RECORD_REPOSITORY,
} from 'src/application/purchasing/purchasing.service.tokens';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

describe('PurchasingService procurement sku separation', () => {
  it('uses procurement skus for purchase suggestions and does not call RecommendedProductService', async () => {
    const orderRepository = {
      findByTargetProductionDateRange: jest
        .fn()
        .mockResolvedValue({ list: [] }),
    } as any;
    const ingredientRepository = {
      findByIds: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
    } as any;
    const procurementSkuService = {
      batchFindActive: jest.fn().mockResolvedValue({
        'ingredient-1': [
          {
            id: 'proc-sku-1',
            ingredientId: 'ingredient-1',
            name: '快驴鸡胸 2kg/包',
            purchaseChannel: '美团快驴',
            productModel: '2kg/包',
            displayUnit: '包',
            isActive: true,
            sortOrder: 0,
          },
        ],
      }),
      listActivePurchaseChannels: jest.fn().mockResolvedValue(['美团快驴']),
    } as any;
    const recommendedProductService = {
      batchFindActive: jest.fn(),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
        { provide: INGREDIENT_REPOSITORY, useValue: ingredientRepository },
        { provide: ProcurementSkuService, useValue: procurementSkuService },
        {
          provide: RecommendedProductService,
          useValue: recommendedProductService,
        },
        { provide: PURCHASE_LIST_REPOSITORY, useValue: {} },
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: {} },
      ],
    }).compile();

    const service = moduleRef.get(PurchasingService);
    const result = await (service as any).enrichRequirementsWithProcurementSkus(
      [
        {
          ingredientId: 'ingredient-1',
          ingredientName: '鸡胸肉',
          type: 'FOOD',
          quantityNeeded: 2,
          quantityUnit: 'kg',
          estimatedCost: 60,
          purchaseChannel: '原料默认渠道',
          productModel: '原料默认规格',
        },
      ],
      new Map([
        [
          'ingredient-1',
          {
            id: 'ingredient-1',
            name: '鸡胸肉',
            purchaseChannel: '原料默认渠道',
            productModel: '原料默认规格',
            unitDisplayLabel: 'kg',
            purchaseUnit: 'kg',
          },
        ],
      ]),
    );

    expect(result[0]).toEqual(
      expect.objectContaining({
        procurementSkuId: 'proc-sku-1',
        procurementSkuName: '快驴鸡胸 2kg/包',
        suggestedProductId: 'proc-sku-1',
        suggestedProductName: '快驴鸡胸 2kg/包',
        purchaseChannel: '美团快驴',
        productModel: '2kg/包',
        displayUnit: '包',
      }),
    );
    expect(recommendedProductService.batchFindActive).not.toHaveBeenCalled();
  });
});
