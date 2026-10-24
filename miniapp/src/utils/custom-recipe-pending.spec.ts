import { describe, expect, it } from 'vitest';
import {
  countValidPendingOrders,
  selectPendingOrder,
  type PendingOrderView,
} from './custom-recipe-pending';

const NOW = new Date('2026-10-25T02:00:00+08:00').getTime();
const minutes = (n: number) => NOW + n * 60 * 1000;

function order(
  orderId: string,
  dogId: string,
  dogName: string,
  deadlineAt: number | null,
  amount = 299,
): PendingOrderView {
  return {
    orderId,
    dogId,
    dogName,
    amount,
    deadlineAt,
    createdAt: '2026-10-25T01:00:00+08:00',
  };
}

describe('待付款提醒 · 先展示哪一张', () => {
  it('★ 当前狗狗有待付款：优先当前狗狗，即使另一张更急', () => {
    const current = order('o-current', 'dog-a', '豆豆', minutes(30));
    const urgent = order('o-urgent', 'dog-b', '毛毛', minutes(5));

    expect(
      selectPendingOrder([urgent, current], 'dog-a', NOW)?.orderId,
    ).toBe('o-current');
  });

  it('★ 当前狗狗没有待付款：选最急的一张', () => {
    const later = order('o-later', 'dog-b', '毛毛', minutes(30));
    const urgent = order('o-urgent', 'dog-c', '球球', minutes(5));

    expect(
      selectPendingOrder([later, urgent], 'dog-a', NOW)?.orderId,
    ).toBe('o-urgent');
  });

  it('★ 已过期的单不展示；全过期返回 null', () => {
    const expired = order('o-expired', 'dog-a', '豆豆', minutes(-1));
    const valid = order('o-valid', 'dog-b', '毛毛', minutes(10));

    expect(selectPendingOrder([expired, valid], 'dog-a', NOW)?.orderId).toBe(
      'o-valid',
    );
    expect(selectPendingOrder([expired], 'dog-a', NOW)).toBeNull();
  });

  it('★ 没有截止时间也能展示（排在有时限的后面）', () => {
    const noDeadline = order('o-none', 'dog-a', '豆豆', null);
    const timed = order('o-timed', 'dog-b', '毛毛', minutes(10));

    expect(selectPendingOrder([noDeadline, timed], '', NOW)?.orderId).toBe(
      'o-timed',
    );
    expect(selectPendingOrder([noDeadline], '', NOW)?.orderId).toBe('o-none');
  });

  it('有效张数不包含已过期的', () => {
    expect(
      countValidPendingOrders(
        [
          order('o-1', 'dog-a', '豆豆', minutes(-1)),
          order('o-2', 'dog-b', '毛毛', minutes(5)),
          order('o-3', 'dog-c', '球球', minutes(10)),
        ],
        NOW,
      ),
    ).toBe(2);
  });
});
