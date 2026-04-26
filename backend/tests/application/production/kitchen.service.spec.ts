import { Test } from '@nestjs/testing';
import { StaffProductionService } from 'src/application/production/kitchen.service';
import { ProductionService } from 'src/application/production/production.service';
import { PRODUCTION_BATCH_REPOSITORY } from 'src/application/production/production.service';
import { PURCHASE_LIST_REPOSITORY } from 'src/application/purchasing/purchasing.service.tokens';
import { ORDER_REPOSITORY } from 'src/application/order/order.service';
import { PurchasingService } from 'src/application/purchasing/purchasing.service';
import {
  PackagingUnitStatus,
  ProductionBatchStatus,
} from 'src/domain/production/enums';
import { PackagingUnit } from 'src/domain/production';
import { OrderStatus } from 'src/domain';
import { TencentCosService } from 'src/infrastructure/services/tencent-cos.service';
import { PdfGeneratorService } from 'src/infrastructure/services/pdf-generator.service';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

describe('StaffProductionService', () => {
  const buildService = async ({
    productionRepository = {},
    orderRepository = {},
    productionService = {},
    purchaseListRepository = { findMany: jest.fn().mockResolvedValue({ list: [] }) },
  }: {
    productionRepository?: Record<string, any>;
    orderRepository?: Record<string, any>;
    productionService?: Record<string, any>;
    purchaseListRepository?: Record<string, any>;
  }) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StaffProductionService,
        {
          provide: ProductionService,
          useValue: productionService,
        },
        {
          provide: PurchasingService,
          useValue: {},
        },
        {
          provide: PRODUCTION_BATCH_REPOSITORY,
          useValue: productionRepository,
        },
        {
          provide: PURCHASE_LIST_REPOSITORY,
          useValue: purchaseListRepository,
        },
        {
          provide: ORDER_REPOSITORY,
          useValue: orderRepository,
        },
        {
          provide: TencentCosService,
          useValue: {},
        },
        {
          provide: PdfGeneratorService,
          useValue: {},
        },
      ],
    }).compile();

    return moduleRef.get(StaffProductionService);
  };

  it('reports unscheduled purchasing orders even when today already has a production batch', async () => {
    const productionRepository = {
      findByProductionDate: jest.fn().mockResolvedValue([
        {
          packagingUnits: [
            {
              id: 'unit-old',
              status: PackagingUnitStatus.PENDING,
            },
          ],
        },
      ]),
    };
    const orderRepository = {
      findByTargetProductionDateRange: jest.fn().mockResolvedValue({
        list: [
          {
            id: 'order-new',
            status: OrderStatus.PURCHASING,
            items: [
              {
                id: 'item-new',
                productionBatchId: null,
              },
            ],
          },
          {
            id: 'order-already-allocated',
            status: OrderStatus.PURCHASING,
            items: [
              {
                id: 'item-allocated',
                productionBatchId: 'batch-existing',
              },
            ],
          },
        ],
      }),
    };

    const service = await buildService({ productionRepository, orderRepository });

    const stats = await service.getTodayStatistics();

    expect(stats.todayOrders).toBe(1);
    expect(stats.pendingScheduleOrders).toBe(1);
    expect(orderRepository.findByTargetProductionDateRange).toHaveBeenCalledWith(
      expect.objectContaining({
        status: OrderStatus.PURCHASING,
      }),
    );
  });

  it('does not report a packaging unit as completed just because it was updated', async () => {
    const createdAt = new Date('2026-04-21T15:15:00.000Z');
    const updatedAt = new Date('2026-04-21T15:23:00.000Z');
    const productionRepository = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 'batch-1',
          packagingUnits: [
            {
              id: 'unit-in-progress',
              productionBatchId: 'batch-1',
              recipeSnapshot: {
                id: 'recipe-1',
                name: '糙米鸡蛋牛肉',
                version: 4,
              },
              totalProductionG: 5250,
              status: PackagingUnitStatus.IN_PROGRESS,
              sourceOrderItemIds: [],
              createdAt,
              updatedAt,
              completedAt: null,
              photosRaw: [],
            },
          ],
        },
      ]),
    };
    const orderRepository = {
      findByStatus: jest.fn().mockResolvedValue([]),
    };
    const service = await buildService({ productionRepository, orderRepository });

    const result = await service.getPackagingUnits({ page: 1, pageSize: 20 });

    expect(result.list).toHaveLength(1);
    expect(result.list[0].status).toBe(PackagingUnitStatus.IN_PROGRESS);
    expect(result.list[0].createdAt).toBeDefined();
    expect(result.list[0].completedAt).toBeUndefined();
  });

  it('returns recorded production result fields for completed packaging units', async () => {
    const completedAt = new Date('2026-04-21T15:45:00.000Z');
    const productionRepository = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 'batch-1',
          packagingUnits: [
            {
              id: 'unit-surplus',
              productionBatchId: 'batch-1',
              recipeSnapshot: {
                id: 'recipe-1',
                name: '糙米鸡蛋牛肉',
                version: 4,
              },
              totalProductionG: 5250,
              actualOutputG: 5504,
              resultStatus: 'SURPLUS',
              surplusG: 254,
              shortageG: 0,
              status: PackagingUnitStatus.COMPLETED,
              sourceOrderItemIds: [],
              createdAt: new Date('2026-04-21T15:15:00.000Z'),
              updatedAt: completedAt,
              completedAt,
              photosRaw: ['raw-photo.jpg'],
              resultPhotoUrls: ['result-photo.jpg'],
            },
          ],
        },
      ]),
    };
    const orderRepository = {
      findByStatus: jest.fn().mockResolvedValue([]),
    };
    const service = await buildService({ productionRepository, orderRepository });

    const result = await service.getPackagingUnits({ page: 1, pageSize: 20 });

    expect(result.list[0]).toEqual(
      expect.objectContaining({
        resultStatus: 'SURPLUS',
        actualOutputG: 5504,
        surplusG: 254,
        shortageG: 0,
        resultPhotoUrls: ['result-photo.jpg'],
      }),
    );
  });

  it('numbers same-recipe pots separately when ingredient source plans differ', async () => {
    const recipeSnapshot = {
      id: 'recipe-1',
      name: '糙米鸡蛋牛肉',
      version: 4,
      items: [],
    };
    const wholesaleUnitOne = new PackagingUnit(
      'unit-wholesale-1',
      'batch-1',
      recipeSnapshot as any,
      5250,
      ['item-wholesale'],
      new Date('2026-04-21T15:15:00.000Z'),
      PackagingUnitStatus.PENDING,
    );
    const wholesaleUnitTwo = new PackagingUnit(
      'unit-wholesale-2',
      'batch-1',
      recipeSnapshot as any,
      2000,
      ['item-wholesale'],
      new Date('2026-04-21T15:16:00.000Z'),
      PackagingUnitStatus.PENDING,
    );
    const marketUnit = new PackagingUnit(
      'unit-market-1',
      'batch-1',
      recipeSnapshot as any,
      5250,
      ['item-market'],
      new Date('2026-04-21T15:17:00.000Z'),
      PackagingUnitStatus.PENDING,
    );
    const productionRepository = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 'batch-1',
          packagingUnits: [wholesaleUnitOne, wholesaleUnitTwo, marketUnit],
        },
      ]),
    };
    const orderRepository = {
      findByStatus: jest.fn().mockImplementation(async (status) => {
        if (status !== OrderStatus.IN_PRODUCTION) return [];
        return [
          {
            id: 'order-wholesale',
            status: OrderStatus.IN_PRODUCTION,
            dog: { name: 'setar' },
            address: { recipientName: '赵晨', region: { city: '成都' } },
            items: [
              {
                id: 'item-wholesale',
                packageSpecG: 208,
                packageCount: 60,
                packagePlan: null,
                ingredientSourcePlan: 'WHOLESALE',
              },
            ],
          },
          {
            id: 'order-market',
            status: OrderStatus.IN_PRODUCTION,
            dog: { name: 'setar' },
            address: { recipientName: '赵晨', region: { city: '成都' } },
            items: [
              {
                id: 'item-market',
                packageSpecG: 122,
                packageCount: 60,
                packagePlan: null,
                ingredientSourcePlan: 'MARKET_PREMIUM',
              },
            ],
          },
        ];
      }),
    };
    const service = await buildService({ productionRepository, orderRepository });

    const result = await service.getPackagingUnits({ page: 1, pageSize: 20 });

    const byId = new Map(result.list.map((unit) => [unit.id, unit]));
    expect(byId.get('unit-wholesale-1')).toEqual(
      expect.objectContaining({
        currentPotNumber: 1,
        totalPots: 2,
        ingredientSourcePlan: 'WHOLESALE',
        ingredientSourcePlanLabel: '性价比优先',
      }),
    );
    expect(byId.get('unit-wholesale-2')).toEqual(
      expect.objectContaining({
        currentPotNumber: 2,
        totalPots: 2,
        ingredientSourcePlan: 'WHOLESALE',
        ingredientSourcePlanLabel: '性价比优先',
      }),
    );
    expect(byId.get('unit-market-1')).toEqual(
      expect.objectContaining({
        currentPotNumber: 1,
        totalPots: 1,
        ingredientSourcePlan: 'MARKET_PREMIUM',
        ingredientSourcePlanLabel: '超市优先',
      }),
    );
  });

  it('adds source-plan procurement sku names to production recipe snapshots', async () => {
    const recipeSnapshot = {
      id: 'recipe-1',
      name: '糙米鸡蛋牛肉',
      version: 4,
      items: [
        {
          ingredient_id: 'ingredient-beef',
          name: '牛霖',
          ratio: 100,
          ingredient_type: 'FOOD',
        },
      ],
    };
    const unit = new PackagingUnit(
      'unit-market-1',
      'batch-1',
      recipeSnapshot as any,
      5250,
      ['item-market'],
      new Date('2026-04-21T15:17:00.000Z'),
      PackagingUnitStatus.PENDING,
    );
    const productionRepository = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 'batch-1',
          productionDate: new Date('2026-04-21T12:00:00.000Z'),
          packagingUnits: [unit],
        },
      ]),
    };
    const orderRepository = {
      findByStatus: jest.fn().mockImplementation(async (status) => {
        if (status !== OrderStatus.IN_PRODUCTION) return [];
        return [
          {
            id: 'order-market',
            status: OrderStatus.IN_PRODUCTION,
            dog: { name: 'setar' },
            address: { recipientName: '赵晨', region: { city: '成都' } },
            items: [
              {
                id: 'item-market',
                packageSpecG: 122,
                packageCount: 60,
                packagePlan: null,
                ingredientSourcePlan: 'MARKET_PREMIUM',
              },
            ],
          },
        ];
      }),
    };
    const purchaseListRepository = {
      findMany: jest.fn().mockResolvedValue({
        list: [
          {
            id: 'purchase-list-1',
            sourceOrderIds: ['order-market'],
            items: [
              {
                ingredientId: 'ingredient-beef',
                ingredientName: '牛霖',
                procurementSkuId: 'sku-wholesale',
                procurementSkuName: '进口冷冻牛霖',
                type: 'FOOD',
                ingredient: {
                  procurementSkus: [
                    {
                      id: 'sku-wholesale',
                      sourceTier: 'WHOLESALE',
                      currentPurchasePrice: 58,
                    },
                    {
                      id: 'sku-market',
                      sourceTier: 'MARKET_PREMIUM',
                      currentPurchasePrice: 98,
                      brand: '山姆会员店',
                      purchaseChannel: '山姆会店',
                      productModel: '1.2kg/盒',
                    },
                  ],
                },
              },
              {
                ingredientId: 'ingredient-beef',
                ingredientName: '牛霖',
                procurementSkuId: 'sku-market',
                procurementSkuName: 'MM澳洲谷饲牛霖',
                type: 'FOOD',
                ingredient: {
                  procurementSkus: [
                    {
                      id: 'sku-wholesale',
                      sourceTier: 'WHOLESALE',
                      currentPurchasePrice: 58,
                    },
                    {
                      id: 'sku-market',
                      sourceTier: 'MARKET_PREMIUM',
                      currentPurchasePrice: 98,
                      brand: '山姆会员店',
                      purchaseChannel: '山姆会店',
                      productModel: '1.2kg/盒',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    };
    const service = await buildService({
      productionRepository,
      orderRepository,
      purchaseListRepository,
    });

    const result = await service.getPackagingUnits({
      page: 1,
      pageSize: 20,
      targetDate: '2026-04-21',
    } as any);

    expect(result.list[0].recipeSnapshot.items[0]).toEqual(
      expect.objectContaining({
        name: '牛霖',
        procurementSkuId: 'sku-market',
        procurementSkuName: 'MM澳洲谷饲牛霖',
        procurementSkuBrand: '山姆会员店',
        procurementSkuPurchaseChannel: '山姆会店',
        procurementSkuProductModel: '1.2kg/盒',
        standardIngredientName: '牛霖',
      }),
    );
  });

  it('adds supplement procurement sku metadata from the selected active sku', async () => {
    const recipeSnapshot = {
      id: 'recipe-1',
      name: '补剂测试食谱',
      version: 1,
      items: [
        {
          ingredient_id: 'ingredient-seaweed',
          name: '海藻粉',
          ratio: 0,
          ingredient_type: 'SUPPLEMENT',
        },
      ],
    };
    const unit = new PackagingUnit(
      'unit-supplement-1',
      'batch-1',
      recipeSnapshot as any,
      1200,
      ['item-supplement'],
      new Date('2026-04-21T15:17:00.000Z'),
      PackagingUnitStatus.PENDING,
    );
    const productionRepository = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 'batch-1',
          productionDate: new Date('2026-04-21T12:00:00.000Z'),
          packagingUnits: [unit],
        },
      ]),
    };
    const orderRepository = {
      findByStatus: jest.fn().mockImplementation(async (status) => {
        if (status !== OrderStatus.IN_PRODUCTION) return [];
        return [
          {
            id: 'order-supplement',
            status: OrderStatus.IN_PRODUCTION,
            dog: { name: '咖喱' },
            address: { recipientName: '邱', region: { city: '深圳' } },
            items: [
              {
                id: 'item-supplement',
                packageSpecG: 90,
                packageCount: 60,
                packagePlan: null,
                ingredientSourcePlan: 'WHOLESALE',
              },
            ],
          },
        ];
      }),
    };
    const purchaseListRepository = {
      findMany: jest.fn().mockResolvedValue({
        list: [
          {
            id: 'purchase-list-1',
            sourceOrderIds: ['order-supplement'],
            items: [
              {
                ingredientId: 'ingredient-seaweed',
                ingredientName: '海藻粉',
                procurementSkuId: 'sku-seaweed',
                type: 'SUPPLEMENT',
                ingredient: {
                  procurementSkus: [
                    {
                      id: 'sku-seaweed',
                      name: '海藻粉 450mcg碘/平勺',
                      brand: 'NOW FOODS',
                      purchaseChannel: 'iHerb',
                      productModel: '227g/瓶',
                      currentPurchasePrice: 89.4,
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    };
    const service = await buildService({
      productionRepository,
      orderRepository,
      purchaseListRepository,
    });

    const result = await service.getPackagingUnits({
      page: 1,
      pageSize: 20,
      targetDate: '2026-04-21',
    } as any);

    expect(result.list[0].recipeSnapshot.items[0]).toEqual(
      expect.objectContaining({
        name: '海藻粉',
        procurementSkuId: 'sku-seaweed',
        procurementSkuName: '海藻粉 450mcg碘/平勺',
        procurementSkuBrand: 'NOW FOODS',
        procurementSkuPurchaseChannel: 'iHerb',
        procurementSkuProductModel: '227g/瓶',
        standardIngredientName: '海藻粉',
      }),
    );
  });

  it('adds legacy supplement brand metadata when no procurement sku exists', async () => {
    const recipeSnapshot = {
      id: 'recipe-1',
      name: '补剂测试食谱',
      version: 1,
      items: [
        {
          ingredient_id: 'ingredient-eggshell',
          name: '鸡蛋壳粉',
          ratio: 0,
          ingredient_type: 'SUPPLEMENT',
        },
      ],
    };
    const unit = new PackagingUnit(
      'unit-legacy-supplement-1',
      'batch-1',
      recipeSnapshot as any,
      1200,
      ['item-supplement'],
      new Date('2026-04-26T03:57:00.000Z'),
      PackagingUnitStatus.PENDING,
    );
    const productionRepository = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 'batch-1',
          productionDate: new Date('2026-04-26T04:00:00.000Z'),
          packagingUnits: [unit],
        },
      ]),
    };
    const orderRepository = {
      findByStatus: jest.fn().mockImplementation(async (status) => {
        if (status !== OrderStatus.IN_PRODUCTION) return [];
        return [
          {
            id: 'order-supplement',
            status: OrderStatus.IN_PRODUCTION,
            dog: { name: '咖喱' },
            address: { recipientName: '邱', region: { city: '深圳' } },
            items: [
              {
                id: 'item-supplement',
                packageSpecG: 90,
                packageCount: 60,
                packagePlan: null,
                ingredientSourcePlan: 'WHOLESALE',
              },
            ],
          },
        ];
      }),
    };
    const purchaseListRepository = {
      findMany: jest.fn().mockResolvedValue({
        list: [
          {
            id: 'purchase-list-1',
            sourceOrderIds: ['order-supplement'],
            items: [
              {
                ingredientId: 'ingredient-eggshell',
                ingredientName: '鸡蛋壳粉',
                procurementSkuId: undefined,
                procurementSkuName: undefined,
                type: 'SUPPLEMENT',
                purchaseChannel: '京东',
                productModel: '500g/罐',
                ingredient: {
                  name: '鸡蛋壳粉',
                  brand: '西知堂',
                  purchaseChannel: '京东',
                  productModel: '500g/罐',
                  procurementSkus: [],
                },
              },
            ],
          },
        ],
      }),
    };
    const service = await buildService({
      productionRepository,
      orderRepository,
      purchaseListRepository,
    });

    const result = await service.getPackagingUnits({
      page: 1,
      pageSize: 20,
      targetDate: '2026-04-26',
    } as any);

    expect(result.list[0].recipeSnapshot.items[0]).toEqual(
      expect.objectContaining({
        name: '鸡蛋壳粉',
        procurementSkuName: '鸡蛋壳粉',
        procurementSkuBrand: '西知堂',
        procurementSkuPurchaseChannel: '京东',
        procurementSkuProductModel: '500g/罐',
        standardIngredientName: '鸡蛋壳粉',
      }),
    );
  });

  it('keeps unfinished carryover tasks visible when filtering by production date', async () => {
    const recipeSnapshot = {
      id: 'recipe-1',
      name: '糙米鸡蛋牛肉',
      version: 4,
      items: [],
    };
    const selectedDateUnit = new PackagingUnit(
      'unit-selected-completed',
      'batch-selected',
      recipeSnapshot as any,
      1000,
      ['item-selected'],
      new Date('2026-04-22T09:00:00.000Z'),
      PackagingUnitStatus.COMPLETED,
    );
    const carryoverUnit = new PackagingUnit(
      'unit-carryover-pending',
      'batch-previous',
      recipeSnapshot as any,
      1000,
      ['item-carryover'],
      new Date('2026-04-21T09:00:00.000Z'),
      PackagingUnitStatus.PENDING,
    );
    const oldCompletedUnit = new PackagingUnit(
      'unit-old-completed',
      'batch-old-completed',
      recipeSnapshot as any,
      1000,
      ['item-old'],
      new Date('2026-04-20T09:00:00.000Z'),
      PackagingUnitStatus.COMPLETED,
    );
    const productionRepository = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 'batch-selected',
          productionDate: new Date('2026-04-22T12:00:00.000Z'),
          packagingUnits: [selectedDateUnit],
        },
        {
          id: 'batch-previous',
          productionDate: new Date('2026-04-21T12:00:00.000Z'),
          packagingUnits: [carryoverUnit],
        },
        {
          id: 'batch-old-completed',
          productionDate: new Date('2026-04-20T12:00:00.000Z'),
          packagingUnits: [oldCompletedUnit],
        },
      ]),
      findByProductionDate: jest.fn().mockResolvedValue([
        {
          id: 'batch-selected',
          productionDate: new Date('2026-04-22T12:00:00.000Z'),
          packagingUnits: [selectedDateUnit],
        },
      ]),
    };
    const orderRepository = {
      findByStatus: jest.fn().mockResolvedValue([]),
    };
    const service = await buildService({ productionRepository, orderRepository });

    const result = await service.getPackagingUnits({
      page: 1,
      pageSize: 20,
      targetDate: '2026-04-22',
      includeUnfinishedCarryover: true,
    } as any);

    expect(result.list.map((unit) => unit.id)).toEqual(
      expect.arrayContaining([
        'unit-selected-completed',
        'unit-carryover-pending',
      ]),
    );
    expect(result.list.map((unit) => unit.id)).not.toContain(
      'unit-old-completed',
    );
    expect(result.list.find((unit) => unit.id === 'unit-selected-completed')).toEqual(
      expect.objectContaining({
        productionDate: '2026-04-22',
      }),
    );
    expect(result.list.find((unit) => unit.id === 'unit-carryover-pending')).toEqual(
      expect.objectContaining({
        productionDate: '2026-04-21',
      }),
    );
  });

  it('does not transition an order to freezing until all of its packaging units are completed', async () => {
    const recipeSnapshot = {
      id: 'recipe-1',
      name: '糙米鸡蛋牛肉',
      version: 4,
      items: [],
    } as any;
    const currentUnit = new PackagingUnit(
      'unit-current',
      'batch-1',
      recipeSnapshot,
      1000,
      ['item-1'],
      new Date('2026-04-21T15:15:00.000Z'),
      PackagingUnitStatus.IN_PROGRESS,
    );
    const pendingUnit = new PackagingUnit(
      'unit-pending',
      'batch-1',
      recipeSnapshot,
      500,
      ['item-1'],
      new Date('2026-04-21T15:16:00.000Z'),
      PackagingUnitStatus.PENDING,
    );
    const productionRepository = {
      findPackagingUnitById: jest.fn().mockResolvedValue(currentUnit),
      updatePackagingUnit: jest.fn().mockImplementation(async (unit) => unit),
      findOrderItemsByIds: jest.fn().mockResolvedValue([
        {
          id: 'item-1',
          orderId: 'order-1',
        },
      ]),
      findById: jest.fn().mockResolvedValue({
        id: 'batch-1',
        status: ProductionBatchStatus.IN_PRODUCTION,
        packagingUnits: [currentUnit, pendingUnit],
      }),
    };
    const order = {
      id: 'order-1',
      status: OrderStatus.IN_PRODUCTION,
      items: [{ id: 'item-1' }],
      markAsFreezing: jest.fn(),
    };
    const orderRepository = {
      findById: jest.fn().mockResolvedValue(order),
      save: jest.fn(),
    };
    const productionService = {
      checkAndCompleteBatch: jest.fn(),
    };
    const service = await buildService({
      productionRepository,
      orderRepository,
      productionService,
    } as any);

    await service.completeProductionTask('unit-current', {
      resultStatus: 'NORMAL',
      resultPhotoUrls: ['result-photo.jpg'],
    });

    expect(order.markAsFreezing).not.toHaveBeenCalled();
    expect(orderRepository.save).not.toHaveBeenCalled();
  });
});
