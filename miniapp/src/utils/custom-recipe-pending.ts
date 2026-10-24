import { isPaymentExpired } from './custom-recipe-order';

/**
 * 定制页顶部「待付款」提醒的展示对象（2026-10-25）。
 *
 * 之前页面只取第一张、且只留订单号和截止时间：
 *   · 多只狗时，顾客不知道这笔是哪只狗的；
 *   · 不显示金额，点“继续支付”前心里没数；
 *   · 只取一张，付完一张第二张才冒出来。
 *
 * 这里只决定“先展示哪一张”，展示几条/总张数由页面自己算。
 */
export interface PendingOrderView {
  orderId: string;
  dogId: string;
  dogName: string;
  amount: number | null;
  deadlineAt: number | null;
  createdAt: string | null;
}

/**
 * 优先当前狗狗的待付款；没有就选最急（剩余时间最少）的一张。
 * 已过期的单不参与展示。
 */
export function selectPendingOrder(
  orders: PendingOrderView[],
  currentDogId?: string | null,
  now = Date.now(),
): PendingOrderView | null {
  const valid = (orders || []).filter(
    (order) => !isPaymentExpired(order.deadlineAt, now),
  );
  if (valid.length === 0) return null;

  const wantedDogId = String(currentDogId || '').trim();
  if (wantedDogId) {
    const sameDog = valid.find((order) => order.dogId === wantedDogId);
    if (sameDog) return sameDog;
  }

  return [...valid].sort((a, b) => {
    const aTime = a.deadlineAt ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.deadlineAt ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  })[0];
}

/** 当前有效的待付款张数（过期的不算） */
export function countValidPendingOrders(
  orders: PendingOrderView[],
  now = Date.now(),
): number {
  return (orders || []).filter(
    (order) => !isPaymentExpired(order.deadlineAt, now),
  ).length;
}
