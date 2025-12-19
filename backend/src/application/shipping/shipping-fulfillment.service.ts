/**
 * Shipping Fulfillment Service
 * Phase 8.14: Production Shipment / Fulfillment MVP
 */

import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import type { OrderRepository } from '../../domain/order/order.repository';
import { Order } from '../../domain/order';
import { OrderStatus } from '../../domain';
import { ORDER_REPOSITORY } from '../order/order.service';

export interface OrderReadyForShipmentDto {
  id: string;
  customerId: string;
  status: OrderStatus;
  amountTotal: number;
  addressId: string | null;
  trackingNumber: string | null;
  carrierCode: string | null;
  shippedAt: string | null;
  items: Array<{
    id: string;
    recipeSnapshotId: string;
    quantityG: number;
  }>;
}

export interface MarkOrderAsShippedDto {
  trackingNumber: string;
  carrierCode: string;
}

@Injectable()
export class ShippingFulfillmentService {
  private readonly logger = new Logger(ShippingFulfillmentService.name);

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
  ) {}

  /**
   * List orders ready for shipment
   * Phase 8.14: Returns orders with READY_FOR_SHIPMENT status
   */
  async listOrdersReadyForShipment(): Promise<OrderReadyForShipmentDto[]> {
    const orders = await this.orderRepository.findByStatus(
      OrderStatus.READY_FOR_SHIPMENT,
    );

    return orders.map((order) => ({
      id: order.id,
      customerId: order.customerId,
      status: order.status,
      amountTotal: order.amountTotal,
      addressId: order.addressId || null,
      trackingNumber: order.trackingNumber || null,
      carrierCode: order.carrierCode || null,
      shippedAt: order.shippedAt?.toISOString() || null,
      items: order.items.map((item) => ({
        id: item.id,
        recipeSnapshotId: item.recipeSnapshot.id,
        quantityG: item.quantityG,
      })),
    }));
  }

  /**
   * Mark order as shipped with tracking information
   * Phase 8.14: Transitions order from READY_FOR_SHIPMENT to SHIPPED
   */
  async markOrderAsShipped(
    orderId: string,
    dto: MarkOrderAsShippedDto,
  ): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    // Validate order is in READY_FOR_SHIPMENT status
    if (order.status !== OrderStatus.READY_FOR_SHIPMENT) {
      throw new BadRequestException(
        `Cannot mark order as shipped from status: ${order.status}. Order must be in READY_FOR_SHIPMENT status.`,
      );
    }

    // Validate tracking information
    if (!dto.trackingNumber || !dto.trackingNumber.trim()) {
      throw new BadRequestException('Tracking number is required');
    }

    if (!dto.carrierCode || !dto.carrierCode.trim()) {
      throw new BadRequestException('Carrier code is required');
    }

    // Mark order as shipped (this will transition status to SHIPPED)
    order.markAsShipped(dto.trackingNumber.trim(), dto.carrierCode.trim());

    // Persist the order
    const savedOrder = await this.orderRepository.save(order);

    // Reload order to ensure we have the latest persisted data (including shipping fields)
    const reloadedOrder = await this.orderRepository.findById(orderId);
    if (!reloadedOrder) {
      this.logger.warn(
        `Order ${orderId} not found after save. Returning saved order.`,
      );
      return savedOrder;
    }

    this.logger.log(
      `Order ${orderId} marked as shipped with tracking number ${dto.trackingNumber} (carrier: ${dto.carrierCode})`,
    );

    return reloadedOrder;
  }
}

