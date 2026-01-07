/**
 * Prisma-based OrderPricingSnapshot Repository
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OrderPricingSnapshot } from '../../domain/order-pricing-snapshot/order-pricing-snapshot.entity';
import { IOrderPricingSnapshotRepository } from '../../domain/order-pricing-snapshot/order-pricing-snapshot.repository.interface';

@Injectable()
export class PrismaOrderPricingSnapshotRepository implements IOrderPricingSnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    customerId: string;
    requestParams: any;
    pricingResult: any;
    expiresAt: Date;
  }): Promise<OrderPricingSnapshot> {
    const record = await this.prisma.orderPricingSnapshot.create({
      data: {
        customerId: data.customerId,
        requestParams: data.requestParams as any,
        pricingResult: data.pricingResult as any,
        expiresAt: data.expiresAt,
      },
    });

    return this.mapToEntity(record);
  }

  async findById(id: string): Promise<OrderPricingSnapshot | null> {
    const record = await this.prisma.orderPricingSnapshot.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.mapToEntity(record);
  }

  async markAsUsed(id: string): Promise<void> {
    await this.prisma.orderPricingSnapshot.update({
      where: { id },
      data: { used: true },
    });
  }

  async deleteExpired(): Promise<number> {
    const result = await this.prisma.orderPricingSnapshot.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    return result.count;
  }

  private mapToEntity(record: any): OrderPricingSnapshot {
    return new OrderPricingSnapshot(
      record.id,
      record.customerId,
      record.requestParams,
      record.pricingResult,
      record.expiresAt,
      record.used,
      record.createdAt,
    );
  }
}
