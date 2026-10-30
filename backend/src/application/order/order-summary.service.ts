import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

export interface CustomerOrderSummary {
  total: number;
  pendingPayment: number;
  inProgress: number;
  waitReceive: number;
  completed: number;
  aftersale: number;
}

type StatusCount = { status: string; _count: { _all: number } };

const FOOD_IN_PROGRESS = ['PAID', 'PURCHASING', 'IN_PRODUCTION', 'FREEZING'];
const SUPPLEMENT_IN_PROGRESS = ['PAID', 'PACKING', 'PACKED'];
const CUSTOM_IN_PROGRESS = ['PAID', 'IN_PROGRESS'];
const OPEN_AFTERSALE = ['PENDING', 'ACCEPTED', 'PROCESSING'];
const OPEN_REFUND = ['PENDING', 'PROCESSING'];

/**
 * 三类订单的统一计数（2026-10-25）。
 *
 * 顾客「我的」页的五个快捷数字和「我的订单」总数必须与三单合一的
 * 订单列表同口径；此前只查鲜食 `/orders`，定制/补剂会漏。
 *
 * 定制单的「售后中」不是订单状态：它有未结调整单或退款申请时，
 * 在列表里只出现在「售后中」，所以这里也要从其他档位扣掉。
 */
@Injectable()
export class OrderSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getCustomerSummary(customerId: string): Promise<CustomerOrderSummary> {
    const [food, supplement, custom, customOpen] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { customerId },
        _count: { _all: true },
      }),
      this.prisma.supplementOrder.groupBy({
        by: ['status'],
        where: { userId: customerId },
        _count: { _all: true },
      }),
      this.prisma.customRecipeOrder.groupBy({
        by: ['status'],
        where: { customerId },
        _count: { _all: true },
      }),
      this.prisma.customRecipeOrder.groupBy({
        by: ['status'],
        where: {
          customerId,
          OR: [
            { aftersales: { some: { status: { in: OPEN_AFTERSALE as any } } } },
            {
              refundRequests: {
                some: { status: { in: OPEN_REFUND as any } },
              },
            },
          ],
        },
        _count: { _all: true },
      }),
    ]);

    const foodCounts = this.toMap(food as StatusCount[]);
    const supplementCounts = this.toMap(supplement as StatusCount[]);
    const customCounts = this.toMap(custom as StatusCount[]);
    const customOpenCounts = this.toMap(customOpen as StatusCount[]);

    const customOpenTotal = this.sum(customOpenCounts);
    const customInProgress =
      this.sumStatuses(customCounts, CUSTOM_IN_PROGRESS) -
      this.sumStatuses(customOpenCounts, CUSTOM_IN_PROGRESS);
    const customWaitReceive =
      this.count(customCounts, 'DELIVERED') -
      this.count(customOpenCounts, 'DELIVERED');
    const customCompleted =
      this.count(customCounts, 'COMPLETED') -
      this.count(customOpenCounts, 'COMPLETED');
    const customPending =
      this.count(customCounts, 'PENDING_PAYMENT') -
      this.count(customOpenCounts, 'PENDING_PAYMENT');

    const total =
      this.sum(foodCounts) + this.sum(supplementCounts) + this.sum(customCounts);

    return {
      total,
      pendingPayment:
        this.count(foodCounts, 'PENDING_PAYMENT') +
        this.count(supplementCounts, 'PENDING_PAYMENT') +
        customPending,
      inProgress:
        this.sumStatuses(foodCounts, FOOD_IN_PROGRESS) +
        this.sumStatuses(supplementCounts, SUPPLEMENT_IN_PROGRESS) +
        customInProgress,
      waitReceive:
        this.count(foodCounts, 'SHIPPED') +
        this.count(supplementCounts, 'SHIPPED') +
        customWaitReceive,
      completed:
        this.count(foodCounts, 'COMPLETED') +
        this.count(supplementCounts, 'COMPLETED') +
        customCompleted,
      aftersale:
        this.count(foodCounts, 'AFTERSALE') +
        this.count(supplementCounts, 'AFTERSALE') +
        customOpenTotal,
    };
  }

  private toMap(rows: StatusCount[]): Record<string, number> {
    const map: Record<string, number> = {};
    for (const row of rows || []) {
      map[String(row.status)] = Number(row._count?._all || 0);
    }
    return map;
  }

  private count(map: Record<string, number>, status: string): number {
    return Number(map[status] || 0);
  }

  private sum(map: Record<string, number>): number {
    return Object.values(map).reduce((sum, count) => sum + Number(count || 0), 0);
  }

  private sumStatuses(map: Record<string, number>, statuses: string[]): number {
    return statuses.reduce((sum, status) => sum + this.count(map, status), 0);
  }
}
