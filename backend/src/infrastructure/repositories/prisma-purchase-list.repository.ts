/**
 * Prisma PurchaseList Repository Implementation
 * 采购清单仓储的Prisma实现
 */

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  PurchaseList,
  PurchaseListKind,
  PurchaseListStatus,
  PurchaseListRepository,
} from '../../domain/purchasing';

const purchaseItemDetailInclude = {
  include: {
    ingredient: {
      include: {
        procurementSkus: {
          where: { isActive: true },
          orderBy: [
            { sortOrder: 'asc' as const },
            { createdAt: 'asc' as const },
          ],
        },
      },
    },
  },
  orderBy: {
    createdAt: 'asc' as const,
  },
} satisfies Prisma.PurchaseList$itemsArgs;

const purchaseListDetailInclude = {
  items: purchaseItemDetailInclude,
  records: true,
  createdBy: {
    select: {
      id: true,
      nickname: true,
      phone: true,
    },
  },
} satisfies Prisma.PurchaseListInclude;

const purchaseListFallbackInclude = {
  items: {
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
  records: true,
  createdBy: {
    select: {
      id: true,
      nickname: true,
      phone: true,
    },
  },
} satisfies Prisma.PurchaseListInclude;

const ingredientProcurementSkuInclude = {
  procurementSkus: {
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.IngredientInclude;

const INCONSISTENT_INGREDIENT_RELATION_ERROR =
  'Inconsistent query result: Field ingredient is required to return data';

@Injectable()
export class PrismaPurchaseListRepository implements PurchaseListRepository {
  constructor(private readonly prisma: PrismaService) {}

  private isInconsistentIngredientRelationError(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message.includes(INCONSISTENT_INGREDIENT_RELATION_ERROR)
    );
  }

  private async hydrateIngredientsForLists(lists: any[]): Promise<any[]> {
    const ingredientIds = Array.from(
      new Set(
        lists.flatMap((list) =>
          (list.items || []).map((item: any) => item.ingredientId),
        ),
      ),
    );

    if (ingredientIds.length === 0) {
      return lists;
    }

    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        id: {
          in: ingredientIds,
        },
      },
      include: ingredientProcurementSkuInclude,
    });

    const ingredientMap = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );

    return lists.map((list) => ({
      ...list,
      items: (list.items || []).map((item: any) => ({
        ...item,
        ingredient: ingredientMap.get(item.ingredientId),
      })),
    }));
  }

  private async findManyWithFallback(
    args: Omit<Prisma.PurchaseListFindManyArgs, 'include'>,
  ): Promise<any[]> {
    try {
      return await this.prisma.purchaseList.findMany({
        ...args,
        include: purchaseListDetailInclude,
      });
    } catch (error) {
      if (!this.isInconsistentIngredientRelationError(error)) {
        throw error;
      }

      const lists = await this.prisma.purchaseList.findMany({
        ...args,
        include: purchaseListFallbackInclude,
      });

      return this.hydrateIngredientsForLists(lists);
    }
  }

  async save(purchaseList: PurchaseList): Promise<PurchaseList> {
    const data = purchaseList.toPrisma();

    const saved = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseList.findUnique({
        where: { id: purchaseList.id },
        select: { id: true },
      });

      if (existing) {
        await tx.purchaseList.update({
          where: { id: purchaseList.id },
          data: {
            targetDate: data.targetDate,
            kind: data.kind,
            status: data.status,
            totalEstimatedCost: data.totalEstimatedCost,
            itemCount: data.itemCount,
            sourceOrderIds: data.sourceOrderIds,
            orderDateSnapshot: data.orderDateSnapshot,
            reimbursementId: data.reimbursementId,
            startedAt: data.startedAt,
            completedAt: data.completedAt,
            updatedAt: data.updatedAt,
          },
        });

        for (const item of data.items) {
          await tx.purchaseItem.upsert({
            where: { id: item.id },
            update: {
              ingredientId: item.ingredientId,
              procurementSkuId: item.procurementSkuId,
              procurementSkuName: item.procurementSkuName,
              ingredientName: item.ingredientName,
              type: item.type,
              quantityNeeded: item.quantityNeeded,
              quantityUnit: item.quantityUnit,
              estimatedCost: item.estimatedCost,
              grossQuantityNeeded: item.grossQuantityNeeded,
              stockDeductedQuantity: item.stockDeductedQuantity,
              purchaseShortageQuantity: item.purchaseShortageQuantity,
              onHandQuantity: item.onHandQuantity,
              allocatedQuantity: item.allocatedQuantity,
              availableQuantity: item.availableQuantity,
              usesInventory: item.usesInventory,
              purchaseChannel: item.purchaseChannel,
              productModel: item.productModel,
              suggestedProductId: item.suggestedProductId,
              suggestedProductName: item.suggestedProductName,
              displayUnit: item.displayUnit,
              notes: item.notes,
            },
            create: {
              ...item,
              purchaseListId: data.id,
            },
          });
        }
      } else {
        await tx.purchaseList.create({
          data: {
            id: data.id,
            targetDate: data.targetDate,
            kind: data.kind,
            status: data.status,
            totalEstimatedCost: data.totalEstimatedCost,
            itemCount: data.itemCount,
            createdById: data.createdById,
            sourceOrderIds: data.sourceOrderIds,
            orderDateSnapshot: data.orderDateSnapshot,
            reimbursementId: data.reimbursementId,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            startedAt: data.startedAt,
            completedAt: data.completedAt,
            items: {
              create: data.items,
            },
          },
        });
      }

      return tx.purchaseList.findUniqueOrThrow({
        where: { id: purchaseList.id },
        include: purchaseListDetailInclude,
      });
    });

    return PurchaseList.fromPrisma(saved);
  }

  async findById(id: string): Promise<PurchaseList | null> {
    const found = await this.prisma.purchaseList.findUnique({
      where: { id },
      include: purchaseListDetailInclude,
    });

    return found ? PurchaseList.fromPrisma(found) : null;
  }

  async findByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<PurchaseList[]> {
    const lists = await this.prisma.purchaseList.findMany({
      where: {
        targetDate: {
          gte: startDate,
          lt: endDate,
        },
      },
      include: purchaseListDetailInclude,
      orderBy: {
        targetDate: 'desc',
      },
    });

    return lists.map((list) => PurchaseList.fromPrisma(list));
  }

  async findByStatus(status: PurchaseListStatus): Promise<PurchaseList[]> {
    const lists = await this.prisma.purchaseList.findMany({
      where: { status },
      include: purchaseListDetailInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return lists.map((list) => PurchaseList.fromPrisma(list));
  }

  async findByCreatedBy(createdById: string): Promise<PurchaseList[]> {
    const lists = await this.prisma.purchaseList.findMany({
      where: { createdById },
      include: purchaseListDetailInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return lists.map((list) => PurchaseList.fromPrisma(list));
  }

  async findMany(params: {
    kind?: PurchaseListKind;
    status?: PurchaseListStatus;
    createdById?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
    excludeReimbursed?: boolean;
  }): Promise<{ list: PurchaseList[]; total: number }> {
    const {
      kind,
      status,
      createdById,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
      excludeReimbursed,
    } = params;

    const where: any = {};
    if (kind) where.kind = kind;
    if (status) where.status = status;
    if (createdById) where.createdById = createdById;
    if (startDate || endDate) {
      where.targetDate = {};
      if (startDate) where.targetDate.gte = startDate;
      if (endDate) where.targetDate.lt = endDate;
    }
    if (excludeReimbursed) {
      where.reimbursementId = null;
    }

    const [list, total] = await Promise.all([
      this.findManyWithFallback({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.purchaseList.count({ where }),
    ]);

    return {
      list: list.map((item) => PurchaseList.fromPrisma(item)),
      total,
    };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.purchaseList.delete({
      where: { id },
    });
  }

  async countByDate(date: Date): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.purchaseList.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });
  }

  async findByReimbursementId(
    reimbursementId: string,
  ): Promise<PurchaseList[]> {
    const lists = await this.prisma.purchaseList.findMany({
      where: { reimbursementId },
      include: purchaseListDetailInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return lists.map((list) => PurchaseList.fromPrisma(list));
  }

  async existsByDateRange(startDate: Date, endDate: Date): Promise<boolean> {
    const count = await this.prisma.purchaseList.count({
      where: {
        targetDate: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    return count > 0;
  }

  /**
   * 删除原料项并更新采购清单
   */
  async deleteItemAndUpdate(
    purchaseListId: string,
    itemId: string,
    updatedList: PurchaseList,
  ): Promise<PurchaseList> {
    // 使用事务删除原料项并更新采购清单
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. 删除原料项
      await tx.purchaseItem.delete({
        where: { id: itemId },
      });

      // 2. 更新采购清单的统计数据
      const updated = await tx.purchaseList.update({
        where: { id: purchaseListId },
        data: {
          itemCount: updatedList.itemCount,
          totalEstimatedCost: updatedList.totalEstimatedCost,
          updatedAt: new Date(),
        },
        include: purchaseListDetailInclude,
      });

      return updated;
    });

    return PurchaseList.fromPrisma(result);
  }

  /**
   * 重新计算采购清单原料（恢复被删除的原料）
   */
  async recalculateItems(
    purchaseListId: string,
    updatedList: PurchaseList,
  ): Promise<PurchaseList> {
    // 使用事务删除所有原料项并重新创建
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. 删除所有现有的原料项
      await tx.purchaseItem.deleteMany({
        where: { purchaseListId },
      });

      // 2. 批量创建新的原料项
      const itemsData = updatedList.items.map((item) => ({
        ...item.toPrisma(),
        purchaseListId,
      }));
      await tx.purchaseItem.createMany({
        data: itemsData,
      });

      // 3. 更新采购清单的统计数据
      const updated = await tx.purchaseList.update({
        where: { id: purchaseListId },
        data: {
          itemCount: updatedList.itemCount,
          totalEstimatedCost: updatedList.totalEstimatedCost,
          updatedAt: new Date(),
        },
        include: purchaseListDetailInclude,
      });

      return updated;
    });

    return PurchaseList.fromPrisma(result);
  }

  /**
   * 清空报销单ID（删除报销单时调用）
   */
  async clearReimbursementId(reimbursementId: string): Promise<void> {
    await this.prisma.purchaseList.updateMany({
      where: { reimbursementId },
      data: { reimbursementId: null },
    });
  }
}
