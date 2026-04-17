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
) => ({
  id: `order-${ingredientId}`,
  status: OrderStatus.PAID,
  targetProductionDate: new Date('2026-04-20T00:00:00.000Z'),
  pricingBreakdownSnapshot: {
    ingredientDetails: [
      {
        ingredientId,
        name,
        purchaseAmount,
        unit: 'G',
        cost: purchaseAmount / 100,
        type: 'FOOD',
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
      findByTargetProductionDateRange: jest.fn().mockResolvedValue({ list: orders }),
      findById: jest.fn(),
      save: jest.fn(),
    };
    const ingredientRepository = {
      findByIds: jest.fn().mockImplementation(async (ids: string[]) =>
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

    const module = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
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
    };
  }

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

  it('creates a purchase list for shortages and an allocation for stock offsets', async () => {
    const { service, inventoryService } = await createService();

    const result: any = await service.generatePurchaseList(
      { startDate: '2026-04-20' },
      'admin-1',
    );

    expect(result.purchaseList?.items).toHaveLength(1);
    expect(result.purchaseList?.items[0]).toEqual(
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
    expect(inventoryService.createAllocationForOrderDemand).toHaveBeenCalledWith(
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

  it('creates only an inventory allocation when all order demand is covered by stock', async () => {
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

    expect(result.purchaseList).toBeNull();
    expect(result.inventoryAllocation).toEqual({
      id: 'allocation-1',
      lineCount: 1,
      totalAllocatedQuantityG: 3000,
    });
    expect(result.fullyCoveredByInventory).toBe(true);
    expect(purchaseListRepository.save).not.toHaveBeenCalled();
  });

  it('returns stock offset fields in purchase preview responses', async () => {
    const { service } = await createService();

    const preview: any = await service.previewPurchaseRequirements('2026-04-20');

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
    purchaseListRepository.findById.mockResolvedValue(makePendingPurchaseList());
    orderRepository.findById.mockResolvedValue(
      makePaidOrder('beef', '牛肉', 3000),
    );
    purchaseListRepository.delete.mockResolvedValue(undefined);

    await service.deletePurchaseList('purchase-list-1', 'admin-1');

    expect(inventoryService.releaseAllocationsForPurchaseList).toHaveBeenCalledWith(
      'purchase-list-1',
    );
  });

  it('releases active allocations when removing orders from a pending purchase list', async () => {
    const {
      service,
      inventoryService,
      orderRepository,
      purchaseListRepository,
    } = await createService();
    purchaseListRepository.findById.mockResolvedValue(makePendingPurchaseList());
    orderRepository.findById.mockResolvedValue(
      makePaidOrder('beef', '牛肉', 3000),
    );

    await service.removeOrdersFromPurchaseList(
      'purchase-list-1',
      ['order-beef'],
      'admin-1',
    );

    expect(inventoryService.releaseAllocationsForPurchaseList).toHaveBeenCalledWith(
      'purchase-list-1',
    );
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
    purchaseListRepository.findById.mockResolvedValue(makePendingPurchaseList());
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

    expect(inventoryService.releaseAllocationsForPurchaseList).toHaveBeenCalledWith(
      'purchase-list-1',
    );
    expect(inventoryService.createAllocationForOrderDemand).toHaveBeenCalledWith(
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
    purchaseListRepository.findById.mockResolvedValue(makePendingPurchaseList());
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

    expect(inventoryService.releaseAllocationsForPurchaseList).toHaveBeenCalledWith(
      'purchase-list-1',
    );
    expect(purchaseListRepository.recalculateItems).toHaveBeenCalled();
    expect(inventoryService.createAllocationForOrderDemand).toHaveBeenCalledWith(
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
});
