import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderService } from '../order/order.service';
import {
  ORDER_REPOSITORY,
  ORDER_STATUS_HISTORY_REPOSITORY,
} from '../order/order.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { ShippingFulfillmentService } from '../shipping/shipping-fulfillment.service';

const WECHAT_ONLINE_PAYMENT_METHODS = ['WECHAT_PAY', 'WECHAT'];

function isWechatOnlinePaymentMethod(
  paymentMethod?: string | null,
): boolean {
  return WECHAT_ONLINE_PAYMENT_METHODS.includes(paymentMethod || '');
}

/**
 * Order Scheduler Service
 *
 * Handles scheduled tasks for order management:
 * - Auto-complete shipped orders after 10 days
 * - Auto-cancel unpaid orders after payment timeout
 */
@Injectable()
export class OrderSchedulerService {
  private static readonly AUTO_COMPLETE_DAYS = 10;
  private readonly logger = new Logger(OrderSchedulerService.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: any,
    @Inject(ORDER_STATUS_HISTORY_REPOSITORY)
    private readonly statusHistoryRepository: any,
    private readonly orderService: OrderService,
    private readonly platformConfigService: PlatformConfigService,
    private readonly shippingFulfillmentService: ShippingFulfillmentService,
  ) {}

  /**
   * Auto-complete shipped orders
   * Runs every hour to check for orders that have been shipped for 10+ days
   *
   * Cron: Every hour at minute 0
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleAutoCompleteOrders() {
    this.logger.debug(
      '[OrderScheduler] Checking for orders to auto-complete...',
    );

    try {
      // Get all shipped orders
      const shippedOrders = await this.orderRepository.findByStatus('SHIPPED');

      if (!shippedOrders || shippedOrders.length === 0) {
        this.logger.debug('[OrderScheduler] No shipped orders found');
        return;
      }

      this.logger.log(
        `[OrderScheduler] Found ${shippedOrders.length} shipped orders`,
      );

      const now = new Date();
      let completedCount = 0;

      for (const order of shippedOrders) {
        try {
          // Get the shipping timestamp from order status history
          const statusHistory = await this.statusHistoryRepository.findByOrderId(
            order.id,
          );
          const shippedEntry = statusHistory?.find(
            (entry: any) => entry.toStatus === 'SHIPPED',
          );

          if (!shippedEntry) {
            this.logger.warn(
              `[OrderScheduler] Order ${order.id} has SHIPPED status but no status history entry`,
            );
            continue;
          }

          const shippedAt = new Date(
            shippedEntry.timestamp ?? shippedEntry.createdAt,
          );
          const daysSinceShipped = Math.floor(
            (now.getTime() - shippedAt.getTime()) / (1000 * 60 * 60 * 24),
          );

          // Auto-complete after 10 days
          if (
            daysSinceShipped >= OrderSchedulerService.AUTO_COMPLETE_DAYS &&
            (await this.completeOrderIfEligible(order, daysSinceShipped))
          ) {
            completedCount++;
          }
        } catch (error) {
          this.logger.error(
            `[OrderScheduler] Error processing shipped order ${order.id}: ${
              (error as Error).message
            }`,
            (error as Error).stack,
          );
        }
      }

      if (completedCount > 0) {
        this.logger.log(
          `[OrderScheduler] Successfully auto-completed ${completedCount} order(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[OrderScheduler] Error during auto-complete task: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  private async completeOrderIfEligible(
    order: any,
    daysSinceShipped: number,
  ): Promise<boolean> {
    if (!isWechatOnlinePaymentMethod(order.paymentMethod)) {
      this.logger.log(
        `[OrderScheduler] Auto-completing order ${order.id} (shipped ${daysSinceShipped} days ago)`,
      );

      await this.orderService.completeOrder(order.id, 'system', null, {
        autoCompleted: true,
        daysSinceShipped,
      });

      return true;
    }

    const wechatStatus = await this.queryWechatStatusForAutoComplete(order.id);
    if (wechatStatus?.queryFailed) {
      return false;
    }

    const wechatOrderState = wechatStatus?.orderState;
    const canComplete =
      wechatStatus?.success !== false &&
      wechatStatus?.skipped !== true &&
      (wechatOrderState === 3 || wechatOrderState === 4);

    if (!canComplete) {
      this.logger.debug(
        `[OrderScheduler] Skipping WeChat Pay order ${order.id}; WeChat order state is ${wechatOrderState ?? 'missing'} (${wechatStatus?.orderStateLabel ?? 'unknown'})`,
      );
      return false;
    }

    this.logger.log(
      `[OrderScheduler] Auto-completing WeChat Pay order ${order.id} (shipped ${daysSinceShipped} days ago, WeChat state ${wechatOrderState})`,
    );

    await this.orderService.completeOrder(order.id, 'system', null, {
      autoCompleted: true,
      daysSinceShipped,
      wechatOrderState,
      wechatOrderStateLabel: wechatStatus?.orderStateLabel,
    });

    return true;
  }

  private async queryWechatStatusForAutoComplete(orderId: string): Promise<any> {
    try {
      return await this.shippingFulfillmentService.queryWechatShippingOrderStatus(
        orderId,
      );
    } catch (error) {
      this.logger.warn(
        `[OrderScheduler] Skipping WeChat Pay order ${orderId}; failed to query WeChat shipping status: ${
          (error as Error).message
        }`,
      );
      return { queryFailed: true };
    }
  }

  /**
   * Auto-cancel expired unpaid orders
   * Runs every minute to check for PENDING_PAYMENT orders that have timed out
   *
   * Cron: Every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleAutoCancelExpiredOrders() {
    this.logger.debug('[OrderScheduler] Checking for expired unpaid orders...');

    try {
      // Get payment timeout configuration from the admin payment settings.
      const paymentConfig = await this.platformConfigService.getPaymentConfig();
      if (!paymentConfig.autoCloseUnpaid) {
        this.logger.debug('[OrderScheduler] Auto close unpaid orders disabled');
        return;
      }

      const paymentTimeoutMinutes = paymentConfig.paymentTimeoutMinutes ?? 30;

      // Get all pending payment orders
      const pendingPaymentOrders =
        await this.orderRepository.findByStatus('PENDING_PAYMENT');

      if (!pendingPaymentOrders || pendingPaymentOrders.length === 0) {
        this.logger.debug('[OrderScheduler] No pending payment orders found');
        return;
      }

      this.logger.log(
        `[OrderScheduler] Found ${pendingPaymentOrders.length} pending payment orders`,
      );

      const now = new Date();
      const timeoutMs = paymentTimeoutMinutes * 60 * 1000;
      let cancelledCount = 0;

      for (const order of pendingPaymentOrders) {
        const orderAge = now.getTime() - order.createdAt.getTime();

        // Check if order has exceeded payment timeout
        if (orderAge > timeoutMs) {
          const minutesSinceCreation = Math.floor(orderAge / (1000 * 60));

          this.logger.log(
            `[OrderScheduler] Auto-cancelling order ${order.id} (created ${minutesSinceCreation} minutes ago, timeout: ${paymentTimeoutMinutes} minutes)`,
          );

          await this.orderService.cancelOrder(
            order.id,
            '支付超时自动取消',
            'system',
            null, // System operation, no actorId
          );

          cancelledCount++;
        }
      }

      if (cancelledCount > 0) {
        this.logger.log(
          `[OrderScheduler] Successfully auto-cancelled ${cancelledCount} expired order(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[OrderScheduler] Error during auto-cancel task: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
