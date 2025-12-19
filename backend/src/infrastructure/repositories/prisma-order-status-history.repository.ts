/**
 * Prisma Order Status History Repository
 * Phase 8.18: Order Status History & Audit Trail
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OrderStatusHistoryRepository } from '../../domain/order/order-status-history.repository';
import { OrderStatusHistory } from '../../domain/order/order-status-history.entity';
import { OrderStatus } from '../../domain';
import { randomUUID } from 'crypto';

@Injectable()
export class PrismaOrderStatusHistoryRepository
  implements OrderStatusHistoryRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async append(
    orderId: string,
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
    actor: 'customer' | 'staff' | 'admin' | 'system',
    actorId?: string | null,
    metadata?: Record<string, any> | null,
  ): Promise<OrderStatusHistory> {
    try {
      const record = await this.prisma.orderStatusHistory.create({
        data: {
          id: randomUUID(),
          orderId,
          fromStatus: fromStatus as any,
          toStatus: toStatus as any,
          actor,
          actorId: actorId ?? null,
          metadata: metadata ? (metadata as any) : null,
        },
      });

      return this.mapToDomain(record);
    } catch (error) {
      console.error(
        `PrismaOrderStatusHistoryRepository.append failed for order ${orderId}:`,
        error,
      );
      throw error;
    }
  }

  async findByOrderId(orderId: string): Promise<OrderStatusHistory[]> {
    const records = await this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { timestamp: 'asc' },
    });

    return records.map((r) => this.mapToDomain(r));
  }

  private mapToDomain(record: any): OrderStatusHistory {
    return new OrderStatusHistory(
      record.id,
      record.orderId,
      record.fromStatus as OrderStatus,
      record.toStatus as OrderStatus,
      record.timestamp,
      record.actor as 'customer' | 'staff' | 'admin' | 'system',
      record.actorId ?? null,
      record.metadata ? (record.metadata as Record<string, any>) : null,
    );
  }
}
