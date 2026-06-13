import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('orders list repurchase action contract', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/orders-list/index.vue'),
    'utf-8',
  );
  const wechatConfirmReceiptSource = readFileSync(
    resolve(process.cwd(), 'src/utils/wechat-confirm-receipt.ts'),
    'utf-8',
  );
  const templateSource = source.slice(0, source.indexOf('<script setup'));
  const buyAgainButtonSource =
    templateSource.match(
      /<button[\s\S]*?@tap="buyAgain\(order\)"[\s\S]*?<\/button>/,
    )?.[0] || '';
  const hasQuickActionsSource =
    source.match(/function hasQuickActions[\s\S]*?\n}\n\nfunction canApplyAftersale/)?.[0] ||
    '';
  const repurchaseSource =
    source.match(/function getRepurchasePackageCount[\s\S]*?\n}\n\nfunction formatAmount/)?.[0] ||
    '';
  const mpWeixinConfirmReceiptSource =
    wechatConfirmReceiptSource.match(
      /\/\/ #ifdef MP-WEIXIN[\s\S]*?\/\/ #endif/,
    )?.[0] || '';

  it('shows buy again on every order card without status gating', () => {
    expect(buyAgainButtonSource).toContain('@tap="buyAgain(order)"');
    expect(buyAgainButtonSource).not.toContain("order.status === 'COMPLETED'");
    expect(buyAgainButtonSource).not.toContain("order.status === 'CANCELLED'");

    expect(hasQuickActionsSource).not.toContain("order.status === 'COMPLETED'");
    expect(hasQuickActionsSource).not.toContain("order.status === 'CANCELLED'");
  });

  it('uses the same safe repurchase handoff as order detail', () => {
    expect(repurchaseSource).toContain("url: `/recipes/${recipeId}`");
    expect(repurchaseSource).toContain("'PUBLIC'");
    expect(repurchaseSource).toContain("'ACTIVE'");
    expect(repurchaseSource).toContain('该食谱已下架，无法再次购买');
    expect(repurchaseSource).toContain('autoConfig=true');
    expect(repurchaseSource).toContain('packageCount');
    expect(repurchaseSource).toContain('packageSpecG');
    expect(repurchaseSource).toContain('perMealG');
  });

  it('keeps list confirm receipt behind the WeChat confirm-receipt helper', () => {
    expect(wechatConfirmReceiptSource).toContain('confirmWechatReceiptBeforeInternalComplete');
    expect(source).toContain('confirmWechatReceiptBeforeInternalComplete');
    expect(source).toContain('confirmReceivedFromList(order)');
    expect(source).toContain('await confirmWechatReceiptBeforeInternalComplete(order)');
  });

  it('treats both current and legacy WeChat payment method values as online WeChat orders', () => {
    expect(wechatConfirmReceiptSource).toContain("paymentMethod === 'WECHAT_PAY'");
    expect(wechatConfirmReceiptSource).toContain("paymentMethod === 'WECHAT'");
  });

  it('does not skip WeChat Pay confirmation when the WeChat API is unavailable', () => {
    expect(mpWeixinConfirmReceiptSource).toContain('当前微信版本不支持确认收货，请升级微信后重试');
    expect(mpWeixinConfirmReceiptSource).not.toContain("return { skipped: true, status: 'success' };");
  });
});
