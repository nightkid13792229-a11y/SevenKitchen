import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderService } from '../order/order.service';
import {
  ORDER_REPOSITORY,
  ORDER_STATUS_HISTORY_REPOSITORY,
} from '../order/order.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { ShippingFulfillmentService } from '../shipping/shipping-fulfillment.service';
import { SupplementShopConfigService } from '../supplement-shop/supplement-shop-config.service';
import { SupplementOrderService } from '../supplement-shop/supplement-order.service';

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
    private readonly supplementShopConfigService: SupplementShopConfigService,
    private readonly supplementOrderService: SupplementOrderService,
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
    } finally {
      /**
       * ⚠️ 补剂订单的处理**必须放在 finally 里**。
       *
       * 上面那段鲜食逻辑有多个 `return`（比如"暂无待付款单"就直接 return），
       * 写在 try/catch 之后会被这些 return 整个跳过 —— 实测踩过：
       * 定时任务跑了一分钟一次，日志里只有鲜食那句话，补剂单纹丝不动。
       *
       * 超时值来自「补剂商城设置」，与鲜食订单解耦。
       */
      await this.autoCancelExpiredSupplementOrders();
    }
  }

  /**
   * 自动取消超时未付款的**补剂订单**（2026-09-24 补上）。
   *
   * 为什么单独一个方法：补剂订单原先**完全不在自动关单的覆盖范围内** ——
   * 上面的逻辑只查鲜食订单（`orderRepository.findByStatus`）。
   * 结果是：用户提交补剂订单后不付款、又不再打开，
   * 这单会永远挂在「待付款」，而鲜食单 30 分钟就自动取消了。
   *
   * 超时值取「补剂商城设置 → 支付超时」，与鲜食各自独立：
   * 两种生意节奏不同，共用一个值会让调一边影响另一边。
   * 配成 0 表示不自动关单。
   */
  private async autoCancelExpiredSupplementOrders() {
    try {
      const shopConfig = await this.supplementShopConfigService.getConfig();
      const timeoutMinutes = shopConfig.paymentTimeoutMinutes;

      if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
        this.logger.debug(
          '[OrderScheduler] 补剂订单自动关单已关闭（paymentTimeoutMinutes = 0）',
        );
        return;
      }

      // 查询收敛在 service 里，定时任务不直接碰 Prisma
      const expired =
        await this.supplementOrderService.findExpiredUnpaidOrders(timeoutMinutes);

      if (expired.length === 0) return;

      this.logger.log(
        `[OrderScheduler] 发现 ${expired.length} 张超时未付款的补剂订单（超时 ${timeoutMinutes} 分钟）`,
      );

      let cancelled = 0;
      for (const order of expired) {
        try {
          await this.supplementOrderService.cancelOrder(order.id, {
            reason: '支付超时自动取消',
          });
          cancelled += 1;
        } catch (error) {
          // 单张失败不能拖垮整批：可能是状态刚好被并发改掉了
          this.logger.warn(
            `[OrderScheduler] 自动取消失败 ${order.orderNo}: ${(error as Error).message}`,
          );
        }
      }

      if (cancelled > 0) {
        this.logger.log(
          `[OrderScheduler] 已自动取消 ${cancelled} 张超时补剂订单`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[OrderScheduler] 补剂订单自动关单出错: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
