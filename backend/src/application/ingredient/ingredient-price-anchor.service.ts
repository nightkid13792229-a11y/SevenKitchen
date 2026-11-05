import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';

/**
 * 原料价格的**基准价**（2026-11-06「单一来源」改造 · 阶段 A）
 *
 * 基准价 = 该原料**历史采购价的中位数**。
 *
 * 为什么用中位数，不用上一次价、也不用创建价：
 * - 上一次价可能本身就是错的（2026-11-04 小米 38.30 元/g 事故就是「旧价已经错了，
 *   只看相对上一次的波动才 -10.7%，看着完全正常」）；
 * - 创建价是 2026-11-02 用旧算法回填的一次性快照，之后没人维护；
 * - 中位数由采购记录自动维护，个别离谱记录不会把基准带偏。
 *
 * 排除本批正在写入的采购记录：否则新值会污染基准，闸门等于自己给自己放行。
 *
 * 口径与算价一致：折算到「元 / 采购单位」。
 */
@Injectable()
export class IngredientPriceAnchorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 批量取基准价。没有可用历史采购的原料不会出现在返回的 Map 里，
   * 调用方应退回「上一次生效价」或按首次定价处理。
   */
  async resolveAnchors(params: {
    ingredientIds: string[];
    excludePurchaseRecordIds?: string[];
  }): Promise<Map<string, number>> {
    const ingredientIds = Array.from(
      new Set((params.ingredientIds || []).filter(Boolean)),
    );
    const result = new Map<string, number>();
    if (ingredientIds.length === 0) {
      return result;
    }

    const excludeIds = Array.from(
      new Set((params.excludePurchaseRecordIds || []).filter(Boolean)),
    );
    const exclusion =
      excludeIds.length > 0
        ? Prisma.sql`AND record_id NOT IN (${Prisma.join(excludeIds)})`
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        ingredientId: string;
        anchor: Prisma.Decimal | number | string | null;
      }>
    >(Prisma.sql`
      WITH priced AS (
        SELECT
          pr.ingredient_id AS ingredient_id,
          pr.id AS record_id,
          CASE
            WHEN COALESCE(
              NULLIF(pr.actual_base_quantity, 0),
              pr.actual_quantity * NULLIF(i.purchase_to_base_ratio, 0)
            ) > 0
            THEN pr.actual_cost
              / COALESCE(
                  NULLIF(pr.actual_base_quantity, 0),
                  pr.actual_quantity * NULLIF(i.purchase_to_base_ratio, 0)
                )
              * COALESCE(NULLIF(i.purchase_to_base_ratio, 0), 1)
          END AS unit_price
        FROM purchase_record pr
        JOIN purchase_list pl ON pl.id = pr.purchase_list_id
        JOIN ingredient i ON i.id = pr.ingredient_id
        WHERE pl.status = 'COMPLETED'
          AND pr.ingredient_id IN (${Prisma.join(ingredientIds)})
      )
      SELECT
        ingredient_id AS "ingredientId",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_price) AS anchor
      FROM priced
      WHERE unit_price IS NOT NULL
        AND unit_price > 0
        ${exclusion}
      GROUP BY ingredient_id
    `);

    for (const row of rows) {
      const value = this.toNumber(row.anchor);
      if (Number.isFinite(value) && value > 0) {
        result.set(row.ingredientId, this.roundTo(value, 6));
      }
    }

    return result;
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

  private roundTo(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}
