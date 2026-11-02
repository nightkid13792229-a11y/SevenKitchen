import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { Ingredient } from '../../domain/ingredient/ingredient.entity';

/**
 * 成品鲜食的算价依据（2026-11-02 老板定）。
 *
 * 口径：
 * 1. 该**标准原料**最近一次采购价 —— 只认「已完成」的采购清单；
 * 2. 没有采购历史 → 原料创建时录入的单价（只写一次，不随改价变化）；
 * 3. 创建价缺失或为 0（历史脏数据）→ 当前价兜底，并记一条 warn。
 *
 * 为什么不再按采购 SKU 算价：
 * 旧逻辑按「商超优先」三档来源方案自动挑一个 SKU，还专挑同档里最贵的，
 * 和实际付的钱脱节；三档方案已整体下线。
 */
export type IngredientPriceBasisSource =
  | 'LATEST_PURCHASE'
  | 'INITIAL_PRICE'
  | 'CURRENT_PRICE'
  | 'SKU_REFERENCE'
  | 'NONE';

export interface IngredientPriceBasis {
  ingredientId: string;
  /** 采购单位单价（元 / 采购单位） */
  pricePerPurchaseUnit: number;
  /** 折合基础单位单价（元 / g、元 / 粒 …），用于展示 */
  baseUnitCost: number | null;
  source: IngredientPriceBasisSource;
  /** 最近一次采购日期；不是采购价时为空 */
  purchasedAt: Date | null;
  /** 采购单位与基础单位的换算比例，仅用于展示 */
  purchaseToBaseRatio: number;
}

interface LatestPurchaseRow {
  ingredientId: string;
  actualCost: Prisma.Decimal | number | string | null;
  actualBaseQuantity: Prisma.Decimal | number | string | null;
  actualQuantity: Prisma.Decimal | number | string | null;
  purchasedAt: Date;
}

interface IngredientPriceMetaRow {
  id: string;
  purchaseToBaseRatio: number;
  initialPricePerPurchaseUnit: Prisma.Decimal | null;
  currentPricePerPurchaseUnit: Prisma.Decimal;
}

@Injectable()
export class IngredientPriceBasisService {
  private readonly logger = new Logger(IngredientPriceBasisService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 批量解析算价依据：最近采购 → 创建价 → 当前价 → 商品参考价。
   */
  async resolveBasis(
    ingredientIds: string[],
  ): Promise<Map<string, IngredientPriceBasis>> {
    const uniqueIds = Array.from(
      new Set(ingredientIds.filter((id): id is string => Boolean(id))),
    );
    const result = new Map<string, IngredientPriceBasis>();
    if (uniqueIds.length === 0) {
      return result;
    }

    const [latestRows, metaRows] = await Promise.all([
      this.findLatestCompletedPurchases(uniqueIds),
      this.prisma.ingredient.findMany({
        where: { id: { in: uniqueIds } },
        select: {
          id: true,
          purchaseToBaseRatio: true,
          initialPricePerPurchaseUnit: true,
          currentPricePerPurchaseUnit: true,
        },
      }) as Promise<IngredientPriceMetaRow[]>,
    ]);

    const latestByIngredient = new Map(
      latestRows.map((row) => [row.ingredientId, row]),
    );

    // 商品参考价：既用来兜底，也用来判断某条采购记录是否明显录错
    const skuReferences = await this.loadSkuReferencePrices(
      metaRows.map((meta) => meta.id),
    );

    for (const meta of metaRows) {
      const ratio =
        Number.isFinite(meta.purchaseToBaseRatio) &&
        Number(meta.purchaseToBaseRatio) > 0
          ? Number(meta.purchaseToBaseRatio)
          : 1;

      const initialPrice = this.toPrice(meta.initialPricePerPurchaseUnit);
      const currentPrice = this.toPrice(meta.currentPricePerPurchaseUnit);
      const skuReference = skuReferences.get(meta.id);
      const skuReferencePrice =
        skuReference && skuReference > 0
          ? this.roundTo(skuReference * ratio, 6)
          : 0;
      const referencePrice =
        initialPrice > 0
          ? initialPrice
          : skuReferencePrice > 0
            ? skuReferencePrice
            : currentPrice;

      const fromPurchase = this.priceFromPurchaseRecord(
        latestByIngredient.get(meta.id),
        ratio,
      );

      if (fromPurchase) {
        // 采购记录可能录错（例如把克数填成「数量 × 数量」）。
        // 与参考价差 5 倍以上的记录不用于算价，记一条 warn 交给后台核对。
        const withinBand =
          referencePrice <= 0 ||
          (fromPurchase.pricePerPurchaseUnit >= referencePrice / 5 &&
            fromPurchase.pricePerPurchaseUnit <= referencePrice * 5);

        if (withinBand) {
          result.set(meta.id, fromPurchase);
          continue;
        }

        this.logger.warn(
          `原料 ${meta.id} 的最近采购价 ${fromPurchase.pricePerPurchaseUnit} 与参考价 ${referencePrice} 相差过大，已跳过该记录`,
        );
      }

      if (initialPrice > 0) {
        result.set(
          meta.id,
          this.buildBasis(meta.id, initialPrice, ratio, 'INITIAL_PRICE'),
        );
        continue;
      }

      if (skuReferencePrice > 0) {
        result.set(
          meta.id,
          this.buildBasis(meta.id, skuReferencePrice, ratio, 'SKU_REFERENCE'),
        );
        this.logger.warn(
          `原料 ${meta.id} 没有采购记录、也没有创建价，临时按商品参考价 ${skuReferencePrice} 算价`,
        );
        continue;
      }

      if (currentPrice > 0) {
        result.set(
          meta.id,
          this.buildBasis(meta.id, currentPrice, ratio, 'CURRENT_PRICE'),
        );
        continue;
      }

      this.logger.warn(
        `原料 ${meta.id} 没有任何可用价格（采购/创建价/商品价/当前价），按 0 计`,
      );
      result.set(meta.id, {
        ingredientId: meta.id,
        pricePerPurchaseUnit: 0,
        baseUnitCost: null,
        source: 'NONE',
        purchasedAt: null,
        purchaseToBaseRatio: ratio,
      });
    }

    return result;
  }

  /**
   * 按算价依据复制原料（只替换价格，不改主数据）。
   * 解析不到依据的原料原样返回。
   */
  async applyToIngredients(
    ingredients: Ingredient[],
  ): Promise<Map<string, Ingredient>> {
    const basisMap = await this.resolveBasis(
      ingredients.map((ingredient) => ingredient.id),
    );

    return new Map(
      ingredients.map((ingredient) => {
        const basis = basisMap.get(ingredient.id);
        if (!basis || basis.pricePerPurchaseUnit <= 0) {
          return [ingredient.id, ingredient];
        }
        return [
          ingredient.id,
          ingredient.withCurrentPrice(basis.pricePerPurchaseUnit),
        ];
      }),
    );
  }

  private async findLatestCompletedPurchases(
    ingredientIds: string[],
  ): Promise<LatestPurchaseRow[]> {
    return this.prisma.$queryRaw<LatestPurchaseRow[]>(Prisma.sql`
      SELECT DISTINCT ON (pr.ingredient_id)
        pr.ingredient_id AS "ingredientId",
        pr.actual_cost AS "actualCost",
        pr.actual_base_quantity AS "actualBaseQuantity",
        pr.actual_quantity AS "actualQuantity",
        pr.purchased_at AS "purchasedAt"
      FROM purchase_record pr
      JOIN purchase_list pl ON pl.id = pr.purchase_list_id
      WHERE pl.status = 'COMPLETED'
        AND pr.ingredient_id IN (${Prisma.join(ingredientIds)})
      ORDER BY pr.ingredient_id, pr.purchased_at DESC, pr.created_at DESC
    `);
  }

  private priceFromPurchaseRecord(
    row: LatestPurchaseRow | undefined,
    ratio: number,
  ): IngredientPriceBasis | null {
    if (!row) {
      return null;
    }

    const actualCost = this.toNumber(row.actualCost);
    const actualBaseQuantity = this.toNumber(row.actualBaseQuantity);
    const actualQuantity = this.toNumber(row.actualQuantity);

    const baseQuantity =
      actualBaseQuantity > 0 ? actualBaseQuantity : actualQuantity * ratio;

    if (
      !Number.isFinite(actualCost) ||
      actualCost <= 0 ||
      !Number.isFinite(baseQuantity) ||
      baseQuantity <= 0
    ) {
      return null;
    }

    const baseUnitCost = actualCost / baseQuantity;
    const pricePerPurchaseUnit = this.roundTo(baseUnitCost * ratio, 6);
    if (pricePerPurchaseUnit <= 0) {
      return null;
    }

    return {
      ingredientId: row.ingredientId,
      pricePerPurchaseUnit,
      baseUnitCost: this.roundTo(baseUnitCost, 6),
      source: 'LATEST_PURCHASE',
      purchasedAt: row.purchasedAt,
      purchaseToBaseRatio: ratio,
    };
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'object' && 'toNumber' in (value as any)) {
      return Number((value as any).toNumber());
    }
    return Number(value);
  }

  private buildBasis(
    ingredientId: string,
    pricePerPurchaseUnit: number,
    ratio: number,
    source: IngredientPriceBasisSource,
  ): IngredientPriceBasis {
    return {
      ingredientId,
      pricePerPurchaseUnit,
      baseUnitCost: this.roundTo(pricePerPurchaseUnit / ratio, 6),
      source,
      purchasedAt: null,
      purchaseToBaseRatio: ratio,
    };
  }

  /**
   * 商品参考价：该原料所有启用商品「基础单位成本」的**中位数**。
   * 取中位数而不是最高价，避免小包装把参考价抬到离谱的量级。
   */
  private async loadSkuReferencePrices(
    ingredientIds: string[],
  ): Promise<Map<string, number>> {
    if (ingredientIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        ingredientId: string;
        unitCost: Prisma.Decimal | number | string;
      }>
    >(Prisma.sql`
      SELECT
        s.ingredient_id AS "ingredientId",
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY s.current_purchase_price / NULLIF(s.purchase_to_base_ratio, 0)
        ) AS "unitCost"
      FROM procurement_sku s
      WHERE s.is_active = true
        AND s.purchase_to_base_ratio > 0
        AND s.current_purchase_price > 0
        AND s.ingredient_id IN (${Prisma.join(ingredientIds)})
      GROUP BY s.ingredient_id
    `);

    return new Map(
      rows.map((row) => [row.ingredientId, this.toNumber(row.unitCost)]),
    );
  }

  private toPrice(value: Prisma.Decimal | null | undefined): number {
    return this.roundTo(this.toNumber(value), 6);
  }

  private roundTo(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}
