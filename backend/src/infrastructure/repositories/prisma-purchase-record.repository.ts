/**
 * Prisma PurchaseRecord Repository Implementation
 * 采购记录仓储的Prisma实现
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PurchaseRecordRepository } from '../../domain/purchasing/purchase-record.repository';
import { PurchaseRecord } from '../../domain/purchasing/purchase-record.entity';
import { PURCHASE_RECORD_REPOSITORY } from '../../application/purchasing/purchasing.service.tokens';

export const purchaseRecordRepositoryProvider = {
  provide: PURCHASE_RECORD_REPOSITORY,
  useClass: PrismaPurchaseRecordRepository,
};

@Injectable()
export class PrismaPurchaseRecordRepository implements PurchaseRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(purchaseRecord: PurchaseRecord): Promise<PurchaseRecord> {
    const data = purchaseRecord.toPrisma();

    const saved = await this.prisma.purchaseRecord.upsert({
      where: { id: purchaseRecord.id },
      update: {
        purchaseChannel: data.purchaseChannel,
        actualQuantity: data.actualQuantity,
        actualCost: data.actualCost,
        productModel: data.productModel,
        notes: data.notes,
        updatedAt: data.updatedAt,
      },
      create: {
        id: data.id,
        purchaseListId: data.purchaseListId,
        purchaseItemId: data.purchaseItemId,
        ingredientId: data.ingredientId,
        ingredientName: data.ingredientName,
        purchaseChannel: data.purchaseChannel,
        actualQuantity: data.actualQuantity,
        actualCost: data.actualCost,
        productModel: data.productModel,
        notes: data.notes,
        purchasedAt: data.purchasedAt,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
    });

    return PurchaseRecord.fromPrisma(saved);
  }

  async findById(id: string): Promise<PurchaseRecord | null> {
    const found = await this.prisma.purchaseRecord.findUnique({
      where: { id },
    });

    return found ? PurchaseRecord.fromPrisma(found) : null;
  }

  async findByPurchaseListId(purchaseListId: string): Promise<PurchaseRecord[]> {
    const records = await this.prisma.purchaseRecord.findMany({
      where: {
        purchaseListId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return records.map(record => PurchaseRecord.fromPrisma(record));
  }

  async findByPurchaseItemId(purchaseItemId: string): Promise<PurchaseRecord[]> {
    const records = await this.prisma.purchaseRecord.findMany({
      where: {
        purchaseItemId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return records.map(record => PurchaseRecord.fromPrisma(record));
  }

  async findByIngredientId(ingredientId: string): Promise<PurchaseRecord[]> {
    const records = await this.prisma.purchaseRecord.findMany({
      where: {
        ingredientId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return records.map(record => PurchaseRecord.fromPrisma(record));
  }

  async calculateTotalActualCost(purchaseListId: string): Promise<number> {
    const result = await this.prisma.purchaseRecord.aggregate({
      where: {
        purchaseListId,
      },
      _sum: {
        actualCost: true,
      },
    });

    return Number(result._sum.actualCost || 0);
  }

  async countByPurchaseListId(purchaseListId: string): Promise<number> {
    return this.prisma.purchaseRecord.count({
      where: {
        purchaseListId,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.purchaseRecord.delete({
      where: { id },
    });
  }

  async deleteByPurchaseListId(purchaseListId: string): Promise<void> {
    await this.prisma.purchaseRecord.deleteMany({
      where: {
        purchaseListId,
      },
    });
  }
}
