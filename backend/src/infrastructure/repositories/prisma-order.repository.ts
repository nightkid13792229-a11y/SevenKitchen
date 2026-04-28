import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderRepository } from '../../domain/order/order.repository';
import { Order } from '../../domain/order/order.entity';
import { OrderItem } from '../../domain/order/order-item.entity';
import { PricingBreakdownSnapshot } from '../../domain/order/pricing-breakdown-snapshot';
import { RecipeSnapshot } from '../../domain/recipe/types';
import { PrismaService } from '../prisma.service';
import { OrderStatus, OrderType } from '../../domain';
import { normalizeIngredientSourcePlan } from '../../domain/order/ingredient-source-plan';

@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  private readonly logger = new Logger(PrismaOrderRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Order | null> {
    const record = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        dog: true,
        address: true,
      },
    });
    if (!record) return null;
    return this.mapToDomain(record);
  }

  async findByCustomerId(customerId: string): Promise<Order[]> {
    const records = await this.prisma.order.findMany({
      where: { customerId },
      include: {
        items: true,
        dog: true,
        address: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async findByStatus(status: OrderStatus): Promise<Order[]> {
    const records = await this.prisma.order.findMany({
      where: { status },
      include: {
        items: true,
        dog: true, // 🔧 添加：包含dog关联数据
        address: true, // 🔧 添加：包含address关联数据
      },
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
            originalTargetProductionDate:
              (order as any).originalTargetProductionDate ?? null,
            amountProduct,
            amountShipping,
            amountTotal,
            totalAmount,
            pricingBreakdownSnapshot: order.pricingBreakdownSnapshot
              ? this.serializePricingSnapshot(order.pricingBreakdownSnapshot)
              : null,
            shippingAddressSnapshot: order.shippingAddressSnapshot
              ? (order.shippingAddressSnapshot as unknown as Prisma.InputJsonValue)
              : null,
            // Phase 8.14: Shipping tracking fields
            trackingNumber: order.trackingNumber ?? null,
            carrierCode: order.carrierCode ?? null,
            shippedAt: order.shippedAt ?? null,
            // Phase 8.15: Order completion
            completedAt: order.completedAt ?? null,
            // Phase 8.16: Order cancellation
            cancelledAt: order.cancelledAt ?? null,
            cancellationReason: order.cancellationReason ?? null,
            cancelledBy: order.cancelledBy ?? null,
            // Phase 8.17: Payment transaction tracking
            paymentMethod: order.paymentMethod ?? null,
            transactionId: order.transactionId ?? null,
            paidAt: order.paidAt ?? null,
            paymentStatus: order.paymentStatus ?? null,
            adminRemark: order.adminRemark ?? null,
            // Phase 9.1: Freezing and Aftersale fields
            aftersaleType: order.aftersaleType ?? null,
            freezingSince: order.freezingSince ?? null,
            aftersaleSince: order.aftersaleSince ?? null,
            aftersaleReason: order.aftersaleReason ?? null,
            aftersalePhotos: order.aftersalePhotos ?? [],
          },
        } as any);

        // Step 2: Create OrderItems separately using createMany with explicit foreign keys
        if (order.items && order.items.length > 0) {
          await tx.orderItem.createMany({
            data: order.items.map((item) => ({
              id: item.id,
              orderId: order.id, // explicit FK here
              dogId: item.dogId ?? null, // ✅ 保存 dogId
              recipeSnapshot: item.recipeSnapshot as any,
              quantityG: item.quantityG,
              packageCount: item.packageCount,
              packageSpecG: item.packageSpecG,
              packagePlan: item.packagePlan
                ? (item.packagePlan as unknown as Prisma.InputJsonValue)
                : undefined,
              ingredientSourcePlan: item.ingredientSourcePlan ?? null,
              preparationMethod: item.preparationMethod ?? null,
              cookingMethod: item.cookingMethod ?? null,
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
          originalTargetProductionDate:
            (order as any).originalTargetProductionDate ?? null,
          amountProduct,
          amountShipping,
          amountTotal,
          totalAmount,
          // pricingBreakdownSnapshot intentionally not updated to preserve immutability
          shippingAddressSnapshot: order.shippingAddressSnapshot
            ? (order.shippingAddressSnapshot as unknown as Prisma.InputJsonValue)
            : null,
          // Phase 8.14: Shipping tracking fields (must be updated when order is shipped)
          trackingNumber: order.trackingNumber ?? null,
          carrierCode: order.carrierCode ?? null,
          shippedAt: order.shippedAt ?? null,
          // Phase 8.15: Order completion (must be updated when order is completed)
          completedAt: order.completedAt ?? null,
          // Phase 8.16: Order cancellation (must be updated when order is cancelled)
          cancelledAt: order.cancelledAt ?? null,
          cancellationReason: order.cancellationReason ?? null,
          cancelledBy: order.cancelledBy ?? null,
          // Phase 8.17: Payment transaction tracking (must be updated when payment is processed)
          paymentMethod: order.paymentMethod ?? null,
          transactionId: order.transactionId ?? null,
          paidAt: order.paidAt ?? null,
          paymentStatus: order.paymentStatus ?? null,
          adminRemark: order.adminRemark ?? null,
          // Phase 9.1: Freezing and Aftersale fields
          freezingSince: order.freezingSince ?? null,
          aftersaleType: order.aftersaleType ?? null,
          aftersaleSince: order.aftersaleSince ?? null,
          aftersaleReason: order.aftersaleReason ?? null,
          aftersalePhotos: order.aftersalePhotos ?? [],
        },
      } as any);
    }

    // Return fresh copy with items included
    const saved = await this.prisma.order.findUnique({
      where: { id: order.id },
      include: {
        items: true,
        dog: true,
        address: true,
      },
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

  private mapToDomain(
    record: Prisma.OrderGetPayload<{
      include: { items: true; dog: true; address: true };
    }>,
  ): Order {
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
          i.dogId, // Phase 8.20: Include dogId from order item
          i.recipeSnapshot as unknown as RecipeSnapshot,
          i.quantityG,
          i.packageCount,
          i.packageSpecG,
          i.customRequirements ?? null,
          // Type assertion needed: dailyIntakeG may not exist in Prisma type until migration is applied
          (i as any).dailyIntakeG ?? i.quantityG / (i.packageCount || 1), // Fallback for backward compatibility
          i.vacuumBagSpec ?? null,
          // Phase 8.11: Allocation fields
          (i as any).productionBatchId ?? null,
          ((i as any).allocatedAt
            ? new Date((i as any).allocatedAt)
            : null) as any,
          (i as any).packagePlan ?? null,
          this.normalizeStoredIngredientSourcePlan(
            (i as any).ingredientSourcePlan,
          ),
          (i as any).preparationMethod ?? null,
          (i as any).cookingMethod ?? null,
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
      record.createdAt,
      record.targetProductionDate,
      (record as any).originalTargetProductionDate,
      Number(record.amountProduct),
      Number(record.amountShipping),
      Number(record.amountTotal),
      items,
      undefined, // totalAmount - 不再从数据库读取，让 Order 实体使用精确的 amountTotal
      snapshot,
      record.dogId ?? undefined,
      record.addressId ?? undefined,
      // 🔧 添加：传入dog和address对象
      record.dog
        ? {
            id: record.dog.id,
            name: record.dog.name,
          }
        : undefined,
      record.address
        ? {
            id: record.address.id,
            recipientName: record.address.recipientName,
            phone: record.address.phone,
            region: record.address.region as any,
            detail: record.address.detail,
          }
        : undefined,
      // Phase 8.14: Shipping tracking fields
      record.trackingNumber ?? undefined,
      record.carrierCode ?? undefined,
      record.shippedAt ?? undefined,
      // Phase 8.15: Order completion
      (record as any).completedAt ?? undefined,
      // Phase 8.16: Order cancellation
      (record as any).cancelledAt ?? undefined,
      (record as any).cancellationReason ?? undefined,
      (record as any).cancelledBy ?? undefined,
      // Phase 8.17: Payment transaction tracking
      (record as any).paymentMethod ?? undefined,
      (record as any).transactionId ?? undefined,
      (record as any).paidAt ? new Date((record as any).paidAt) : undefined,
      (record as any).paymentStatus ?? undefined,
      // Phase 9.1: Freezing and Aftersale fields
      (record as any).aftersaleType ?? undefined,
      (record as any).freezingSince
        ? new Date((record as any).freezingSince)
        : undefined,
      (record as any).aftersaleSince
        ? new Date((record as any).aftersaleSince)
        : undefined,
      (record as any).aftersaleReason ?? undefined,
      (record as any).aftersalePhotos ?? undefined,
      // Skip validation for orders loaded from database (allows admin-adjusted amounts)
      true, // skipValidation
      (record as any).adminRemark ?? null,
      ((record as any).shippingAddressSnapshot as any) ?? null,
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
      ingredientDetails: snapshot.ingredientDetails ?? null, // 保存原料详情
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
      raw.ingredientDetails ?? undefined, // 读取原料详情
    );
  }

  private normalizeStoredIngredientSourcePlan(raw: unknown) {
    return raw ? normalizeIngredientSourcePlan(String(raw)) : null;
  }

  /**
   * Find all orders with filtering, pagination, and search
   * Admin-only method for cross-customer order management
   */
  async findAll(params?: {
    customerId?: string;
    status?: OrderStatus;
    type?: OrderType;
    keyword?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: Order[]; total: number }> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    // Build where clause
    const where: Prisma.OrderWhereInput = {};

    if (params?.customerId) {
      where.customerId = params.customerId;
    }

    if (params?.status) {
      if (Array.isArray(params.status)) {
        where.status = { in: params.status };
      } else {
        where.status = params.status;
      }
    }

    if (params?.type) {
      where.type = params.type;
    }

    if (params?.startDate || params?.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = params.startDate;
      }
      if (params.endDate) {
        where.createdAt.lte = params.endDate;
      }
    }

    // Keyword search: order ID, customer nickname/phone
    if (params?.keyword) {
      where.OR = [
        { id: { contains: params.keyword, mode: 'insensitive' } },
        {
          customer: {
            nickname: { contains: params.keyword, mode: 'insensitive' },
          },
        },
        {
          customer: {
            phone: { contains: params.keyword, mode: 'insensitive' },
          },
        },
      ];
    }

    // Execute count and list queries in parallel
    const [total, records] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          items: true,
          dog: true, // 🔧 添加：包含dog关联数据
          address: true, // 🔧 添加：包含address关联数据
          customer: {
            select: {
              id: true,
              nickname: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const list = records.map((r) => this.mapToDomain(r));
    return { list, total };
  }

  /**
   * Find orders by target production date range
   * Used by purchasing module to find orders scheduled for production
   */
  async findByTargetProductionDateRange(params: {
    startDate: Date;
    endDate?: Date;
    status?: OrderStatus;
  }): Promise<{ list: Order[]; total: number }> {
    const endDate = params.endDate || params.startDate;

    // Build where clause
    const where: Prisma.OrderWhereInput = {
      targetProductionDate: {
        gte: params.startDate,
        lte: endDate,
      },
    };

    if (params.status) {
      where.status = params.status;
    }

    // Execute queries
    const [total, records] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          items: true,
          dog: true, // 🔧 添加：包含dog关联数据
          address: true, // 🔧 添加：包含address关联数据
          customer: {
            select: {
              id: true,
              nickname: true,
              phone: true,
            },
          },
        },
        orderBy: { targetProductionDate: 'asc' },
      }),
    ]);

    const list = records.map((r) => this.mapToDomain(r));
    return { list, total };
  }

  /**
   * Get order statistics grouped by status
   * Phase 9: Simplified statistics aligned with e-commerce standards
   */
  async getStats(): Promise<{
    total: number;
    pendingPayment: number;
    paid: number;
    purchasing: number;
    inProduction: number;
    freezing: number;
    shipped: number;
    completed: number;
    cancelled: number;
    aftersale: number;
  }> {
    const stats = await this.prisma.order.groupBy({
      by: ['status'],
      _count: {
        status: true,
      },
    });

    const countMap = stats.reduce(
      (acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total: await this.prisma.order.count(),
      pendingPayment: countMap[OrderStatus.PENDING_PAYMENT] ?? 0,
      paid: countMap[OrderStatus.PAID] ?? 0,
      purchasing: countMap[OrderStatus.PURCHASING] ?? 0,
      inProduction: countMap[OrderStatus.IN_PRODUCTION] ?? 0,
      freezing: countMap[OrderStatus.FREEZING] ?? 0,
      shipped: countMap[OrderStatus.SHIPPED] ?? 0,
      completed: countMap[OrderStatus.COMPLETED] ?? 0,
      cancelled: countMap[OrderStatus.CANCELLED] ?? 0,
      aftersale: countMap[OrderStatus.AFTERSALE] ?? 0,
    };
  }

  /**
   * Find an order item by ID
   */
  async findOrderItemById(orderItemId: string): Promise<any | null> {
    const orderItem = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
    });

    if (!orderItem) {
      return null;
    }

    return {
      id: orderItem.id,
      orderId: orderItem.orderId,
      dogId: orderItem.dogId,
      recipeSnapshot: orderItem.recipeSnapshot,
      quantityG: orderItem.quantityG,
      packageCount: orderItem.packageCount,
      packageSpecG: orderItem.packageSpecG,
      packagePlan: (orderItem as any).packagePlan ?? null,
      ingredientSourcePlan: (orderItem as any).ingredientSourcePlan ?? null,
      customRequirements: orderItem.customRequirements,
      dailyIntakeG: orderItem.dailyIntakeG,
      vacuumBagSpec: orderItem.vacuumBagSpec,
      allocatedAt: orderItem.allocatedAt,
      productionBatchId: orderItem.productionBatchId,
      // createdAt exists in the Prisma schema and is included for production service use.
      preparationMethod: (orderItem as any).preparationMethod,
      cookingMethod: (orderItem as any).cookingMethod,
      createdAt: (orderItem as any).createdAt,
    };
  }

  /**
   * Find a dog by ID
   */
  async findDogById(dogId: string): Promise<any | null> {
    const dog = await this.prisma.dog.findUnique({
      where: { id: dogId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!dog) {
      return null;
    }

    return {
      id: dog.id,
      name: dog.name,
    };
  }
}
