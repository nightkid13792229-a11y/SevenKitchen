import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';

/**
 * 订单详情里的「实际采购」披露（2026-11-02）。
 *
 * 口径：
 * - 只认**已完成**的采购清单；未完成时返回状态占位。
 * - 本单某原料有采购记录 → ORDER_PURCHASE（渠道 + 采购产品名）。
 * - 没有记录、但采购明细显示库存抵扣 → FROM_INVENTORY，
 *   给该原料**最近一次**真实采购，并在前端标注「库存采购日期」。
 * - 产品名取采购时冻结的名字（渠道商原始名称，不改写），
 *   没有才回落到商品当前名；仍没有则用原料名。
 */
export type ProcurementDisclosureStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export type ProcurementDisclosureSource =
  | 'ORDER_PURCHASE'
  | 'FROM_INVENTORY';

export interface ProcurementDisclosureItem {
  ingredientId: string;
  ingredientName: string;
  source: ProcurementDisclosureSource;
  channel: string | null;
  /** 采购商品的品牌；补剂展示用 */
  brand: string | null;
  productName: string | null;
  /** YYYY-MM-DD */
  purchasedAt: string | null;
}

export interface ProcurementDisclosure {
  status: ProcurementDisclosureStatus;
  /** 最近一张相关采购清单的完成日期 YYYY-MM-DD */
  completedAt: string | null;
  items: ProcurementDisclosureItem[];
}

interface PurchaseRecordLite {
  ingredientId: string;
  purchaseChannel: string | null;
  procurementSkuName: string | null;
  procurementSkuId: string | null;
  purchasedAt: Date;
}

@Injectable()
export class OrderProcurementDisclosureService {
  constructor(private readonly prisma: PrismaService) {}

  async build(params: {
    orderId: string;
    ingredients: Array<{ id: string; name: string }>;
  }): Promise<ProcurementDisclosure | null> {
    const ingredientIds = Array.from(
      new Set(params.ingredients.map((item) => item.id).filter(Boolean)),
    );
    if (ingredientIds.length === 0) {
      return null;
    }

    const lists = await this.prisma.purchaseList.findMany({
      where: { sourceOrderIds: { has: params.orderId } },
      select: { id: true, status: true, completedAt: true },
    });

    if (lists.length === 0) {
      return { status: 'NOT_STARTED', completedAt: null, items: [] };
    }

    const completedLists = lists.filter((list) => list.status === 'COMPLETED');
    const completedIds = completedLists.map((list) => list.id);
    const status: ProcurementDisclosureStatus =
      completedLists.length === 0
        ? 'IN_PROGRESS'
        : completedLists.length === lists.length
          ? 'COMPLETED'
          : 'IN_PROGRESS';

    const completedAt = this.latestDate(
      completedLists
        .map((list) => list.completedAt)
        .filter((value): value is Date => Boolean(value)),
    );

    if (completedIds.length === 0) {
      return {
        status,
        completedAt: this.toDateString(completedAt),
        items: [],
      };
    }

    const [records, purchaseItems] = await Promise.all([
      this.prisma.purchaseRecord.findMany({
        where: {
          purchaseListId: { in: completedIds },
          ingredientId: { in: ingredientIds },
        },
        orderBy: [{ purchasedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          ingredientId: true,
          purchaseChannel: true,
          procurementSkuName: true,
          procurementSkuId: true,
          purchasedAt: true,
        },
      }),
      this.prisma.purchaseItem.findMany({
        where: {
          purchaseListId: { in: completedIds },
          ingredientId: { in: ingredientIds },
        },
        select: {
          ingredientId: true,
          stockDeductedQuantity: true,
        },
      }),
    ]);

    const latestByIngredient = this.pickLatestByIngredient(records);

    const inventoryCovered = new Set(
      purchaseItems
        .filter((item) => Number(item.stockDeductedQuantity ?? 0) > 0)
        .map((item) => item.ingredientId),
    );

    const needFallback = ingredientIds.filter(
      (ingredientId) =>
        !latestByIngredient.has(ingredientId) &&
        inventoryCovered.has(ingredientId),
    );
    const fallbackRecords = await this.findLatestCompletedRecords(needFallback);

    const skuIds = Array.from(
      new Set(
        [...records, ...fallbackRecords]
          .map((record) => record.procurementSkuId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const skuInfoById = await this.loadSkuInfo(skuIds);

    const items: ProcurementDisclosureItem[] = [];
    for (const ingredient of params.ingredients) {
      const ownRecord = latestByIngredient.get(ingredient.id);
      if (ownRecord) {
        items.push(
          this.toItem(ingredient, ownRecord, 'ORDER_PURCHASE', skuInfoById),
        );
        continue;
      }

      if (!inventoryCovered.has(ingredient.id)) {
        continue;
      }

      const fallback = fallbackRecords.find(
        (record) => record.ingredientId === ingredient.id,
      );
      if (!fallback) {
        // 库存抵扣了，但历史上没有可公开的采购记录：宁可不说，也不编。
        continue;
      }

      items.push(
        this.toItem(ingredient, fallback, 'FROM_INVENTORY', skuInfoById),
      );
    }

    return {
      status,
      completedAt: this.toDateString(completedAt),
      items,
    };
  }

  private toItem(
    ingredient: { id: string; name: string },
    record: PurchaseRecordLite,
    source: ProcurementDisclosureSource,
    skuInfoById: Map<string, { name: string; brand: string | null }>,
  ): ProcurementDisclosureItem {
    const skuInfo = record.procurementSkuId
      ? skuInfoById.get(record.procurementSkuId)
      : null;
    const productName =
      this.normalizeText(record.procurementSkuName) ||
      this.normalizeText(skuInfo?.name) ||
      this.normalizeText(ingredient.name) ||
      null;

    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      source,
      channel: this.normalizeText(record.purchaseChannel) || null,
      brand: this.normalizeText(skuInfo?.brand) || null,
      productName,
      purchasedAt: this.toDateString(record.purchasedAt),
    };
  }

  private pickLatestByIngredient(
    records: PurchaseRecordLite[],
  ): Map<string, PurchaseRecordLite> {
    const result = new Map<string, PurchaseRecordLite>();
    for (const record of records) {
      if (!result.has(record.ingredientId)) {
        result.set(record.ingredientId, record);
      }
    }
    return result;
  }

  private async findLatestCompletedRecords(
    ingredientIds: string[],
  ): Promise<PurchaseRecordLite[]> {
    if (ingredientIds.length === 0) {
      return [];
    }

    return this.prisma.$queryRaw<PurchaseRecordLite[]>(Prisma.sql`
      SELECT DISTINCT ON (pr.ingredient_id)
        pr.ingredient_id AS "ingredientId",
        pr.purchase_channel AS "purchaseChannel",
        pr.procurement_sku_name AS "procurementSkuName",
        pr.procurement_sku_id AS "procurementSkuId",
        pr.purchased_at AS "purchasedAt"
      FROM purchase_record pr
      JOIN purchase_list pl ON pl.id = pr.purchase_list_id
      WHERE pl.status = 'COMPLETED'
        AND pr.ingredient_id IN (${Prisma.join(ingredientIds)})
      ORDER BY pr.ingredient_id, pr.purchased_at DESC, pr.created_at DESC
    `);
  }

  private async loadSkuInfo(
    skuIds: string[],
  ): Promise<Map<string, { name: string; brand: string | null }>> {
    if (skuIds.length === 0) {
      return new Map();
    }

    const skus = await this.prisma.procurementSku.findMany({
      where: { id: { in: skuIds } },
      select: { id: true, name: true, brand: true },
    });

    return new Map(
      skus.map((sku) => [sku.id, { name: sku.name, brand: sku.brand }]),
    );
  }

  private latestDate(dates: Date[]): Date | null {
    if (dates.length === 0) {
      return null;
    }
    return dates.reduce((latest, current) =>
      current.getTime() > latest.getTime() ? current : latest,
    );
  }

  private toDateString(value: Date | null): string | null {
    if (!value) {
      return null;
    }
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeText(value: string | null | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
