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
import { OrderStatus } from 'src/domain';
import {
  PurchaseItem,
  PurchaseList,
  PurchaseListStatus,
} from 'src/domain/purchasing';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

const makePaidOrder = (
  ingredientId: string,
  name: string,
  purchaseAmount: number,
  orderId = `order-${ingredientId}`,
  options?: {
    unit?: string;
    cost?: number;
    procurementSkuId?: string;
    procurementSkuName?: string;
  },
) => ({
  id: orderId,
  status: OrderStatus.PAID,
  targetProductionDate: new Date('2026-04-20T00:00:00.000Z'),
  pricingBreakdownSnapshot: {
    ingredientDetails: [
      {
        ingredientId,
        name,
        purchaseAmount,
        unit: options?.unit ?? 'G',
        cost: options?.cost ?? purchaseAmount / 100,
        type: 'FOOD',
        procurementSkuId: options?.procurementSkuId,
        procurementSkuName: options?.procurementSkuName,
      },
    ],
  },
  items: [
    {
      recipeSnapshot: {
        items: [
          {
            ingredient_id: ingredientId,
            ingredient_type: 'FOOD',
            sort_order: 1,
          },
        ],
      },
    },
  ],
  transitionTo: jest.fn(function transitionTo(this: any, status: OrderStatus) {
    this.status = status;
  }),
});

const beefIngredient = {
  id: 'beef',
  name: '牛肉',
  type: 'FOOD',
  procurementStrategy: 'HYBRID',
  baseUnit: 'G',
  purchaseUnit: 'G',
  purchaseToBaseRatio: 1,
  currentPricePerPurchaseUnit: 0.08,
};

const spinachIngredient = {
  id: 'spinach',
  name: '菠菜',
  type: 'FOOD',
  procurementStrategy: 'DAILY_PURCHASE',
  baseUnit: 'G',
  purchaseUnit: 'G',
  purchaseToBaseRatio: 1,
  currentPricePerPurchaseUnit: 0.03,
};

const makePendingPurchaseList = () =>
  new PurchaseList({
    id: 'purchase-list-1',
    targetDate: new Date('2026-04-20T12:00:00.000Z'),
    status: PurchaseListStatus.PENDING,
    totalEstimatedCost: 6,
    itemCount: 1,
    createdById: 'admin-1',
    sourceOrderIds: ['order-beef', 'order-spinach'],
    items: [
      new PurchaseItem({
        id: 'item-spinach',
        purchaseListId: 'purchase-list-1',
        ingredientId: 'spinach',
        ingredientName: '菠菜',
        type: 'FOOD',
        quantityNeeded: 600,
        quantityUnit: 'G',
        estimatedCost: 6,
      }),
    ],
  });

describe('PurchasingService inventory allocation calculation', () => {
  async function createService(params?: {
    orders?: any[];
    availability?: Map<string, any>;
  }) {
    const orders = params?.orders ?? [
      makePaidOrder('beef', '牛肉', 3000),
      makePaidOrder('spinach', '菠菜', 600),
    ];
    const orderRepository = {
      findByTargetProductionDateRange: jest
        .fn()
        .mockResolvedValue({ list: orders }),
      findById: jest.fn(),
      save: jest.fn(),
    };
    const ingredientRepository = {
      findByIds: jest
        .fn()
        .mockImplementation(async (ids: string[]) =>
          [beefIngredient, spinachIngredient].filter((ingredient) =>
            ids.includes(ingredient.id),
          ),
        ),
      findAll: jest.fn().mockResolvedValue([]),
    };
    const inventoryService = {
      getAvailabilityByIngredientIds: jest.fn().mockResolvedValue(
        params?.availability ??
          new Map([
            [
              'beef',
              {
                ingredientId: 'beef',
                onHandQuantityG: 5000,
                allocatedQuantityG: 1000,
                availableQuantityG: 4000,
              },
            ],
            [
              'spinach',
              {
                ingredientId: 'spinach',
                onHandQuantityG: 900,
                allocatedQuantityG: 0,
                availableQuantityG: 900,
              },
            ],
          ]),
      ),
      createAllocationForOrderDemand: jest
        .fn()
        .mockResolvedValue({ id: 'allocation-1' }),
      releaseAllocationsForPurchaseList: jest.fn(),
      inboundFromPurchaseRecords: jest.fn(),
    };
    const purchaseListRepository = {
      findByDateRange: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (list) => list),
      findById: jest.fn(),
      recalculateItems: jest.fn(async (_id, list) => list),
      delete: jest.fn(),
    };
    const statusHistoryRepository = {
      append: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: statusHistoryRepository,
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
        { provide: PURCHASE_LIST_REPOSITORY, useValue: purchaseListRepository },
        { provide: PURCHASE_RECORD_REPOSITORY, useValue: {} },
      ],
    }).compile();

    return {
      service: module.get(PurchasingService),
      inventoryService,
      orderRepository,
      purchaseListRepository,
      statusHistoryRepository,
    };
  }

  it('converts kilogram purchase demand before applying gram inventory availability', async () => {
    const { service, inventoryService } = await createService({
      orders: [
        makePaidOrder('beef', '牛肉', 3.703, 'order-beef-kg', {
          unit: 'kg',
          cost: 37.03,
        }),
      ],
      availability: new Map([
        [
          'beef',
          {
            ingredientId: 'beef',
            onHandQuantityG: 1000,
            allocatedQuantityG: 0,
            availableQuantityG: 1000,
          },
        ],
      ]),
    });

    const result: any = await service.generatePurchaseList(
      { startDate: '2026-04-20' },
      'admin-1',
    );

    expect(result.purchaseList?.items).toEqual([
      expect.objectContaining({
        ingredientId: 'beef',
        quantityUnit: 'kg',
        grossQuantityNeeded: 3.703,
        stockDeductedQuantity: 1,
        purchaseShortageQuantity: 2.703,
        quantityNeeded: 2.703,
        onHandQuantity: 1,
        availableQuantity: 1,
        estimatedCost: 27.03,
        usesInventory: true,
      }),
    ]);
    expect(
      inventoryService.createAllocationForOrderDemand,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            ingredientId: 'beef',
            quantityG: 1000,
          }),
        ],
      }),
    );
  });

  it('does not over-allocate shared inventory when one ingredient has multiple procurement SKUs', async () => {
    const { service, inventoryService } = await createService({
      orders: [
        makePaidOrder('beef', '牛肉', 0.6, 'order-beef-wholesale', {
          unit: 'kg',
          cost: 6,
          procurementSkuId: 'sku-wholesale',
          procurementSkuName: '批发牛肉',
        }),
        makePaidOrder('beef', '牛肉', 0.5, 'order-beef-premium', {
          unit: 'kg',
          cost: 5,
          procurementSkuId: 'sku-premium',
          procurementSkuName: '商超牛肉',
        }),
      ],
      availability: new Map([
        [
          'beef',
          {
            ingredientId: 'beef',
            onHandQuantityG: 1000,
            allocatedQuantityG: 0,
            availableQuantityG: 1000,
          },
        ],
      ]),
    });

    const result: any = await service.generatePurchaseList(
      { startDate: '2026-04-20' },
      'admin-1',
    );
    const beefItems = result.purchaseList?.items.filter(
      (item: PurchaseItem) => item.ingredientId === 'beef',
    );

    expect(beefItems).toHaveLength(2);
    expect(
      beefItems.reduce(
        (sum: number, item: PurchaseItem) =>
          sum + Number(item.stockDeductedQuantity || 0),
        0,
      ),
    ).toBe(1);
    expect(
      inventoryService.createAllocationForOrderDemand,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            ingredientId: 'beef',
            procurementSkuId: null,
            quantityG: 1000,
          }),
        ],
      }),
    );
  });

  it('offsets hybrid ingredients by available stock but leaves daily purchase ingredients untouched', async () => {
    const { service } = await createService();

    const result = await service.calculatePurchaseRequirements('2026-04-20');

    expect(result).toEqual([
      expect.objectContaining({
        ingredientId: 'beef',
        grossQuantityNeeded: 3000,
        stockDeductedQuantity: 3000,
        quantityNeeded: 0,
        purchaseShortageQuantity: 0,
        onHandQuantity: 5000,
        allocatedQuantity: 1000,
        availableQuantity: 4000,
        usesInventory: true,
      }),
      expect.objectContaining({
        ingredientId: 'spinach',
        grossQuantityNeeded: 600,
        stockDeductedQuantity: 0,
        quantityNeeded: 600,
        purchaseShortageQuantity: 600,
        usesInventory: false,
      }),
    ]);
  });

  it('creates a purchase list with stock-covered items for manual audit', async () => {
    const { service, inventoryService } = await createService();

    const result: any = await service.generatePurchaseList(
      { startDate: '2026-04-20' },
      'admin-1',
    );

    expect(result.purchaseList?.items).toHaveLength(2);
    expect(result.purchaseList?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ingredientId: 'beef',
          grossQuantityNeeded: 3000,
          stockDeductedQuantity: 3000,
          quantityNeeded: 0,
          purchaseShortageQuantity: 0,
          estimatedCost: 0,
          usesInventory: true,
        }),
        expect.objectContaining({
          ingredientId: 'spinach',
          quantityNeeded: 600,
        }),
      ]),
    );
    expect(
      result.purchaseList?.items.find(
        (item: PurchaseItem) => item.ingredientId === 'spinach',
      ),
    ).toEqual(
      expect.objectContaining({
        ingredientId: 'spinach',
        quantityNeeded: 600,
      }),
    );
    expect(result.inventoryAllocation).toEqual({
      id: 'allocation-1',
      lineCount: 1,
      totalAllocatedQuantityG: 3000,
    });
    expect(result.fullyCoveredByInventory).toBe(false);
    expect(
      inventoryService.createAllocationForOrderDemand,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseListId: expect.any(String),
        sourceOrderIds: ['order-beef', 'order-spinach'],
        createdById: 'admin-1',
        lines: [
          expect.objectContaining({
            ingredientId: 'beef',
            quantityG: 3000,
          }),
        ],
      }),
    );
  });

  it('records order status history when generated purchase lists move orders into purchasing', async () => {
    const { service, statusHistoryRepository } = await createService();

    const result: any = await service.generatePurchaseList(
      { startDate: '2026-04-20' },
      'admin-1',
    );

    expect(statusHistoryRepository.append).toHaveBeenCalledTimes(2);
    expect(statusHistoryRepository.append).toHaveBeenCalledWith(
      'order-beef',
      OrderStatus.PAID,
      OrderStatus.PURCHASING,
      'staff',
      'admin-1',
      expect.objectContaining({
        purchaseListId: result.purchaseList.id,
        triggeredBy: 'purchase_list_generation',
      }),
    );
    expect(statusHistoryRepository.append).toHaveBeenCalledWith(
      'order-spinach',
      OrderStatus.PAID,
      OrderStatus.PURCHASING,
      'staff',
      'admin-1',
      expect.objectContaining({
        purchaseListId: result.purchaseList.id,
        triggeredBy: 'purchase_list_generation',
      }),
    );
  });

  it('still creates a zero-shortage purchase list when all order demand is covered by stock', async () => {
    const { service, purchaseListRepository } = await createService({
      orders: [makePaidOrder('beef', '牛肉', 3000)],
      availability: new Map([
        [
          'beef',
          {
            ingredientId: 'beef',
            onHandQuantityG: 5000,
            allocatedQuantityG: 0,
            availableQuantityG: 5000,
          },
        ],
      ]),
    });

    const result: any = await service.generatePurchaseList(
      { startDate: '2026-04-20' },
      'admin-1',
    );

    expect(result.purchaseList).not.toBeNull();
    expect(result.purchaseList.items).toHaveLength(1);
    expect(result.purchaseList.items[0]).toEqual(
      expect.objectContaining({
        ingredientId: 'beef',
        quantityNeeded: 0,
        grossQuantityNeeded: 3000,
        stockDeductedQuantity: 3000,
        purchaseShortageQuantity: 0,
        estimatedCost: 0,
      }),
    );
    expect(result.inventoryAllocation).toEqual({
      id: 'allocation-1',
      lineCount: 1,
      totalAllocatedQuantityG: 3000,
    });
    expect(result.fullyCoveredByInventory).toBe(true);
    expect(purchaseListRepository.save).toHaveBeenCalledTimes(1);
  });

  it('returns stock offset fields in purchase preview responses', async () => {
    const { service } = await createService();

    const preview: any =
      await service.previewPurchaseRequirements('2026-04-20');

    expect(preview.totalEstimatedCost).toBe(6);
    expect(preview.items[0]).toEqual(
      expect.objectContaining({
        ingredientId: 'beef',
        grossQuantityNeeded: 3000,
        stockDeductedQuantity: 3000,
        purchaseShortageQuantity: 0,
        onHandQuantity: 5000,
        allocatedQuantity: 1000,
        availableQuantity: 4000,
        usesInventory: true,
        allocationRequired: true,
      }),
    );
  });

  it('releases active allocations before deleting a pending purchase list', async () => {
    const {
      service,
      inventoryService,
      orderRepository,
      purchaseListRepository,
    } = await createService();
    purchaseListRepository.findById.mockResolvedValue(
      makePendingPurchaseList(),
    );
    orderRepository.findById.mockResolvedValue(
      makePaidOrder('beef', '牛肉', 3000),
    );
    purchaseListRepository.delete.mockResolvedValue(undefined);

    await service.deletePurchaseList('purchase-list-1', 'admin-1');

    expect(
      inventoryService.releaseAllocationsForPurchaseList,
    ).toHaveBeenCalledWith('purchase-list-1');
  });

  it('releases active allocations when removing orders from a pending purchase list', async () => {
    const {
      service,
      inventoryService,
      orderRepository,
      purchaseListRepository,
    } = await createService();
    purchaseListRepository.findById.mockResolvedValue(
      makePendingPurchaseList(),
    );
    orderRepository.findById.mockResolvedValue(
      makePaidOrder('beef', '牛肉', 3000),
    );

    await service.removeOrdersFromPurchaseList(
      'purchase-list-1',
      ['order-beef'],
      'admin-1',
    );

    expect(
      inventoryService.releaseAllocationsForPurchaseList,
    ).toHaveBeenCalledWith('purchase-list-1');
  });

  it('recreates allocation for remaining order demand when removing orders from a pending purchase list', async () => {
    const {
      service,
      inventoryService,
      orderRepository,
      purchaseListRepository,
    } = await createService({
      availability: new Map([
        [
          'beef',
          {
            ingredientId: 'beef',
            onHandQuantityG: 1000,
            allocatedQuantityG: 0,
            availableQuantityG: 1000,
          },
        ],
      ]),
    });
    purchaseListRepository.findById.mockResolvedValue(
      makePendingPurchaseList(),
    );
    orderRepository.findById.mockImplementation(async (id: string) => {
      if (id === 'order-beef') {
        return makePaidOrder('beef', '牛肉', 3000);
      }
      if (id === 'order-spinach') {
        return makePaidOrder('spinach', '菠菜', 600);
      }
      return null;
    });

    await service.removeOrdersFromPurchaseList(
      'purchase-list-1',
      ['order-spinach'],
      'admin-1',
    );

    expect(
      inventoryService.releaseAllocationsForPurchaseList,
    ).toHaveBeenCalledWith('purchase-list-1');
    expect(
      inventoryService.createAllocationForOrderDemand,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseListId: 'purchase-list-1',
        sourceOrderIds: ['order-beef'],
        createdById: 'admin-1',
        lines: [
          expect.objectContaining({
            ingredientId: 'beef',
            quantityG: 1000,
          }),
        ],
      }),
    );
  });

  it('releases and recreates allocation when recalculating a pending purchase list', async () => {
    const {
      service,
      inventoryService,
      orderRepository,
      purchaseListRepository,
    } = await createService({
      availability: new Map([
        [
          'beef',
          {
            ingredientId: 'beef',
            onHandQuantityG: 1000,
            allocatedQuantityG: 0,
            availableQuantityG: 1000,
          },
        ],
      ]),
    });
    purchaseListRepository.findById.mockResolvedValue(
      makePendingPurchaseList(),
    );
    orderRepository.findById.mockImplementation(async (id: string) => {
      if (id === 'order-beef') {
        return makePaidOrder('beef', '牛肉', 3000);
      }
      if (id === 'order-spinach') {
        return makePaidOrder('spinach', '菠菜', 600);
      }
      return null;
    });

    await service.recalculatePurchaseList('purchase-list-1', 'admin-1');

    expect(
      inventoryService.releaseAllocationsForPurchaseList,
    ).toHaveBeenCalledWith('purchase-list-1');
    expect(purchaseListRepository.recalculateItems).toHaveBeenCalled();
    expect(
      inventoryService.createAllocationForOrderDemand,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseListId: 'purchase-list-1',
        sourceOrderIds: ['order-beef', 'order-spinach'],
        createdById: 'admin-1',
        lines: [
          expect.objectContaining({
            ingredientId: 'beef',
            quantityG: 1000,
          }),
        ],
      }),
    );
  });

  it('allocates available stock only for newly added orders before adding purchase shortages', async () => {
    const {
      service,
      inventoryService,
      orderRepository,
      purchaseListRepository,
    } = await createService({
      availability: new Map([
        [
          'beef',
          {
            ingredientId: 'beef',
            onHandQuantityG: 3600,
            allocatedQuantityG: 3000,
            availableQuantityG: 600,
          },
        ],
      ]),
    });
    purchaseListRepository.findById.mockResolvedValue(
      makePendingPurchaseList(),
    );
    orderRepository.findById.mockResolvedValue(
      makePaidOrder('beef', '牛肉', 1000, 'order-beef-extra'),
    );

    const result = await service.addOrdersToPurchaseList(
      'purchase-list-1',
      ['order-beef-extra'],
      'admin-1',
    );

    expect(
      inventoryService.releaseAllocationsForPurchaseList,
    ).not.toHaveBeenCalled();
    expect(
      inventoryService.createAllocationForOrderDemand,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseListId: 'purchase-list-1',
        sourceOrderIds: ['order-beef-extra'],
        createdById: 'admin-1',
        lines: [
          expect.objectContaining({
            ingredientId: 'beef',
            quantityG: 600,
          }),
        ],
      }),
    );
    expect(result.newItems).toHaveLength(1);
    expect(result.newItems[0]).toEqual(
      expect.objectContaining({
        ingredientId: 'beef',
        grossQuantityNeeded: 1000,
        stockDeductedQuantity: 600,
        purchaseShortageQuantity: 400,
        quantityNeeded: 400,
        usesInventory: true,
      }),
    );
  });

  it('rolls up audit quantities when appended orders match an existing procurement sku item', async () => {
    const { service, orderRepository, purchaseListRepository } =
      await createService({
        availability: new Map([
          [
            'beef',
            {
              ingredientId: 'beef',
              onHandQuantityG: 3600,
              allocatedQuantityG: 3600,
              availableQuantityG: 0,
            },
          ],
        ]),
      });
    purchaseListRepository.findById.mockResolvedValue(
      new PurchaseList({
        id: 'purchase-list-1',
        targetDate: new Date('2026-04-20T12:00:00.000Z'),
        status: PurchaseListStatus.PENDING,
        totalEstimatedCost: 4,
        itemCount: 1,
        createdById: 'admin-1',
        sourceOrderIds: ['order-beef-original'],
        items: [
          new PurchaseItem({
            id: 'item-beef-premium',
            purchaseListId: 'purchase-list-1',
            ingredientId: 'beef',
            procurementSkuId: 'sku-premium',
            procurementSkuName: '商超牛肉',
            ingredientName: '牛肉',
            type: 'FOOD',
            quantityNeeded: 400,
            quantityUnit: 'G',
            estimatedCost: 4,
            grossQuantityNeeded: 1000,
            stockDeductedQuantity: 600,
            purchaseShortageQuantity: 400,
            onHandQuantity: 3600,
            allocatedQuantity: 3000,
            availableQuantity: 600,
            usesInventory: true,
          }),
        ],
      }),
    );
    orderRepository.findById.mockResolvedValue(
      makePaidOrder('beef', '牛肉', 1000, 'order-beef-extra', {
        cost: 10,
        procurementSkuId: 'sku-premium',
        procurementSkuName: '商超牛肉',
      }),
    );

    const result = await service.addOrdersToPurchaseList(
      'purchase-list-1',
      ['order-beef-extra'],
      'admin-1',
    );

    expect(result.newItems).toHaveLength(0);
    expect(result.updatedItems).toHaveLength(1);
    expect(result.updatedItems[0]).toEqual(
      expect.objectContaining({
        id: 'item-beef-premium',
        ingredientId: 'beef',
        procurementSkuId: 'sku-premium',
        quantityNeeded: 1400,
        grossQuantityNeeded: 2000,
        stockDeductedQuantity: 600,
        purchaseShortageQuantity: 1400,
        estimatedCost: 14,
        usesInventory: true,
      }),
    );
    expect(result.purchaseList.items).toEqual([
      expect.objectContaining({
        id: 'item-beef-premium',
        quantityNeeded: 1400,
        grossQuantityNeeded: 2000,
        stockDeductedQuantity: 600,
        purchaseShortageQuantity: 1400,
      }),
    ]);
  });

  it('creates a separate appended item for the same ingredient with a different procurement sku', async () => {
    const { service, orderRepository, purchaseListRepository } =
      await createService({
        availability: new Map([
          [
            'beef',
            {
              ingredientId: 'beef',
              onHandQuantityG: 0,
              allocatedQuantityG: 0,
              availableQuantityG: 0,
            },
          ],
        ]),
      });
    purchaseListRepository.findById.mockResolvedValue(
      new PurchaseList({
        id: 'purchase-list-1',
        targetDate: new Date('2026-04-20T12:00:00.000Z'),
        status: PurchaseListStatus.PENDING,
        totalEstimatedCost: 4,
        itemCount: 1,
        createdById: 'admin-1',
        sourceOrderIds: ['order-beef-original'],
        items: [
          new PurchaseItem({
            id: 'item-beef-wholesale',
            purchaseListId: 'purchase-list-1',
            ingredientId: 'beef',
            procurementSkuId: 'sku-wholesale',
            procurementSkuName: '批发牛肉',
            ingredientName: '牛肉',
            type: 'FOOD',
            quantityNeeded: 400,
            quantityUnit: 'G',
            estimatedCost: 4,
            grossQuantityNeeded: 400,
            stockDeductedQuantity: 0,
            purchaseShortageQuantity: 400,
          }),
        ],
      }),
    );
    orderRepository.findById.mockResolvedValue(
      makePaidOrder('beef', '牛肉', 1000, 'order-beef-extra', {
        cost: 10,
        procurementSkuId: 'sku-premium',
        procurementSkuName: '商超牛肉',
      }),
    );

    const result = await service.addOrdersToPurchaseList(
      'purchase-list-1',
      ['order-beef-extra'],
      'admin-1',
    );

    expect(result.updatedItems).toHaveLength(0);
    expect(result.newItems).toHaveLength(1);
    expect(result.purchaseList.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'item-beef-wholesale',
          procurementSkuId: 'sku-wholesale',
          quantityNeeded: 400,
        }),
        expect.objectContaining({
          ingredientId: 'beef',
          procurementSkuId: 'sku-premium',
          procurementSkuName: '商超牛肉',
          quantityNeeded: 1000,
          grossQuantityNeeded: 1000,
          purchaseShortageQuantity: 1000,
        }),
      ]),
    );
  });

  it('records order status history when adding orders to an existing purchase list', async () => {
    const {
      service,
      orderRepository,
      purchaseListRepository,
      statusHistoryRepository,
    } = await createService();
    purchaseListRepository.findById.mockResolvedValue(
      makePendingPurchaseList(),
    );
    orderRepository.findById.mockResolvedValue(
      makePaidOrder('beef', '牛肉', 1000, 'order-beef-extra'),
    );

    await service.addOrdersToPurchaseList(
      'purchase-list-1',
      ['order-beef-extra'],
      'admin-1',
    );

    expect(statusHistoryRepository.append).toHaveBeenCalledWith(
      'order-beef-extra',
      OrderStatus.PAID,
      OrderStatus.PURCHASING,
      'staff',
      'admin-1',
      expect.objectContaining({
        purchaseListId: 'purchase-list-1',
        triggeredBy: 'purchase_list_order_addition',
      }),
    );
  });
});
