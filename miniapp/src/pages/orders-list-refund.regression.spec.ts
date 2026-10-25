import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('统一订单列表 · 退款申请与加载状态（2026-10-25）', () => {
  const page = read('src/pages/orders-list/index.vue');

  it('★ 定制单分页拿全，不再只拉前 50 单', () => {
    expect(page).toContain('CUSTOM_ORDER_PAGE_SIZE');
    expect(page).toContain('CUSTOM_ORDER_MAX_PAGES');
    expect(page).toContain('while (page <= CUSTOM_ORDER_MAX_PAGES)');
    expect(page).toContain('fetchMyOrders({');
    expect(page).toContain('collected.length >= total');
  });

  it('★ 退款申请进列表：售后中归类、状态、退款进度入口', () => {
    expect(page).toContain('refundRequest');
    expect(page).toContain('isCustomRefundRequestOpen');
    expect(page).toContain('isCustomRefundBlockingAftersale');
    expect(page).toContain('customRefundEntryLabel');
    expect(page).toContain('goCustomRefund');
    expect(page).toContain("'退款审核中'");
    expect(page).toContain("'退款处理中'");
    expect(page).toContain("'退款进度'");
    expect(page).toContain('/pages/custom-recipe/refund?orderId=');
  });

  it('★ 有未处理退款时不再同时给“申请售后”', () => {
    expect(page).toContain('!isCustomRefundBlockingAftersale(order)');
    expect(page).toContain('customRefundEntryLabel(order)');
  });

  it('★ 加载失败/部分失败有明确提示和重试，不冒充“没有订单”', () => {
    expect(page).toContain('loadFailed');
    expect(page).toContain('partialLoadFailed');
    expect(page).toContain('loadWarningText');
    expect(page).toContain('订单加载失败');
    expect(page).toContain('其他订单仍可查看');
    expect(page).toContain('@tap="loadOrders"');
    expect(page).toContain('loadFailed && allOrders.length === 0');
  });
});
