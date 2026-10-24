import { describe, expect, it } from 'vitest';
import { ORDER_TYPE_META, ORDER_TYPE_TABS, orderTypeLabel } from './order-type';

/**
 * 订单类型文案的单一来源（2026-10-24）。
 *
 * 改之前 `定制/成品/补剂` 散在订单列表、卡片角标、专属列表、员工端各写一份；
 * 这次统一成"食谱定制 / 成品鲜食 / 预分装补剂"，并把它们收进一个表。
 * 以后改名只改这一个文件，不再全仓搜字符串。
 */
describe('订单类型文案', () => {
  it('三类订单的顾客端名称是统一的长名', () => {
    expect(ORDER_TYPE_META.custom.label).toBe('食谱定制');
    expect(ORDER_TYPE_META.food.label).toBe('成品鲜食');
    expect(ORDER_TYPE_META.supplement.label).toBe('预分装补剂');
  });

  it('类型筛选的四个 Tab 依次是：全部、食谱定制、成品鲜食、预分装补剂', () => {
    expect(ORDER_TYPE_TABS.map((tab) => tab.label)).toEqual([
      '全部',
      '食谱定制',
      '成品鲜食',
      '预分装补剂',
    ]);
  });

  it('orderTypeLabel 对未知类型给空串，不把内部码丢给顾客', () => {
    expect(orderTypeLabel('custom')).toBe('食谱定制');
    expect(orderTypeLabel('unknown' as any)).toBe('');
  });

  it('色调跟着类型走（定制橙 / 成品绿 / 补剂紫）', () => {
    expect(ORDER_TYPE_META.custom.tone).toBe('custom');
    expect(ORDER_TYPE_META.food.tone).toBe('food');
    expect(ORDER_TYPE_META.supplement.tone).toBe('supplement');
  });
});
