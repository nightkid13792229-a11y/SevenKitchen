/**
 * Prisma Reimbursement Repository Implementation
 * 报销单仓储的Prisma实现
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  Reimbursement,
  ReimbursementStatus,
  ReimbursementRepository,
} from '../../domain/purchasing';

@Injectable()
export class PrismaReimbursementRepository implements ReimbursementRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toCustomFeesJson(customFees: Reimbursement['customFees']) {
    return customFees as unknown as Prisma.InputJsonValue;
  }

  private reimbursementInclude = {
    purchaseLists: {
      include: {
        items: true,
      },
    },
    submittedBy: {
      select: {
        id: true,
        nickname: true,
        phone: true,
      },
    },
    reviewedBy: {
      select: {
        id: true,
        nickname: true,
        phone: true,
      },
    },
  } as const;

  private userInclude = {
    submittedBy: {
      select: {
        id: true,
        nickname: true,
        phone: true,
      },
    },
    reviewedBy: {
      select: {
        id: true,
        nickname: true,
        phone: true,
      },
    },
  } as const;

  private upsertReimbursement(
    client: Pick<PrismaService, 'reimbursement'>,
    reimbursement: Reimbursement,
  ) {
    const data = reimbursement.toPrisma();

    return client.reimbursement.upsert({
      where: { id: reimbursement.id },
      update: {
        status: data.status,
        totalActualCost: data.totalActualCost,
        totalEstimatedCost: data.totalEstimatedCost,
        receiptUrls: data.receiptUrls,
        platformShippingFee: data.platformShippingFee,
        platformPackagingFee: data.platformPackagingFee,
        customFees: this.toCustomFeesJson(data.customFees),
        paymentProofUrls: data.paymentProofUrls,
        paymentProofKeys: data.paymentProofKeys,
        reviewedById: data.reviewedById ?? null,
        reviewedAt: data.reviewedAt ?? null,
        reviewComment: data.reviewComment ?? null,
        updatedAt: data.updatedAt,
      },
      create: {
        id: data.id,
        claimNumber: data.claimNumber,
        status: data.status,
        totalActualCost: data.totalActualCost,
        totalEstimatedCost: data.totalEstimatedCost,
        receiptUrls: data.receiptUrls,
        submittedById: data.submittedById,
        submittedAt: data.submittedAt,
        platformShippingFee: data.platformShippingFee,
        platformPackagingFee: data.platformPackagingFee,
        customFees: this.toCustomFeesJson(data.customFees),
        paymentProofUrls: data.paymentProofUrls,
        paymentProofKeys: data.paymentProofKeys,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
      include: this.userInclude,
    });
  }

  private async findCompleteReimbursement(
    client: Pick<PrismaService, 'reimbursement'>,
    id: string,
  ) {
    const complete = await client.reimbursement.findUnique({
      where: { id },
      include: this.reimbursementInclude,
    });

    return Reimbursement.fromPrisma(complete!);
  }

  async save(reimbursement: Reimbursement): Promise<Reimbursement> {
    // 保存报销单（不包含关联的purchaseLists，因为这需要单独更新）
    const saved = await this.upsertReimbursement(this.prisma, reimbursement);

    // 关联采购清单（如果是新建的）
    await Promise.all(
      reimbursement.purchaseLists.map((list) =>
        this.prisma.purchaseList.update({
          where: { id: list.id },
          data: { reimbursementId: saved.id },
        }),
      ),
    );

    return this.findCompleteReimbursement(this.prisma, saved.id);
  }

  async saveWithPurchaseListReplacement(
    reimbursement: Reimbursement,
  ): Promise<Reimbursement> {
    return this.prisma.$transaction(async (tx) => {
      const saved = await this.upsertReimbursement(tx, reimbursement);
      const selectedListIds = reimbursement.purchaseLists.map(
        (list) => list.id,
      );

      await tx.purchaseList.updateMany({
        where: {
          reimbursementId: saved.id,
          id: { notIn: selectedListIds },
        },
        data: { reimbursementId: null },
      });

      if (selectedListIds.length > 0) {
        const linked = await tx.purchaseList.updateMany({
          where: {
            id: { in: selectedListIds },
            OR: [{ reimbursementId: null }, { reimbursementId: saved.id }],
          },
          data: { reimbursementId: saved.id },
        });

        if (linked.count !== selectedListIds.length) {
          throw new Error(
            `Unable to replace purchase-list links for reimbursement ${saved.id}`,
          );
        }
      }

      return this.findCompleteReimbursement(tx, saved.id);
    });
  }

  async findById(id: string): Promise<Reimbursement | null> {
    const found = await this.prisma.reimbursement.findUnique({
      where: { id },
      include: {
        purchaseLists: {
          include: {
            items: true,
          },
        },
        submittedBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
    });

    return found ? Reimbursement.fromPrisma(found) : null;
  }

  async findByClaimNumber(claimNumber: string): Promise<Reimbursement | null> {
    const found = await this.prisma.reimbursement.findUnique({
      where: { claimNumber },
      include: {
        purchaseLists: {
          include: {
            items: true,
          },
        },
        submittedBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
    });

    return found ? Reimbursement.fromPrisma(found) : null;
  }

  async findByStatus(status: ReimbursementStatus): Promise<Reimbursement[]> {
    const reimbursements = await this.prisma.reimbursement.findMany({
      where: { status },
      include: {
        purchaseLists: {
          include: {
            items: true,
          },
        },
        submittedBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
      orderBy: {
        submittedAt: 'desc',
      },
    });

    return reimbursements.map((r) => Reimbursement.fromPrisma(r));
  }

  async findBySubmittedBy(submittedById: string): Promise<Reimbursement[]> {
    const reimbursements = await this.prisma.reimbursement.findMany({
      where: { submittedById },
      include: {
        purchaseLists: {
          include: {
            items: true,
          },
        },
        submittedBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
      orderBy: {
        submittedAt: 'desc',
      },
    });

    return reimbursements.map((r) => Reimbursement.fromPrisma(r));
  }

  async findMany(params: {
    status?: ReimbursementStatus;
    submittedById?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: Reimbursement[]; total: number }> {
    const {
      status,
      submittedById,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = params;

    const where: any = {};
    if (status) where.status = status;
    if (submittedById) where.submittedById = submittedById;
    if (startDate || endDate) {
      where.submittedAt = {};
      if (startDate) where.submittedAt.gte = startDate;
      if (endDate) where.submittedAt.lte = endDate;
    }

    const [list, total] = await Promise.all([
      this.prisma.reimbursement.findMany({
        where,
        include: {
          purchaseLists: {
            include: {
              items: true,
            },
          },
          submittedBy: {
            select: {
              id: true,
              nickname: true,
              phone: true,
            },
          },
          reviewedBy: {
            select: {
              id: true,
              nickname: true,
              phone: true,
            },
          },
        },
        orderBy: {
          submittedAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.reimbursement.count({ where }),
    ]);

    return {
      list: list.map((item) => Reimbursement.fromPrisma(item)),
      total,
    };
  }

  async countByDate(date: string): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.reimbursement.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });
  }

  async findByReviewedBy(reviewedById: string): Promise<Reimbursement[]> {
    const reimbursements = await this.prisma.reimbursement.findMany({
      where: { reviewedById },
      include: {
        purchaseLists: {
          include: {
            items: true,
          },
        },
        submittedBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
      orderBy: {
        reviewedAt: 'desc',
      },
    });

    return reimbursements.map((r) => Reimbursement.fromPrisma(r));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.reimbursement.delete({
      where: { id },
    });
  }
}
