import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TimezoneUtil } from '../../utils/timezone.util';

@Injectable()
export class SupplementDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(actor: { role?: string } = {}) {
    const todayDate = TimezoneUtil.toShanghaiDateOnly(new Date());
    const today = TimezoneUtil.startOfShanghaiDay(todayDate);
    const tomorrow = TimezoneUtil.startOfShanghaiDay(
      TimezoneUtil.addDays(todayDate, 1),
    );
    const monthStart = TimezoneUtil.startOfShanghaiMonth(todayDate);
    const nextMonth = new Date(
      monthStart.getTime() + 32 * 24 * 60 * 60 * 1000,
    );
    // 下月 1 日：用 32 天后再取月初，避免手写月份进位
    const nextMonthStart = TimezoneUtil.startOfShanghaiMonth(nextMonth);

    const [
      todayCreated,
      todayPaid,
      pendingSchedule,
      todayPacking,
      toShip,
      openAftersale,
      refundAgg,
      statusRows,
    ] = await Promise.all([
      this.prisma.supplementOrder.count({
        where: { createdAt: { gte: today, lt: tomorrow } },
      }),
      this.prisma.supplementOrder.count({
        where: {
          paidAt: { gte: today, lt: tomorrow },
          paymentStatus: 'SUCCESS',
        },
      }),
      this.prisma.supplementOrder.count({
        where: { status: 'PAID', packingDate: null },
      }),
      this.prisma.supplementOrder.count({
        where: {
          packingDate: today,
          status: { in: ['PACKED', 'SHIPPED', 'COMPLETED'] },
        },
      }),
      this.prisma.supplementOrder.count({
        where: { status: 'PACKED' },
      }),
      this.prisma.aftersaleCase.count({
        where: {
          orderType: 'SUPPLEMENT',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      }),
      this.prisma.aftersaleCase.aggregate({
        where: {
          orderType: 'SUPPLEMENT',
          refundStatus: 'SUCCESS',
          refundedAt: { gte: monthStart, lt: nextMonthStart },
        },
        _sum: { refundAmount: true },
      }),
      this.prisma.supplementOrder.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of statusRows) {
      byStatus[row.status] = row._count._all;
    }

    return {
      date: TimezoneUtil.shanghaiDateKey(todayDate),
      todayCreated,
      todayPaid,
      pendingSchedule,
      todayPacking,
      toShip,
      openAftersale,
      refundAmountMonth:
        actor.role === 'STAFF'
          ? null
          : Number(refundAgg._sum.refundAmount ?? 0),
      byStatus,
      configHints: {
        cutoff: (await this.prisma.supplementShopConfig.findUnique({
          where: { id: 'singleton' },
          select: {
            dailyCutoffTime: true,
            dailyPackingCapacity: true,
            autoScheduleEnabled: true,
          },
        })) ?? null,
      },
    };
  }
}
