import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 「我的订单」卡片的单号行（2026-11-02 老板要求两件事）：
 *   1. 订单号整行放到**卡片顶部**；
 *   2. 鲜食 / 食谱定制 / 预分装补剂**统一成同一套 UI**。
 *
 * 改之前三类各说各的：
 *   · 鲜食、定制 → 单号在卡片最下面，右边才是「查看详情」；
 *   · 补剂 → 单号挤在标题下的概要小字里（「订单号 SP… · 6 种 · 共 6 袋」），没有复制。
 */
describe('orders list card header · 单号行统一', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/orders-list/index.vue'),
    'utf-8',
  );
  const template = source.slice(0, source.indexOf('<script setup'));

  const noRowBlock =
    template.match(/<view\s+v-if="orderNoOf\(order\)"[\s\S]*?<\/view>/)?.[0] || '';
  const footBlock =
    template.match(/<view class="order-foot">[\s\S]*?<\/view>/)?.[0] || '';

  it('把单号行放在卡片头下面、标题上面', () => {
    const headerAt = template.indexOf('class="order-header"');
    const noRowAt = template.indexOf('class="order-no-row"');
    const mainAt = template.indexOf('class="order-main"');

    expect(headerAt).toBeGreaterThan(-1);
    expect(noRowAt).toBeGreaterThan(headerAt);
    expect(mainAt).toBeGreaterThan(noRowAt);
  });

  it('三类订单共用同一个单号行（不按订单类型分叉）', () => {
    expect(noRowBlock).toContain('class="order-no-row"');
    expect(noRowBlock).toContain('订单号 {{ orderNoOf(order) }}');
    expect(noRowBlock).toContain('复制');
    expect(noRowBlock).toContain('@tap.stop="copyOrderNo(order)"');
    // 统一 UI 的关键：这一段里不许出现「哪种订单显示成什么样」
    expect(noRowBlock).not.toContain('_orderType');
  });

  it('三种订单都能从自己的字段取到单号', () => {
    expect(source).toContain("return (order as SupplementOrderRow).orderNo || ''");
    expect(source).toContain("return (order as CustomOrderRow).orderId || ''");
    expect(source).toContain("return (order as FoodOrderRow).orderNo || ''");
    // 单号为空时整行不渲染，不留一条空白
    expect(template).toContain('v-if="orderNoOf(order)"');
  });

  it('补剂概要不再重复写一遍订单号', () => {
    expect(template).not.toContain('订单号 {{ order.orderNo }}');
    expect(template).toContain('{{ formatSupplementSummary(order) }}');
  });

  it('卡片底部只剩「查看详情」，不再重复单号', () => {
    expect(footBlock).toContain('查看详情');
    expect(footBlock).not.toContain('order-no');
    expect(footBlock).not.toContain('copyOrderNo');
  });
});
