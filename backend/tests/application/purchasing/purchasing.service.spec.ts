import { Test } from '@nestjs/testing';
import { ProcurementSkuService } from 'src/application/ingredient/procurement-sku.service';
import { RecommendedProductService } from 'src/application/ingredient/recommended-product.service';
import { INGREDIENT_REPOSITORY } from 'src/application/ingredient/ingredient.service';
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
import {
  PurchaseList,
  PurchaseListStatus,
} from 'src/domain/purchasing';
import { PurchaseItem } from 'src/domain/purchasing/purchase-item.entity';
import { PurchaseRecord } from 'src/domain/purchasing/purchase-record.entity';
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
            purchaseUnit: '包',
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
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: { append: jest.fn() },
        },
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

  it('keeps supplement demand display units separate from procurement sku package units', async () => {
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
        'ingredient-seaweed': [
          {
            id: 'sku-seaweed',
            ingredientId: 'ingredient-seaweed',
            name: '海藻粉 2522平勺/瓶',
            purchaseChannel: '天猫旗舰店',
            productModel: '2522平勺/瓶',
            purchaseUnit: '瓶',
            isActive: true,
            sortOrder: 0,
          },
        ],
      }),
      listActivePurchaseChannels: jest.fn().mockResolvedValue([]),
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
        {
          provide: InventoryService,
          useValue: {
            getBalanceByIngredient: jest.fn(),
            inboundFromPurchaseRecords: jest.fn(),
          },
        },
        { provide: ProcurementSkuService, useValue: procurementSkuService },
        {
          provide: RecommendedProductService,
          useValue: { batchFindActive: jest.fn() },
        },
        { provide: PURCHASE_LIST_REPOSITORY, useValue: {} },
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: {} },
      ],
    }).compile();

    const service = moduleRef.get(PurchasingService);
    const result = await (service as any).enrichRequirementsWithProcurementSkus(
      [
        {
          ingredientId: 'ingredient-seaweed',
          ingredientName: '海藻粉',
          type: 'SUPPLEMENT',
          quantityNeeded: 2.91,
          quantityUnit: '平勺',
          displayUnit: '平勺',
          estimatedCost: 0.1,
        },
      ],
      new Map([
        [
          'ingredient-seaweed',
          {
            id: 'ingredient-seaweed',
            name: '海藻粉',
            type: 'SUPPLEMENT',
            unitDisplayLabel: '平勺',
            purchaseUnit: '瓶',
          },
        ],
      ]),
    );

    expect(result[0]).toEqual(
      expect.objectContaining({
        procurementSkuId: 'sku-seaweed',
        procurementSkuName: '海藻粉 2522平勺/瓶',
        purchaseChannel: '天猫旗舰店',
        productModel: '2522平勺/瓶',
        quantityUnit: '平勺',
        displayUnit: '平勺',
      }),
    );
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
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: { append: jest.fn() },
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
          useValue: {
            batchFindActive: jest.fn(),
            listActivePurchaseChannels: jest.fn(),
          },
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
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: { append: jest.fn() },
        },
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

  it('uses food gross purchase amount including edible yield for order-demand requirements', async () => {
    const orderRepository = {
      findByTargetProductionDateRange: jest.fn().mockResolvedValue({
        list: [
          {
            id: 'order-1',
            pricingBreakdownSnapshot: {
              ingredientDetails: [
                {
                  ingredientId: 'ingredient-beef',
                  name: '带筋牛肉',
                  type: 'FOOD',
                  netAmount: 1,
                  purchaseAmount: 1.07,
                  amount: 1.3375,
                  unit: 'kg',
                  cost: 80.25,
                },
              ],
            },
            items: [
              {
                recipeSnapshot: {
                  items: [
                    {
                      ingredient_id: 'ingredient-beef',
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
          id: 'ingredient-beef',
          name: '带筋牛肉',
          type: 'FOOD',
          procurementStrategy: 'DAILY_PURCHASE',
          baseUnit: 'G',
          purchaseUnit: 'kg',
          purchaseToBaseRatio: 1000,
          currentPricePerPurchaseUnit: 60,
        },
      ]),
      findAll: jest.fn().mockResolvedValue([]),
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
        {
          provide: InventoryService,
          useValue: {
            getBalanceByIngredient: jest.fn(),
            getAvailabilityByIngredientIds: jest
              .fn()
              .mockResolvedValue(new Map()),
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
    expect(result[0]).toEqual(
      expect.objectContaining({
        ingredientId: 'ingredient-beef',
        quantityNeeded: 1.337,
        grossQuantityNeeded: 1.337,
        purchaseShortageQuantity: 1.337,
        quantityUnit: 'kg',
      }),
    );
  });

  it('uses the standard ingredient display unit for supplement order-demand requirements', async () => {
    const orderRepository = {
      findByTargetProductionDateRange: jest.fn().mockResolvedValue({
        list: [
          {
            id: 'order-1',
            pricingBreakdownSnapshot: {
              ingredientDetails: [
                {
                  ingredientId: 'ingredient-seaweed',
                  name: '海藻粉',
                  type: 'SUPPLEMENT',
                  purchaseAmount: 2.91,
                  unit: 'g',
                  displayUnit: '瓶',
                  cost: 0.1,
                  procurementSkuId: 'sku-seaweed',
                  procurementSkuName: '海藻粉 2522平勺/瓶',
                },
              ],
            },
            items: [
              {
                recipeSnapshot: {
                  items: [
                    {
                      ingredient_id: 'ingredient-seaweed',
                      ingredient_type: 'SUPPLEMENT',
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
          id: 'ingredient-seaweed',
          name: '海藻粉',
          type: 'SUPPLEMENT',
          procurementStrategy: 'DAILY_PURCHASE',
          baseUnit: 'PCS',
          unitDisplayLabel: '平勺',
          purchaseUnit: '瓶',
          purchaseToBaseRatio: 2522,
          currentPricePerPurchaseUnit: 89.41,
        },
      ]),
      findAll: jest.fn().mockResolvedValue([]),
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
        {
          provide: InventoryService,
          useValue: {
            getBalanceByIngredient: jest.fn(),
            getAvailabilityByIngredientIds: jest
              .fn()
              .mockResolvedValue(new Map()),
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
    expect(result[0]).toEqual(
      expect.objectContaining({
        ingredientId: 'ingredient-seaweed',
        quantityNeeded: 2.91,
        quantityUnit: '平勺',
        displayUnit: '平勺',
      }),
    );
  });

  it('previews PCS supplement demand measured in 粒 without rejecting the unit', async () => {
    const order = {
      id: 'order-vitamin-e',
      targetProductionDate: new Date('2026-04-27T00:00:00.000Z'),
      pricingBreakdownSnapshot: {
        ingredientDetails: [
          {
            ingredientId: 'ingredient-vitamin-e',
            name: '维生素E胶囊',
            type: 'SUPPLEMENT',
            purchaseAmount: 3,
            unit: '粒',
            displayUnit: '粒',
            cost: 1.5,
          },
        ],
      },
      items: [
        {
          recipeSnapshot: {
            items: [
              {
                ingredient_id: 'ingredient-vitamin-e',
                ingredient_type: 'SUPPLEMENT',
                sort_order: 1,
              },
            ],
          },
        },
      ],
    };
    const orderRepository = {
      findByTargetProductionDateRange: jest
        .fn()
        .mockResolvedValue({ list: [order] }),
    } as any;
    const ingredientRepository = {
      findByIds: jest.fn().mockResolvedValue([
        {
          id: 'ingredient-vitamin-e',
          name: '维生素E胶囊',
          type: 'SUPPLEMENT',
          procurementStrategy: 'HYBRID',
          baseUnit: 'PCS',
          unitDisplayLabel: '粒',
          purchaseUnit: '瓶',
          purchaseToBaseRatio: 60,
          currentPricePerPurchaseUnit: 30,
        },
      ]),
      findAll: jest.fn().mockResolvedValue([]),
    } as any;
    const inventoryService = {
      getAvailabilityByIngredientIds: jest.fn().mockResolvedValue(
        new Map([
          [
            'ingredient-vitamin-e',
            {
              ingredientId: 'ingredient-vitamin-e',
              onHandQuantityG: 2,
              allocatedQuantityG: 1,
              availableQuantityG: 1,
            },
          ],
        ]),
      ),
      inboundFromPurchaseRecords: jest.fn(),
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
        { provide: InventoryService, useValue: inventoryService },
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
    const preview = await service.previewPurchaseRequirements('2026-04-27');

    expect(preview.items).toEqual([
      expect.objectContaining({
        ingredientId: 'ingredient-vitamin-e',
        quantityUnit: '粒',
        displayUnit: '粒',
        grossQuantityNeeded: 3,
        stockDeductedQuantity: 1,
        purchaseShortageQuantity: 2,
        quantityNeeded: 2,
        usesInventory: true,
      }),
    ]);
  });

  it('keeps same-ingredient purchase requirements separated by procurement sku snapshot', async () => {
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
                  type: 'FOOD',
                  purchaseAmount: 120,
                  unit: 'G',
                  cost: 6,
                  purchaseChannel: '有机渠道',
                  productModel: '有机规格',
                  procurementSkuId: 'sku-organic',
                  procurementSkuName: '有机鸡胸肉',
                },
                {
                  ingredientId: 'ingredient-1',
                  name: '鸡胸肉',
                  type: 'FOOD',
                  purchaseAmount: 180,
                  unit: 'G',
                  cost: 7.2,
                  purchaseChannel: '批发渠道',
                  productModel: '批发规格',
                  procurementSkuId: 'sku-wholesale',
                  procurementSkuName: '批发鸡胸肉',
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
          procurementStrategy: 'DAILY_PURCHASE',
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
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: { append: jest.fn() },
        },
        { provide: INGREDIENT_REPOSITORY, useValue: ingredientRepository },
        {
          provide: InventoryService,
          useValue: {
            getBalanceByIngredient: jest.fn(),
            getAvailabilityByIngredientIds: jest
              .fn()
              .mockResolvedValue(new Map()),
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

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ingredientId: 'ingredient-1',
          procurementSkuId: 'sku-organic',
          procurementSkuName: '有机鸡胸肉',
          quantityNeeded: 120,
          estimatedCost: 6,
          purchaseChannel: '有机渠道',
          productModel: '有机规格',
        }),
        expect.objectContaining({
          ingredientId: 'ingredient-1',
          procurementSkuId: 'sku-wholesale',
          procurementSkuName: '批发鸡胸肉',
          quantityNeeded: 180,
          estimatedCost: 7.2,
          purchaseChannel: '批发渠道',
          productModel: '批发规格',
        }),
      ]),
    );
  });

  it('rejects one-off purchase products without a configured procurement sku', async () => {
    const purchaseItem = new PurchaseItem({
      id: 'item-1',
      purchaseListId: 'list-1',
      ingredientId: 'ingredient-beef',
      ingredientName: '牛霖',
      type: 'FOOD',
      procurementSkuId: 'sku-suggested',
      procurementSkuName: '进口冷冻牛霖',
      quantityNeeded: 2.703,
      quantityUnit: 'kg',
      estimatedCost: 165.03,
      purchaseChannel: '本地生鲜市场',
      productModel: '1kg/袋',
      ingredient: {
        baseUnit: 'G',
        purchaseUnit: 'kg',
        purchaseToBaseRatio: 1000,
      },
    });
    const purchaseRecordRepository = {
      save: jest.fn(async (record) => record),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        {
          provide: ORDER_REPOSITORY,
          useValue: { findByTargetProductionDateRange: jest.fn() },
        },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: { append: jest.fn() },
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
          useValue: {
            batchFindActive: jest.fn(),
            listActivePurchaseChannels: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: RecommendedProductService,
          useValue: { batchFindActive: jest.fn() },
        },
        {
          provide: PURCHASE_LIST_REPOSITORY,
          useValue: {
            findById: jest.fn().mockResolvedValue({
              id: 'list-1',
              reimbursementId: null,
              items: [purchaseItem],
            }),
          },
        },
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: purchaseRecordRepository },
      ],
    }).compile();

    const service = moduleRef.get(PurchasingService);
    await expect(
      service.addPurchaseRecord('list-1', {
        purchaseItemId: 'item-1',
        procurementSkuName: '临时采购牛霖',
        purchaseChannel: '盒马鲜生',
        actualPackageCount: 2,
        actualPackageSize: 500,
        actualPackageUnit: 'g',
        actualCost: 72,
        productModel: '500g/盒',
      }),
    ).rejects.toThrow('请选择已配置的采购 SKU 后再记录采购');

    expect(purchaseRecordRepository.save).not.toHaveBeenCalled();
  });

  it('rejects completing a purchase list when required items have no purchase record', async () => {
    const recordedItem = new PurchaseItem({
      id: 'item-recorded',
      purchaseListId: 'list-1',
      ingredientId: 'ingredient-beef',
      ingredientName: '牛霖',
      type: 'FOOD',
      quantityNeeded: 2.286,
      quantityUnit: 'kg',
      estimatedCost: 228.06,
      purchaseShortageQuantity: 2.286,
    });
    const missingItem = new PurchaseItem({
      id: 'item-missing',
      purchaseListId: 'list-1',
      ingredientId: 'ingredient-egg',
      ingredientName: '鸡蛋',
      type: 'FOOD',
      quantityNeeded: 2.848,
      quantityUnit: 'kg',
      estimatedCost: 30.27,
      purchaseShortageQuantity: 2.848,
    });
    const stockCoveredItem = new PurchaseItem({
      id: 'item-covered',
      purchaseListId: 'list-1',
      ingredientId: 'ingredient-rice',
      ingredientName: '糙米',
      type: 'FOOD',
      quantityNeeded: 0,
      quantityUnit: 'kg',
      estimatedCost: 0,
      purchaseShortageQuantity: 0,
      stockDeductedQuantity: 0.651,
    });
    const purchaseList = new PurchaseList({
      id: 'list-1',
      targetDate: new Date('2026-04-21T04:00:00.000Z'),
      status: PurchaseListStatus.PENDING,
      totalEstimatedCost: 258.33,
      itemCount: 3,
      createdById: 'admin-1',
      sourceOrderIds: ['order-1'],
      startedAt: new Date('2026-04-21T11:31:00.000Z'),
      items: [recordedItem, missingItem, stockCoveredItem],
    });
    const purchaseRecordRepository = {
      findByPurchaseListId: jest.fn().mockResolvedValue([
        {
          id: 'record-1',
          purchaseListId: 'list-1',
          purchaseItemId: 'item-recorded',
          ingredientId: 'ingredient-beef',
        },
      ]),
    } as any;
    const inventoryService = {
      getBalanceByIngredient: jest.fn(),
      inboundFromPurchaseRecords: jest
        .fn()
        .mockResolvedValue({ createdCount: 1, skippedCount: 0 }),
    } as any;
    const purchaseListRepository = {
      findById: jest.fn().mockResolvedValue(purchaseList),
      save: jest.fn(),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        {
          provide: ORDER_REPOSITORY,
          useValue: { findByTargetProductionDateRange: jest.fn() },
        },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: { append: jest.fn() },
        },
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: { findByIds: jest.fn(), findAll: jest.fn() },
        },
        { provide: InventoryService, useValue: inventoryService },
        {
          provide: ProcurementSkuService,
          useValue: { batchFindActive: jest.fn(), listActivePurchaseChannels: jest.fn() },
        },
        {
          provide: RecommendedProductService,
          useValue: { batchFindActive: jest.fn() },
        },
        { provide: PURCHASE_LIST_REPOSITORY, useValue: purchaseListRepository },
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: purchaseRecordRepository },
      ],
    }).compile();

    const service = moduleRef.get(PurchasingService);
    await expect(service.completePurchase('list-1', {})).rejects.toThrow(
      '还有 1 个原料未添加采购记录',
    );
    expect(inventoryService.inboundFromPurchaseRecords).not.toHaveBeenCalled();
    expect(purchaseListRepository.save).not.toHaveBeenCalled();
  });

  it('allows completing a purchase list when a required item is marked no purchase needed', async () => {
    const recordedItem = new PurchaseItem({
      id: 'item-recorded',
      purchaseListId: 'list-1',
      ingredientId: 'ingredient-beef',
      ingredientName: '牛霖',
      type: 'FOOD',
      quantityNeeded: 2.286,
      quantityUnit: 'kg',
      estimatedCost: 228.06,
      purchaseShortageQuantity: 2.286,
    });
    const noPurchaseItem = new PurchaseItem({
      id: 'item-no-purchase',
      purchaseListId: 'list-1',
      ingredientId: 'ingredient-egg',
      ingredientName: '鸡蛋',
      type: 'FOOD',
      quantityNeeded: 2.848,
      quantityUnit: 'kg',
      estimatedCost: 30.27,
      purchaseShortageQuantity: 2.848,
      noPurchaseNeeded: true,
      noPurchaseReason: '现场库存足够',
      noPurchaseMarkedAt: new Date('2026-04-21T11:40:00.000Z'),
      noPurchaseMarkedById: 'admin-1',
    });
    const purchaseList = new PurchaseList({
      id: 'list-1',
      targetDate: new Date('2026-04-21T04:00:00.000Z'),
      status: PurchaseListStatus.PENDING,
      totalEstimatedCost: 258.33,
      itemCount: 2,
      createdById: 'admin-1',
      sourceOrderIds: ['order-1'],
      startedAt: new Date('2026-04-21T11:31:00.000Z'),
      items: [recordedItem, noPurchaseItem],
    });
    const purchaseRecord = {
      id: 'record-1',
      purchaseListId: 'list-1',
      purchaseItemId: 'item-recorded',
      ingredientId: 'ingredient-beef',
    };
    const purchaseRecordRepository = {
      findByPurchaseListId: jest.fn().mockResolvedValue([purchaseRecord]),
    } as any;
    const inventoryService = {
      getBalanceByIngredient: jest.fn(),
      inboundFromPurchaseRecords: jest
        .fn()
        .mockResolvedValue({ createdCount: 1, skippedCount: 0 }),
    } as any;
    const purchaseListRepository = {
      findById: jest.fn().mockResolvedValue(purchaseList),
      save: jest.fn(async (list) => list),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        {
          provide: ORDER_REPOSITORY,
          useValue: { findByTargetProductionDateRange: jest.fn() },
        },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: { append: jest.fn() },
        },
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: { findByIds: jest.fn(), findAll: jest.fn() },
        },
        { provide: InventoryService, useValue: inventoryService },
        {
          provide: ProcurementSkuService,
          useValue: { batchFindActive: jest.fn(), listActivePurchaseChannels: jest.fn() },
        },
        {
          provide: RecommendedProductService,
          useValue: { batchFindActive: jest.fn() },
        },
        { provide: PURCHASE_LIST_REPOSITORY, useValue: purchaseListRepository },
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: purchaseRecordRepository },
      ],
    }).compile();

    const service = moduleRef.get(PurchasingService);
    const result = await service.completePurchase('list-1', {});

    expect(result.status).toBe(PurchaseListStatus.COMPLETED);
    expect(inventoryService.inboundFromPurchaseRecords).toHaveBeenCalledWith([
      purchaseRecord,
    ]);
    expect(purchaseListRepository.save).toHaveBeenCalledWith(purchaseList);
  });

  it('rejects marking an item as no purchase needed when it already has purchase records', async () => {
    const purchaseItem = new PurchaseItem({
      id: 'item-1',
      purchaseListId: 'list-1',
      ingredientId: 'ingredient-beef',
      ingredientName: '牛霖',
      type: 'FOOD',
      quantityNeeded: 2.286,
      quantityUnit: 'kg',
      estimatedCost: 228.06,
      purchaseShortageQuantity: 2.286,
    });
    const purchaseList = new PurchaseList({
      id: 'list-1',
      targetDate: new Date('2026-04-21T04:00:00.000Z'),
      status: PurchaseListStatus.PENDING,
      totalEstimatedCost: 228.06,
      itemCount: 1,
      createdById: 'admin-1',
      sourceOrderIds: ['order-1'],
      startedAt: new Date('2026-04-21T11:31:00.000Z'),
      items: [purchaseItem],
    });
    const purchaseRecordRepository = {
      findByPurchaseItemId: jest.fn().mockResolvedValue([
        {
          id: 'record-1',
          purchaseListId: 'list-1',
          purchaseItemId: 'item-1',
          ingredientId: 'ingredient-beef',
        },
      ]),
    } as any;
    const purchaseListRepository = {
      findById: jest.fn().mockResolvedValue(purchaseList),
      save: jest.fn(),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        {
          provide: ORDER_REPOSITORY,
          useValue: { findByTargetProductionDateRange: jest.fn() },
        },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: { append: jest.fn() },
        },
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: { findByIds: jest.fn(), findAll: jest.fn() },
        },
        {
          provide: InventoryService,
          useValue: { getBalanceByIngredient: jest.fn(), inboundFromPurchaseRecords: jest.fn() },
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
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: purchaseRecordRepository },
      ],
    }).compile();

    const service = moduleRef.get(PurchasingService);
    await expect(
      service.markPurchaseItemNoPurchase(
        'list-1',
        'item-1',
        { reason: '现场库存足够' },
        'admin-1',
      ),
    ).rejects.toThrow('已有采购记录，不能标记无需采购');

    expect(purchaseListRepository.save).not.toHaveBeenCalled();
  });

  it('reopens a completed purchase list and releases purchase-record inventory inbound entries', async () => {
    const purchaseItem = new PurchaseItem({
      id: 'item-1',
      purchaseListId: 'list-1',
      ingredientId: 'ingredient-beef',
      ingredientName: '牛霖',
      type: 'FOOD',
      quantityNeeded: 2.286,
      quantityUnit: 'kg',
      estimatedCost: 228.06,
      purchaseShortageQuantity: 2.286,
    });
    const purchaseList = new PurchaseList({
      id: 'list-1',
      targetDate: new Date('2026-04-21T04:00:00.000Z'),
      status: PurchaseListStatus.COMPLETED,
      totalEstimatedCost: 228.06,
      itemCount: 1,
      createdById: 'admin-1',
      sourceOrderIds: ['order-1'],
      startedAt: new Date('2026-04-21T11:31:00.000Z'),
      completedAt: new Date('2026-04-21T11:50:00.000Z'),
      items: [purchaseItem],
    });
    const inventoryService = {
      getBalanceByIngredient: jest.fn(),
      inboundFromPurchaseRecords: jest.fn(),
      releasePurchaseRecordInboundsForPurchaseList: jest
        .fn()
        .mockResolvedValue({ deletedCount: 1 }),
    } as any;
    const purchaseListRepository = {
      findById: jest.fn().mockResolvedValue(purchaseList),
      save: jest.fn(async (list) => list),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        {
          provide: ORDER_REPOSITORY,
          useValue: { findByTargetProductionDateRange: jest.fn() },
        },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: { append: jest.fn() },
        },
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: { findByIds: jest.fn(), findAll: jest.fn() },
        },
        { provide: InventoryService, useValue: inventoryService },
        {
          provide: ProcurementSkuService,
          useValue: { batchFindActive: jest.fn(), listActivePurchaseChannels: jest.fn() },
        },
        {
          provide: RecommendedProductService,
          useValue: { batchFindActive: jest.fn() },
        },
        { provide: PURCHASE_LIST_REPOSITORY, useValue: purchaseListRepository },
        {
          provide: PURCHASE_RECORD_REPOSITORY,
          useValue: { findByPurchaseListId: jest.fn() },
        },
      ],
    }).compile();

    const service = moduleRef.get(PurchasingService);
    const result = await service.reopenPurchaseList('list-1', 'admin-1');

    expect(result.status).toBe(PurchaseListStatus.PENDING);
    expect(result.completedAt).toBeUndefined();
    expect(
      inventoryService.releasePurchaseRecordInboundsForPurchaseList,
    ).toHaveBeenCalledWith('list-1');
    expect(purchaseListRepository.save).toHaveBeenCalledWith(purchaseList);
  });

  it('rejects deleting a purchase record from a completed list until it is reopened', async () => {
    const purchaseItem = new PurchaseItem({
      id: 'item-1',
      purchaseListId: 'list-1',
      ingredientId: 'ingredient-beef',
      ingredientName: '牛霖',
      type: 'FOOD',
      quantityNeeded: 2.286,
      quantityUnit: 'kg',
      estimatedCost: 228.06,
      purchaseShortageQuantity: 2.286,
    });
    const completedList = new PurchaseList({
      id: 'list-1',
      targetDate: new Date('2026-04-21T04:00:00.000Z'),
      status: PurchaseListStatus.COMPLETED,
      totalEstimatedCost: 228.06,
      itemCount: 1,
      createdById: 'admin-1',
      sourceOrderIds: ['order-1'],
      startedAt: new Date('2026-04-21T11:31:00.000Z'),
      completedAt: new Date('2026-04-21T11:50:00.000Z'),
      items: [purchaseItem],
    });
    const purchaseRecordRepository = {
      findById: jest.fn().mockResolvedValue(
        new PurchaseRecord({
          id: 'record-1',
          purchaseListId: 'list-1',
          purchaseItemId: 'item-1',
          ingredientId: 'ingredient-beef',
          ingredientName: '牛霖',
          procurementSkuId: 'sku-1',
          procurementSkuName: 'MM澳洲谷饲牛霖',
          purchaseChannel: '山姆会员店',
          actualQuantity: 2,
          actualBaseQuantity: 2400,
          actualBaseUnit: 'G',
          actualCost: 229,
        }),
      ),
      delete: jest.fn(),
    } as any;
    const purchaseListRepository = {
      findById: jest.fn().mockResolvedValue(completedList),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        {
          provide: ORDER_REPOSITORY,
          useValue: { findByTargetProductionDateRange: jest.fn() },
        },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: { append: jest.fn() },
        },
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: { findByIds: jest.fn(), findAll: jest.fn() },
        },
        {
          provide: InventoryService,
          useValue: { getBalanceByIngredient: jest.fn(), inboundFromPurchaseRecords: jest.fn() },
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
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: purchaseRecordRepository },
      ],
    }).compile();

    const service = moduleRef.get(PurchasingService);
    await expect(service.deletePurchaseRecord('record-1')).rejects.toThrow(
      '采购清单已完成，请先撤回完成后再删除采购记录',
    );
    expect(purchaseRecordRepository.delete).not.toHaveBeenCalled();
  });

  it('rejects updating an existing purchase record to a one-off product', async () => {
    const purchaseItem = new PurchaseItem({
      id: 'item-1',
      purchaseListId: 'list-1',
      ingredientId: 'ingredient-beef',
      ingredientName: '牛霖',
      type: 'FOOD',
      procurementSkuId: 'sku-suggested',
      procurementSkuName: '进口冷冻牛霖',
      quantityNeeded: 2.703,
      quantityUnit: 'kg',
      estimatedCost: 165.03,
      purchaseChannel: '本地生鲜市场',
      productModel: '1kg/袋',
      ingredient: {
        baseUnit: 'G',
        purchaseUnit: 'kg',
        purchaseToBaseRatio: 1000,
      },
    });
    const existingRecord = new PurchaseRecord({
      id: 'record-1',
      purchaseListId: 'list-1',
      purchaseItemId: 'item-1',
      ingredientId: 'ingredient-beef',
      procurementSkuId: 'sku-suggested',
      procurementSkuName: '进口冷冻牛霖',
      ingredientName: '牛霖',
      purchaseChannel: '本地生鲜市场',
      actualQuantity: 1,
      actualPackageCount: 1,
      actualPackageSize: 1,
      actualPackageUnit: 'kg',
      actualBaseQuantity: 1000,
      actualBaseUnit: 'G',
      actualCost: 29,
      productModel: '1kg/袋',
    });
    const purchaseRecordRepository = {
      findById: jest.fn().mockResolvedValue(existingRecord),
      save: jest.fn(async (record) => record),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        {
          provide: ORDER_REPOSITORY,
          useValue: { findByTargetProductionDateRange: jest.fn() },
        },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: { append: jest.fn() },
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
          useValue: {
            batchFindActive: jest.fn(),
            listActivePurchaseChannels: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: RecommendedProductService,
          useValue: { batchFindActive: jest.fn() },
        },
        {
          provide: PURCHASE_LIST_REPOSITORY,
          useValue: {
            findById: jest.fn().mockResolvedValue({
              id: 'list-1',
              reimbursementId: null,
              items: [purchaseItem],
            }),
          },
        },
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: purchaseRecordRepository },
      ],
    }).compile();

    const service = moduleRef.get(PurchasingService);
    await expect(
      service.updatePurchaseRecord('record-1', {
        procurementSkuName: '临时采购牛霖',
        purchaseChannel: '盒马鲜生',
        actualPackageCount: 2,
        actualPackageSize: 500,
        actualPackageUnit: 'g',
        actualCost: 72,
        productModel: '500g/盒',
      }),
    ).rejects.toThrow('请选择已配置的采购 SKU 后再记录采购');

    expect(purchaseRecordRepository.save).not.toHaveBeenCalled();
  });

  it('returns purchase records with procurement sku scoped inventory balance', async () => {
    const purchaseListRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'list-1',
        items: [],
      }),
    } as any;
    const purchaseRecordRepository = {
      findByPurchaseListId: jest.fn().mockResolvedValue([
        new PurchaseRecord({
          id: 'record-1',
          purchaseListId: 'list-1',
          purchaseItemId: 'item-1',
          ingredientId: 'ingredient-beef',
          procurementSkuId: 'sku-1',
          procurementSkuName: 'MM澳洲谷饲牛霖',
          ingredientName: '牛霖',
          purchaseChannel: '山姆会员店',
          actualQuantity: 1,
          actualPackageCount: 1,
          actualPackageSize: 1200,
          actualPackageUnit: 'g',
          actualBaseQuantity: 1200,
          actualBaseUnit: 'G',
          actualCost: 98,
          productModel: '1.2kg/盒',
        }),
      ]),
    } as any;
    const inventoryService = {
      getProcurementSkuInventoryBalances: jest.fn().mockResolvedValue(
        new Map([
          [
            'sku-1',
            {
              currentStock: 3600,
              hasLedger: true,
            },
          ],
        ]),
      ),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasingService,
        {
          provide: ORDER_REPOSITORY,
          useValue: { findByTargetProductionDateRange: jest.fn() },
        },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: { append: jest.fn() },
        },
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: { findByIds: jest.fn(), findAll: jest.fn() },
        },
        { provide: InventoryService, useValue: inventoryService },
        {
          provide: ProcurementSkuService,
          useValue: { batchFindActive: jest.fn(), listActivePurchaseChannels: jest.fn() },
        },
        {
          provide: RecommendedProductService,
          useValue: { batchFindActive: jest.fn() },
        },
        { provide: PURCHASE_LIST_REPOSITORY, useValue: purchaseListRepository },
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: purchaseRecordRepository },
      ],
    }).compile();

    const service = moduleRef.get(PurchasingService);

    const records = await service.getPurchaseRecords('list-1');

    expect(inventoryService.getProcurementSkuInventoryBalances).toHaveBeenCalledWith([
      'sku-1',
    ]);
    expect(records[0]).toEqual(
      expect.objectContaining({
        procurementSkuId: 'sku-1',
        procurementSkuStockBaseQuantity: 3600,
        procurementSkuStockBaseUnit: 'G',
        procurementSkuHasStockLedger: true,
      }),
    );
  });
});
