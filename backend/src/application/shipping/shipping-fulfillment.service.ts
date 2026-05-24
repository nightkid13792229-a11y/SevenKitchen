/**
 * Shipping Fulfillment Service
 * Phase 8.14: Production Shipment / Fulfillment MVP
 */

import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { OrderRepository } from '../../domain/order/order.repository';
import type { OrderStatusHistoryRepository } from '../../domain/order/order-status-history.repository';
import { Order } from '../../domain/order';
import { OrderStatus } from '../../domain';
import {
  ORDER_REPOSITORY,
  ORDER_STATUS_HISTORY_REPOSITORY,
} from '../order/order.service';
import {
  WechatShippingBatchUploadResult,
  WechatShippingUploadPendingSummary,
  WechatShippingUploadResult,
  WechatShippingUploadService,
} from './wechat-shipping-upload.service';

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

export interface MarkOrderAsShippedResult {
  order: Order;
  wechatShippingUpload: WechatShippingUploadResult;
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
    @Inject(ORDER_STATUS_HISTORY_REPOSITORY)
    private readonly statusHistoryRepository: OrderStatusHistoryRepository,
    private readonly wechatShippingUploadService: WechatShippingUploadService,
  ) {}

  /**
   * List orders ready for shipment
   * Orders are ready for shipment once production is completed and they enter
   * the FREEZING ("急冻中待发货") state.
   */
  async listOrdersReadyForShipment(): Promise<OrderReadyForShipmentDto[]> {
    const orders = await this.orderRepository.findByStatus(
      OrderStatus.FREEZING,
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
   * Shipping happens after the order has moved into FREEZING.
   * Phase 8.18: Logs status transition to history
   */
  async markOrderAsShipped(
    orderId: string,
    dto: MarkOrderAsShippedDto,
    actor: 'customer' | 'staff' | 'admin' | 'system' = 'staff',
    actorId?: string | null,
  ): Promise<MarkOrderAsShippedResult> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    if (order.status !== OrderStatus.FREEZING) {
      throw new BadRequestException(
        `Cannot mark order as shipped from status: ${order.status}. Order must be in FREEZING status.`,
      );
    }

    // Validate tracking information
    if (!dto.trackingNumber || !dto.trackingNumber.trim()) {
      throw new BadRequestException('Tracking number is required');
    }

    if (!dto.carrierCode || !dto.carrierCode.trim()) {
      throw new BadRequestException('Carrier code is required');
    }

    const fromStatus = order.status;

    // Mark order as shipped (this will transition status to SHIPPED)
    order.markAsShipped(dto.trackingNumber.trim(), dto.carrierCode.trim());

    // Persist the order
    const savedOrder = await this.orderRepository.save(order);

    // Log status transition with shipping metadata
    try {
      await this.statusHistoryRepository.append(
        savedOrder.id,
        fromStatus,
        OrderStatus.SHIPPED,
        actor,
        actorId,
        {
          trackingNumber: dto.trackingNumber.trim(),
          carrierCode: dto.carrierCode.trim(),
        },
      );
    } catch (error) {
      // Phase 8.18: Log errors at ERROR level and re-throw to prevent silent failures
      this.logger.error(
        `[History] ERROR: Failed to log status transition for order ${orderId}:`,
        error,
      );
      // Re-throw to fail fast and prevent silent failures
      throw error;
    }

    // Reload order to ensure we have the latest persisted data (including shipping fields)
    const reloadedOrder = await this.orderRepository.findById(orderId);
    if (!reloadedOrder) {
      this.logger.warn(
        `Order ${orderId} not found after save. Returning saved order.`,
      );
      return {
        order: savedOrder,
        wechatShippingUpload: await this.uploadWechatShippingInfoSafely(
          savedOrder.id,
          actor,
          actorId,
        ),
      };
    }

    this.logger.log(
      `Order ${orderId} marked as shipped with tracking number ${dto.trackingNumber} (carrier: ${dto.carrierCode})`,
    );

    return {
      order: reloadedOrder,
      wechatShippingUpload: await this.uploadWechatShippingInfoSafely(
        reloadedOrder.id,
        actor,
        actorId,
      ),
    };
  }

  async uploadWechatShippingInfo(
    orderId: string,
    actor: 'customer' | 'staff' | 'admin' | 'system' = 'staff',
    actorId?: string | null,
  ): Promise<WechatShippingUploadResult> {
    return this.uploadWechatShippingInfoSafely(orderId, actor, actorId);
  }

  async listPendingWechatShippingUploads(
    limit = 100,
  ): Promise<WechatShippingUploadPendingSummary> {
    return this.wechatShippingUploadService.listPendingUploads(limit);
  }

  async uploadPendingWechatShippingInfo(
    limit = 100,
  ): Promise<WechatShippingBatchUploadResult> {
    const pending =
      await this.wechatShippingUploadService.listPendingUploads(limit);
    const results: WechatShippingBatchUploadResult['results'] = [];

    for (const candidate of pending.candidates) {
      const result = await this.uploadWechatShippingInfoSafely(
        candidate.orderId,
        'admin',
        null,
      );
      results.push({
        orderId: candidate.orderId,
        success: result.success,
        skipped: result.skipped,
        message: result.message,
      });
    }

    return {
      total: results.length,
      success: results.filter((item) => item.success && !item.skipped).length,
      failed: results.filter((item) => !item.success).length,
      skipped: results.filter((item) => item.skipped).length,
      results,
    };
  }

  private async uploadWechatShippingInfoSafely(
    orderId: string,
    actor: 'customer' | 'staff' | 'admin' | 'system',
    actorId?: string | null,
  ): Promise<WechatShippingUploadResult> {
    let result: WechatShippingUploadResult;
    try {
      result = await this.wechatShippingUploadService.uploadForOrder(orderId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = {
        success: false,
        message,
      };
      this.logger.error(
        `[WeChatShipping] Failed to upload shipping info for order ${orderId}: ${message}`,
      );
    }

    try {
      const currentOrder = await this.orderRepository.findById(orderId);
      if (currentOrder) {
        await this.statusHistoryRepository.append(
          orderId,
          currentOrder.status,
          currentOrder.status,
          actor,
          actorId,
          {
            event: 'WECHAT_SHIPPING_UPLOAD',
            success: result.success,
            skipped: Boolean(result.skipped),
            message: result.message,
          },
        );
      }
    } catch (historyError) {
      this.logger.warn(
        `[WeChatShipping] Failed to append upload history for order ${orderId}: ${
          historyError instanceof Error ? historyError.message : String(historyError)
        }`,
      );
    }

    return result;
  }
}
