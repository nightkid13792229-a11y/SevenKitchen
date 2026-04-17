import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  PurchaseListKind,
  PurchaseListStatus,
  type Prisma,
} from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../../infrastructure/prisma.service';

type OrderItemWithOrder = {
  id: string;
  orderId: string;
  quantityG: number;
  order: {
    id: string;
    amountTotal: unknown;
    pricingBreakdownSnapshot: unknown;
  };
};

type PackagingUnitForSettlement = {
  totalProductionG: number;
  actualOutputG: number | null;
  surplusG: number | null;
  shortageG: number | null;
  sourceOrderItemIds: string[];
};

export interface ProductionBatchSettlementResult {
  batchId: string;
  plannedOutputG: number;
  actualOutputG: number;
  surplusG: number;
  shortageG: number;
  purchaseCost: number;
  inventoryCost: number;
  lossCost: number;
  totalActualCost: number;
  suggestedRefundAmount: number;
  orderSettlementCount: number;
}

@Injectable()
export class ProductionCostSettlementService {
  private readonly logger = new Logger(ProductionCostSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async settleCompletedBatch(
    batchId: string,
  ): Promise<ProductionBatchSettlementResult> {
    const batch = await this.prisma.productionBatch.findUnique({
      where: { id: batchId },
      include: {
        packagingUnits: true,
        costSettlement: true,
      },
    });

    if (!batch) {
      throw new BadRequestException(`Production batch not found: ${batchId}`);
    }

    const units = (batch.packagingUnits || []) as PackagingUnitForSettlement[];
    if (units.length === 0) {
      throw new BadRequestException(
        `Production batch ${batchId} has no packaging units to settle`,
      );
    }

    const plannedOutputG = this.roundNumber(
      units.reduce((sum, unit) => sum + Number(unit.totalProductionG || 0), 0),
      3,
    );
    const surplusG = this.roundNumber(
      units.reduce((sum, unit) => sum + Number(unit.surplusG || 0), 0),
      3,
    );
    const shortageG = this.roundNumber(
      units.reduce((sum, unit) => sum + Number(unit.shortageG || 0), 0),
      3,
    );
    const actualOutputG = this.roundNumber(
      units.reduce(
        (sum, unit) =>
          sum +
          Number(
            unit.actualOutputG ??
              Number(unit.totalProductionG || 0) +
                Number(unit.surplusG || 0) -
                Number(unit.shortageG || 0),
          ),
        0,
      ),
      3,
    );

    const sourceOrderItemIds = Array.from(
      new Set(units.flatMap((unit) => unit.sourceOrderItemIds || [])),
    );
    const orderItems = await this.loadOrderItems(sourceOrderItemIds);
    const orders = this.groupOrderItemsByOrder(orderItems);
    const orderIds = Array.from(orders.keys());

    const inventoryResult =
      await this.inventoryService.consumeAllocationsForOrderIds(
        orderIds,
        batchId,
      );
    const inventoryCost = this.roundNumber(
      inventoryResult.totalInventoryCost,
      2,
    );
    const purchaseCost = await this.calculatePurchaseCost(orderIds);
    const totalActualCost = this.roundNumber(purchaseCost + inventoryCost, 2);
    const revenue = this.roundNumber(
      Array.from(orders.values()).reduce(
        (sum, order) => sum + order.revenue,
        0,
      ),
      2,
    );
    const suggestedRefundAmount = this.calculateShortageAdjustment(
      revenue,
      shortageG,
      plannedOutputG,
    );
    const lossCost = this.roundNumber(
      plannedOutputG > 0 ? (totalActualCost * shortageG) / plannedOutputG : 0,
      2,
    );
    const inventoryAllocationSnapshot: Prisma.InputJsonObject = {
      consumedAllocationCount: inventoryResult.consumedAllocationCount,
      ledgerEntryCount: inventoryResult.ledgerEntryCount,
      totalConsumedQuantityG: inventoryResult.totalConsumedQuantityG,
      totalInventoryCost: inventoryResult.totalInventoryCost,
    };
    const snapshot: Prisma.InputJsonObject = {
      batchId,
      plannedOutputG,
      actualOutputG,
      surplusG,
      shortageG,
      purchaseCost,
      inventoryCost,
      totalActualCost,
      lossCost,
      suggestedRefundAmount,
      inventoryAllocation: inventoryAllocationSnapshot,
      settledAt: new Date().toISOString(),
    };

    const settlement = await this.prisma.productionBatchCostSettlement.upsert({
      where: { productionBatchId: batchId },
      create: {
        productionBatchId: batchId,
        plannedOutputG,
        actualOutputG,
        surplusG,
        shortageG,
        inventoryCost,
        purchaseCost,
        lossCost,
        totalActualCost,
        suggestedRefundAmount,
        snapshot,
      },
      update: {
        plannedOutputG,
        actualOutputG,
        surplusG,
        shortageG,
        inventoryCost,
        purchaseCost,
        lossCost,
        totalActualCost,
        suggestedRefundAmount,
        snapshot,
        settledAt: new Date(),
      },
    });

    let orderSettlementCount = 0;
    for (const order of orders.values()) {
      await this.upsertOrderSettlement({
        order,
        settlementId: settlement.id,
        totalPlannedOutputG: plannedOutputG,
        totalShortageG: shortageG,
        totalActualCost,
      });
      orderSettlementCount++;
    }

    await this.prisma.productionBatch.update({
      where: { id: batchId },
      data: {
        plannedOutputG,
        actualOutputG,
        surplusG,
        shortageG,
        actualCost: totalActualCost,
        costSettlementSnapshot: snapshot,
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `Settled production batch ${batchId}: actualCost=${totalActualCost}, shortage=${shortageG}g`,
    );

    return {
      batchId,
      plannedOutputG,
      actualOutputG,
      surplusG,
      shortageG,
      purchaseCost,
      inventoryCost,
      lossCost,
      totalActualCost,
      suggestedRefundAmount,
      orderSettlementCount,
    };
  }

  private async loadOrderItems(
    sourceOrderItemIds: string[],
  ): Promise<OrderItemWithOrder[]> {
    if (sourceOrderItemIds.length === 0) {
      return [];
    }

    return this.prisma.orderItem.findMany({
      where: {
        id: {
          in: sourceOrderItemIds,
        },
      },
      include: {
        order: true,
      },
    }) as Promise<OrderItemWithOrder[]>;
  }

  private groupOrderItemsByOrder(orderItems: OrderItemWithOrder[]): Map<
    string,
    {
      orderId: string;
      plannedOutputG: number;
      estimatedCost: number;
      revenue: number;
      orderItemIds: string[];
    }
  > {
    const orders = new Map<
      string,
      {
        orderId: string;
        plannedOutputG: number;
        estimatedCost: number;
        revenue: number;
        orderItemIds: string[];
      }
    >();

    for (const item of orderItems) {
      const existing = orders.get(item.orderId);
      const plannedOutputG = Number(item.quantityG || 0);
      if (existing) {
        existing.plannedOutputG = this.roundNumber(
          existing.plannedOutputG + plannedOutputG,
          3,
        );
        existing.orderItemIds.push(item.id);
        continue;
      }

      orders.set(item.orderId, {
        orderId: item.orderId,
        plannedOutputG,
        estimatedCost: this.extractEstimatedCost(
          item.order.pricingBreakdownSnapshot,
        ),
        revenue: this.roundNumber(this.toNumber(item.order.amountTotal), 2),
        orderItemIds: [item.id],
      });
    }

    return orders;
  }

  private async calculatePurchaseCost(orderIds: string[]): Promise<number> {
    if (orderIds.length === 0) {
      return 0;
    }

    const purchaseLists = await this.prisma.purchaseList.findMany({
      where: {
        kind: PurchaseListKind.ORDER_DEMAND,
        status: PurchaseListStatus.COMPLETED,
        sourceOrderIds: {
          hasSome: orderIds,
        },
      },
      include: {
        records: true,
      },
    });

    return this.roundNumber(
      purchaseLists.reduce(
        (sum, list) =>
          sum +
          (list.records || []).reduce(
            (recordSum, record) =>
              recordSum + this.toNumber(record.actualCost),
            0,
          ),
        0,
      ),
      2,
    );
  }

  private async upsertOrderSettlement(input: {
    order: {
      orderId: string;
      plannedOutputG: number;
      estimatedCost: number;
      revenue: number;
      orderItemIds: string[];
    };
    settlementId: string;
    totalPlannedOutputG: number;
    totalShortageG: number;
    totalActualCost: number;
  }): Promise<void> {
    const share =
      input.totalPlannedOutputG > 0
        ? input.order.plannedOutputG / input.totalPlannedOutputG
        : 0;
    const shortageG = this.roundNumber(input.totalShortageG * share, 3);
    const actualOutputG = this.roundNumber(
      Math.max(input.order.plannedOutputG - shortageG, 0),
      3,
    );
    const actualCost = this.roundNumber(input.totalActualCost * share, 2);
    const actualMargin = this.roundNumber(input.order.revenue - actualCost, 2);
    const suggestedAdjustmentAmount = -this.calculateShortageAdjustment(
      input.order.revenue,
      shortageG,
      input.order.plannedOutputG,
    );
    const snapshot: Prisma.InputJsonObject = {
      orderId: input.order.orderId,
      orderItemIds: input.order.orderItemIds,
      share,
      plannedOutputG: input.order.plannedOutputG,
      actualOutputG,
      shortageG,
      actualCost,
      revenue: input.order.revenue,
      actualMargin,
      suggestedAdjustmentAmount,
    };

    await this.prisma.orderCostSettlement.upsert({
      where: {
        orderId_productionBatchSettlementId: {
          orderId: input.order.orderId,
          productionBatchSettlementId: input.settlementId,
        },
      },
      create: {
        orderId: input.order.orderId,
        productionBatchSettlementId: input.settlementId,
        plannedOutputG: input.order.plannedOutputG,
        actualOutputG,
        shortageG,
        estimatedCost: input.order.estimatedCost,
        actualCost,
        revenue: input.order.revenue,
        actualMargin,
        suggestedAdjustmentAmount,
        requiresCustomerPayment: suggestedAdjustmentAmount > 0,
        snapshot,
      },
      update: {
        plannedOutputG: input.order.plannedOutputG,
        actualOutputG,
        shortageG,
        estimatedCost: input.order.estimatedCost,
        actualCost,
        revenue: input.order.revenue,
        actualMargin,
        suggestedAdjustmentAmount,
        requiresCustomerPayment: suggestedAdjustmentAmount > 0,
        snapshot,
      },
    });
  }

  private extractEstimatedCost(snapshot: unknown): number {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return 0;
    }

    const record = snapshot as Record<string, unknown>;
    const totalProductCost = this.toNumber(record.totalProductCost);
    if (totalProductCost > 0) {
      return this.roundNumber(totalProductCost, 2);
    }

    return this.roundNumber(
      this.toNumber(record.costIngredients) +
        this.toNumber(record.costPackaging) +
        this.toNumber(record.costLabor) +
        this.toNumber(record.costOverhead),
      2,
    );
  }

  private calculateShortageAdjustment(
    baseAmount: number,
    shortageG: number,
    plannedOutputG: number,
  ): number {
    if (baseAmount <= 0 || shortageG <= 0 || plannedOutputG <= 0) {
      return 0;
    }

    return this.roundNumber((baseAmount * shortageG) / plannedOutputG, 2);
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private roundNumber(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }
}
