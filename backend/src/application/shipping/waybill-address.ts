/**
 * 读订单的收货信息（2026-11-10，2026-11-11 复审后调整优先级）。
 *
 * 鲜食/试吃装挂在 `order`，补剂挂在 `supplement_order`，两边的地址快照
 * **字段名完全一样**（`{recipientName, phone, region:{province,city,district}, detail}`），
 * 所以比对代码只写一份，这里只负责把两张表读成同一个形状。
 *
 * ⚠️ 优先级是 **address 关系 > 下单快照**，不能反过来：
 *   · 发货弹窗上显示的收货地址、员工照着打包的地址，读的都是 address 关系；
 *   · 顾客事后在地址簿改地址时**不会**刷新订单快照；
 *   · 所以按快照比，会出现「员工看到的地址 = 存根上的地址，却被判对不上」的红条，
 *     而且红条不给手动出口，唯一出路是回地址面板重存一遍同样的地址 —— 没人猜得到。
 * 快照只在 address 关系缺失（老单/纯快照单）时兜底。
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
    recipientName: pickText(addr, snap, 'recipientName'),
    phone: pickText(addr, snap, 'phone'),
    province: pickText(addrRegion, snapRegion, 'province'),
    city: pickText(addrRegion, snapRegion, 'city'),
    district: pickText(addrRegion, snapRegion, 'district'),
    detail: pickText(addr, snap, 'detail'),
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
