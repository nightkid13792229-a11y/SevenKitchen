import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

const PAGE = 'src/pages/custom-recipe/refund.vue';
const DETAIL = 'src/pages/custom-recipe/order-detail.vue';
const PAGES_JSON = 'src/pages.json';
const API = 'src/api/custom-recipe.ts';

describe('定制退款页（2026-10-25）', () => {
  const page = read(PAGE);
  const detail = read(DETAIL);
  const api = read(API);
  const pagesJson = read(PAGES_JSON);

  it('★ 已注册退款页，订单详情只留一个退款入口', () => {
    expect(pagesJson).toContain('"pages/custom-recipe/refund"');
    expect(detail).toContain('showRefundEntry');
    expect(detail).toContain('refundEntryLabel');
    expect(detail).toContain('goRefund');
    expect(detail).toContain('pages/custom-recipe/refund?orderId=');
    // 旧占位入口不再出现
    expect(detail).not.toContain('canRequestRefund');
    expect(detail).not.toContain('viewRefund');
  });

  it('★ 未开始制作走全额退款；制作中/已交付走申请审核', () => {
    expect(page).toContain("status === 'PAID'");
    expect(page).toContain("'IN_PROGRESS'");
    expect(page).toContain("'DELIVERED'");
    expect(page).toContain("'COMPLETED'");
    expect(page).toContain('confirmFullRefund');
    expect(page).toContain('cancelOrder(orderId.value');
    expect(page).toContain('submitRequest');
    expect(page).toContain('createCustomRecipeRefundRequest');
  });

  it('★ 退款原因来自选项字典，B 必选，A 选填', () => {
    expect(page).toContain("useOptionSet('custom_recipe_refund_reason')");
    expect(page).toContain('reasonOptions');
    expect(page).toContain('reasonFailed');
    expect(page).toContain('retryReasons');
    expect(page).toContain('请选择退款原因');
  });

  it('★ B 页有说明+照片，提交后进 C 审核进度', () => {
    expect(page).toContain('uploadAftersaleAttachment');
    expect(page).toContain('最多 6 张');
    expect(page).toContain('提交后一个工作日内处理');
    expect(page).toContain('制作中的订单会自动停单并取消');
    expect(page).toContain('退款已原路退回，制作已停止，订单已取消');
    expect(page).toContain("screen.value = 'C'");
    expect(page).toContain('canReapply');
  });

  it('★ C 页展示审核进度，不只是微信退款', () => {
    expect(page).toContain('Seven爸爸审核中');
    expect(page).toContain('审核通过后退款');
    expect(page).toContain('微信退款到账');
    expect(page).toContain('审核通过后才会发起退款');
  });

  it('★ 到账时间按微信官方口径，不写死 1-3 天', () => {
    expect(page).toContain('零钱即时，银行卡 0-3 个工作日');
    expect(page).not.toContain('预计 1-3 个工作日');
  });

  it('★ 订单详情的取消按钮只留给待付款；已付款不再出现“取消并退款”', () => {
    expect(detail).toContain(
      "order.status === 'PENDING_PAYMENT' && cancelAction?.enabled",
    );
  });

  it('API 带退款申请与取消原因', () => {
    expect(api).toContain('createCustomRecipeRefundRequest');
    expect(api).toContain('fetchCustomRecipeRefundRequest');
    expect(api).toContain('refund-request');
    expect(api).toContain('reason?: string');
  });
});
