import { Test } from '@nestjs/testing';
import { INGREDIENT_REPOSITORY } from 'src/application/ingredient/ingredient.service';
import { ProcurementSkuService } from 'src/application/ingredient/procurement-sku.service';
import { RecommendedProductService } from 'src/application/ingredient/recommended-product.service';
import { InventoryService } from 'src/application/inventory/inventory.service';
import {
  ORDER_REPOSITORY,
  ORDER_STATUS_HISTORY_REPOSITORY,
} from 'src/application/order/order.service';
import { PurchasingService } from 'src/application/purchasing/purchasing.service';
import {
  PURCHASE_LIST_REPOSITORY,
  PURCHASE_RECORD_REPOSITORY,
} from 'src/application/purchasing/purchasing.service.tokens';
import { IngredientProcurementStrategy } from 'src/domain/ingredient/enums';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

describe('PurchasingService stock replenishment procurement sku flow', () => {
  const legacyIngredient = {
    id: 'ingredient-1',
    name: '猪里脊',
    type: 'FOOD',
    procurementStrategy: IngredientProcurementStrategy.STOCK_REPLENISHMENT,
    baseUnit: 'G',
    unitDisplayLabel: '克',
    purchaseUnit: '袋',
    purchaseToBaseRatio: 1,
    currentPricePerPurchaseUnit: 40,
    effectivePricePerPurchaseUnit: null,
    purchaseChannel: '旧渠道',
    productModel: '旧规格',
    safetyStock: 5,
    reorderPoint: 8,
    targetStock: 10,
  };

  const higherCostDefaultProcurementSku = {
    id: 'proc-sku-1',
    ingredientId: 'ingredient-1',
    name: '默认山姆猪里脊 1kg/包',
    brand: 'Member Mark',
    productModel: '1kg/包',
    purchaseChannel: '山姆',
    supplierName: '山姆前置仓',
    purchaseUnit: '包',
    purchaseToBaseRatio: 1,
    currentPurchasePrice: 58,
    referencePurchasePrice: 60,
    referencePricePerPurchaseUnit: 60,
    notes: null,
    isDefault: true,
    isActive: true,
    sortOrder: 0,
    safetyStock: 10,
    reorderPoint: 20,
    targetStock: 30,
  };

  const lowerCostProcurementSku = {
    ...higherCostDefaultProcurementSku,
    id: 'proc-sku-2',
    name: '低折算价山姆猪里脊 2kg/包',
    productModel: '2kg/包',
    purchaseToBaseRatio: 2,
    currentPurchasePrice: 88,
    referencePurchasePrice: 92,
    referencePricePerPurchaseUnit: 92,
    isDefault: false,
  };

  const createModule = async (
    procurementSkus = [
      higherCostDefaultProcurementSku,
      lowerCostProcurementSku,
    ],
  ) => {
    const orderRepository = {
      findByTargetProductionDateRange: jest.fn().mockResolvedValue({ list: [] }),
    } as any;
    const ingredientRepository = {
      findAll: jest.fn().mockResolvedValue([legacyIngredient]),
      findByIds: jest.fn().mockResolvedValue([legacyIngredient]),
    } as any;
    const procurementSkuService = {
      batchFindActive: jest.fn().mockResolvedValue({
        'ingredient-1': procurementSkus,
      }),
      listActivePurchaseChannels: jest.fn().mockResolvedValue(['山姆']),
    } as any;
    const recommendedProductService = {
      batchFindActive: jest.fn().mockResolvedValue({}),
    } as any;
    const inventoryService = {
      getBalanceByIngredient: jest.fn().mockResolvedValue(6),
      inboundFromPurchaseRecords: jest
        .fn()
        .mockResolvedValue({ createdCount: 0, skippedCount: 0 }),
    } as any;
    const purchaseListRepository = {
      findByDateRange: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async (list) => list),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: { append: jest.fn() },
        },
        { provide: INGREDIENT_REPOSITORY, useValue: ingredientRepository },
        { provide: ProcurementSkuService, useValue: procurementSkuService },
        {
          provide: RecommendedProductService,
          useValue: recommendedProductService,
        },
        { provide: InventoryService, useValue: inventoryService },
        { provide: PURCHASE_LIST_REPOSITORY, useValue: purchaseListRepository },
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: {} },
      ],
    }).compile();

    return {
      service: moduleRef.get(PurchasingService),
      orderRepository,
      ingredientRepository,
      procurementSkuService,
      recommendedProductService,
      inventoryService,
      purchaseListRepository,
    };
  };

  it('ignores default flags and picks the lowest normalized procurement sku when building stock replenishment insights', async () => {
    const { service } = await createModule();

    const result = await service.getStockReplenishmentIngredients({
      includeDaily: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'ingredient-1',
        procurementSkuId: 'proc-sku-2',
        procurementSkuName: '低折算价山姆猪里脊 2kg/包',
        purchaseUnit: '包',
        purchaseToBaseRatio: 2,
        purchaseChannel: '山姆',
        productModel: '2kg/包',
        currentPricePerPurchaseUnit: 88,
        stockStatus: 'NEEDS_REPLENISHMENT',
        suggestedBaseQuantity: 24,
        suggestedPurchaseQuantity: 12,
        suggestedEstimatedCost: 1056,
      }),
    );
  });

  it('captures the lowest normalized procurement sku snapshot when creating stock purchase lists', async () => {
    const { service, purchaseListRepository } = await createModule();

    const result = await service.createStockPurchaseList(
      {
        targetDate: '2026-04-11',
        items: [
          {
            ingredientId: 'ingredient-1',
            plannedQuantity: 3,
          },
        ],
      },
      'user-1',
    );

    expect(purchaseListRepository.save).toHaveBeenCalledTimes(1);
    const savedList = purchaseListRepository.save.mock.calls[0][0];
    expect(savedList.items[0]).toEqual(
      expect.objectContaining({
        ingredientId: 'ingredient-1',
        procurementSkuId: 'proc-sku-2',
        procurementSkuName: '低折算价山姆猪里脊 2kg/包',
        quantityUnit: '包',
        purchaseChannel: '山姆',
        productModel: '2kg/包',
        displayUnit: '包',
        estimatedCost: 264,
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        procurementSkuId: 'proc-sku-2',
        procurementSkuName: '低折算价山姆猪里脊 2kg/包',
        quantityUnit: '包',
        estimatedCost: 264,
      }),
    );
  });

  it('breaks same-cost procurement sku ties by name instead of input order', async () => {
    const betaSku = {
      ...lowerCostProcurementSku,
      id: 'proc-sku-beta',
      name: 'B 山姆猪里脊 2kg/包',
    };
    const alphaSku = {
      ...lowerCostProcurementSku,
      id: 'proc-sku-alpha',
      name: 'A 山姆猪里脊 2kg/包',
    };
    const { service } = await createModule([betaSku, alphaSku]);

    const result = await service.getStockReplenishmentIngredients({
      includeDaily: true,
    });

    expect(result[0]).toEqual(
      expect.objectContaining({
        procurementSkuId: 'proc-sku-alpha',
        procurementSkuName: 'A 山姆猪里脊 2kg/包',
      }),
    );
  });
});
