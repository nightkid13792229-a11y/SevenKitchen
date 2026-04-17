jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

import { PackagingUnit } from 'src/domain/production';
import { PackagingUnitStatus } from 'src/domain/production/enums';
import type { RecipeSnapshot } from 'src/domain/recipe/types';
import { StaffProductionService } from 'src/application/production/kitchen.service';
import { ProductionCostSettlementService } from 'src/application/production/production-cost-settlement.service';

const recipeSnapshot: RecipeSnapshot = {
  id: 'recipe-1',
  version: 1,
  name: '牛肉鲜食',
  production_loss_rate: 1.07,
  energy_density_kcal_per_kg: 1450,
  nutrition_standard: 'FEDIAF_2021',
  items: [],
};

describe('production completion result', () => {
  it('records finished-product surplus without requiring ingredient actual usage', () => {
    const unit = new PackagingUnit(
      'unit-1',
      'batch-1',
      recipeSnapshot,
      5000,
      ['order-item-1'],
      new Date('2026-04-20T08:00:00.000Z'),
    );

    unit.recordProductionResult({
      resultStatus: 'SURPLUS',
      surplusG: 250,
      resultPhotoUrls: ['https://example.com/result.jpg'],
    });

    expect(unit.resultStatus).toBe('SURPLUS');
    expect(unit.surplusG).toBe(250);
    expect(unit.shortageG).toBe(0);
    expect(unit.actualOutputG).toBe(5250);
    expect(unit.resultPhotoUrls).toEqual(['https://example.com/result.jpg']);
    expect(unit.completedAt).toBeInstanceOf(Date);
    expect(unit.ingredientsUsageSnapshot).toBeNull();
  });

  it('completes a staff production task with a finished-product shortage result', async () => {
    const unit = new PackagingUnit(
      'unit-1',
      'batch-1',
      recipeSnapshot,
      5000,
      ['order-item-1'],
      new Date('2026-04-20T08:00:00.000Z'),
      PackagingUnitStatus.IN_PROGRESS,
    );
    const productionRepository = {
      findPackagingUnitById: jest.fn().mockResolvedValue(unit),
      updatePackagingUnit: jest.fn(async (updatedUnit) => updatedUnit),
      findOrderItemsByIds: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
    };
    const productionService = {
      checkAndCompleteBatch: jest.fn(),
    };
    const service = new StaffProductionService(
      productionService as any,
      {} as any,
      productionRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await (service as any).completeProductionTask('unit-1', {
      resultStatus: 'SHORTAGE',
      shortageG: 300,
      resultPhotoUrls: ['https://example.com/shortage.jpg'],
    });

    expect(result.status).toBe(PackagingUnitStatus.COMPLETED);
    expect(result.resultStatus).toBe('SHORTAGE');
    expect(result.shortageG).toBe(300);
    expect(result.surplusG).toBe(0);
    expect(result.actualOutputG).toBe(4700);
    expect(result.resultPhotoUrls).toEqual([
      'https://example.com/shortage.jpg',
    ]);
    expect(productionRepository.updatePackagingUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        resultStatus: 'SHORTAGE',
        shortageG: 300,
        actualOutputG: 4700,
      }),
    );
  });

  it('settles a completed batch into batch and order cost snapshots', async () => {
    const prisma = {
      productionBatch: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'batch-1',
          packagingUnits: [
            {
              id: 'unit-1',
              totalProductionG: 5000,
              actualOutputG: 4700,
              surplusG: 0,
              shortageG: 300,
              sourceOrderItemIds: ['order-item-1'],
            },
          ],
        }),
        update: jest.fn(),
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-item-1',
            orderId: 'order-1',
            quantityG: 5000,
            order: {
              id: 'order-1',
              amountTotal: 100,
              pricingBreakdownSnapshot: {
                totalProductCost: 60,
                costIngredients: 40,
                costPackaging: 10,
                costLabor: 5,
                costOverhead: 5,
              },
            },
          },
        ]),
      },
      purchaseList: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'purchase-list-1',
            records: [{ actualCost: 30 }],
          },
        ]),
      },
      productionBatchCostSettlement: {
        upsert: jest.fn().mockResolvedValue({ id: 'settlement-1' }),
      },
      orderCostSettlement: {
        upsert: jest.fn(),
      },
    };
    const inventoryService = {
      consumeAllocationsForOrderIds: jest.fn().mockResolvedValue({
        consumedAllocationCount: 1,
        ledgerEntryCount: 1,
        totalConsumedQuantityG: 1200,
        totalInventoryCost: 20,
      }),
    };
    const service = new ProductionCostSettlementService(
      prisma as any,
      inventoryService as any,
    );

    const result = await service.settleCompletedBatch('batch-1');

    expect(inventoryService.consumeAllocationsForOrderIds).toHaveBeenCalledWith(
      ['order-1'],
      'batch-1',
    );
    expect(result).toEqual(
      expect.objectContaining({
        batchId: 'batch-1',
        plannedOutputG: 5000,
        actualOutputG: 4700,
        shortageG: 300,
        purchaseCost: 30,
        inventoryCost: 20,
        totalActualCost: 50,
        suggestedRefundAmount: 6,
      }),
    );
    expect(prisma.productionBatchCostSettlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productionBatchId: 'batch-1' },
      }),
    );
    expect(prisma.orderCostSettlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orderId_productionBatchSettlementId: {
            orderId: 'order-1',
            productionBatchSettlementId: 'settlement-1',
          },
        },
        create: expect.objectContaining({
          orderId: 'order-1',
          plannedOutputG: 5000,
          actualOutputG: 4700,
          actualCost: 50,
          revenue: 100,
          actualMargin: 50,
          suggestedAdjustmentAmount: -6,
        }),
      }),
    );
  });
});
