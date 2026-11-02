import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 鲜食订单卡上的运单号（2026-11-02 老板要求）。
 *
 * 「我的订单」里已发货的鲜食卡片：
 *   · 不要「物流详情」入口，也不弹「物流信息」弹窗；
 *   · 运单号右侧只留一个「复制」；
 *   · **复制的内容只能是运单号本身** —— 带上「顺丰速运」这种公司名，
 *     顾客拿去查快递会查不到。
 */
describe('orders list shipping number contract', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/orders-list/index.vue'),
    'utf-8',
  );
  const templateSource = source.slice(0, source.indexOf('<script setup'));

  const logisticsBlockSource =
    templateSource.match(/<view\s+v-if="order\._orderType === 'food'[\s\S]*?<\/view>/)?.[0] ||
    '';
  const copyTrackingNumberSource =
    source.match(/function copyTrackingNumber[\s\S]*?\n}\n/)?.[0] || '';

  it('keeps the carrier + number on the card', () => {
    expect(logisticsBlockSource).toContain('trackingText(order)');
    // 承运商仍然要显示（顾客要认得出是哪家快递）
    expect(source).toContain("return carrier && carrier !== '-' ? `${carrier} ${row.trackingNumber}` : row.trackingNumber");
  })

  it('offers a copy button right next to the number', () => {
    expect(logisticsBlockSource).toContain('class="logistics__copy"');
    expect(logisticsBlockSource).toContain('@tap.stop="copyTrackingNumber(order)"');
  });

  it('drops the logistics detail entry and the logistics modal', () => {
    expect(logisticsBlockSource).not.toContain('logistics__link');
    expect(source).not.toContain('function viewLogistics');
    expect(source).not.toContain('@tap.stop="viewLogistics(order)"');
    // 卡片上不再有物流信息弹窗
    expect(source).not.toContain("title: '物流信息'");
  });

  it('copies only the tracking number, never the carrier name', () => {
    expect(copyTrackingNumberSource).toContain('function copyTrackingNumber(order: FoodOrderRow)');
    expect(copyTrackingNumberSource).toContain('const trackingNumber = String(order.trackingNumber || \'\').trim()');
    expect(copyTrackingNumberSource).toContain('data: trackingNumber');
    // 复用 trackingText() 会把「顺丰速运」一起复制走
    expect(copyTrackingNumberSource).not.toContain('trackingText');
    expect(copyTrackingNumberSource).not.toContain('getCarrierName');
  });
});
