/**
 * Prisma PurchaseList Repository Implementation
 * 采购清单仓储的Prisma实现
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  PurchaseList,
  PurchaseListStatus,
  PurchaseListRepository,
} from '../../domain/purchasing';

@Injectable()
export class PrismaPurchaseListRepository implements PurchaseListRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(purchaseList: PurchaseList): Promise<PurchaseList> {
    const data = purchaseList.toPrisma();

    const saved = await this.prisma.purchaseList.upsert({
      where: { id: purchaseList.id },
      update: {
        status: data.status,
        reimbursementId: data.reimbursementId,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        updatedAt: data.updatedAt,
      },
      create: {
        id: data.id,
        targetDate: data.targetDate,
        status: data.status,
        totalEstimatedCost: data.totalEstimatedCost,
        itemCount: data.itemCount,
        createdById: data.createdById,
        sourceOrderIds: data.sourceOrderIds,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        items: {
          create: data.items,
        },
      },
      include: {
        items: true,
        records: true, // Include purchase records for calculating aggregates
        createdBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
    });

    return PurchaseList.fromPrisma(saved);
  }

  async findById(id: string): Promise<PurchaseList | null> {
    const found = await this.prisma.purchaseList.findUnique({
      where: { id },
      include: {
        items: true,
        records: true, // Include purchase records for calculating aggregates
        createdBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
    });

    return found ? PurchaseList.fromPrisma(found) : null;
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<PurchaseList[]> {
    const lists = await this.prisma.purchaseList.findMany({
      where: {
        targetDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        items: true,
        records: true, // Include purchase records for calculating aggregates
        createdBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
      orderBy: {
        targetDate: 'desc',
      },
    });

    return lists.map(list => PurchaseList.fromPrisma(list));
  }

  async findByStatus(status: PurchaseListStatus): Promise<PurchaseList[]> {
    const lists = await this.prisma.purchaseList.findMany({
      where: { status },
      include: {
        items: true,
        records: true, // Include purchase records for calculating aggregates
        createdBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return lists.map(list => PurchaseList.fromPrisma(list));
  }

  async findByCreatedBy(createdById: string): Promise<PurchaseList[]> {
    const lists = await this.prisma.purchaseList.findMany({
      where: { createdById },
      include: {
        items: true,
        records: true, // Include purchase records for calculating aggregates
        createdBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return lists.map(list => PurchaseList.fromPrisma(list));
  }

  async findMany(params: {
    status?: PurchaseListStatus;
    createdById?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: PurchaseList[]; total: number }> {
    const { status, createdById, startDate, endDate, page = 1, pageSize = 20 } = params;

    const where: any = {};
    if (status) where.status = status;
    if (createdById) where.createdById = createdById;
    if (startDate || endDate) {
      where.targetDate = {};
      if (startDate) where.targetDate.gte = startDate;
      if (endDate) where.targetDate.lte = endDate;
    }

    const [list, total] = await Promise.all([
      this.prisma.purchaseList.findMany({
        where,
        include: {
          items: true,
          records: true, // Include purchase records for calculating aggregates
          createdBy: {
            select: {
              id: true,
              nickname: true,
              phone: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.purchaseList.count({ where }),
    ]);

    return {
      list: list.map(item => PurchaseList.fromPrisma(item)),
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

  async findByReimbursementId(reimbursementId: string): Promise<PurchaseList[]> {
    const lists = await this.prisma.purchaseList.findMany({
      where: { reimbursementId },
      include: {
        items: true,
        records: true, // Include purchase records for calculating aggregates
        createdBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return lists.map(list => PurchaseList.fromPrisma(list));
  }

  async existsByDateRange(startDate: Date, endDate: Date): Promise<boolean> {
    const count = await this.prisma.purchaseList.count({
      where: {
        targetDate: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          not: PurchaseListStatus.CANCELLED,
        },
      },
    });

    return count > 0;
  }
}
