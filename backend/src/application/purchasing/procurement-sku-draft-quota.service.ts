/**
 * 「从截图识别采购商品」的用量配额（2026-11-01）。
 *
 * 为什么单独一个服务：现有的 `HealthExtractionQuotaService` 只有"全系统每天"一档，
 * 而这里要挡的是**单个员工刷图**（每人每天）+ **整体成本失控**（全系统每月）。
 * 两者口径不同，混用会把健康模块的额度也吃掉。
 *
 * 上限：
 *   · 每个员工每天 30 次 —— 正常员工一周也就几次，30 次足够，超了基本是误触或刷；
 *   · 全系统每月 3000 次 —— 按每次几分钱算，月成本封顶在几十元量级。
 *
 * ⚠️ 先自增再判断：被拒的那一次也会把计数推上去（计数器只增不减）。
 * 这是刻意选的：宁可配额"越用越紧"，也不要为了回滚计数引入一次写失败的风险。
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

export const DAILY_DRAFT_LIMIT_PER_USER = 30;
export const MONTHLY_DRAFT_LIMIT_SYSTEM = 3000;

const startOfLocalDay = (now: Date): Date =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate());

const startOfLocalMonth = (now: Date): Date =>
  new Date(now.getFullYear(), now.getMonth(), 1);

@Injectable()
export class ProcurementSkuDraftQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async consume(userId: string, now: Date = new Date()): Promise<void> {
    const usedOn = startOfLocalDay(now);
    const monthStart = startOfLocalMonth(now);

    const monthTotal = await this.prisma.procurementSkuDraftUsage.aggregate({
      where: { usedOn: { gte: monthStart } },
      _sum: { count: true },
    });

    if (
      (monthTotal?._sum?.count ?? 0) >= MONTHLY_DRAFT_LIMIT_SYSTEM
    ) {
      throw new BadRequestException(
        '本月识别次数已达上限，请手动填写，或联系管理员',
      );
    }

    const row = await this.prisma.procurementSkuDraftUsage.upsert({
      where: { userId_usedOn: { userId, usedOn } },
      create: { userId, usedOn, count: 1 },
      update: { count: { increment: 1 } },
    });

    if ((row?.count ?? 0) > DAILY_DRAFT_LIMIT_PER_USER) {
      throw new BadRequestException(
        `今天的识别次数已用完（每天 ${DAILY_DRAFT_LIMIT_PER_USER} 次），请手动填写`,
      );
    }
  }
}
