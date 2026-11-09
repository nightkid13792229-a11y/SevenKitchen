import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { PurchasingService } from '../purchasing/purchasing.service';

const SOURCE_LABELS: Record<string, string> = {
  KITCHEN_TASK: '厨房领用',
  PURCHASE_RECORD: '采购入库',
  PURCHASE_RECORD_REVERSAL: '采购撤回',
  OPENING_BALANCE: '期初结转',
  MANUAL_ADJUSTMENT: '手工调整',
  STOCKTAKE: '盘点差异',
  PRODUCTION_ALLOCATION_CONSUMPTION: '生产领用',
  SUPPLEMENT_PACK_CONSUMPTION: '补剂分装',
  PRODUCTION_SURPLUS: '生产余量',
};

@Injectable()
export class InventoryHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchasing: PurchasingService,
  ) {}

  async getHome() {
    const grouped = await this.prisma.inventoryLedgerEntry.groupBy({
      by: ['ingredientId'],
      _sum: { deltaG: true },
    });
    const balances = new Map<string, number>(
      grouped.map((row) => [
        row.ingredientId,
        Number(row._sum?.deltaG ?? 0),
      ]),
    );

    const items = await this.purchasing.getStockReplenishmentIngredients({
      includeDaily: true,
      balances,
    });

    const ids = items.map((item) => item.id);
    const movements = ids.length
      ? await this.prisma.inventoryLedgerEntry.findMany({
          where: { ingredientId: { in: ids } },
          orderBy: [{ ingredientId: 'asc' }, { createdAt: 'desc' }],
          distinct: ['ingredientId'],
          select: {
            ingredientId: true,
            createdAt: true,
            deltaG: true,
            sourceType: true,
          },
        })
      : [];

    const movementMap = new Map(
      movements.map((movement) => [
        movement.ingredientId,
        {
          at: movement.createdAt.toISOString(),
          deltaBaseQuantity: Number(movement.deltaG),
          sourceLabel:
            SOURCE_LABELS[movement.sourceType] ?? movement.sourceType,
        },
      ]),
    );

    const lastStocktake = await this.prisma.inventoryStocktake.findFirst({
      where: {
        status: { in: ['APPLIED', 'SUBMITTED'] as any },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, appliedAt: true, status: true },
    });

    return {
      summary: {
        needsReplenishment: items.filter(
          (item) => item.stockStatus === 'NEEDS_REPLENISHMENT',
        ).length,
        lowStock: items.filter((item) => item.stockStatus === 'LOW_STOCK')
          .length,
        noPolicy: items.filter((item) => item.stockStatus === 'NO_POLICY')
          .length,
        lastStocktakeAt:
          (lastStocktake?.appliedAt ?? lastStocktake?.createdAt)?.toISOString() ??
          null,
      },
      items: items.map((item) => ({
        ...item,
        lastMovement: movementMap.get(item.id) ?? null,
      })),
    };
  }
}
