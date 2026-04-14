import { Test } from '@nestjs/testing';
import { INGREDIENT_REPOSITORY } from 'src/application/ingredient/ingredient.service';
import { ProcurementSkuService } from 'src/application/ingredient/procurement-sku.service';
import { RecommendedProductService } from 'src/application/ingredient/recommended-product.service';
import { InventoryService } from 'src/application/inventory/inventory.service';
import { ORDER_REPOSITORY } from 'src/application/order/order.service';
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

  const defaultProcurementSku = {
    id: 'proc-sku-1',
    ingredientId: 'ingredient-1',
    name: '山姆猪里脊 2kg/包',
    brand: 'Member Mark',
    productModel: '2kg/包',
    purchaseChannel: '山姆',
    supplierName: '山姆前置仓',
    purchaseUnit: '包',
    purchaseToBaseRatio: 2,
    currentPurchasePrice: 88,
    referencePurchasePrice: 92,
    referencePricePerPurchaseUnit: 92,
    displayUnit: '包',
    notes: null,
    isDefault: true,
    isActive: true,
    sortOrder: 0,
    safetyStock: 10,
    reorderPoint: 20,
    targetStock: 30,
  };

  const createModule = async () => {
    const orderRepository = {
      findByTargetProductionDateRange: jest.fn().mockResolvedValue({ list: [] }),
    } as any;
    const ingredientRepository = {
      findAll: jest.fn().mockResolvedValue([legacyIngredient]),
      findByIds: jest.fn().mockResolvedValue([legacyIngredient]),
    } as any;
    const procurementSkuService = {
      batchFindActive: jest.fn().mockResolvedValue({
        'ingredient-1': [defaultProcurementSku],
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

  it('prefers the default procurement sku when building stock replenishment insights', async () => {
    const { service } = await createModule();

    const result = await service.getStockReplenishmentIngredients({
      includeDaily: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'ingredient-1',
        procurementSkuId: 'proc-sku-1',
        procurementSkuName: '山姆猪里脊 2kg/包',
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

  it('captures the default procurement sku snapshot when creating stock purchase lists', async () => {
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
        procurementSkuId: 'proc-sku-1',
        procurementSkuName: '山姆猪里脊 2kg/包',
        quantityUnit: '包',
        purchaseChannel: '山姆',
        productModel: '2kg/包',
        displayUnit: '包',
        estimatedCost: 264,
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        procurementSkuId: 'proc-sku-1',
        procurementSkuName: '山姆猪里脊 2kg/包',
        quantityUnit: '包',
        estimatedCost: 264,
      }),
    );
  });
});
