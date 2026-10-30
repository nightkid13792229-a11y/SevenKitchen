import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 食谱调整页 · 守卫（2026-10-25 重写）
 *
 * 这一页只做“调整食谱”：
 *   · 不再让顾客选问题类型；
 *   · 历史只显示提交时间/内容/状态，不展开时间轴；
 *   · 多份订单用 Tab 切换，每份独立说明和附件；
 *   · 撤销/已交付的状态文案由后端给。
 */
function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/<!--[\s\S]*?-->/g, '');
}

describe('食谱调整页', () => {
  const page = stripComments(read('src/pages/custom-recipe/aftersale.vue'));

  it('★ 只提交“调整食谱”，不再有类型选择器', () => {
    expect(page).toContain("type: 'ADJUST_RECIPE'");
    expect(page).not.toContain('fetchAftersaleTypes');
    expect(page).not.toContain('typeOptions');
    expect(page).not.toContain('问个问题');
    expect(page).not.toContain('其他意见');
  });

  it('★ 提交失败显示后端原因，不编通用文案', () => {
    expect(page).toContain('result.message');
    expect(page).not.toContain('提交失败，请稍后重试');
  });

  it('★ 能不能撤销由后端 canCancel 决定', () => {
    expect(page).toContain('openItem.value?.canCancel');
    expect(page).toContain('canCancel');
  });

  it('★ 历史只显示时间、内容、状态，不画进度时间轴', () => {
    expect(page).toContain('提交时间');
    expect(page).toContain('customerStatusLabel');
    expect(page).not.toContain('progress.timeline');
  });

  it('★ 调整总结 / 驳回原因如实显示', () => {
    expect(page).toContain('item.handleNote');
    expect(page).toContain('item.rejectReason');
    expect(page).toContain('调整总结');
  });

  it('★ 已交付卡有最新食谱入口', () => {
    expect(page).toContain('查看最新食谱');
    expect(page).toContain('/pages/custom-recipe/delivery?orderId=');
  });

  it('★ 大容器 + Tab + 可切换摘要/表单', () => {
    expect(page).toContain('调整哪个食谱？');
    expect(page).toContain('recipe-tab');
    expect(page).toContain('activeKey');
    expect(page).toContain('食谱摘要');
    expect(page).toContain('想怎么调整');
  });

  it('★ 退款入口只给占位，不进调整表单', () => {
    expect(page).toContain('isRefundScene');
    expect(page).toContain('退款申请页正在制作中');
  });

  it('★ 订单详情入口文案：调整食谱 / 查看进展', () => {
    const detail = stripComments(
      read('src/pages/custom-recipe/order-detail.vue'),
    );
    expect(detail).toContain('aftersaleAction');
    expect(detail).toContain('showAftersaleEntry');
    expect(detail).toContain('aftersaleEntryLabel');
    expect(detail).toContain('openAftersaleRecipeIds');
    expect(detail).toContain('调整食谱');
    expect(detail).toContain('查看进展');
    expect(detail).toContain('查看记录');
  });
});
