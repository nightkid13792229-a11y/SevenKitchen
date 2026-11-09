import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  DEFAULT_PRODUCT_LABEL_INGREDIENT_ID,
  PackagingService,
} from '../../domain/packaging/packaging.service';
import { GlobalConfigService } from '../config/global-config.service';
import { InventorySourceType } from '../../domain/inventory/enums';

interface PendingRow {
  ingredientId: string;
  orderId: string | null;
  quantity: number;
}

@Injectable()
export class PackagingConsumptionService {
  private readonly logger = new Logger(PackagingConsumptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly packagingService: PackagingService,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  /**
   * 发货确认时扣袋/标签。
   * 数据源是发货明细（每行：订单 + 每袋克数 + 袋数），不是价格快照。
   * 试吃装发货跳过——成品在分装完工时已经装袋。
   */
  async consumePackagingForShipment(
    tx: Prisma.TransactionClient,
    input: { shipmentId: string; orderIds: string[] },
  ): Promise<{ entryCount: number }> {
    const items = await tx.orderShipmentPackageItem.findMany({
      where: { package: { shipmentId: input.shipmentId } },
      select: { orderId: true, specG: true, bags: true },
    });
    if (items.length === 0) return { entryCount: 0 };

    const tasting = await tx.orderItem.findMany({
      where: {
        orderId: { in: input.orderIds },
        tastingPackId: { not: null },
      },
      select: { orderId: true },
    });
    const tastingOrderIds = new Set(tasting.map((row) => row.orderId));

    const config = await this.globalConfigService.getGlobalConfig();
    const labelId =
      config.defaultProductLabelId || DEFAULT_PRODUCT_LABEL_INGREDIENT_ID;

    const aggregates = new Map<string, PendingRow>();
    const bump = (orderId: string, ingredientId: string, quantity: number) => {
      if (quantity <= 0) return;
      const key = `${orderId}|${ingredientId}`;
      const existing = aggregates.get(key);
      if (existing) {
        existing.quantity += quantity;
      } else {
        aggregates.set(key, { ingredientId, orderId, quantity });
      }
    };

    for (const item of items) {
      if (tastingOrderIds.has(item.orderId)) continue;
      const bag = await this.packagingService.selectVacuumBag(item.specG);
      bump(item.orderId, bag.id, item.bags);
      bump(item.orderId, labelId, item.bags);
    }

    const rows = Array.from(aggregates.values()).map((row) => ({
      ingredientId: row.ingredientId,
      deltaG: -Math.abs(row.quantity),
      procurementSkuId: null,
      sourceType: InventorySourceType.PACKAGING_CONSUMPTION as any,
      sourceId: `${input.shipmentId}:${row.orderId}`,
      sourceVersion: 1,
      costAmount: null,
      createdAt: new Date(),
    }));

    if (!config.packagingDeductionEnabled) {
      this.logger.log(
        `[Packaging] 包材扣减开关关闭，跳过发货 ${input.shipmentId}（应扣 ${rows.length} 行）`,
      );
      return { entryCount: 0 };
    }

    if (rows.length > 0) {
      await tx.inventoryLedgerEntry.createMany({
        data: rows,
        skipDuplicates: true,
      });
    }
    this.logger.log(
      `[Packaging] 发货 ${input.shipmentId} 扣包材 ${rows.length} 行`,
    );
    return { entryCount: rows.length };
  }

  /** 备货锅完工时按分装计划扣袋/标签（订单锅不走这条）。 */
  async consumeForPackagingUnit(
    unit: {
      id: string;
      stockPortionPlan?: { packageSpecG: number; packageCount: number } | null;
      sourceOrderItemIds?: string[];
    },
    actorId?: string,
  ): Promise<{ entryCount: number }> {
    if (!unit.stockPortionPlan) return { entryCount: 0 };
    if ((unit.sourceOrderItemIds || []).length > 0) return { entryCount: 0 };

    return this.prisma.$transaction(async (tx) => {
      const config = await this.globalConfigService.getGlobalConfig();
      const labelId =
        config.defaultProductLabelId || DEFAULT_PRODUCT_LABEL_INGREDIENT_ID;
      const bag = await this.packagingService.selectVacuumBag(
        unit.stockPortionPlan!.packageSpecG,
      );
      const count = Number(unit.stockPortionPlan!.packageCount || 0);
      const rows = [
        { ingredientId: bag.id, quantity: count },
        { ingredientId: labelId, quantity: count },
      ]
        .filter((row) => row.quantity > 0)
        .map((row) => ({
          ingredientId: row.ingredientId,
          deltaG: -Math.abs(row.quantity),
          procurementSkuId: null,
          sourceType: InventorySourceType.PACKAGING_CONSUMPTION as any,
          sourceId: `${unit.id}:stock`,
          sourceVersion: 1,
          costAmount: null,
          createdAt: new Date(),
        }));

      if (!config.packagingDeductionEnabled) {
        this.logger.log(
          `[Packaging] 包材扣减开关关闭，跳过备货锅 ${unit.id}（应扣 ${rows.length} 行）`,
        );
        return { entryCount: 0 };
      }

      if (rows.length > 0) {
        await tx.inventoryLedgerEntry.createMany({
          data: rows,
          skipDuplicates: true,
        });
      }
      this.logger.log(
        `[Packaging] 备货锅 ${unit.id} 扣包材 ${rows.length} 行（操作人 ${actorId ?? 'unknown'}）`,
      );
      return { entryCount: rows.length };
    });
  }
}
