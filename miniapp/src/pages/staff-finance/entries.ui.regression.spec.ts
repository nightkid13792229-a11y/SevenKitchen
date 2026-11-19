import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');

const luminance = (hex: string) => {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  const [r, g, b] = [0, 2, 4].map(
    (offset) => parseInt(full.slice(offset, offset + 2), 16) / 255,
  );
  const channel = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (foreground: string, background: string) => {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
};

describe('收支明细', () => {
  const page = read('./entries.vue');
  const home = read('./index.vue');
  const api = read('../../api/staff-finance.ts');
  const pagesJson = read('../../pages.json');
  const tokenSource = read('../../styles/staff-tokens.scss');

  it('有四个筛选：全部/收入/支出/我垫的', () => {
    for (const text of ['全部', '收入', '支出', '我垫的']) {
      expect(page).toContain(text);
    }
    // 我垫的 = 付款方是个人
    expect(page).toContain("payerType: 'PERSONAL'");
    // 收入/支出走 direction，不另造后端没有的参数
    expect(page).toContain("direction: 'INCOME'");
    expect(page).toContain("direction: 'EXPENSE'");
  });

  it('退款显示为红色负数并带「退款」标记', () => {
    expect(page).toContain('isRefund');
    expect(page).toContain('退款');
    expect(page).toContain('amountNegative');
    expect(page).toContain("'−'");
    expect(page).toContain('entry-amount--negative');

    // 红色用规范里的 staff-danger，且在白色卡片上达到正文对比度
    const danger = tokenSource.match(/\$staff-danger:\s*(#[0-9a-fA-F]{6})/)?.[1];
    expect(danger).toBeTruthy();
    expect(contrast(danger!, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(page).toContain('$staff-danger');
  });

  it('每条能跳来源单据，跳不了有 toast 不静默', () => {
    expect(page).toContain('sourceType');
    expect(page).toContain('/pages/staff-order-center/index');
    expect(page).toContain('/pages/staff-supplement-orders/index');
    expect(page).toContain('/pages/staff-purchasing/index');

    // 定制食谱的 /pages/custom-recipe/list 没有注册：只提示、不跳
    expect(page).toContain('CUSTOM_RECIPE_ORDER');
    expect(page).toContain('定制食谱');
    expect(page).not.toContain("CUSTOM_RECIPE_ORDER: '/pages");

    // BILL / MANUAL / FEE 不跳，给一句说明
    expect(page).toContain('BILL');
    expect(page).toContain('MANUAL');
    expect(page).toContain('FEE');

    // 跳转失败必须有 toast
    const navBlock = page.match(/function openSource[\s\S]*?\n\}/)?.[0] || '';
    expect(navBlock).toContain('uni.navigateTo');
    expect(navBlock).toContain('fail');
    expect(navBlock).toContain('uni.showToast');
  });

  it('触底加载更多，到底提示没有更多了', () => {
    expect(page).toContain('onReachBottom');
    expect(page).toContain('loadMore');
    expect(page).toContain('hasMore');
    expect(page).toContain('pageSize');
    expect(page).toContain('没有更多了');
    expect(page).toContain('加载中');
  });

  it('空态一句话 + 回财务首页', () => {
    expect(page).toContain('还没有收支记录');
    expect(page).toContain('回财务首页');
    expect(page).toContain('/pages/staff-finance/index');
  });

  it('金额带正负，日期和类别标签都在一行里', () => {
    expect(page).toContain('formatMoney');
    expect(page).toContain('occurredAt');
    expect(page).toContain('entry.label');
    expect(page).toContain('formatDate');
  });

  it('API 层封装 listEntries 并支持付款方筛选', () => {
    expect(api).toContain('listEntries');
    expect(api).toContain("url: '/admin/finance/entries'");
    expect(api).toContain('FinanceEntriesPage');
    expect(api).toContain('payerType');
  });

  it('首页三个大数可点，带 query 进明细', () => {
    expect(home).toContain('entries?direction=INCOME');
    expect(home).toContain('entries?direction=EXPENSE');
    // 结余点进去是全部
    expect(home).toContain("goEntries()");
    expect(home).toContain('uni.navigateTo');
  });

  it('分包注册 entries，导航标题「收支明细」深绿', () => {
    expect(pagesJson).toContain('"root": "pages/staff-finance"');
    expect(pagesJson).toContain('"path": "entries"');
    expect(pagesJson).toContain('"navigationBarTitleText": "收支明细"');

    const entryStyle =
      pagesJson.match(
        /"path": "entries"[\s\S]*?"navigationBarBackgroundColor": "(#[0-9a-fA-F]{6})"/,
      )?.[1] || '';
    expect(entryStyle.toLowerCase()).toBe('#1e3a2f');
  });

  it('非 ADMIN 直接输地址先拦下，不发请求', () => {
    expect(page).toContain("getStoredUser()?.role !== 'ADMIN'");
    expect(page).toContain('权限不足');
  });
});
