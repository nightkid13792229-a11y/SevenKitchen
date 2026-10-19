import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupplementSchedulingService } from '../supplement-shop/supplement-scheduling.service';

/**
 * 补剂排期定时任务
 *
 * - 每分钟：重试“已付款但未排期”的订单（支付时排期失败/自动排期关闭后开启）
 * - 每小时：发货满 autoCompleteDays 的订单自动完成
 *
 * 不在 OrderSchedulerService 里加，避免和鲜食/定制定时任务互相影响；
 * 后续如果任务多了，再抽统一的 scheduler 模块。
 */
@Injectable()
export class SupplementSchedulerService {
  private readonly logger = new Logger(SupplementSchedulerService.name);

  constructor(
    private readonly schedulingService: SupplementSchedulingService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async retryUnscheduledOrders(): Promise<void> {
    try {
      const count = await this.schedulingService.retryUnscheduledOrders(50);
      if (count > 0) {
        this.logger.log(`[SupplementScheduler] retried/scheduled ${count} orders`);
      }
    } catch (error) {
      this.logger.error(
        `[SupplementScheduler] retry failed: ${(error as Error).message}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async autoCompleteShippedOrders(): Promise<void> {
    try {
      const count = await this.schedulingService.autoCompleteShippedOrders(200);
      if (count > 0) {
        this.logger.log(`[SupplementScheduler] auto-completed ${count} orders`);
      }
    } catch (error) {
      this.logger.error(
        `[SupplementScheduler] auto-complete failed: ${(error as Error).message}`,
      );
    }
  }
}
