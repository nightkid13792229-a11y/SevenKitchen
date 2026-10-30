import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('统一订单列表 · S2（2026-10-25）', () => {
  const page = read('src/pages/orders-list/index.vue');
  const template = page.slice(0, page.indexOf('<script setup'));

  it('★ 首次进入只加载一次，之后 onShow 才刷新', () => {
    expect(page).toContain('hasShownOrdersList');
    expect(page).toContain('if (!hasShownOrdersList)');
    expect(page).toContain('hasShownOrdersList = true');
    expect(page).toContain('void loadOrders()');
  });

  it('★ 所有支付按钮共用一个支付锁，支付中全部禁用', () => {
    expect(page).toContain('const payingKey = ref');
    expect(page).toContain('function beginPayment');
    expect(page).toContain('function endPayment');
    expect(page).toContain('function isPaying');
    expect(template.match(/:disabled="Boolean\(payingKey\)"/g)?.length).toBe(3);
    expect(template).toContain("isPaying('food', order.id)");
    expect(template).toContain("isPaying('supplement', order.id)");
    expect(template).toContain("isPaying('custom', order.orderId)");
    expect(page).not.toContain('payingOrderId');
    expect(page).not.toContain('payingSupplementId');
    expect(page).not.toContain('payingCustomId');
  });

  it('★ 待付款卡上能直接取消，不用进详情（2026-10-30）', () => {
    expect(page).toContain('cancelOrderFromList');
    expect(page).toContain('/orders/${order.id}/cancel');
    expect(template).toContain('cancelOrderFromList(order)');
    expect(template).toContain('取消订单');
    expect(template).toContain('cancellingId === order.id');
  });

  it('★ 待付款卡显示自动关闭倒计时（2026-10-30）', () => {
    expect(page).toContain('paymentCountdownText');
    expect(page).toContain('paymentLoadedAt');
    expect(template).toContain('paymentCountdownText(order)');
  });

  it('★ 生产不再输出完整订单 DEBUG', () => {
    expect(page).toContain('const DEBUG = false;');
  });

  it('★ 补剂详情注释与代码一致，不再写“没有详情页”', () => {
    expect(page).toContain('补剂有独立详情页');
    expect(page).not.toContain('补剂没有独立详情页');
    expect(page).not.toContain('点卡片不再跳转');
  });
});
