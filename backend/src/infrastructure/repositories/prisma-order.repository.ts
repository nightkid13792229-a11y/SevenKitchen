import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderRepository } from '../../domain/order/order.repository';
import { Order } from '../../domain/order/order.entity';
import { OrderItem } from '../../domain/order/order-item.entity';
import { PricingBreakdownSnapshot } from '../../domain/order/pricing-breakdown-snapshot';
import { RecipeSnapshot } from '../../domain/recipe/types';
import { PrismaService } from '../prisma.service';
import { OrderStatus, OrderType } from '../../domain';

@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  private readonly logger = new Logger(PrismaOrderRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Order | null> {
    const record = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!record) return null;
    return this.mapToDomain(record);
  }

  async findByCustomerId(customerId: string): Promise<Order[]> {
    const records = await this.prisma.order.findMany({
      where: { customerId },
      include: { items: true },
      orderBy: { id: 'asc' },
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async findByStatus(status: OrderStatus): Promise<Order[]> {
    const records = await this.prisma.order.findMany({
      where: { status },
      include: { items: true },
      orderBy: { id: 'asc' },
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async save(order: Order): Promise<Order> {
    const existing = await this.prisma.order.findUnique({
      where: { id: order.id },
      select: { id: true },
    });

    const amountProduct = new Prisma.Decimal(order.amountProduct);
    const amountShipping = new Prisma.Decimal(order.amountShipping);
    const amountTotal = new Prisma.Decimal(order.amountTotal);
    const totalAmount =
      order.totalAmount !== undefined
        ? new Prisma.Decimal(order.totalAmount)
        : amountTotal;

    if (!existing) {
      // Use transaction to ensure atomicity: create Order and OrderItems together
      await this.prisma.$transaction(async (tx) => {
        // Step 1: Create Order first (without items)
        await tx.order.create({
          data: {
            id: order.id,
            customerId: order.customerId,
            dogId: order.dogId ?? null,
            addressId: order.addressId ?? null,
            status: order.status as any,
            type: order.type as any,
            targetProductionDate: order.targetProductionDate,
            amountProduct,
            amountShipping,
            amountTotal,
            totalAmount,
            pricingBreakdownSnapshot: order.pricingBreakdownSnapshot
              ? this.serializePricingSnapshot(order.pricingBreakdownSnapshot)
              : null,
            // Phase 8.14: Shipping tracking fields
            trackingNumber: order.trackingNumber ?? null,
            carrierCode: order.carrierCode ?? null,
            shippedAt: order.shippedAt ?? null,
          },
        });

        // Step 2: Create OrderItems separately using createMany with explicit foreign keys
        if (order.items && order.items.length > 0) {
          await tx.orderItem.createMany({
            data: order.items.map((item) => ({
              id: item.id,
              orderId: order.id, // explicit FK here
              recipeSnapshot: item.recipeSnapshot as any,
              quantityG: item.quantityG,
              packageCount: item.packageCount,
              packageSpecG: item.packageSpecG,
              customRequirements: item.customRequirements,
              dailyIntakeG: item.dailyIntakeG,
              // Phase 8.11: Allocation fields (null on creation, set when allocated to batch)
              productionBatchId: item.productionBatchId ?? null,
              allocatedAt: item.allocatedAt ?? null,
            })),
          });
          this.logger.debug(
            `Created ${order.items.length} order items for order ${order.id}`,
          );
        } else {
          this.logger.warn(`Order ${order.id} has no items to create`);
        }
      });
    } else {
      // Updates: keep items and pricing snapshot immutable; update status/amounts/targetProductionDate/shipping fields.
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          customerId: order.customerId,
          dogId: order.dogId ?? null,
          addressId: order.addressId ?? null,
          status: order.status as any,
          type: order.type as any,
          targetProductionDate: order.targetProductionDate,
          amountProduct,
          amountShipping,
          amountTotal,
          totalAmount,
          // pricingBreakdownSnapshot intentionally not updated to preserve immutability
          // Phase 8.14: Shipping tracking fields (must be updated when order is shipped)
          trackingNumber: order.trackingNumber ?? null,
          carrierCode: order.carrierCode ?? null,
          shippedAt: order.shippedAt ?? null,
        },
      });
    }

    // Return fresh copy with items included
    const saved = await this.prisma.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    });
    if (!saved) {
      this.logger.error(`Failed to load order after save: ${order.id}`);
      return order;
    }
    // Log item count for debugging
    const itemCount = saved.items?.length ?? 0;
    if (itemCount === 0) {
      this.logger.warn(
        `Order ${order.id} loaded with 0 items. Expected ${order.items?.length ?? 0} items.`,
      );
    } else {
      this.logger.debug(`Order ${order.id} loaded with ${itemCount} items`);
    }
    return this.mapToDomain(saved);
  }

  private mapToDomain(record: Prisma.OrderGetPayload<{ include: { items: true } }>): Order {
    // Defensive check: ensure items array exists and is populated
    if (!record.items || !Array.isArray(record.items)) {
      this.logger.warn(
        `Order ${record.id} has no items array or items is not an array. Items: ${JSON.stringify(record.items)}`,
      );
      // Return empty array to prevent domain validation error, but log the issue
      // This should not happen in normal operation
    }
    const items = (record.items || []).map(
      (i) =>
        new OrderItem(
          i.id,
          i.orderId,
          i.recipeSnapshot as unknown as RecipeSnapshot,
          i.quantityG,
          i.packageCount,
          i.packageSpecG,
          i.customRequirements ?? null,
          // Type assertion needed: dailyIntakeG may not exist in Prisma type until migration is applied
          (i as any).dailyIntakeG ?? i.quantityG / (i.packageCount || 1), // Fallback for backward compatibility
          // Phase 8.11: Allocation fields
          (i as any).productionBatchId ?? null,
          (i as any).allocatedAt ? new Date((i as any).allocatedAt) : null,
        ),
    );

    const snapshot = record.pricingBreakdownSnapshot
      ? this.deserializePricingSnapshot(record.pricingBreakdownSnapshot as any)
      : undefined;

    return new Order(
      record.id,
      record.customerId,
      record.status as OrderStatus,
      record.type as OrderType,
      record.targetProductionDate,
      Number(record.amountProduct),
      Number(record.amountShipping),
      Number(record.amountTotal),
      items,
      record.totalAmount !== null ? Number(record.totalAmount) : undefined,
      snapshot,
      record.dogId ?? undefined,
      record.addressId ?? undefined,
      // Phase 8.14: Shipping tracking fields
      record.trackingNumber ?? undefined,
      record.carrierCode ?? undefined,
      record.shippedAt ?? undefined,
    );
  }

  private serializePricingSnapshot(snapshot: PricingBreakdownSnapshot): any {
    return {
      costIngredients: snapshot.costIngredients,
      costPackaging: snapshot.costPackaging,
      costLabor: snapshot.costLabor,
      costOverhead: snapshot.costOverhead,
      totalProductCost: snapshot.totalProductCost,
      productPrice: snapshot.productPrice,
      shippingFee: snapshot.shippingFee,
      totalPrice: snapshot.totalPrice,
      shippingTemplateId: snapshot.shippingTemplateId,
      marginStrategyName: snapshot.marginStrategyName,
      createdAt: snapshot.createdAt.toISOString(),
      ingredientPriceVersionHash: snapshot.ingredientPriceVersionHash ?? null,
    };
  }

  private deserializePricingSnapshot(raw: any): PricingBreakdownSnapshot {
    return new PricingBreakdownSnapshot(
      raw.costIngredients,
      raw.costPackaging,
      raw.costLabor,
      raw.costOverhead,
      raw.totalProductCost,
      raw.productPrice,
      raw.shippingFee,
      raw.totalPrice,
      raw.shippingTemplateId ?? null,
      raw.marginStrategyName,
      new Date(raw.createdAt),
      raw.ingredientPriceVersionHash ?? null,
    );
  }
}



