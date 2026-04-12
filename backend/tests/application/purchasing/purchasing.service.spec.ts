import { Test } from '@nestjs/testing';
import { ProcurementSkuService } from 'src/application/ingredient/procurement-sku.service';
import { RecommendedProductService } from 'src/application/ingredient/recommended-product.service';
import { INGREDIENT_REPOSITORY } from 'src/application/ingredient/ingredient.service';
import { InventoryService } from 'src/application/inventory/inventory.service';
import { ORDER_REPOSITORY } from 'src/application/order/order.service';
import { PurchasingService } from 'src/application/purchasing/purchasing.service';
import {
  PURCHASE_LIST_REPOSITORY,
  PURCHASE_RECORD_REPOSITORY,
} from 'src/application/purchasing/purchasing.service.tokens';
import { DateUtil } from 'src/utils/date.util';

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
    const inventoryService = {
      getBalanceByIngredient: jest.fn().mockResolvedValue(0),
      inboundFromPurchaseRecords: jest
        .fn()
        .mockResolvedValue({ createdCount: 0, skippedCount: 0 }),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
        { provide: INGREDIENT_REPOSITORY, useValue: ingredientRepository },
        { provide: InventoryService, useValue: inventoryService },
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
        purchaseChannel: '美团快驴',
        productModel: '2kg/包',
        displayUnit: '包',
      }),
    );
    expect(result[0].suggestedProductId).toBeUndefined();
    expect(result[0].suggestedProductName).toBeUndefined();
    expect(recommendedProductService.batchFindActive).not.toHaveBeenCalled();
  });

  it('normalizes purchase list date filters to noon-based ranges', async () => {
    const purchaseListRepository = {
      findMany: jest.fn().mockResolvedValue({ list: [], total: 0 }),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        {
          provide: ORDER_REPOSITORY,
          useValue: { findByTargetProductionDateRange: jest.fn() },
        },
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: { findByIds: jest.fn(), findAll: jest.fn() },
        },
        {
          provide: InventoryService,
          useValue: {
            getBalanceByIngredient: jest.fn(),
            inboundFromPurchaseRecords: jest.fn(),
          },
        },
        {
          provide: ProcurementSkuService,
          useValue: { batchFindActive: jest.fn(), listActivePurchaseChannels: jest.fn() },
        },
        {
          provide: RecommendedProductService,
          useValue: { batchFindActive: jest.fn() },
        },
        { provide: PURCHASE_LIST_REPOSITORY, useValue: purchaseListRepository },
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: {} },
      ],
    }).compile();

    const service = moduleRef.get(PurchasingService);
    const { start, end } = DateUtil.createDateRange('2026-04-05');

    await service.getPurchaseLists({
      startDate: '2026-04-05',
      endDate: '2026-04-05',
      page: 2,
      pageSize: 10,
    });

    expect(purchaseListRepository.findMany).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      startDate: start,
      endDate: end,
    });
  });

  it('does not expose raw unresolved legacy preparation method uuids in purchase requirements', async () => {
    const missingId = '33333333-3333-3333-3333-333333333333';
    const orderRepository = {
      findByTargetProductionDateRange: jest.fn().mockResolvedValue({
        list: [
          {
            id: 'order-1',
            pricingBreakdownSnapshot: {
              ingredientDetails: [
                {
                  ingredientId: 'ingredient-1',
                  name: '鸡胸肉',
                  purchaseAmount: 1200,
                  unit: 'G',
                  cost: 48,
                  preparationMethod: missingId,
                },
              ],
            },
            items: [
              {
                recipeSnapshot: {
                  items: [
                    {
                      ingredient_id: 'ingredient-1',
                      ingredient_type: 'FOOD',
                      sort_order: 1,
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    } as any;
    const ingredientRepository = {
      findByIds: jest.fn().mockResolvedValue([
        {
          id: 'ingredient-1',
          name: '鸡胸肉',
          type: 'FOOD',
          baseUnit: 'G',
          purchaseUnit: 'kg',
          purchaseToBaseRatio: 1000,
          currentPricePerPurchaseUnit: 40,
        },
      ]),
      findAll: jest.fn().mockResolvedValue([]),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
        { provide: INGREDIENT_REPOSITORY, useValue: ingredientRepository },
        {
          provide: InventoryService,
          useValue: {
            getBalanceByIngredient: jest.fn(),
            inboundFromPurchaseRecords: jest.fn(),
          },
        },
        {
          provide: ProcurementSkuService,
          useValue: { batchFindActive: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: RecommendedProductService,
          useValue: { batchFindActive: jest.fn().mockResolvedValue({}) },
        },
        { provide: PURCHASE_LIST_REPOSITORY, useValue: {} },
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: {} },
      ],
    }).compile();

    const service = moduleRef.get(PurchasingService);
    const result = await service.calculatePurchaseRequirements('2026-04-05');

    expect(result).toHaveLength(1);
    expect(result[0].preparationMethods).toBeUndefined();
  });
});
