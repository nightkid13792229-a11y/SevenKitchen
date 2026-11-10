/**
 * 读订单的收货信息（2026-11-10）。
 *
 * 鲜食/试吃装挂在 `order`，补剂挂在 `supplement_order`，两边的地址快照
 * **字段名完全一样**（`{recipientName, phone, region:{province,city,district}, detail}`），
 * 所以比对代码只写一份，这里只负责把两张表读成同一个形状。
 *
 * 为什么优先读快照而不是 address 关系：快照是**下单那一刻**的收货信息，
 * 跟存根上印的应该是同一份；address 关系事后被顾客改过也不影响历史单。
 */

import type { PrismaService } from '../../infrastructure/prisma.service';
import type { AddressView } from './waybill-receipt-match';

export interface OrderAddressSnapshot {
  orderId: string;
  kind: 'ORDER' | 'SUPPLEMENT';
  view: AddressView;
}

type RawSnapshot = Record<string, unknown> | null | undefined;
type RawAddress = Record<string, unknown> | null | undefined;

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const pickText = (
  primary: Record<string, unknown> | null,
  fallback: Record<string, unknown> | null,
  key: string,
): string => {
  const fromPrimary = primary?.[key];
  if (typeof fromPrimary === 'string' && fromPrimary.length > 0) {
    return fromPrimary;
  }
  const fromFallback = fallback?.[key];
  return typeof fromFallback === 'string' ? fromFallback : '';
};

/** 快照优先，快照缺的字段用 address 关系补 */
function toAddressView(
  snapshot: RawSnapshot,
  address: RawAddress,
): AddressView {
  const snap = asObject(snapshot);
  const addr = asObject(address);
  const snapRegion = asObject(snap?.region);
  const addrRegion = asObject(addr?.region);

  return {
    recipientName: pickText(snap, addr, 'recipientName'),
    phone: pickText(snap, addr, 'phone'),
    province: pickText(snapRegion, addrRegion, 'province'),
    city: pickText(snapRegion, addrRegion, 'city'),
    district: pickText(snapRegion, addrRegion, 'district'),
    detail: pickText(snap, addr, 'detail'),
  };
}

/**
 * 批量读收货信息。只返回**查得到的**订单；调用方负责判断
 * 「要了 3 张单却只回来 2 张」这种情况（那是订单不存在，得拦住）。
 */
export async function loadOrderAddresses(
  prisma: PrismaService,
  orderIds: string[],
): Promise<OrderAddressSnapshot[]> {
  const unique = Array.from(
    new Set((orderIds ?? []).filter((id) => typeof id === 'string' && id.length > 0)),
  );
  if (unique.length === 0) return [];

  const [orders, supplements] = await Promise.all([
    prisma.order.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        shippingAddressSnapshot: true,
        address: {
          select: {
            recipientName: true,
            phone: true,
            region: true,
            detail: true,
          },
        },
      },
    }),
    prisma.supplementOrder.findMany({
      where: { id: { in: unique } },
      select: { id: true, shippingAddressSnapshot: true },
    }),
  ]);

  const result: OrderAddressSnapshot[] = [];

  for (const order of orders as any[]) {
    result.push({
      orderId: order.id,
      kind: 'ORDER',
      view: toAddressView(order.shippingAddressSnapshot, order.address),
    });
  }

  for (const order of supplements as any[]) {
    result.push({
      orderId: order.id,
      kind: 'SUPPLEMENT',
      view: toAddressView(order.shippingAddressSnapshot, null),
    });
  }

  return result;
}
