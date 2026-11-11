/**
 * Inventory Service
 * Maintains inventory as an append-only ledger and exposes
 * operational workflows such as manual adjustments and stocktakes.
 */

import {
  Injectable,
  Inject,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import type { InventoryRepository } from '../../domain/inventory/inventory.repository';
import {
  InventoryAdjustment,
  InventoryAdjustmentCategory,
  InventoryAdjustmentMode,
  InventoryAdjustmentReviewStatus,
  InventoryLedgerEntry,
  InventorySourceType,
  InventoryStocktake,
  InventoryStocktakeLine,
  InventoryStocktakeStatus,
} from '../../domain/inventory';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import { assertRejectNote, canEdit, isWithinTolerance } from './stocktake-rules';
import { PackagingUnitStatus } from '../../domain/production/enums';
import { PRODUCTION_BATCH_REPOSITORY } from '../production/production.service';
export interface PurchaseInboundRecord {
  id: string;
  ingredientId: string;
  actualBaseQuantity?: number | { toString(): string } | null;
  procurementSkuId?: string | null;
  inboundVersion?: number | null;
}

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');

export interface InventoryLedgerQueryDto {
  ingredientId?: string;
  limit?: number;
}

export interface InventoryLedgerItemDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
  procurementSkuId?: string | null;
  procurementSkuName?: string | null;
  deltaG: number;
  stockUnitLabel: string;
  sourceType: InventorySourceType;
  sourceId: string;
  sourceLabel: string;
  sourceDescription: string | null;
  quantityBeforeG: number | null;
  quantityAfterG: number | null;
  expectedQuantityG: number | null;
  countedQuantityG: number | null;
  createdAt: string;
}

export interface CreateInventoryAdjustmentDto {
  ingredientId: string;
  procurementSkuId?: string;
  adjustmentMode: InventoryAdjustmentMode;
  quantity: number;
  reason: string;
  note?: string | null;
  /** 报废/领用分类；不传 = 后台普通调整，不进复核 */
  category?: InventoryAdjustmentCategory;
}

export interface InventoryAdjustmentDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
  procurementSkuId?: string | null;
  stockUnitLabel: string;
  adjustmentMode: InventoryAdjustmentMode;
  quantityBeforeG: number;
  quantityAfterG: number;
  deltaG: number;
  reason: string;
  note: string | null;
  category: InventoryAdjustmentCategory;
  reviewStatus: InventoryAdjustmentReviewStatus;
  costAmount: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  reversesAdjustmentId: string | null;
  createdAt: string;
}

export interface CreateInventoryStocktakeLineDto {
  ingredientId: string;
  procurementSkuId?: string;
  /** null / 省略 = 未盘，不生成流水 */
  countedQuantityG?: number | null;
}

export interface CreateInventoryStocktakeDto {
  note?: string | null;
  lines: CreateInventoryStocktakeLineDto[];
}

export interface InventoryStocktakePortionDto {
  id: string;
  lineId: string;
  procurementSkuId: string | null;
  procurementSkuName: string | null;
  /** 品牌：商品有则用商品的，没有则回退原料档案 */
  brand: string | null;
  /** 采购渠道：商品有则用商品的，没有则回退原料档案 */
  purchaseChannel: string | null;
  locationLabel: string | null;
  countedQuantityG: number | null;
  isCounted: boolean;
}

export interface InventoryStocktakeLineDto {
  id: string;
  ingredientId: string;
  procurementSkuId?: string | null;
  procurementSkuName?: string | null;
  ingredientName: string;
  ingredientType?: string | null;
  stockUnitLabel: string;
  /** 原料档案上的品牌/规格/渠道：补剂、包材没有商品层，靠它们描述 */
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  expectedQuantityG: number;
  countedQuantityG: number | null;
  deltaG: number | null;
  isCounted: boolean;
  countedAt: string | null;
  withinTolerance: boolean | null;
  /** 明细点：食材按商品/位置拆开录入；汇总结果写回本行的 countedQuantityG */
  portions: InventoryStocktakePortionDto[];
}

export interface StocktakePortionDraft {
  /** 已有的点：传 id + 实盘；remove=true 表示删掉这个点 */
  id: string;
  countedQuantityG?: number | null;
  /** 位置/批次，可选；传了才更新 */
  locationLabel?: string | null;
  remove?: boolean;
}

export interface StocktakeNewPortionDraft {
  lineId: string;
  procurementSkuId?: string | null;
  locationLabel?: string | null;
}

export interface InventoryStocktakeDto {
  id: string;
  type: 'OPENING' | 'ROUTINE';
  status: InventoryStocktakeStatus;
  createdBy: string | null;
  note: string | null;
  createdAt: string;
  appliedAt: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  lineCount: number;
  varianceCount: number;
  totalAbsDeltaG: number;
  lines: InventoryStocktakeLineDto[];
}

export interface InventoryAvailabilitySnapshot {
  ingredientId: string;
  onHandQuantityG: number;
  allocatedQuantityG: number;
  /** 可用 = 现存 − 已占用；**不减在途** */
  availableQuantityG: number;
  /** 已下单未到货（只减"还差多少要买"，不减可用） */
  inTransitQuantityG: number;
}

export interface ProcurementSkuInventoryBalance {
  currentStock: number;
  hasLedger: boolean;
}

export interface CreateInventoryAllocationDto {
  targetDate: Date;
  purchaseListId?: string | null;
  sourceOrderIds: string[];
  createdById?: string | null;
  lines: Array<{
    ingredientId: string;
    procurementSkuId?: string | null;
    quantityG: number;
  }>;
}

export interface ConsumeInventoryAllocationResult {
  consumedAllocationCount: number;
  ledgerEntryCount: number;
  totalConsumedQuantityG: number;
  totalInventoryCost: number;
}

export interface RecordProductionSurplusLineDto {
  ingredientId: string;
  procurementSkuId?: string | null;
  quantityG: number;
  costAmount?: number;
}

type IngredientStockMeta = {
  id: string;
  name: string;
  baseUnit: string;
  unitDisplayLabel: string | null;
};

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventoryRepository: InventoryRepository,
    @Inject(PRODUCTION_BATCH_REPOSITORY)
    private readonly productionRepository: ProductionBatchRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Deduct inventory from a completed kitchen task.
   * Must be idempotent: same PackagingUnit cannot deduct twice.
   */
  async deductFromKitchenTask(packagingUnitId: string): Promise<void> {
    const unit =
      await this.productionRepository.findPackagingUnitById(packagingUnitId);
    if (!unit) {
      throw new BadRequestException(
        `PackagingUnit not found: ${packagingUnitId}`,
      );
    }

    if (unit.status !== PackagingUnitStatus.COMPLETED) {
      throw new BadRequestException(
        `Cannot deduct inventory: PackagingUnit status is ${unit.status}, must be COMPLETED`,
      );
    }

    if (!unit.ingredientsUsageSnapshot) {
      throw new BadRequestException(
        `Cannot deduct inventory: ingredientsUsageSnapshot is missing for PackagingUnit ${packagingUnitId}`,
      );
    }

    const snapshot = unit.ingredientsUsageSnapshot;
    const ingredientIds = Object.keys(snapshot);

    for (const ingredientId of ingredientIds) {
      const exists = await this.inventoryRepository.existsBySourceAndIngredient(
        InventorySourceType.KITCHEN_TASK,
        packagingUnitId,
        ingredientId,
      );

      if (exists) {
        this.logger.warn(
          `Inventory deduction already exists for PackagingUnit ${packagingUnitId}, ingredient ${ingredientId}. Skipping.`,
        );
        return;
      }
    }

    const ledgerEntries: InventoryLedgerEntry[] = [];

    for (const [ingredientId, usage] of Object.entries(snapshot)) {
      if (usage.actual_g <= 0) {
        this.logger.warn(
          `Skipping ingredient ${ingredientId}: actual_g is ${usage.actual_g} (must be positive)`,
        );
        continue;
      }

      ledgerEntries.push(
        new InventoryLedgerEntry(
          randomUUID(),
          ingredientId,
          -usage.actual_g,
          InventorySourceType.KITCHEN_TASK,
          packagingUnitId,
          new Date(),
        ),
      );
    }

    if (ledgerEntries.length === 0) {
      this.logger.warn(
        `No valid ledger entries to create for PackagingUnit ${packagingUnitId}`,
      );
      return;
    }

    try {
      await this.inventoryRepository.recordEntries(ledgerEntries);
      this.logger.log(
        `Successfully deducted inventory for PackagingUnit ${packagingUnitId}: ${ledgerEntries.length} entries`,
      );
    } catch (error: any) {
      if (
        error.code === 'P2002' ||
        error.message?.includes('Unique constraint')
      ) {
        this.logger.warn(
          `Unique constraint violation for PackagingUnit ${packagingUnitId}. Deduction may already exist.`,
        );
        return;
      }
      throw error;
    }
  }

  /**
   * Inbound inventory from purchase records.
   * Uses actualBaseQuantity as the canonical warehouse delta.
   */
  async inboundFromPurchaseRecords(
    purchaseRecords: PurchaseInboundRecord[],
    tx?: Prisma.TransactionClient,
  ): Promise<{ createdCount: number; skippedCount: number }> {
    if (purchaseRecords.length === 0) {
      return { createdCount: 0, skippedCount: 0 };
    }

    const run = async (client: Prisma.TransactionClient) => {
      let skippedCount = 0;
      const rows: any[] = [];
      const versions: Array<{ id: string; version: number }> = [];

      for (const record of purchaseRecords) {
        const baseQuantity = Number(record.actualBaseQuantity || 0);
        if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) {
          this.logger.warn(
            `Skipping purchase record ${record.id}: actualBaseQuantity is ${record.actualBaseQuantity}`,
          );
          skippedCount++;
          continue;
        }

        // 同一采购记录的第几次入库：撤回不递减，再完成时 +1。
        const version = Number(record.inboundVersion ?? 0) + 1;
        const exists = await client.inventoryLedgerEntry.count({
          where: {
            sourceType: InventorySourceType.PURCHASE_RECORD as any,
            sourceId: record.id,
            sourceVersion: version,
            ingredientId: record.ingredientId,
          },
        });

        if (exists > 0) {
          skippedCount++;
          continue;
        }

        rows.push({
          id: randomUUID(),
          ingredientId: record.ingredientId,
          deltaG: baseQuantity,
          procurementSkuId: record.procurementSkuId ?? null,
          sourceType: InventorySourceType.PURCHASE_RECORD as any,
          sourceId: record.id,
          sourceVersion: version,
          costAmount: null,
          createdAt: new Date(),
        });
        versions.push({ id: record.id, version });
      }

      const result = rows.length
        ? await client.inventoryLedgerEntry.createMany({
            data: rows,
            skipDuplicates: true,
          })
        : { count: 0 };

      for (const item of versions) {
        await client.purchaseRecord.update({
          where: { id: item.id },
          data: { inboundVersion: item.version },
        });
      }

      if (result.count > 0) {
        this.logger.log(
          `Successfully inbounded ${result.count} purchase records into inventory`,
        );
      }

      return { createdCount: result.count, skippedCount };
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * 撤回采购完成：按"当前版本"的入库流水写等量负数冲红，不删历史。
   * 金额从原流水读，不能用采购记录上的当前数量（撤回后可能被改过）。
   */
  async reversePurchaseRecordInboundsForPurchaseList(
    purchaseRecords: PurchaseInboundRecord[],
    tx?: Prisma.TransactionClient,
  ): Promise<{ reversedCount: number }> {
    const run = async (client: Prisma.TransactionClient) => {
      let reversedCount = 0;

      for (const record of purchaseRecords) {
        const version = Number(record.inboundVersion ?? 0);
        if (!version) {
          continue;
        }

        const originals = await client.inventoryLedgerEntry.findMany({
          where: {
            sourceType: InventorySourceType.PURCHASE_RECORD as any,
            sourceId: record.id,
            sourceVersion: version,
          },
        });

        if (originals.length === 0) {
          this.logger.warn(
            `Cannot reverse purchase record ${record.id}: no inbound entries at version ${version}`,
          );
          continue;
        }

        const rows = originals.map((entry) => ({
          id: randomUUID(),
          ingredientId: entry.ingredientId,
          deltaG: -Math.abs(Number(entry.deltaG)),
          procurementSkuId: entry.procurementSkuId,
          sourceType: InventorySourceType.PURCHASE_RECORD_REVERSAL as any,
          sourceId: record.id,
          sourceVersion: version,
          costAmount:
            entry.costAmount === null
              ? null
              : -Math.abs(Number(entry.costAmount)),
          createdAt: new Date(),
        }));

        const result = await client.inventoryLedgerEntry.createMany({
          data: rows,
          skipDuplicates: true,
        });
        reversedCount += result.count;
      }

      return { reversedCount };
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * 已完工但未成功扣料的锅次（B2）：给后台"补扣"用。
   */
  async listUndeductedUnits(params: { from?: Date; to?: Date } = {}) {
    const completedAt: Record<string, Date> = {};
    if (params.from) completedAt.gte = params.from;
    if (params.to) completedAt.lte = params.to;

    const rows = await this.prisma.packagingUnit.findMany({
      where: {
        status: 'COMPLETED' as any,
        inventoryDeductedAt: null,
        ...(Object.keys(completedAt).length > 0 ? { completedAt } : {}),
      },
      orderBy: { completedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        productionBatchId: true,
        completedAt: true,
        completedBy: true,
        inventoryDeductionError: true,
        totalProductionG: true,
        ingredientsUsageSnapshot: true,
      },
    });

    return rows
      .filter((row) => row.ingredientsUsageSnapshot !== null)
      .map(({ ingredientsUsageSnapshot, ...rest }) => rest);
  }

  /**
   * Get current inventory balance for an ingredient (SUM(delta_g)).
   */
  async getBalanceByIngredient(ingredientId: string): Promise<number> {
    return this.inventoryRepository.getCurrentBalanceByIngredient(ingredientId);
  }

  async getProcurementSkuInventoryBalances(
    procurementSkuIds: string[],
  ): Promise<Map<string, ProcurementSkuInventoryBalance>> {
    const uniqueIds = Array.from(new Set(procurementSkuIds.filter(Boolean)));
    const result = new Map<string, ProcurementSkuInventoryBalance>();

    for (const procurementSkuId of uniqueIds) {
      result.set(procurementSkuId, {
        currentStock: 0,
        hasLedger: false,
      });
    }

    if (uniqueIds.length === 0) {
      return result;
    }

    const grouped = await this.prisma.inventoryLedgerEntry.groupBy({
      by: ['procurementSkuId'],
      where: {
        procurementSkuId: {
          in: uniqueIds,
        },
      },
      _sum: {
        deltaG: true,
      },
      _count: {
        _all: true,
      },
    });

    for (const row of grouped) {
      if (!row.procurementSkuId) continue;

      result.set(row.procurementSkuId, {
        currentStock: row._sum.deltaG ?? 0,
        hasLedger: row._count._all > 0,
      });
    }

    return result;
  }

  /**
   * Get stock availability for purchase planning.
   * Physical stock comes from ledger balances; allocation is a logical claim
   * that keeps the same stock from being assigned to multiple orders.
   */
  async getAvailabilityByIngredientIds(
    ingredientIds: string[],
    dateRange?: { start: Date; end: Date },
    excludePurchaseListId?: string,
  ): Promise<Map<string, InventoryAvailabilitySnapshot>> {
    const uniqueIds = Array.from(new Set(ingredientIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const [balances, allocationLines, inTransitMap] = await Promise.all([
      Promise.all(
        uniqueIds.map(
          async (ingredientId) =>
            [
              ingredientId,
              await this.getBalanceByIngredient(ingredientId),
            ] as const,
        ),
      ),
      this.prisma.inventoryAllocationLine.groupBy({
        by: ['ingredientId'],
        where: {
          ingredientId: {
            in: uniqueIds,
          },
          allocation: {
            status: 'ACTIVE',
          },
        },
        _sum: {
          quantityG: true,
        },
      }),
      this.getInTransitByIngredientIds(
        uniqueIds,
        dateRange,
        excludePurchaseListId,
      ),
    ]);

    const balanceMap = new Map(balances);
    const allocatedMap = new Map(
      allocationLines.map((item: any) => [
        item.ingredientId,
        Number(item._sum.quantityG ?? 0),
      ]),
    );

    return new Map(
      uniqueIds.map((ingredientId) => {
        const onHandQuantityG = Number(balanceMap.get(ingredientId) ?? 0);
        const allocatedQuantityG = Number(allocatedMap.get(ingredientId) ?? 0);

        return [
          ingredientId,
          {
            ingredientId,
            onHandQuantityG,
            allocatedQuantityG,
            availableQuantityG: Math.max(
              onHandQuantityG - allocatedQuantityG,
              0,
            ),
            inTransitQuantityG: Number(inTransitMap.get(ingredientId) ?? 0),
          },
        ];
      }),
    );
  }

  /**
   * 在途 = 目标日期内、状态 PENDING 的订单需求采购单里"还没买到的部分"。
   * COMPLETED 不算（已经进 onHand）；作废单不算。
   */
  async getInTransitByIngredientIds(
    ingredientIds: string[],
    dateRange?: { start: Date; end: Date },
    excludePurchaseListId?: string,
    includeReplenishment = false,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (!dateRange || ingredientIds.length === 0) {
      return result;
    }

    const items = await this.prisma.purchaseItem.findMany({
      where: {
        ingredientId: { in: ingredientIds },
        purchaseList: {
          status: 'PENDING' as any,
          kind: includeReplenishment
            ? { in: ['ORDER_DEMAND', 'STOCK_REPLENISHMENT'] as any }
            : ('ORDER_DEMAND' as any),
          targetDate: { gte: dateRange.start, lte: dateRange.end },
          ...(excludePurchaseListId
            ? { id: { not: excludePurchaseListId } }
            : {}),
        },
      },
      select: {
        ingredientId: true,
        procurementSkuId: true,
        purchaseShortageQuantity: true,
        quantityNeeded: true,
        ingredient: { select: { purchaseToBaseRatio: true } },
      },
    });
    if (items.length === 0) return result;

    const skuIds = Array.from(
      new Set(
        items
          .map((item) => item.procurementSkuId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const skus = skuIds.length
      ? await this.prisma.procurementSku.findMany({
          where: { id: { in: skuIds } },
          select: { id: true, purchaseToBaseRatio: true },
        })
      : [];
    const skuMap = new Map(
      skus.map((sku) => [sku.id, Number(sku.purchaseToBaseRatio ?? 0)]),
    );

    for (const item of items) {
      // 订单需求单写 shortage；补货单不写 shortage，退回用 quantityNeeded。
      const pendingQuantity =
        item.purchaseShortageQuantity !== null &&
        item.purchaseShortageQuantity !== undefined
          ? Number(item.purchaseShortageQuantity)
          : Number(item.quantityNeeded ?? 0);
      if (!Number.isFinite(pendingQuantity) || pendingQuantity <= 0) continue;
      const ratio =
        skuMap.get(item.procurementSkuId ?? '') ??
        Number(item.ingredient?.purchaseToBaseRatio ?? 1);
      const baseQuantity = pendingQuantity * (ratio > 0 ? ratio : 1);
      result.set(
        item.ingredientId,
        (result.get(item.ingredientId) ?? 0) + baseQuantity,
      );
    }

    return result;
  }

  /**
   * 补货在途 = 已下单、还没确认到货的补货记录里，各原料的已购数量（基准单位）。
   * 和 getInTransitByIngredientIds（日采待买）是两个口径，不能相加。
   */
  async getReplenishmentInTransitByIngredientIds(
    ingredientIds: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (ingredientIds.length === 0) {
      return result;
    }

    const rows = await this.prisma.purchaseRecord.findMany({
      where: {
        ingredientId: { in: ingredientIds },
        purchaseList: {
          kind: 'STOCK_REPLENISHMENT' as any,
          isDraft: false,
          arrivedAt: null,
          voidedAt: null,
        },
      },
      select: { ingredientId: true, actualBaseQuantity: true },
    });

    for (const row of rows) {
      const quantity = Number(row.actualBaseQuantity ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        continue;
      }
      result.set(
        row.ingredientId,
        (result.get(row.ingredientId) ?? 0) + quantity,
      );
    }

    return result;
  }

  async createAllocationForOrderDemand(
    dto: CreateInventoryAllocationDto,
  ): Promise<{ id: string }> {
    if (Number.isNaN(dto.targetDate.getTime())) {
      throw new BadRequestException('targetDate must be valid');
    }

    const validLines = dto.lines
      .filter((line) => Number.isFinite(line.quantityG) && line.quantityG > 0)
      .map((line) => ({
        id: randomUUID(),
        ingredientId: line.ingredientId,
        procurementSkuId: line.procurementSkuId ?? null,
        quantityG: Number(line.quantityG.toFixed(3)),
        createdAt: new Date(),
      }));

    if (validLines.length === 0) {
      throw new BadRequestException('库存分配至少需要一条有效明细');
    }

    return this.prisma.$transaction(async (tx) => {
      const allocation = await tx.inventoryAllocation.create({
        data: {
          targetDate: dto.targetDate,
          purchaseListId: dto.purchaseListId ?? null,
          sourceOrderIds: dto.sourceOrderIds,
          createdById: dto.createdById ?? null,
          status: 'ACTIVE',
        },
        select: {
          id: true,
        },
      });

      await tx.inventoryAllocationLine.createMany({
        data: validLines.map((line) => ({
          ...line,
          allocationId: allocation.id,
        })),
      });

      return allocation;
    });
  }

  async releaseAllocationsForPurchaseList(
    purchaseListId: string,
  ): Promise<void> {
    await this.prisma.inventoryAllocation.updateMany({
      where: {
        purchaseListId,
        status: 'ACTIVE',
      },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
      },
    });
  }

  async consumeAllocationsForOrderIds(
    orderIds: string[],
    _batchId: string,
  ): Promise<ConsumeInventoryAllocationResult> {
    const uniqueOrderIds = Array.from(new Set(orderIds.filter(Boolean)));
    if (uniqueOrderIds.length === 0) {
      return {
        consumedAllocationCount: 0,
        ledgerEntryCount: 0,
        totalConsumedQuantityG: 0,
        totalInventoryCost: 0,
      };
    }

    return this.prisma.$transaction(async (tx) => {
      const allocations = await tx.inventoryAllocation.findMany({
        where: {
          status: 'ACTIVE',
          sourceOrderIds: {
            hasSome: uniqueOrderIds,
          },
        },
        include: {
          lines: true,
        },
      });

      const now = new Date();
      const allocationIds = allocations.map((allocation: any) => allocation.id);

      if (allocationIds.length > 0) {
        await tx.inventoryAllocation.updateMany({
          where: {
            id: {
              in: allocationIds,
            },
            status: 'ACTIVE',
          },
          data: {
            status: 'CONSUMED',
            consumedAt: now,
          },
        });
      }

      // 预占只负责"占用"：消耗时只改状态，不再写第二笔扣减。
      // 汇总数仍按预占行算，供成本快照展示。
      const totalConsumedQuantityG = this.roundNumber(
        allocations
          .flatMap((allocation: any) => allocation.lines || [])
          .reduce(
            (sum: number, line: any) =>
              sum + Math.abs(Number(line.quantityG || 0)),
            0,
          ),
        3,
      );

      return {
        consumedAllocationCount: allocationIds.length,
        ledgerEntryCount: 0,
        totalConsumedQuantityG,
        totalInventoryCost: 0,
      };
    });
  }

  async recordProductionSurplus(
    batchId: string,
    lines: RecordProductionSurplusLineDto[],
  ): Promise<{ ledgerEntryCount: number; totalSurplusQuantityG: number }> {
    const validLines = lines
      .filter((line) => Number.isFinite(line.quantityG) && line.quantityG > 0)
      .map((line) => ({
        id: randomUUID(),
        ingredientId: line.ingredientId,
        deltaG: this.roundNumber(line.quantityG, 3),
        procurementSkuId: line.procurementSkuId ?? null,
        sourceType: InventorySourceType.PRODUCTION_SURPLUS as any,
        sourceId: batchId,
        costAmount: this.roundNumber(Number(line.costAmount || 0), 2),
        createdAt: new Date(),
      }));

    if (validLines.length === 0) {
      return { ledgerEntryCount: 0, totalSurplusQuantityG: 0 };
    }

    await this.prisma.inventoryLedgerEntry.createMany({
      data: validLines,
      skipDuplicates: true,
    });

    return {
      ledgerEntryCount: validLines.length,
      totalSurplusQuantityG: this.roundNumber(
        validLines.reduce((sum, line) => sum + line.deltaG, 0),
        3,
      ),
    };
  }

  /**
   * Get all ledger entries for a PackagingUnit (for debugging/audit).
   */
  async getEntriesByPackagingUnit(
    packagingUnitId: string,
  ): Promise<InventoryLedgerEntry[]> {
    return this.inventoryRepository.findBySource(
      InventorySourceType.KITCHEN_TASK,
      packagingUnitId,
    );
  }

  /**
   * Query recent ledger entries for inventory audit.
   */
  async listLedgerEntries(
    query: InventoryLedgerQueryDto,
  ): Promise<InventoryLedgerItemDto[]> {
    const limit = this.normalizeLimit(query.limit);
    const entries = await this.prisma.inventoryLedgerEntry.findMany({
      where: query.ingredientId
        ? {
            ingredientId: query.ingredientId,
          }
        : undefined,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    if (entries.length === 0) {
      return [];
    }

    const ingredientIds = Array.from(new Set(entries.map((entry) => entry.ingredientId)));
    const ingredients = await this.getIngredientMetaMap(ingredientIds);

    const manualSourceIds = Array.from(
      new Set(
        entries
          .filter(
            (entry) =>
              entry.sourceType === InventorySourceType.MANUAL_ADJUSTMENT,
          )
          .map((entry) => entry.sourceId),
      ),
    );
    const stocktakeSourceIds = Array.from(
      new Set(
        entries
          .filter((entry) => entry.sourceType === InventorySourceType.STOCKTAKE)
          .map((entry) => entry.sourceId),
      ),
    );
    const purchaseRecordSourceIds = Array.from(
      new Set(
        entries
          .filter(
            (entry) => entry.sourceType === InventorySourceType.PURCHASE_RECORD,
          )
          .map((entry) => entry.sourceId),
      ),
    );
    const procurementSkuIds = Array.from(
      new Set(
        entries
          .map((entry) => entry.procurementSkuId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [adjustments, stocktakeLines, purchaseRecords, procurementSkus] =
      await Promise.all([
      manualSourceIds.length > 0
        ? this.prisma.inventoryAdjustment.findMany({
            where: {
              id: {
                in: manualSourceIds,
              },
            },
          })
        : Promise.resolve([]),
      stocktakeSourceIds.length > 0
        ? this.prisma.inventoryStocktakeLine.findMany({
            where: {
              stocktakeId: {
                in: stocktakeSourceIds,
              },
              ingredientId: {
                in: ingredientIds,
              },
            },
            include: {
              stocktake: true,
            },
          })
        : Promise.resolve([]),
      purchaseRecordSourceIds.length > 0
        ? this.prisma.purchaseRecord.findMany({
            where: {
              id: {
                in: purchaseRecordSourceIds,
              },
            },
            select: {
              id: true,
              procurementSkuId: true,
              procurementSkuName: true,
              purchaseChannel: true,
              productModel: true,
            },
          })
        : Promise.resolve([]),
      procurementSkuIds.length > 0
        ? this.prisma.procurementSku.findMany({
            where: {
              id: {
                in: procurementSkuIds,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const adjustmentMap = new Map(adjustments.map((item) => [item.id, item]));
    const stocktakeLineMap = new Map(
      stocktakeLines.map((item) => [
        `${item.stocktakeId}:${item.ingredientId}`,
        item,
      ]),
    );
    const purchaseRecordMap = new Map(
      purchaseRecords.map((item) => [item.id, item]),
    );
    const procurementSkuMap = new Map(
      procurementSkus.map((item) => [item.id, item]),
    );

    return entries.map((entry) => {
      const ingredient = ingredients.get(entry.ingredientId);
      const adjustment =
        entry.sourceType === InventorySourceType.MANUAL_ADJUSTMENT
          ? adjustmentMap.get(entry.sourceId)
          : null;
      const stocktakeLine =
        entry.sourceType === InventorySourceType.STOCKTAKE
          ? stocktakeLineMap.get(`${entry.sourceId}:${entry.ingredientId}`)
          : null;
      const purchaseRecord =
        entry.sourceType === InventorySourceType.PURCHASE_RECORD
          ? purchaseRecordMap.get(entry.sourceId)
          : null;

      return {
        id: entry.id,
        ingredientId: entry.ingredientId,
        ingredientName: ingredient?.name ?? entry.ingredientId,
        procurementSkuId:
          entry.procurementSkuId ??
          purchaseRecord?.procurementSkuId ??
          null,
        procurementSkuName:
          purchaseRecord?.procurementSkuName ??
          (entry.procurementSkuId
            ? procurementSkuMap.get(entry.procurementSkuId)?.name ?? null
            : null),
        deltaG: entry.deltaG,
        stockUnitLabel: this.resolveStockUnitLabel(ingredient),
        sourceType: entry.sourceType as InventorySourceType,
        sourceId: entry.sourceId,
        sourceLabel: this.resolveSourceLabel(entry.sourceType as InventorySourceType),
        sourceDescription: this.resolveSourceDescription(
          entry.sourceType as InventorySourceType,
          adjustment,
          stocktakeLine,
          purchaseRecord,
        ),
        quantityBeforeG: adjustment?.quantityBeforeG ?? null,
        quantityAfterG: adjustment?.quantityAfterG ?? null,
        expectedQuantityG: stocktakeLine?.expectedQuantityG ?? null,
        countedQuantityG: stocktakeLine?.countedQuantityG ?? null,
        createdAt: entry.createdAt.toISOString(),
      };
    });
  }

  /**
   * Create and apply a manual inventory adjustment.
   */
  async createManualAdjustment(
    dto: CreateInventoryAdjustmentDto,
    createdBy?: string,
  ): Promise<InventoryAdjustmentDto> {
    if (!dto.ingredientId?.trim()) {
      throw new BadRequestException('ingredientId is required');
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('reason is required');
    }
    if (
      dto.adjustmentMode !== InventoryAdjustmentMode.DELTA &&
      dto.adjustmentMode !== InventoryAdjustmentMode.SET
    ) {
      throw new BadRequestException('invalid adjustmentMode');
    }

    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: dto.ingredientId },
      select: {
        id: true,
        name: true,
        baseUnit: true,
        unitDisplayLabel: true,
        purchaseToBaseRatio: true,
        currentPricePerPurchaseUnit: true,
      },
    });
    if (!ingredient) {
      throw new NotFoundException(`Ingredient not found: ${dto.ingredientId}`);
    }
    if (!Number.isFinite(dto.quantity)) {
      throw new BadRequestException('quantity must be a finite number');
    }

    const currentBalance = await this.getBalanceByIngredient(dto.ingredientId);
    const procurementSkuId = dto.procurementSkuId?.trim() || null;
    const reason = dto.reason.trim();
    const note = dto.note?.trim() || null;
    const deltaG =
      dto.adjustmentMode === InventoryAdjustmentMode.SET
        ? dto.quantity - currentBalance
        : dto.quantity;
    const quantityAfterG = currentBalance + deltaG;

    if (dto.quantity < 0 && dto.adjustmentMode === InventoryAdjustmentMode.SET) {
      throw new BadRequestException('quantity cannot be negative in SET mode');
    }

    // 报废/领用是物理已发生的事实：允许账面变负，首页会标红进"待核实"。
    const ratio = Number((ingredient as any).purchaseToBaseRatio ?? 0);
    const price = Number(
      (ingredient as any).currentPricePerPurchaseUnit ?? 0,
    );
    const category = dto.category ?? InventoryAdjustmentCategory.OTHER;
    const costAmount =
      deltaG < 0 && ratio > 0 && price > 0
        ? this.roundNumber((Math.abs(deltaG) / ratio) * price, 2)
        : null;
    const isScrap = dto.category !== undefined;
    const reviewStatus =
      isScrap &&
      category !== InventoryAdjustmentCategory.INTERNAL_USE &&
      (costAmount === null || costAmount >= 50)
        ? InventoryAdjustmentReviewStatus.PENDING
        : InventoryAdjustmentReviewStatus.NONE;

    const adjustment = new InventoryAdjustment(
      randomUUID(),
      dto.ingredientId,
      procurementSkuId,
      dto.adjustmentMode,
      currentBalance,
      quantityAfterG,
      deltaG,
      reason,
      note,
      new Date(),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryAdjustment.create({
        data: {
          id: adjustment.id,
          ingredientId: adjustment.ingredientId,
          procurementSkuId: adjustment.procurementSkuId,
          adjustmentMode: adjustment.adjustmentMode as any,
          quantityBeforeG: adjustment.quantityBeforeG,
          quantityAfterG: adjustment.quantityAfterG,
          deltaG: adjustment.deltaG,
          reason: adjustment.reason,
          note: adjustment.note,
          category: category as any,
          reviewStatus: reviewStatus as any,
          costAmount,
          createdBy: createdBy ?? null,
          createdAt: adjustment.createdAt,
        },
      });
      await tx.inventoryLedgerEntry.create({
        data: {
          id: randomUUID(),
          ingredientId: adjustment.ingredientId,
          procurementSkuId: adjustment.procurementSkuId,
          deltaG: adjustment.deltaG,
          sourceType: InventorySourceType.MANUAL_ADJUSTMENT as any,
          sourceId: adjustment.id,
          createdAt: adjustment.createdAt,
        },
      });
    });

    return {
      id: adjustment.id,
      ingredientId: adjustment.ingredientId,
      ingredientName: ingredient.name,
      procurementSkuId: adjustment.procurementSkuId,
      stockUnitLabel: this.resolveStockUnitLabel(ingredient as any),
      adjustmentMode: adjustment.adjustmentMode,
      quantityBeforeG: adjustment.quantityBeforeG,
      quantityAfterG: adjustment.quantityAfterG,
      deltaG: adjustment.deltaG,
      reason: adjustment.reason,
      note: adjustment.note,
      category,
      reviewStatus,
      costAmount,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      reversesAdjustmentId: null,
      createdAt: adjustment.createdAt.toISOString(),
    };
  }

  /**
   * 报废复核：通过不动账；驳回写一笔反向调整，把已扣的加回来。
   */
  async reviewAdjustment(
    id: string,
    input: { approve: boolean; note?: string | null },
    reviewerId: string,
  ) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
    });
    if (!adjustment) {
      throw new NotFoundException(`Adjustment not found: ${id}`);
    }
    if (adjustment.reviewStatus === 'APPROVED' && input.approve) {
      return this.getAdjustmentDto(id);
    }
    if (adjustment.reviewStatus !== 'PENDING') {
      throw new ConflictException('这条报废不在待复核状态');
    }
    if (!input.approve && !input.note?.trim()) {
      throw new BadRequestException('驳回必须填写原因');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const transition = await tx.inventoryAdjustment.updateMany({
        where: { id, reviewStatus: 'PENDING' as any },
        data: {
          reviewStatus: (input.approve ? 'APPROVED' : 'REJECTED') as any,
          reviewedBy: reviewerId,
          reviewedAt: now,
          reviewNote: input.note ?? null,
        },
      });
      if (transition.count === 0) {
        throw new ConflictException('这条报废已被处理，请刷新');
      }
      if (input.approve) return;

      const existing = await tx.inventoryAdjustment.findFirst({
        where: { reversesAdjustmentId: id },
        select: { id: true },
      });
      if (existing) return;

      const balance = await tx.inventoryLedgerEntry.aggregate({
        where: { ingredientId: adjustment.ingredientId },
        _sum: { deltaG: true },
      });
      const before = Number(balance._sum?.deltaG ?? 0);
      const delta = -Number(adjustment.deltaG);
      const reversalId = randomUUID();

      await tx.inventoryAdjustment.create({
        data: {
          id: reversalId,
          ingredientId: adjustment.ingredientId,
          procurementSkuId: adjustment.procurementSkuId,
          adjustmentMode: InventoryAdjustmentMode.DELTA as any,
          quantityBeforeG: before,
          quantityAfterG: before + delta,
          deltaG: delta,
          reason: '报废复核驳回',
          note: input.note ?? null,
          category: adjustment.category,
          reviewStatus: InventoryAdjustmentReviewStatus.NONE as any,
          costAmount:
            adjustment.costAmount === null
              ? null
              : -Math.abs(Number(adjustment.costAmount)),
          createdBy: reviewerId,
          reversesAdjustmentId: id,
          createdAt: now,
        },
      });
      await tx.inventoryLedgerEntry.create({
        data: {
          id: randomUUID(),
          ingredientId: adjustment.ingredientId,
          procurementSkuId: adjustment.procurementSkuId,
          deltaG: delta,
          sourceType: InventorySourceType.MANUAL_ADJUSTMENT as any,
          sourceId: reversalId,
          createdAt: now,
        },
      });
    });

    return this.getAdjustmentDto(id);
  }

  async listAdjustments(query: {
    from?: Date;
    to?: Date;
    category?: string;
    pending?: boolean;
    limit?: number;
  }) {
    const createdAt: Record<string, Date> = {};
    if (query.from) createdAt.gte = query.from;
    if (query.to) createdAt.lte = query.to;

    const rows = await this.prisma.inventoryAdjustment.findMany({
      where: {
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
        ...(query.category ? { category: query.category as any } : {}),
        ...(query.pending ? { reviewStatus: 'PENDING' as any } : {}),
      },
      include: {
        ingredient: {
          select: { name: true, baseUnit: true, unitDisplayLabel: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(query.limit ?? 100, 1), 200),
    });

    return rows.map((row: any) => this.mapAdjustmentRow(row));
  }

  async getAdjustmentSummary(query: { from?: Date; to?: Date } = {}) {
    const createdAt: Record<string, Date> = {};
    if (query.from) createdAt.gte = query.from;
    if (query.to) createdAt.lte = query.to;

    const rows = await this.prisma.inventoryAdjustment.findMany({
      where: {
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
        reversesAdjustmentId: null,
      },
      select: {
        category: true,
        reviewStatus: true,
        costAmount: true,
      },
    });

    const internalUseCount = rows.filter(
      (row) => row.category === 'INTERNAL_USE',
    ).length;
    const scrapCount = rows.filter(
      (row) => row.category !== 'INTERNAL_USE',
    ).length;
    const pendingAmount = rows
      .filter((row) => row.reviewStatus === 'PENDING')
      .reduce((sum, row) => sum + Number(row.costAmount ?? 0), 0);

    const stocktakeLines = await this.prisma.inventoryStocktakeLine.findMany({
      where: {
        deltaG: { lt: 0 },
        stocktake: {
          status: 'APPLIED' as any,
          type: 'ROUTINE' as any,
          ...(Object.keys(createdAt).length ? { appliedAt: createdAt } : {}),
        },
      },
      select: { deltaG: true },
    });
    const stocktakeLoss = stocktakeLines.reduce(
      (sum, line) => sum + Math.abs(Number(line.deltaG ?? 0)),
      0,
    );

    return {
      internalUseCount,
      scrapCount,
      pendingAmount: this.roundNumber(pendingAmount, 2),
      stocktakeLoss: this.roundNumber(stocktakeLoss, 2),
    };
  }

  private async getAdjustmentDto(id: string) {
    const row = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
      include: {
        ingredient: {
          select: { name: true, baseUnit: true, unitDisplayLabel: true },
        },
      },
    });
    if (!row) throw new NotFoundException(`Adjustment not found: ${id}`);
    return this.mapAdjustmentRow(row);
  }

  private mapAdjustmentRow(row: any) {
    return {
      id: row.id,
      ingredientId: row.ingredientId,
      ingredientName: row.ingredient?.name ?? row.ingredientId,
      procurementSkuId: row.procurementSkuId ?? null,
      stockUnitLabel: this.resolveStockUnitLabel(row.ingredient),
      adjustmentMode: row.adjustmentMode as InventoryAdjustmentMode,
      quantityBeforeG: Number(row.quantityBeforeG),
      quantityAfterG: Number(row.quantityAfterG),
      deltaG: Number(row.deltaG),
      reason: row.reason,
      note: row.note ?? null,
      category: row.category as InventoryAdjustmentCategory,
      reviewStatus: row.reviewStatus as InventoryAdjustmentReviewStatus,
      costAmount:
        row.costAmount === null || row.costAmount === undefined
          ? null
          : Number(row.costAmount),
      reviewedBy: row.reviewedBy ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewNote: row.reviewNote ?? null,
      reversesAdjustmentId: row.reversesAdjustmentId ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Create a stocktake, optionally applying the variance immediately.
   */
  async createStocktake(
    dto: CreateInventoryStocktakeDto,
    createdBy?: string,
  ): Promise<InventoryStocktakeDto> {
    if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new BadRequestException('盘点单至少需要一条原料明细');
    }

    const lineMap = new Map<string, CreateInventoryStocktakeLineDto>();
    for (const line of dto.lines) {
      if (!line?.ingredientId?.trim()) {
        throw new BadRequestException('ingredientId is required');
      }
      const countedQuantityG = line.countedQuantityG ?? null;
      if (
        countedQuantityG !== null &&
        (!Number.isFinite(countedQuantityG) || countedQuantityG < 0)
      ) {
        throw new BadRequestException(
          'countedQuantityG must be a non-negative number',
        );
      }
      if (lineMap.has(line.ingredientId)) {
        throw new BadRequestException(`盘点单中存在重复原料: ${line.ingredientId}`);
      }
      lineMap.set(line.ingredientId, line);
    }

    const ingredientIds = Array.from(lineMap.keys());
    const ingredients = await this.getIngredientMetaMap(ingredientIds);
    if (ingredients.size !== ingredientIds.length) {
      const missingId = ingredientIds.find((id) => !ingredients.has(id));
      throw new NotFoundException(`Ingredient not found: ${missingId}`);
    }

    const balances = await this.getBalancesByIngredientIds(ingredientIds);
    const now = new Date();
    const stocktakeId = randomUUID();
    // 创建永远是草稿；入账只走"提交 →（必要时）复核"。
    const status = InventoryStocktakeStatus.DRAFT;
    const lines = ingredientIds.map((ingredientId) => {
      const expectedQuantityG = balances.get(ingredientId) ?? 0;
      const sourceLine = lineMap.get(ingredientId)!;
      const countedQuantityG = sourceLine.countedQuantityG ?? null;
      return new InventoryStocktakeLine(
        randomUUID(),
        stocktakeId,
        ingredientId,
        sourceLine.procurementSkuId?.trim() || null,
        expectedQuantityG,
        countedQuantityG,
        countedQuantityG === null
          ? null
          : countedQuantityG - expectedQuantityG,
      );
    });

    const stocktake = new InventoryStocktake(
      stocktakeId,
      status,
      dto.note?.trim() || null,
      now,
      null,
      lines,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryStocktake.create({
        data: {
          id: stocktake.id,
          status: stocktake.status as any,
          note: stocktake.note,
          createdBy: createdBy ?? null,
          createdAt: stocktake.createdAt,
          appliedAt: stocktake.appliedAt,
        },
      });

      await tx.inventoryStocktakeLine.createMany({
        data: stocktake.lines.map((line) => ({
          id: line.id,
          stocktakeId: line.stocktakeId,
          ingredientId: line.ingredientId,
          procurementSkuId: line.procurementSkuId,
          expectedQuantityG: line.expectedQuantityG,
          countedQuantityG: line.countedQuantityG,
          deltaG: line.deltaG,
        })),
      });

    });

    return this.getStocktakeById(stocktake.id);
  }

  /**
   * Apply a draft stocktake into the inventory ledger.
   */
  async applyStocktake(stocktakeId: string): Promise<InventoryStocktakeDto> {
    const existing = await this.prisma.inventoryStocktake.findUnique({
      where: {
        id: stocktakeId,
      },
      include: {
        lines: true,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Stocktake not found: ${stocktakeId}`);
    }

    if (existing.status === InventoryStocktakeStatus.APPLIED) {
      return this.getStocktakeById(stocktakeId);
    }

    const appliedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const ledgerEntries = existing.lines
        .filter(
          (line) =>
            line.deltaG !== null && Math.abs(line.deltaG) > 0.0001,
        )
        .map((line) => ({
          id: randomUUID(),
          ingredientId: line.ingredientId,
          procurementSkuId: line.procurementSkuId ?? null,
          deltaG: line.deltaG as number,
          sourceType: InventorySourceType.STOCKTAKE as any,
          sourceId: stocktakeId,
          createdAt: appliedAt,
        }));

      if (ledgerEntries.length > 0) {
        await tx.inventoryLedgerEntry.createMany({
          data: ledgerEntries,
          skipDuplicates: true,
        });
      }

      await tx.inventoryStocktake.update({
        where: {
          id: stocktakeId,
        },
        data: {
          status: InventoryStocktakeStatus.APPLIED as any,
          appliedAt,
        },
      });
    });

    return this.getStocktakeById(stocktakeId);
  }

  /**
   * List recent stocktakes with line-level variances.
   */
  /**
   * 开一张草稿盘点单：账面在开单时冻结（盲盘 DTO 不含账面/差异）。
   * 全局只允许一张 DRAFT；别人有草稿时 409。
   */
  async startStocktake(params: {
    userId: string;
    note?: string | null;
    /** OPENING = 期初盘点：不看容差，全部按实盘入账 */
    type?: 'OPENING' | 'ROUTINE';
  }) {
    const existing = await this.prisma.inventoryStocktake.findFirst({
      where: { status: 'DRAFT' as any },
      select: { id: true, createdBy: true, createdAt: true },
    });
    if (existing) {
      if (existing.createdBy === params.userId) {
        return this.toBlindStocktakeDto(
          await this.getStocktakeById(existing.id),
        );
      }
      throw new ConflictException(
        `已有未完成的盘点（${existing.createdBy ?? '未知'} / ${existing.createdAt.toLocaleString('zh-CN')}）`,
      );
    }

    const ingredients = await this.loadStocktakeScope();
    if (ingredients.length === 0) {
      throw new BadRequestException('没有需要盘点的原料');
    }

    const balances = await this.getBalancesByIngredientIds(
      ingredients.map((ingredient) => ingredient.id),
    );
    const stocktakeId = randomUUID();
    const now = new Date();
    const type = params.type === 'OPENING' ? 'OPENING' : 'ROUTINE';

    // 食材按采购商品各生成一个明细点；补剂/包材本身即商品，只有一个点。
    const skus = await this.prisma.procurementSku.findMany({
      where: {
        ingredientId: { in: ingredients.map((ingredient) => ingredient.id) },
        isActive: true,
      },
      select: { id: true, ingredientId: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const skuMap = new Map<string, string[]>();
    for (const sku of skus) {
      const list = skuMap.get(sku.ingredientId) ?? [];
      list.push(sku.id);
      skuMap.set(sku.ingredientId, list);
    }

    const lineRows = ingredients.map((ingredient) => ({
      id: randomUUID(),
      stocktakeId,
      ingredientId: ingredient.id,
      procurementSkuId: null as string | null,
      expectedQuantityG: balances.get(ingredient.id) ?? 0,
      countedQuantityG: null as number | null,
      deltaG: null as number | null,
      countedAt: null as Date | null,
    }));
    const lineByIngredient = new Map(
      lineRows.map((line) => [line.ingredientId, line]),
    );
    const portionRows = ingredients.flatMap((ingredient) => {
      const line = lineByIngredient.get(ingredient.id);
      if (!line) return [];
      const ingredientSkus =
        ingredient.type === 'FOOD' ? skuMap.get(ingredient.id) ?? [] : [];
      if (ingredientSkus.length === 0) {
        return [
          {
            id: randomUUID(),
            lineId: line.id,
            procurementSkuId: null as string | null,
            locationLabel: null as string | null,
            countedQuantityG: null as number | null,
            countedAt: null as Date | null,
          },
        ];
      }
      return ingredientSkus.map((skuId) => ({
        id: randomUUID(),
        lineId: line.id,
        procurementSkuId: skuId as string | null,
        locationLabel: null as string | null,
        countedQuantityG: null as number | null,
        countedAt: null as Date | null,
      }));
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryStocktake.create({
        data: {
          id: stocktakeId,
          type: type as any,
          status: 'DRAFT' as any,
          note: params.note ?? null,
          createdBy: params.userId,
          createdAt: now,
        },
      });
      await tx.inventoryStocktakeLine.createMany({ data: lineRows });
      await tx.inventoryStocktakePortion.createMany({ data: portionRows });
    });

    return this.toBlindStocktakeDto(await this.getStocktakeById(stocktakeId));
  }

  /** 当前草稿（只看自己的）。 */
  async getDraftStocktake(userId: string) {
    const draft = await this.prisma.inventoryStocktake.findFirst({
      where: { status: 'DRAFT' as any },
      select: { id: true, createdBy: true },
    });
    if (!draft || draft.createdBy !== userId) {
      return null;
    }
    return this.toBlindStocktakeDto(await this.getStocktakeById(draft.id));
  }

  /** 员工查看：草稿盲盘（仅本人），提交后可见差异。 */
  async getStocktakeForStaff(id: string, userId: string) {
    const header = await this.prisma.inventoryStocktake.findUnique({
      where: { id },
      select: { id: true, status: true, createdBy: true },
    });
    if (!header) throw new NotFoundException(`Stocktake not found: ${id}`);
    if (
      header.status === ('DRAFT' as any) &&
      header.createdBy !== userId
    ) {
      throw new ForbiddenException('只能查看自己开的盘点草稿');
    }
    const dto = await this.getStocktakeById(id);
    return header.status === ('DRAFT' as any)
      ? this.toBlindStocktakeDto(dto)
      : dto;
  }

  /** 取消草稿：只允许自己的（管理员可取消任何人的）；草稿没有流水，可以删。 */
  async cancelStocktakeDraft(
    id: string,
    userId: string,
    isAdmin = false,
  ) {
    const header = await this.prisma.inventoryStocktake.findUnique({
      where: { id },
      select: { id: true, status: true, createdBy: true },
    });
    if (!header) throw new NotFoundException(`Stocktake not found: ${id}`);
    if (header.status !== ('DRAFT' as any)) {
      throw new ConflictException('只有草稿可以取消');
    }
    if (!isAdmin && header.createdBy !== userId) {
      throw new ForbiddenException('只能取消自己开的盘点单');
    }
    const ledgerCount = await this.prisma.inventoryLedgerEntry.count({
      where: { sourceId: id },
    });
    if (ledgerCount > 0) {
      throw new ConflictException('这张盘点单已经有流水，不能删除');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryStocktakeLine.deleteMany({ where: { stocktakeId: id } });
      await tx.inventoryStocktake.delete({ where: { id } });
    });
  }

  /**
   * 保存草稿：只改实盘和计数时刻，不动账面。
   * 新协议按"明细点"保存（食材按商品/位置），旧的按原料保存仍兼容。
   * 有明细点的行，实盘由服务端汇总，行级写入会被拒绝。
   */
  async saveStocktakeLines(
    id: string,
    input:
      | Array<{ ingredientId: string; countedQuantityG: number | null }>
      | {
          lines?: Array<{
            ingredientId: string;
            countedQuantityG: number | null;
          }>;
          portions?: StocktakePortionDraft[];
          newPortions?: StocktakeNewPortionDraft[];
        },
    userId: string,
  ) {
    const header = await this.prisma.inventoryStocktake.findUnique({
      where: { id },
      select: { id: true, status: true, createdBy: true },
    });
    if (!header) throw new NotFoundException(`Stocktake not found: ${id}`);
    if (!canEdit(header.status)) {
      throw new ConflictException('盘点已提交或已入账，不能再改');
    }
    if (header.createdBy !== userId) {
      throw new ForbiddenException('只能编辑自己开的盘点单');
    }

    const payload = Array.isArray(input) ? { lines: input } : input ?? {};
    const lineUpdates = payload.lines ?? [];
    const portionUpdates = payload.portions ?? [];
    const newPortions = payload.newPortions ?? [];

    const existing = await this.prisma.inventoryStocktakeLine.findMany({
      where: { stocktakeId: id },
      select: { id: true, ingredientId: true, expectedQuantityG: true },
    });
    const lineById = new Map(existing.map((line) => [line.id, line]));
    const lineByIngredient = new Map(
      existing.map((line) => [line.ingredientId, line]),
    );

    const existingPortions =
      await this.prisma.inventoryStocktakePortion.findMany({
        where: { line: { stocktakeId: id } },
        select: { id: true, lineId: true },
      });
    const portionMap = new Map(
      existingPortions.map((portion) => [portion.id, portion]),
    );

    const normalizeCounted = (value: number | null | undefined) => {
      const counted = value ?? null;
      if (counted !== null && (!Number.isFinite(counted) || counted < 0)) {
        throw new BadRequestException(
          '实盘数量必须是非负数字，或留空表示未盘',
        );
      }
      return counted;
    };

    const now = new Date();
    const touchedLineIds = new Set<string>();

    await this.prisma.$transaction(async (tx) => {
      for (const draft of portionUpdates) {
        const portion = portionMap.get(draft.id);
        if (!portion) {
          throw new BadRequestException(`盘点明细点不存在：${draft.id}`);
        }
        touchedLineIds.add(portion.lineId);
        if (draft.remove) {
          await tx.inventoryStocktakePortion.delete({
            where: { id: draft.id },
          });
          continue;
        }
        const counted = normalizeCounted(draft.countedQuantityG);
        const data: Record<string, any> = {
          countedQuantityG: counted,
          countedAt: counted === null ? null : now,
        };
        if (draft.locationLabel !== undefined) {
          data.locationLabel = draft.locationLabel?.trim() || null;
        }
        await tx.inventoryStocktakePortion.update({
          where: { id: draft.id },
          data,
        });
      }

      for (const draft of newPortions) {
        const line = lineById.get(draft.lineId);
        if (!line) {
          throw new BadRequestException(`盘点行不存在：${draft.lineId}`);
        }
        touchedLineIds.add(line.id);
        await tx.inventoryStocktakePortion.create({
          data: {
            id: randomUUID(),
            lineId: line.id,
            procurementSkuId: draft.procurementSkuId ?? null,
            locationLabel: draft.locationLabel?.trim() || null,
            countedQuantityG: null,
            countedAt: null,
          },
        });
      }

      for (const update of lineUpdates) {
        const line = lineByIngredient.get(update.ingredientId);
        if (!line) {
          throw new BadRequestException(
            `盘点单里没有原料 ${update.ingredientId}`,
          );
        }
        if ((existingPortions as any[]).some((p) => p.lineId === line.id)) {
          throw new BadRequestException(
            '该原料已按商品/位置拆分录入，请提交明细点而不是原料总数',
          );
        }
        const counted = normalizeCounted(update.countedQuantityG);
        touchedLineIds.add(line.id);
        await tx.inventoryStocktakeLine.update({
          where: { id: line.id },
          data: {
            countedQuantityG: counted,
            deltaG:
              counted === null
                ? null
                : counted - Number(line.expectedQuantityG),
            countedAt: counted === null ? null : now,
          },
        });
      }

      // 明细点变动后，把行的实盘/差异重新汇总（行级永远等于各点之和）。
      for (const lineId of touchedLineIds) {
        const portions = await tx.inventoryStocktakePortion.findMany({
          where: { lineId },
          select: { countedQuantityG: true },
        });
        if (portions.length === 0) continue;
        const line = lineById.get(lineId);
        if (!line) continue;
        const filled = portions.filter(
          (portion) => portion.countedQuantityG !== null,
        );
        const counted =
          filled.length === 0
            ? null
            : Number(
                filled
                  .reduce(
                    (sum, portion) => sum + Number(portion.countedQuantityG),
                    0,
                  )
                  .toFixed(3),
              );
        await tx.inventoryStocktakeLine.update({
          where: { id: lineId },
          data: {
            countedQuantityG: counted,
            deltaG:
              counted === null
                ? null
                : counted - Number(line.expectedQuantityG),
            countedAt: counted === null ? null : now,
          },
        });
      }
    });

    return this.toBlindStocktakeDto(await this.getStocktakeById(id));
  }

  /**
   * 完成录入后的差异预览：只算不写。
   * 有未盘行时必须显式 confirmPartial，防止录到一半偷看账面。
   */
  async previewStocktake(
    id: string,
    userId: string,
    opts: { confirmPartial?: boolean } = {},
  ) {
    const header = await this.prisma.inventoryStocktake.findUnique({
      where: { id },
      select: { id: true, status: true, createdBy: true, type: true },
    });
    if (!header) throw new NotFoundException(`Stocktake not found: ${id}`);
    if (header.status !== ('DRAFT' as any)) {
      throw new ConflictException('只有草稿可以预览');
    }
    if (header.createdBy !== userId) {
      throw new ForbiddenException('只能预览自己开的盘点单');
    }

    const lines = await this.prisma.inventoryStocktakeLine.findMany({
      where: { stocktakeId: id },
      include: {
        ingredient: {
          select: {
            id: true,
            name: true,
            type: true,
            baseUnit: true,
            unitDisplayLabel: true,
            brand: true,
            productModel: true,
            purchaseChannel: true,
          },
        },
        portions: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { ingredientId: 'asc' },
    });

    const skipped = lines.filter(
      (line) => line.countedQuantityG === null,
    ).length;
    if (skipped > 0 && !opts.confirmPartial) {
      throw new BadRequestException(
        `还有 ${skipped} 项未盘；确认按未盘处理后才能预览`,
      );
    }

    const skuNames = await this.loadProcurementSkuNames(
      lines.flatMap((line) =>
        (line.portions || []).map((portion) => portion.procurementSkuId),
      ),
    );
    const previewLines = lines.map((line) => {
      const counted = line.countedQuantityG;
      const delta =
        counted === null ? null : Number(counted) - Number(line.expectedQuantityG);
      return {
        ingredientId: line.ingredientId,
        ingredientName: line.ingredient?.name ?? line.ingredientId,
        ingredientType: line.ingredient?.type ?? null,
        stockUnitLabel:
          line.ingredient?.unitDisplayLabel ||
          line.ingredient?.baseUnit ||
          'G',
        brand: line.ingredient?.brand ?? null,
        productModel: line.ingredient?.productModel ?? null,
        purchaseChannel: line.ingredient?.purchaseChannel ?? null,
        // 未盘的行不返回账面，避免用「预览一次再退出」绕过盲盘
        expectedQuantityG:
          counted === null ? null : Number(line.expectedQuantityG),
        countedQuantityG: counted === null ? null : Number(counted),
        deltaG: delta,
        isCounted: counted !== null,
        withinTolerance:
          delta === null
            ? null
            : isWithinTolerance(
                delta,
                Number(line.expectedQuantityG),
                line.ingredient?.baseUnit ?? 'G',
              ),
        portions: (line.portions || []).map((portion: any) => ({
          id: portion.id,
          lineId: line.id,
          procurementSkuId: portion.procurementSkuId ?? null,
          procurementSkuName: portion.procurementSkuId
            ? skuNames.get(portion.procurementSkuId)?.name ?? null
            : null,
          brand: portion.procurementSkuId
            ? skuNames.get(portion.procurementSkuId)?.brand ??
              line.ingredient?.brand ??
              null
            : line.ingredient?.brand ?? null,
          purchaseChannel: portion.procurementSkuId
            ? skuNames.get(portion.procurementSkuId)?.channel ??
              line.ingredient?.purchaseChannel ??
              null
            : line.ingredient?.purchaseChannel ?? null,
          locationLabel: portion.locationLabel ?? null,
          countedQuantityG:
            portion.countedQuantityG === null
              ? null
              : Number(portion.countedQuantityG),
          isCounted:
            portion.countedQuantityG !== null &&
            portion.countedQuantityG !== undefined,
        })),
      };
    });

    return {
      id,
      type: (header.type ?? 'ROUTINE') as 'OPENING' | 'ROUTINE',
      status: header.status,
      autoApplyAll: header.type === ('OPENING' as any),
      lines: previewLines,
      countedCount: previewLines.filter((line) => line.isCounted).length,
      skippedCount: skipped,
      withinCount: previewLines.filter((line) => line.withinTolerance === true)
        .length,
      overCount: previewLines.filter((line) => line.withinTolerance === false)
        .length,
    };
  }

  /**
   * 提交盘点：
   *  - 容差内的行立即入账；
   *  - 只要有一行超容差，整单进入 SUBMITTED 等复核（容差内的行照常入账）。
   */
  async submitStocktake(id: string, userId: string, note?: string | null) {
    const header = await this.prisma.inventoryStocktake.findUnique({
      where: { id },
      select: { id: true, status: true, createdBy: true, type: true },
    });
    if (!header) throw new NotFoundException(`Stocktake not found: ${id}`);
    if (header.status !== ('DRAFT' as any)) {
      throw new ConflictException('盘点已提交或已入账，不能重复提交');
    }
    if (header.createdBy !== userId) {
      throw new ForbiddenException('只能提交自己开的盘点单');
    }

    const lines = await this.prisma.inventoryStocktakeLine.findMany({
      where: { stocktakeId: id },
      include: { ingredient: { select: { baseUnit: true } } },
    });
    const counted = lines.filter((line) => line.countedQuantityG !== null);
    if (counted.length === 0) {
      throw new BadRequestException('至少盘一项才能提交');
    }

    const evaluated = counted.map((line) => {
      const countedQuantityG = Number(line.countedQuantityG);
      const expected = Number(line.expectedQuantityG);
      const delta = Number((countedQuantityG - expected).toFixed(3));
      return {
        line,
        countedQuantityG,
        delta,
        within: isWithinTolerance(
          delta,
          expected,
          line.ingredient?.baseUnit ?? 'G',
        ),
      };
    });
    // 期初盘点不看容差：全部按实盘入账，不进复核（否则期初会被卡在待复核）。
    const isOpening = header.type === ('OPENING' as any);
    const overs = evaluated.filter((item) => !item.within);
    const nextStatus = isOpening
      ? 'APPLIED'
      : overs.length > 0
        ? 'SUBMITTED'
        : 'APPLIED';
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const transition = await tx.inventoryStocktake.updateMany({
        where: {
          id,
          status: 'DRAFT' as any,
          createdBy: userId,
        },
        data: {
          status: nextStatus as any,
          submittedAt: now,
          appliedAt: nextStatus === 'APPLIED' ? now : null,
          note: note ?? undefined,
        },
      });
      if (transition.count === 0) {
        throw new ConflictException('盘点状态已变化，请刷新后重试');
      }

      for (const item of evaluated) {
        await tx.inventoryStocktakeLine.update({
          where: { id: item.line.id },
          data: { deltaG: item.delta },
        });
      }

      const ledgerRows = evaluated
        .filter(
          (item) => (isOpening || item.within) && Math.abs(item.delta) > 0.0001,
        )
        .map((item) => ({
          id: randomUUID(),
          ingredientId: item.line.ingredientId,
          procurementSkuId: item.line.procurementSkuId ?? null,
          deltaG: item.delta,
          sourceType: (isOpening
            ? InventorySourceType.OPENING_BALANCE
            : InventorySourceType.STOCKTAKE) as any,
          sourceId: id,
          sourceVersion: 1,
          costAmount: null,
          createdAt: now,
        }));

      if (ledgerRows.length > 0) {
        await tx.inventoryLedgerEntry.createMany({
          data: ledgerRows,
          skipDuplicates: true,
        });
      }
    });

    return this.getStocktakeById(id);
  }

  /**
   * 复核：通过补入超容差的行；驳回写原因、不写流水、终态。
   */
  async reviewStocktake(
    id: string,
    input: { approve: boolean; note?: string | null },
    reviewerId: string,
  ) {
    assertRejectNote(input.approve, input.note);

    const header = await this.prisma.inventoryStocktake.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!header) throw new NotFoundException(`Stocktake not found: ${id}`);
    if (header.status !== ('SUBMITTED' as any)) {
      throw new ConflictException('只有待复核的盘点可以复核');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const transition = await tx.inventoryStocktake.updateMany({
        where: { id, status: 'SUBMITTED' as any },
        data: {
          status: (input.approve ? 'APPLIED' : 'REJECTED') as any,
          reviewedBy: reviewerId,
          reviewedAt: now,
          reviewNote: input.note ?? null,
          appliedAt: input.approve ? now : null,
        },
      });
      if (transition.count === 0) {
        throw new ConflictException('盘点状态已变化，请刷新后重试');
      }

      if (!input.approve) {
        // 提交时容差内的行已经入账；驳回必须把已入账的冲回去，否则账上撤不回来。
        const appliedEntries = await tx.inventoryLedgerEntry.findMany({
          where: {
            sourceType: InventorySourceType.STOCKTAKE as any,
            sourceId: id,
          },
          select: {
            ingredientId: true,
            procurementSkuId: true,
            deltaG: true,
          },
        });
        const reversals = appliedEntries
          .filter((entry) => Math.abs(Number(entry.deltaG)) > 0.0001)
          .map((entry) => ({
            id: randomUUID(),
            ingredientId: entry.ingredientId,
            procurementSkuId: entry.procurementSkuId ?? null,
            deltaG: -Number(entry.deltaG),
            sourceType: InventorySourceType.STOCKTAKE as any,
            sourceId: `${id}:reject`,
            sourceVersion: 1,
            costAmount: null,
            createdAt: now,
          }));
        if (reversals.length > 0) {
          await tx.inventoryLedgerEntry.createMany({
            data: reversals,
            skipDuplicates: true,
          });
        }
        return;
      }

      const lines = await tx.inventoryStocktakeLine.findMany({
        where: { stocktakeId: id, countedQuantityG: { not: null } },
      });
      const ledgerRows = lines
        .filter(
          (line) =>
            line.deltaG !== null && Math.abs(Number(line.deltaG)) > 0.0001,
        )
        .map((line) => ({
          id: randomUUID(),
          ingredientId: line.ingredientId,
          procurementSkuId: line.procurementSkuId ?? null,
          deltaG: Number(line.deltaG),
          sourceType: InventorySourceType.STOCKTAKE as any,
          sourceId: id,
          sourceVersion: 1,
          costAmount: null,
          createdAt: now,
        }));
      if (ledgerRows.length > 0) {
        await tx.inventoryLedgerEntry.createMany({
          data: ledgerRows,
          skipDuplicates: true,
        });
      }
    });

    return this.getStocktakeById(id);
  }

  private toBlindStocktakeDto(dto: InventoryStocktakeDto) {
    return {
      id: dto.id,
      type: dto.type,
      status: dto.status,
      note: dto.note,
      createdBy: dto.createdBy,
      createdAt: dto.createdAt,
      lineCount: dto.lineCount,
      countedCount: dto.lines.filter((line) => line.isCounted).length,
      lines: dto.lines.map((line) => ({
        id: line.id,
        ingredientId: line.ingredientId,
        ingredientName: line.ingredientName,
        ingredientType: line.ingredientType ?? null,
        stockUnitLabel: line.stockUnitLabel,
        brand: line.brand ?? null,
        productModel: line.productModel ?? null,
        purchaseChannel: line.purchaseChannel ?? null,
        countedQuantityG: line.countedQuantityG,
        isCounted: line.isCounted,
        countedAt: line.countedAt,
        portions: line.portions.map((portion) => ({
          id: portion.id,
          lineId: portion.lineId,
          procurementSkuId: portion.procurementSkuId,
          procurementSkuName: portion.procurementSkuName,
          brand: portion.brand ?? null,
          purchaseChannel: portion.purchaseChannel ?? null,
          locationLabel: portion.locationLabel,
          countedQuantityG: portion.countedQuantityG,
          isCounted: portion.isCounted,
        })),
      })),
    };
  }

  /**
   * 盘点范围：所有原料都参与（2026-11-11 起全部原料记库存，期初盘点必须是全量）。
   * 排序按上次盘点时间，从未盘过的排前面，其次按类型/名称。
   */
  private async loadStocktakeScope() {
    const [ingredients, counted] = await Promise.all([
      this.prisma.ingredient.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          baseUnit: true,
          unitDisplayLabel: true,
        },
      }),
      this.prisma.inventoryStocktakeLine.groupBy({
        by: ['ingredientId'],
        where: { countedAt: { not: null } },
        _min: { countedAt: true },
      }),
    ]);

    const lastCounted = new Map(
      counted.map((row) => [
        row.ingredientId,
        row._min?.countedAt
          ? new Date(row._min.countedAt as any).getTime()
          : Number.POSITIVE_INFINITY,
      ]),
    );

    const typeRank: Record<string, number> = {
      FOOD: 0,
      SUPPLEMENT: 1,
      PACKAGING: 2,
    };

    return ingredients.sort((left, right) => {
      const leftCounted =
        lastCounted.get(left.id) ?? Number.POSITIVE_INFINITY;
      const rightCounted =
        lastCounted.get(right.id) ?? Number.POSITIVE_INFINITY;
      if (leftCounted !== rightCounted) {
        return leftCounted - rightCounted;
      }
      const rankDiff =
        (typeRank[left.type] ?? 9) - (typeRank[right.type] ?? 9);
      if (rankDiff !== 0) return rankDiff;
      return left.name.localeCompare(right.name, 'zh-CN');
    });
  }

  async listStocktakes(limit = 20): Promise<InventoryStocktakeDto[]> {
    const stocktakes = await this.prisma.inventoryStocktake.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: this.normalizeLimit(limit, 1, 50),
      include: {
        lines: {
          orderBy: {
            ingredientId: 'asc',
          },
          include: {
            ingredient: {
              select: {
                id: true,
                name: true,
                type: true,
                baseUnit: true,
                unitDisplayLabel: true,
                productModel: true,
                purchaseChannel: true,
              },
            },
          },
        },
      },
    });

    const enriched = await this.attachProcurementSkuNamesToStocktakes(stocktakes);
    return enriched.map((stocktake) => this.mapStocktake(stocktake));
  }

  /** 员工端列表：草稿只返回盲盘字段，避免盲盘期间读到账面/差异。 */
  async listStocktakesForStaff(limit = 20): Promise<any[]> {
    const rows = await this.listStocktakes(limit);
    return rows.map((row) =>
      row.status === 'DRAFT' ? this.toBlindStocktakeDto(row) : row,
    );
  }

  private async getStocktakeById(id: string): Promise<InventoryStocktakeDto> {
    const stocktake = await this.prisma.inventoryStocktake.findUnique({
      where: {
        id,
      },
      include: {
        lines: {
          orderBy: {
            ingredientId: 'asc',
          },
          include: {
            ingredient: {
              select: {
                id: true,
                name: true,
                type: true,
                baseUnit: true,
                unitDisplayLabel: true,
                brand: true,
                productModel: true,
                purchaseChannel: true,
              },
            },
            portions: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!stocktake) {
      throw new NotFoundException(`Stocktake not found: ${id}`);
    }

    const [enriched] = await this.attachProcurementSkuNamesToStocktakes([
      stocktake,
    ]);
    return this.mapStocktake(enriched);
  }

  private mapStocktake(stocktake: any): InventoryStocktakeDto {
    const lines: InventoryStocktakeLineDto[] = stocktake.lines.map((line: any) => ({
      id: line.id,
      ingredientId: line.ingredientId,
      procurementSkuId: line.procurementSkuId ?? null,
      procurementSkuName: line.procurementSkuName ?? null,
      ingredientName: line.ingredient?.name ?? line.ingredientId,
      ingredientType: line.ingredient?.type ?? null,
      stockUnitLabel: this.resolveStockUnitLabel(line.ingredient),
      brand: line.ingredient?.brand ?? null,
      productModel: line.ingredient?.productModel ?? null,
      purchaseChannel: line.ingredient?.purchaseChannel ?? null,
      expectedQuantityG: line.expectedQuantityG,
      countedQuantityG: line.countedQuantityG ?? null,
      deltaG: line.deltaG ?? null,
      isCounted:
        line.countedQuantityG !== null &&
        line.countedQuantityG !== undefined,
      countedAt: line.countedAt?.toISOString() ?? null,
      withinTolerance:
        line.countedQuantityG === null ||
        line.countedQuantityG === undefined
          ? null
          : isWithinTolerance(
              Number(line.deltaG ?? 0),
              Number(line.expectedQuantityG ?? 0),
              line.ingredient?.baseUnit ?? 'G',
            ),
      portions: (line.portions || []).map((portion: any) => ({
        id: portion.id,
        lineId: line.id,
        procurementSkuId: portion.procurementSkuId ?? null,
        procurementSkuName: portion.procurementSkuName ?? null,
        brand: portion.brand ?? null,
        purchaseChannel: portion.purchaseChannel ?? null,
        locationLabel: portion.locationLabel ?? null,
        countedQuantityG: portion.countedQuantityG ?? null,
        isCounted:
          portion.countedQuantityG !== null &&
          portion.countedQuantityG !== undefined,
      })),
    }));

    return {
      id: stocktake.id,
      type: (stocktake.type ?? 'ROUTINE') as 'OPENING' | 'ROUTINE',
      status: stocktake.status as InventoryStocktakeStatus,
      note: stocktake.note ?? null,
      createdBy: stocktake.createdBy ?? null,
      createdAt: stocktake.createdAt.toISOString(),
      appliedAt: stocktake.appliedAt?.toISOString() ?? null,
      submittedAt: stocktake.submittedAt?.toISOString() ?? null,
      reviewedBy: stocktake.reviewedBy ?? null,
      reviewedAt: stocktake.reviewedAt?.toISOString() ?? null,
      reviewNote: stocktake.reviewNote ?? null,
      lineCount: lines.length,
      varianceCount: lines.filter(
        (line) => line.isCounted && Math.abs(line.deltaG ?? 0) > 0.0001,
      ).length,
      totalAbsDeltaG: lines.reduce(
        (sum, line) => sum + Math.abs(line.deltaG ?? 0),
        0,
      ),
      lines,
    };
  }

  /** 批量取采购商品名与采购渠道（明细点用）。 */
  private async loadProcurementSkuNames(
    ids: Array<string | null | undefined>,
  ): Promise<
    Map<string, { name: string; channel: string | null; brand: string | null }>
  > {
    const unique = Array.from(new Set(ids.filter(Boolean))) as string[];
    if (unique.length === 0) return new Map();
    const skus = await this.prisma.procurementSku.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        name: true,
        brand: true,
        purchaseChannel: true,
      },
    });
    return new Map(
      skus.map((sku) => [
        sku.id,
        {
          name: sku.name,
          channel: sku.purchaseChannel ?? null,
          brand: sku.brand ?? null,
        },
      ]),
    );
  }

  private async attachProcurementSkuNamesToStocktakes(
    stocktakes: any[],
  ): Promise<any[]> {
    const procurementSkuIds = Array.from(
      new Set(
        stocktakes.flatMap((stocktake) =>
          (stocktake.lines || []).flatMap((line: any) =>
            [
              line.procurementSkuId,
              ...(line.portions || []).map(
                (portion: any) => portion.procurementSkuId,
              ),
            ].filter(Boolean),
          ),
        ),
      ),
    );

    if (procurementSkuIds.length === 0) {
      return stocktakes;
    }

    const procurementSkus = await this.prisma.procurementSku.findMany({
      where: {
        id: {
          in: procurementSkuIds,
        },
      },
      select: {
        id: true,
        name: true,
        brand: true,
        purchaseChannel: true,
      },
    });

    const procurementSkuMap = new Map(
      procurementSkus.map((sku) => [sku.id, sku]),
    );

    return stocktakes.map((stocktake) => ({
      ...stocktake,
      lines: (stocktake.lines || []).map((line: any) => ({
        ...line,
        procurementSkuName: line.procurementSkuId
          ? procurementSkuMap.get(line.procurementSkuId)?.name ?? null
          : null,
        portions: (line.portions || []).map((portion: any) => ({
          ...portion,
          procurementSkuName: portion.procurementSkuId
            ? procurementSkuMap.get(portion.procurementSkuId)?.name ?? null
            : null,
          brand: portion.procurementSkuId
            ? procurementSkuMap.get(portion.procurementSkuId)?.brand ??
              line.ingredient?.brand ??
              null
            : line.ingredient?.brand ?? null,
          purchaseChannel: portion.procurementSkuId
            ? procurementSkuMap.get(portion.procurementSkuId)?.purchaseChannel ??
              line.purchaseChannel ??
              null
            : line.purchaseChannel ?? null,
        })),
      })),
    }));
  }

  private async getIngredientMetaMap(
    ingredientIds: string[],
  ): Promise<Map<string, IngredientStockMeta>> {
    if (ingredientIds.length === 0) {
      return new Map();
    }

    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        id: {
          in: ingredientIds,
        },
      },
      select: {
        id: true,
        name: true,
        baseUnit: true,
        unitDisplayLabel: true,
      },
    });

    return new Map(
      ingredients.map((ingredient) => [
        ingredient.id,
        {
          id: ingredient.id,
          name: ingredient.name,
          baseUnit: ingredient.baseUnit,
          unitDisplayLabel: ingredient.unitDisplayLabel,
        },
      ]),
    );
  }

  private async getBalancesByIngredientIds(
    ingredientIds: string[],
  ): Promise<Map<string, number>> {
    if (ingredientIds.length === 0) {
      return new Map();
    }

    const grouped = await this.prisma.inventoryLedgerEntry.groupBy({
      by: ['ingredientId'],
      where: {
        ingredientId: {
          in: ingredientIds,
        },
      },
      _sum: {
        deltaG: true,
      },
    });

    const result = new Map<string, number>();
    for (const ingredientId of ingredientIds) {
      result.set(ingredientId, 0);
    }

    for (const row of grouped) {
      result.set(row.ingredientId, row._sum.deltaG ?? 0);
    }

    return result;
  }

  private normalizeLimit(value?: number, min = 1, max = 200): number {
    const parsed = Number(value ?? 50);
    if (!Number.isFinite(parsed)) {
      return 50;
    }
    return Math.max(min, Math.min(max, Math.floor(parsed)));
  }

  private roundNumber(value: number, decimals: number): number {
    return Number(value.toFixed(decimals));
  }

  private resolveStockUnitLabel(
    ingredient?: IngredientStockMeta | null,
  ): string {
    return ingredient?.unitDisplayLabel || ingredient?.baseUnit || 'G';
  }

  private resolveSourceLabel(sourceType: InventorySourceType): string {
    const labelMap: Record<InventorySourceType, string> = {
      [InventorySourceType.KITCHEN_TASK]: '厨房领用',
      [InventorySourceType.PURCHASE_RECORD]: '采购入库',
      [InventorySourceType.PURCHASE_RECORD_REVERSAL]: '采购撤回',
      [InventorySourceType.OPENING_BALANCE]: '期初结转',
      [InventorySourceType.PACKAGING_CONSUMPTION]: '包材扣减',
      [InventorySourceType.MANUAL_ADJUSTMENT]: '手工调整',
      [InventorySourceType.STOCKTAKE]: '盘点差异',
      [InventorySourceType.PRODUCTION_ALLOCATION_CONSUMPTION]: '生产领用',
      [InventorySourceType.SUPPLEMENT_PACK_CONSUMPTION]: '补剂分装扣减',
      [InventorySourceType.PRODUCTION_SURPLUS]: '生产余量入库',
    };
    return labelMap[sourceType];
  }

  private resolveSourceDescription(
    sourceType: InventorySourceType,
    adjustment: any,
    stocktakeLine: any,
    purchaseRecord?: {
      procurementSkuName?: string | null;
      purchaseChannel?: string | null;
      productModel?: string | null;
    } | null,
  ): string | null {
    if (sourceType === InventorySourceType.MANUAL_ADJUSTMENT && adjustment) {
      return adjustment.note
        ? `${adjustment.reason} / ${adjustment.note}`
        : adjustment.reason;
    }

    if (sourceType === InventorySourceType.STOCKTAKE && stocktakeLine) {
      return stocktakeLine.stocktake?.note || '盘点差异入账';
    }

    if (sourceType === InventorySourceType.PURCHASE_RECORD && purchaseRecord) {
      const parts = [
        purchaseRecord.procurementSkuName,
        purchaseRecord.purchaseChannel,
        purchaseRecord.productModel,
      ].filter(Boolean);

      return parts.length > 0 ? parts.join(' · ') : '采购入库';
    }

    if (sourceType === InventorySourceType.PRODUCTION_ALLOCATION_CONSUMPTION) {
      return '生产完成后消耗已分配库存';
    }

    if (sourceType === InventorySourceType.PRODUCTION_SURPLUS) {
      return '生产完成后可保存余量入库';
    }

    return null;
  }
}
