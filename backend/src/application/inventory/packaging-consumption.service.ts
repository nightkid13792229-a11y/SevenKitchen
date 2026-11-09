import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  DEFAULT_PRODUCT_LABEL_INGREDIENT_ID,
  ICE_PACK_INGREDIENT_ID,
  PackagingService,
} from '../../domain/packaging/packaging.service';
import { GlobalConfigService } from '../config/global-config.service';
import { InventorySourceType } from '../../domain/inventory/enums';

interface PendingRow {
  ingredientId: string;
  sourceId: string;
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
    const bump = (
      sourceId: string,
      ingredientId: string,
      quantity: number,
    ) => {
      if (quantity <= 0) return;
      const key = `${sourceId}|${ingredientId}`;
      const existing = aggregates.get(key);
      if (existing) {
        existing.quantity += quantity;
      } else {
        aggregates.set(key, { ingredientId, sourceId, quantity });
      }
    };

    for (const item of items) {
      if (tastingOrderIds.has(item.orderId)) continue;
      const sourceId = `${input.shipmentId}:${item.orderId}`;
      const bag = await this.packagingService.selectVacuumBag(item.specG);
      bump(sourceId, bag.id, item.bags);
      bump(sourceId, labelId, item.bags);
    }

    // 箱 / 保温袋 / 冰袋：按包裹扣（一个运单 = 一个箱子）
    const packages = await tx.orderShipmentPackage.findMany({
      where: { shipmentId: input.shipmentId },
      select: {
        id: true,
        boxIngredientId: true,
        thermalBagIngredientId: true,
      },
    });
    for (const pkg of packages) {
      if (!pkg.boxIngredientId) continue;
      const box = await tx.ingredient.findUnique({
        where: { id: pkg.boxIngredientId },
        select: { id: true, name: true, productModel: true },
      });
      if (!box) {
        this.logger.warn(
          `[Packaging] 包裹 ${pkg.id} 的箱型 ${pkg.boxIngredientId} 不存在，跳过`,
        );
        continue;
      }
      const { icePacks } = await this.packagingService.resolveBoxContainer(
        box as any,
      );
      const sourceId = `${input.shipmentId}:pkg:${pkg.id}`;
      bump(sourceId, box.id, 1);
      if (pkg.thermalBagIngredientId) {
        bump(sourceId, pkg.thermalBagIngredientId, 1);
      }
      bump(sourceId, ICE_PACK_INGREDIENT_ID, icePacks);
    }

    const rows = Array.from(aggregates.values()).map((row) => ({
      ingredientId: row.ingredientId,
      deltaG: -Math.abs(row.quantity),
      procurementSkuId: null,
      sourceType: InventorySourceType.PACKAGING_CONSUMPTION as any,
      sourceId: row.sourceId,
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

  /**
   * 决定一个包裹用什么箱、配什么保温袋。
   * 没传箱型就按总重推荐；传了必须是泡沫箱，且能配到保温袋。
   */
  async resolvePackageContainer(
    weightG: number,
    boxIngredientId?: string | null,
  ): Promise<{
    boxIngredientId: string;
    thermalBagIngredientId: string;
    icePacks: number;
  }> {
    if (boxIngredientId) {
      const box = await this.prisma.ingredient.findUnique({
        where: { id: boxIngredientId },
        select: { id: true, name: true, type: true, productModel: true },
      });
      if (!box || box.type !== 'PACKAGING' || !box.name.includes('泡沫箱')) {
        throw new BadRequestException('箱型必须是泡沫箱原料');
      }
      const { thermalBag, icePacks } =
        await this.packagingService.resolveBoxContainer(box as any);
      return {
        boxIngredientId: box.id,
        thermalBagIngredientId: thermalBag.id,
        icePacks,
      };
    }

    const containers =
      await this.packagingService.calculateShippingContainers(weightG);
    const first = containers[0];
    if (!first) {
      throw new BadRequestException('算不出合适的箱型');
    }
    return {
      boxIngredientId: first.boxItem.id,
      thermalBagIngredientId: first.thermalItem.id,
      icePacks: first.icePacks,
    };
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
