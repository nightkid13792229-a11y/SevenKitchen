/**
 * 发货前的存根核对（2026-11-10）。
 *
 * 老板选的是**硬锁**：没验过存根、或者验完对不上，这单就发不出去。
 * 所以发货的三个入口（单笔鲜食 / 合并拆包 / 补剂）在落库之前都要过这里。
 *
 * 判定只看数据库，不信前端：
 *   1. 有没有一条「这张单 + 这个运单号」的核对记录（status 为 MATCH 或 MANUAL）
 *   2. 记录里记的收货地址指纹，跟现在的地址还一样吗
 *
 * 第 2 条是「先去改地址、再回来传存根」那条唯一出路的实现：
 * 地址一改，旧记录自动作废。
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { loadOrderAddresses } from './waybill-address';
import { buildAddressFingerprint } from './waybill-receipt-match';

/** 放行的两种结论：机器核对通过 / 人工声明确认过 */
export const VERIFIED_STATUSES = ['MATCH', 'MANUAL'] as const;

const NOT_VERIFIED_MESSAGE =
  '这单的运单号还没核对过（或核对没通过）。请先上传电子存根；如果存根认不出来，走「手动填写并确认」。';

const ADDRESS_CHANGED_MESSAGE =
  '这单的收货地址改过了，之前那张存根的核对结果已作废。请重新上传存根再发货。';

const ORDER_MISSING_MESSAGE = '订单不存在，刷新一下再试';

/** 运单号统一口径：去空格、转大写。写和读必须用同一个函数。 */
export function normalizeTrackingNumber(
  raw: string | null | undefined,
): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase();
}

@Injectable()
export class WaybillReceiptGuardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 校验通过就静默返回；不通过抛 `BadRequestException`（调用方直接 400）。
   *
   * 调用时机必须在**事务开始之前** —— 拦下来的时候库里什么都不该动。
   */
  async assertVerified(input: {
    orderIds: string[];
    trackingNumber: string;
  }): Promise<void> {
    const orderIds = Array.from(
      new Set((input.orderIds ?? []).filter(Boolean)),
    );
    if (orderIds.length === 0) {
      throw new BadRequestException('缺少订单');
    }

    const trackingNumber = normalizeTrackingNumber(input.trackingNumber);
    if (!trackingNumber) {
      throw new BadRequestException('缺少运单号');
    }

    const snapshots = await loadOrderAddresses(this.prisma, orderIds);
    if (snapshots.length !== orderIds.length) {
      throw new BadRequestException(ORDER_MISSING_MESSAGE);
    }

    const record = await this.prisma.waybillReceiptRecord.findFirst({
      where: {
        trackingNumber,
        orderIds: { hasEvery: orderIds },
        status: { in: [...VERIFIED_STATUSES] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new BadRequestException(NOT_VERIFIED_MESSAGE);
    }

    const stored = (record.addressFingerprints ?? {}) as Record<string, string>;
    for (const snapshot of snapshots) {
      const current = buildAddressFingerprint(snapshot.view);
      if (stored[snapshot.orderId] !== current) {
        throw new BadRequestException(ADDRESS_CHANGED_MESSAGE);
      }
    }
  }
}
