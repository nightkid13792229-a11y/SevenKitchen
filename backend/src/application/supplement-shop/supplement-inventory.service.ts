import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { toSupplementBaseQuantity } from './supplement-unit.util';

type Tx = Prisma.TransactionClient;

interface OrderItemForInventory {
  ingredientId: string;
  name: string;
  unit: string;
  packedAmount: number;
  bags: number;
}

/**
 * 补剂库存（2026-10-20）
 *
 * 复用现有 InventoryAllocation / InventoryAllocationLine / InventoryLedgerEntry：
 * - 预占：sourceType=SUPPLEMENT_PACK，targetDate=分装日，sourceOrderIds=[orderId]
 * - 扣减：sourceType=SUPPLEMENT_PACK_CONSUMPTION，sourceId=orderId
 *
 * ⚠️ `quantityG` / `deltaG` 是历史命名，实际存的是原料 `baseUnit` 数量：
 * G / ML / PCS。平勺按 PCS 记（1 平勺 = 1 PCS），不换算成克。
 *
 * 开关：SUPPLEMENT_INVENTORY_RESERVATION_ENABLED=false 时全部 no-op，
 * 用于上线前/回滚；默认开启。
 */
@Injectable()
export class SupplementInventoryService {
  private readonly logger = new Logger(SupplementInventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get enabled(): boolean {
    // 默认关闭：先部署代码/迁移，回填已排订单占用后再显式开启。
    return process.env.SUPPLEMENT_INVENTORY_RESERVATION_ENABLED === 'true';
  }

  /**
   * 预占；已存在 ACTIVE allocation 时只移动日期（幂等）。
   * 必须在排期事务内调用。
   */
  async reserveForOrder(
    tx: Tx,
    orderId: string,
    targetDate?: Date,
  ): Promise<void> {
    if (!this.enabled) return;

    const order = await tx.supplementOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        packingDate: true,
        items: {
          select: {
            ingredientId: true,
            name: true,
            unit: true,
            packedAmount: true,
            bags: true,
          },
        },
      },
    });
    if (!order) throw new BadRequestException('补剂订单不存在');

    const date = targetDate ?? order.packingDate;
    if (!date) throw new BadRequestException('订单还没有分装日，不能预占库存');

    const existing = await tx.inventoryAllocation.findFirst({
      where: {
        status: 'ACTIVE',
        sourceType: 'SUPPLEMENT_PACK',
        sourceOrderIds: { has: orderId },
      },
      select: { id: true },
    });
    if (existing) {
      await tx.inventoryAllocation.update({
        where: { id: existing.id },
        data: { targetDate: date },
      });
      return;
    }

    const lines = await this.buildAllocationLines(tx, order.items);
    const allocation = await tx.inventoryAllocation.create({
      data: {
        targetDate: date,
        status: 'ACTIVE',
        sourceType: 'SUPPLEMENT_PACK',
        sourceOrderIds: [orderId],
      },
      select: { id: true },
    });
    await tx.inventoryAllocationLine.createMany({
      data: lines.map((line) => ({
        allocationId: allocation.id,
        ingredientId: line.ingredientId,
        quantityG: line.quantity,
      })),
    });
  }

  async moveReservation(
    tx: Tx,
    orderId: string,
    targetDate: Date,
  ): Promise<void> {
    if (!this.enabled) return;
    await tx.inventoryAllocation.updateMany({
      where: {
        status: 'ACTIVE',
        sourceType: 'SUPPLEMENT_PACK',
        sourceOrderIds: { has: orderId },
      },
      data: { targetDate },
    });
  }

  async releaseForOrder(tx: Tx, orderId: string): Promise<void> {
    if (!this.enabled) return;
    await tx.inventoryAllocation.updateMany({
      where: {
        status: 'ACTIVE',
        sourceType: 'SUPPLEMENT_PACK',
        sourceOrderIds: { has: orderId },
      },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });
  }

  /**
   * 分装前缺料检查：返回缺口（数量按 baseUnit）。
   * 判断口径：实物账面 < 全部 ACTIVE 预占 = 缺料；当前订单的预占也算在内。
   * 强制分装由调用方决定是否忽略。
   */
  async getShortages(
    tx: Tx,
    orderId: string,
  ): Promise<
    Array<{
      ingredientId: string;
      name: string;
      required: number;
      onHand: number;
      allocated: number;
    }>
  > {
    if (!this.enabled) return [];

    const allocation = await tx.inventoryAllocation.findFirst({
      where: {
        status: 'ACTIVE',
        sourceType: 'SUPPLEMENT_PACK',
        sourceOrderIds: { has: orderId },
      },
      include: { lines: true },
    });

    let requiredByIngredient = new Map<string, number>();
    if (allocation) {
      for (const line of allocation.lines) {
        requiredByIngredient.set(
          line.ingredientId,
          (requiredByIngredient.get(line.ingredientId) ?? 0) +
            Number(line.quantityG),
        );
      }
    } else {
      const order = await tx.supplementOrder.findUnique({
        where: { id: orderId },
        select: {
          items: {
            select: {
              ingredientId: true,
              name: true,
              unit: true,
              packedAmount: true,
              bags: true,
            },
          },
        },
      });
      if (!order) return [];
      const lines = await this.buildAllocationLines(tx, order.items);
      requiredByIngredient = new Map(
        lines.map((line) => [line.ingredientId, line.quantity]),
      );
    }

    const ids = Array.from(requiredByIngredient.keys());
    if (ids.length === 0) return [];

    const [balances, allocatedRows, ingredients] = await Promise.all([
      tx.inventoryLedgerEntry.groupBy({
        by: ['ingredientId'],
        where: { ingredientId: { in: ids } },
        _sum: { deltaG: true },
      }),
      tx.inventoryAllocationLine.groupBy({
        by: ['ingredientId'],
        where: {
          ingredientId: { in: ids },
          allocation: { status: 'ACTIVE' },
        },
        _sum: { quantityG: true },
      }),
      tx.ingredient.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      }),
    ]);

    const balanceMap = new Map(
      balances.map((row) => [row.ingredientId, Number(row._sum.deltaG ?? 0)]),
    );
    const allocatedMap = new Map(
      allocatedRows.map((row) => [
        row.ingredientId,
        Number(row._sum.quantityG ?? 0),
      ]),
    );
    const nameMap = new Map(ingredients.map((row) => [row.id, row.name]));

    const shortages: Array<{
      ingredientId: string;
      name: string;
      required: number;
      onHand: number;
      allocated: number;
    }> = [];
    for (const [ingredientId, required] of requiredByIngredient) {
      const onHand = balanceMap.get(ingredientId) ?? 0;
      const allocated = allocatedMap.get(ingredientId) ?? required;
      // 没有预占的强制路径：把本单需求也算进占用
      const claimed = allocation ? allocated : allocated + required;
      if (onHand < claimed) {
        shortages.push({
          ingredientId,
          name: nameMap.get(ingredientId) ?? ingredientId,
          required,
          onHand,
          allocated: claimed,
        });
      }
    }
    return shortages;
  }

  /**
   * 分装完成时扣减。
   * - 正常分装：必须有 ACTIVE allocation；没有就拒绝（防止静默不扣库存）。
   * - 强制分装：allowMissing=true，允许直接写 ledger，事件由调用方留痕。
   */
  async consumeForOrder(
    tx: Tx,
    orderId: string,
    opts: { allowMissing?: boolean } = {},
  ): Promise<void> {
    if (!this.enabled) return;

    const allocation = await tx.inventoryAllocation.findFirst({
      where: {
        status: 'ACTIVE',
        sourceType: 'SUPPLEMENT_PACK',
        sourceOrderIds: { has: orderId },
      },
      include: { lines: true },
    });

    if (!allocation) {
      if (!opts.allowMissing) {
        throw new BadRequestException(
          '该订单没有有效的库存预占；请先排期预占，或由管理员强制分装并留痕',
        );
      }
      // 强制分装兜底：按订单行直接写 ledger
      const order = await tx.supplementOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          items: {
            select: {
              ingredientId: true,
              name: true,
              unit: true,
              packedAmount: true,
              bags: true,
            },
          },
        },
      });
      if (!order) throw new BadRequestException('补剂订单不存在');
      const lines = await this.buildAllocationLines(tx, order.items);
      await this.writeConsumptionLedger(tx, orderId, lines);
      return;
    }

    const lines = allocation.lines.map((line) => ({
      ingredientId: line.ingredientId,
      quantity: Number(line.quantityG),
    }));
    await this.writeConsumptionLedger(tx, orderId, lines);
    await tx.inventoryAllocation.update({
      where: { id: allocation.id },
      data: { status: 'CONSUMED', consumedAt: new Date() },
    });
  }

  /** 单位 → baseUnit 1:1 数量；规则集中在 supplement-unit.util */
  async toBaseQuantity(
    unit: string,
    amount: number,
    baseUnit: string,
    ingredientName: string,
  ): Promise<number> {
    return toSupplementBaseQuantity(unit, amount, baseUnit, ingredientName);
  }

  private async buildAllocationLines(
    tx: Tx,
    items: OrderItemForInventory[],
  ): Promise<Array<{ ingredientId: string; quantity: number }>> {
    if (!items || items.length === 0) {
      throw new BadRequestException('订单没有补剂明细，不能预占库存');
    }
    const ingredients = await tx.ingredient.findMany({
      where: { id: { in: items.map((item) => item.ingredientId) } },
      select: { id: true, name: true, baseUnit: true, unitDisplayLabel: true },
    });
    const byId = new Map(ingredients.map((item) => [item.id, item]));

    const result: Array<{ ingredientId: string; quantity: number }> = [];
    for (const item of items) {
      const ingredient = byId.get(item.ingredientId);
      if (!ingredient) {
        throw new BadRequestException(`补剂原料不存在: ${item.ingredientId}`);
      }
      const perBag = await this.toBaseQuantity(
        item.unit,
        Number(item.packedAmount || 0),
        ingredient.baseUnit,
        ingredient.name || item.name,
      );
      const quantity = round3(perBag * Math.max(1, Number(item.bags) || 1));
      result.push({ ingredientId: item.ingredientId, quantity });
    }
    return result;
  }

  private async writeConsumptionLedger(
    tx: Tx,
    orderId: string,
    lines: Array<{ ingredientId: string; quantity: number }>,
  ): Promise<void> {
    const now = new Date();
    await tx.inventoryLedgerEntry.createMany({
      data: lines.map((line) => ({
        ingredientId: line.ingredientId,
        deltaG: -Math.abs(line.quantity),
        sourceType: 'SUPPLEMENT_PACK_CONSUMPTION',
        sourceId: orderId,
        costAmount: 0,
        createdAt: now,
      })),
      skipDuplicates: true,
    });
  }
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}
