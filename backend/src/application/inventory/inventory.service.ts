/**
 * Inventory Service
 * Maintains inventory as an append-only ledger and exposes
 * operational workflows such as manual adjustments and stocktakes.
 */

import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma.service';
import type { InventoryRepository } from '../../domain/inventory/inventory.repository';
import {
  InventoryAdjustment,
  InventoryAdjustmentMode,
  InventoryLedgerEntry,
  InventorySourceType,
  InventoryStocktake,
  InventoryStocktakeLine,
  InventoryStocktakeStatus,
} from '../../domain/inventory';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import { PackagingUnitStatus } from '../../domain/production/enums';
import { PRODUCTION_BATCH_REPOSITORY } from '../production/production.service';
import type { PurchaseRecord } from '../../domain/purchasing';

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');

export interface InventoryLedgerQueryDto {
  ingredientId?: string;
  limit?: number;
}

export interface InventoryLedgerItemDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
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
  adjustmentMode: InventoryAdjustmentMode;
  quantity: number;
  reason: string;
  note?: string | null;
}

export interface InventoryAdjustmentDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
  stockUnitLabel: string;
  adjustmentMode: InventoryAdjustmentMode;
  quantityBeforeG: number;
  quantityAfterG: number;
  deltaG: number;
  reason: string;
  note: string | null;
  createdAt: string;
}

export interface CreateInventoryStocktakeLineDto {
  ingredientId: string;
  countedQuantityG: number;
}

export interface CreateInventoryStocktakeDto {
  note?: string | null;
  lines: CreateInventoryStocktakeLineDto[];
  applyImmediately?: boolean;
}

export interface InventoryStocktakeLineDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
  stockUnitLabel: string;
  expectedQuantityG: number;
  countedQuantityG: number;
  deltaG: number;
}

export interface InventoryStocktakeDto {
  id: string;
  status: InventoryStocktakeStatus;
  note: string | null;
  createdAt: string;
  appliedAt: string | null;
  lineCount: number;
  varianceCount: number;
  totalAbsDeltaG: number;
  lines: InventoryStocktakeLineDto[];
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
    purchaseRecords: PurchaseRecord[],
  ): Promise<{ createdCount: number; skippedCount: number }> {
    if (purchaseRecords.length === 0) {
      return { createdCount: 0, skippedCount: 0 };
    }

    const ledgerEntries: InventoryLedgerEntry[] = [];
    let skippedCount = 0;

    for (const record of purchaseRecords) {
      const baseQuantity = Number(record.actualBaseQuantity || 0);
      if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) {
        this.logger.warn(
          `Skipping purchase record ${record.id}: actualBaseQuantity is ${record.actualBaseQuantity}`,
        );
        skippedCount++;
        continue;
      }

      const exists = await this.inventoryRepository.existsBySourceAndIngredient(
        InventorySourceType.PURCHASE_RECORD,
        record.id,
        record.ingredientId,
      );

      if (exists) {
        skippedCount++;
        continue;
      }

      ledgerEntries.push(
        new InventoryLedgerEntry(
          randomUUID(),
          record.ingredientId,
          baseQuantity,
          InventorySourceType.PURCHASE_RECORD,
          record.id,
          new Date(),
        ),
      );
    }

    if (ledgerEntries.length > 0) {
      await this.inventoryRepository.recordEntries(ledgerEntries);
      this.logger.log(
        `Successfully inbounded ${ledgerEntries.length} purchase records into inventory`,
      );
    }

    return {
      createdCount: ledgerEntries.length,
      skippedCount,
    };
  }

  /**
   * Get current inventory balance for an ingredient (SUM(delta_g)).
   */
  async getBalanceByIngredient(ingredientId: string): Promise<number> {
    return this.inventoryRepository.getCurrentBalanceByIngredient(ingredientId);
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

    const [adjustments, stocktakeLines] = await Promise.all([
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
    ]);

    const adjustmentMap = new Map(adjustments.map((item) => [item.id, item]));
    const stocktakeLineMap = new Map(
      stocktakeLines.map((item) => [
        `${item.stocktakeId}:${item.ingredientId}`,
        item,
      ]),
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

      return {
        id: entry.id,
        ingredientId: entry.ingredientId,
        ingredientName: ingredient?.name ?? entry.ingredientId,
        deltaG: entry.deltaG,
        stockUnitLabel: this.resolveStockUnitLabel(ingredient),
        sourceType: entry.sourceType as InventorySourceType,
        sourceId: entry.sourceId,
        sourceLabel: this.resolveSourceLabel(entry.sourceType as InventorySourceType),
        sourceDescription: this.resolveSourceDescription(
          entry.sourceType as InventorySourceType,
          adjustment,
          stocktakeLine,
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
      where: {
        id: dto.ingredientId,
      },
      select: {
        id: true,
        name: true,
        baseUnit: true,
        unitDisplayLabel: true,
      },
    });

    if (!ingredient) {
      throw new NotFoundException(`Ingredient not found: ${dto.ingredientId}`);
    }

    if (!Number.isFinite(dto.quantity)) {
      throw new BadRequestException('quantity must be a finite number');
    }

    const currentBalance = await this.getBalanceByIngredient(dto.ingredientId);
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

    if (quantityAfterG < 0) {
      throw new BadRequestException('库存调整后不能为负数');
    }

    const adjustment = new InventoryAdjustment(
      randomUUID(),
      dto.ingredientId,
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
          adjustmentMode: adjustment.adjustmentMode as any,
          quantityBeforeG: adjustment.quantityBeforeG,
          quantityAfterG: adjustment.quantityAfterG,
          deltaG: adjustment.deltaG,
          reason: adjustment.reason,
          note: adjustment.note,
          createdAt: adjustment.createdAt,
        },
      });

      await tx.inventoryLedgerEntry.create({
        data: {
          id: randomUUID(),
          ingredientId: adjustment.ingredientId,
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
      stockUnitLabel: this.resolveStockUnitLabel(ingredient),
      adjustmentMode: adjustment.adjustmentMode,
      quantityBeforeG: adjustment.quantityBeforeG,
      quantityAfterG: adjustment.quantityAfterG,
      deltaG: adjustment.deltaG,
      reason: adjustment.reason,
      note: adjustment.note,
      createdAt: adjustment.createdAt.toISOString(),
    };
  }

  /**
   * Create a stocktake, optionally applying the variance immediately.
   */
  async createStocktake(
    dto: CreateInventoryStocktakeDto,
  ): Promise<InventoryStocktakeDto> {
    if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new BadRequestException('盘点单至少需要一条原料明细');
    }

    const lineMap = new Map<string, CreateInventoryStocktakeLineDto>();
    for (const line of dto.lines) {
      if (!line?.ingredientId?.trim()) {
        throw new BadRequestException('ingredientId is required');
      }
      if (!Number.isFinite(line.countedQuantityG) || line.countedQuantityG < 0) {
        throw new BadRequestException('countedQuantityG must be a non-negative number');
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
    const status = dto.applyImmediately
      ? InventoryStocktakeStatus.APPLIED
      : InventoryStocktakeStatus.DRAFT;
    const lines = ingredientIds.map((ingredientId) => {
      const expectedQuantityG = balances.get(ingredientId) ?? 0;
      const countedQuantityG = lineMap.get(ingredientId)!.countedQuantityG;
      return new InventoryStocktakeLine(
        randomUUID(),
        stocktakeId,
        ingredientId,
        expectedQuantityG,
        countedQuantityG,
        countedQuantityG - expectedQuantityG,
      );
    });

    const stocktake = new InventoryStocktake(
      stocktakeId,
      status,
      dto.note?.trim() || null,
      now,
      status === InventoryStocktakeStatus.APPLIED ? now : null,
      lines,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryStocktake.create({
        data: {
          id: stocktake.id,
          status: stocktake.status as any,
          note: stocktake.note,
          createdAt: stocktake.createdAt,
          appliedAt: stocktake.appliedAt,
        },
      });

      await tx.inventoryStocktakeLine.createMany({
        data: stocktake.lines.map((line) => ({
          id: line.id,
          stocktakeId: line.stocktakeId,
          ingredientId: line.ingredientId,
          expectedQuantityG: line.expectedQuantityG,
          countedQuantityG: line.countedQuantityG,
          deltaG: line.deltaG,
        })),
      });

      if (dto.applyImmediately) {
        const ledgerEntries = stocktake.lines
          .filter((line) => Math.abs(line.deltaG) > 0.0001)
          .map((line) => ({
            id: randomUUID(),
            ingredientId: line.ingredientId,
            deltaG: line.deltaG,
            sourceType: InventorySourceType.STOCKTAKE as any,
            sourceId: stocktake.id,
            createdAt: now,
          }));

        if (ledgerEntries.length > 0) {
          await tx.inventoryLedgerEntry.createMany({
            data: ledgerEntries,
            skipDuplicates: true,
          });
        }
      }
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
        .filter((line) => Math.abs(line.deltaG) > 0.0001)
        .map((line) => ({
          id: randomUUID(),
          ingredientId: line.ingredientId,
          deltaG: line.deltaG,
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
                baseUnit: true,
                unitDisplayLabel: true,
              },
            },
          },
        },
      },
    });

    return stocktakes.map((stocktake) => this.mapStocktake(stocktake));
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
                baseUnit: true,
                unitDisplayLabel: true,
              },
            },
          },
        },
      },
    });

    if (!stocktake) {
      throw new NotFoundException(`Stocktake not found: ${id}`);
    }

    return this.mapStocktake(stocktake);
  }

  private mapStocktake(stocktake: any): InventoryStocktakeDto {
    const lines: InventoryStocktakeLineDto[] = stocktake.lines.map((line: any) => ({
      id: line.id,
      ingredientId: line.ingredientId,
      ingredientName: line.ingredient?.name ?? line.ingredientId,
      stockUnitLabel: this.resolveStockUnitLabel(line.ingredient),
      expectedQuantityG: line.expectedQuantityG,
      countedQuantityG: line.countedQuantityG,
      deltaG: line.deltaG,
    }));

    return {
      id: stocktake.id,
      status: stocktake.status as InventoryStocktakeStatus,
      note: stocktake.note ?? null,
      createdAt: stocktake.createdAt.toISOString(),
      appliedAt: stocktake.appliedAt?.toISOString() ?? null,
      lineCount: lines.length,
      varianceCount: lines.filter((line) => Math.abs(line.deltaG) > 0.0001).length,
      totalAbsDeltaG: lines.reduce(
        (sum, line) => sum + Math.abs(line.deltaG),
        0,
      ),
      lines,
    };
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

  private resolveStockUnitLabel(
    ingredient?: IngredientStockMeta | null,
  ): string {
    return ingredient?.unitDisplayLabel || ingredient?.baseUnit || 'G';
  }

  private resolveSourceLabel(sourceType: InventorySourceType): string {
    const labelMap: Record<InventorySourceType, string> = {
      [InventorySourceType.KITCHEN_TASK]: '厨房领用',
      [InventorySourceType.PURCHASE_RECORD]: '采购入库',
      [InventorySourceType.MANUAL_ADJUSTMENT]: '手工调整',
      [InventorySourceType.STOCKTAKE]: '盘点差异',
    };
    return labelMap[sourceType];
  }

  private resolveSourceDescription(
    sourceType: InventorySourceType,
    adjustment: any,
    stocktakeLine: any,
  ): string | null {
    if (sourceType === InventorySourceType.MANUAL_ADJUSTMENT && adjustment) {
      return adjustment.note
        ? `${adjustment.reason} / ${adjustment.note}`
        : adjustment.reason;
    }

    if (sourceType === InventorySourceType.STOCKTAKE && stocktakeLine) {
      return stocktakeLine.stocktake?.note || '盘点差异入账';
    }

    return null;
  }
}
