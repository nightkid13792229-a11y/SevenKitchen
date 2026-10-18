import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CustomRecipeStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CustomRecipeDeliveryService } from '../custom-recipe/custom-recipe-delivery.service';
import { decideAutoComplete } from '../../domain/custom-recipe/custom-recipe.state';

/**
 * 定制单 · 自动完成（2026-10-16，批次 4.1）
 *
 * ## 它补上的是什么
 *
 * 老板 2026-10-16 定了：**交付后 3 天顾客没确认，系统自动完成**。
 * 我在交付服务里把"闹钟"（`auto_complete_at`）设上了，但**一直没有程序去响它** ——
 * 也就是说订单永远不会自动完成，顾客不点确认就永远挂在"已交付"。
 *
 * 这又是一次"功能上线了但没生效"：字段写了、逻辑没接。
 * （与选项字典那次同类：看着都做了，用户真走一遍才发现走不通。）
 *
 * ## 三条设计口径
 *
 * **一、只完成"确实到点了且还在等确认"的单。**
 * 判断放在领域层（`decideAutoComplete`），可以穷举测试 ——
 * 定时任务最怕的就是"边界写错，半夜批量改错状态"。
 *
 * **二、一次最多处理 N 单，剩下的下轮再说。**
 * 生产上如果积压了几百单，一口气全处理会打出几百条通知、
 * 也会把数据库连接占满。分批来，失败了下一轮还会扫到。
 *
 * **三、单条失败不影响其它单。** 一条出错就 continue，
 * 不能因为一张单数据有问题，整批都不完成。
 */
@Injectable()
export class CustomRecipeSchedulerService {
  private readonly logger = new Logger(CustomRecipeSchedulerService.name);

  /**
   * 每轮最多处理多少单。
   *
   * 取 50：一次跑完一批，又不至于把连接池占满或一次发几百条通知。
   * 积压更多时下一轮（每小时）继续。
   */
  private static readonly BATCH_SIZE = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryService: CustomRecipeDeliveryService,
  ) {}

  /**
   * 自动完成到点的定制单。
   *
   * Cron：每小时的第 20 分钟。
   *
   * 为什么不跟订单调度器一样整点跑：整点已经有一个大任务（成品单自动完成 +
   * 超时关单），错开 20 分钟免得两个任务抢数据库。
   */
  @Cron('0 20 * * * *')
  async handleAutoCompleteCustomRecipes() {
    try {
      const result = await this.autoCompleteDueOrders();
      if (result.completed > 0 || result.failed > 0) {
        this.logger.log(
          `[CustomRecipeScheduler] 自动完成：扫描 ${result.scanned} 单，` +
            `完成 ${result.completed} 单，失败 ${result.failed} 单`,
        );
      }
    } catch (error) {
      // 定时任务里抛出去没人接，会变成未处理异常 —— 自己吞掉并记日志
      this.logger.error('[CustomRecipeScheduler] 自动完成任务整体失败', error);
    }
  }

  /**
   * 实际做事的那个方法（与 cron 分开，便于测试直接调）。
   */
  async autoCompleteDueOrders(input?: { now?: Date; batchSize?: number }): Promise<{
    scanned: number;
    completed: number;
    failed: number;
  }> {
    const now = input?.now ?? new Date();
    const batchSize = input?.batchSize ?? CustomRecipeSchedulerService.BATCH_SIZE;

    /**
     * 只捞"设了闹钟、还没响、且状态确实在等确认"的单。
     *
     * 这里用 `status: DELIVERED` 是**第一道网**（数据库层）；
     * 领域层的 `decideAutoComplete` 是**第二道网**（逻辑层）——
     * 两道都要，因为状态可能在扫描与处理之间被顾客改掉（他正好点了确认）。
     */
    const candidates = await this.prisma.customRecipeOrder.findMany({
      where: {
        status: CustomRecipeStatus.DELIVERED,
        autoCompleteAt: { not: null, lte: now },
      },
      select: {
        id: true,
        orderId: true,
        status: true,
        autoCompleteAt: true,
        /**
         * 2026-10-18：有未处理完的售后时**不许**自动完成（需求 2.5.5）。
         * 在 SQL 里就把它捞出来，省得每单再查一次。
         */
        aftersales: {
          where: { status: { in: ['PENDING', 'ACCEPTED', 'PROCESSING'] } },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { autoCompleteAt: 'asc' },
      take: batchSize,
    });

    let completed = 0;
    let failed = 0;

    for (const order of candidates) {
      /**
       * 领域层再判一次。
       *
       * 为什么不在 SQL 里判完就算了：扫描与处理之间有时间差，
       * 顾客可能正好在这几十毫秒里点了「确认收到」。
       * 那时订单已经是 COMPLETED，**不能再"自动完成"一次**
       * （会覆盖 `completedAt`，而那是售后窗口的起算点）。
       */
      const decision = decideAutoComplete({
        status: order.status,
        autoCompleteAt: order.autoCompleteAt,
        now,
        hasOpenAftersale: (order.aftersales ?? []).length > 0,
      });

      if (!decision.shouldComplete) {
        this.logger.debug(
          `[CustomRecipeScheduler] 跳过 ${order.orderId}：${decision.reason}`,
        );
        continue;
      }

      try {
        const result = await this.deliveryService.confirmReceipt({
          orderIdOrId: order.orderId,
          /**
           * 渠道标 AUTO —— 与顾客主动点「确认收到」区分开。
           * 将来要看"多少单是顾客自己确认的、多少是超期自动的"，
           * 靠这个字段就够，不用再加表。
           */
          channel: 'AUTO',
          now,
        });

        if (result.alreadyConfirmed) {
          // 顾客刚好自己点过了 —— 不是错误
          this.logger.debug(
            `[CustomRecipeScheduler] ${order.orderId} 顾客已自行确认，跳过`,
          );
        } else {
          completed += 1;
        }
      } catch (error) {
        failed += 1;
        /**
         * 单条失败不影响其它单 —— 一张单数据有问题不该让整批都不完成。
         * 这一单的 autoCompleteAt 还在，下一轮会再扫到，不会丢。
         */
        this.logger.warn(
          `[CustomRecipeScheduler] 自动完成 ${order.orderId} 失败，下轮重试`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    return { scanned: candidates.length, completed, failed };
  }
}
