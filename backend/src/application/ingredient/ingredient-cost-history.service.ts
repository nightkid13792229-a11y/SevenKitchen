import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';

/**
 * 食材成本流水（2026-11-07「成本口径归位」）。
 *
 * 一条流水 = 一次「每基准单位成本」的变化。四个来源：
 *   · INIT_FROM_SKU —— 建档时用第一条采购商品的价初始化
 *   · REIMBURSEMENT —— 采购报销审批后按实付覆盖
 *   · MANUAL        —— 后台手工改价
 *   · MIGRATION     —— 口径迁移折算
 *
 * 为什么单独一张表（不复用 `IngredientPriceChange`）：
 * 那张表带 `reimbursement_id` / `purchase_record_id` 非空外键，是**报销审批
 * 工作流表**。手工改价和建档初始化根本没有报销单，塞进去只能改约束或造单号。
 *
 * 为什么写入口只有这一处：成本是「售价的输入」，任何一条写入路径都不能绕开留痕，
 * 否则半年后没人能解释「这条原料的价为什么是这个数」。
 */
@Injectable()
export class IngredientCostHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordIngredientCostInput): Promise<void> {
    const client = input.tx ?? this.prisma;

    await client.ingredientPriceHistory.create({
      data: {
        ingredientId: input.ingredientId,
        oldCostPerBaseUnit: this.toNullableRound(input.oldCost),
        newCostPerBaseUnit: this.round6(input.newCost),
        source: input.source,
        procurementSkuId: input.procurementSkuId ?? null,
        reimbursementId: input.reimbursementId ?? null,
        purchaseRecordId: input.purchaseRecordId ?? null,
        operatorId: input.operatorId ?? null,
        note: input.note ?? null,
      },
    });
  }

  async list(ingredientId: string, limit = 50): Promise<IngredientCostHistoryView[]> {
    const rows = await this.prisma.ingredientPriceHistory.findMany({
      where: { ingredientId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { operator: { select: { nickname: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      oldCostPerBaseUnit: this.toNullableNumber(row.oldCostPerBaseUnit),
      newCostPerBaseUnit: this.toNullableNumber(row.newCostPerBaseUnit) ?? 0,
      source: row.source as IngredientPriceHistorySourceCode,
      note: row.note ?? null,
      operatorName: row.operator?.nickname ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** 与 `numeric(14,6)` 对齐：先乘再除，避免 0.079812345 被存成 0.07981234500000001 */
  private round6(value: number): number {
    return Math.round(value * 1e6) / 1e6;
  }

  private toNullableRound(value: number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (!Number.isFinite(Number(value))) {
      return null;
    }
    return this.round6(Number(value));
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)) {
      return Number((value as { toNumber: () => number }).toNumber());
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
}

export type IngredientPriceHistorySourceCode =
  | 'INIT_FROM_SKU'
  | 'REIMBURSEMENT'
  | 'MANUAL'
  | 'MIGRATION';

export interface RecordIngredientCostInput {
  ingredientId: string;
  /** 变更前成本（元/基准单位）；建档初始化时为空 */
  oldCost: number | null | undefined;
  /** 变更后成本（元/基准单位） */
  newCost: number;
  source: IngredientPriceHistorySourceCode;
  procurementSkuId?: string | null;
  reimbursementId?: string | null;
  purchaseRecordId?: string | null;
  operatorId?: string | null;
  note?: string | null;
  /** 传了就走调用方的事务，避免「价写了、流水没写」 */
  tx?: Prisma.TransactionClient;
}

export interface IngredientCostHistoryView {
  id: string;
  oldCostPerBaseUnit: number | null;
  newCostPerBaseUnit: number;
  source: IngredientPriceHistorySourceCode;
  note: string | null;
  operatorName: string | null;
  createdAt: string;
}
