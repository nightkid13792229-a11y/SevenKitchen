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

  it('方向筛选：全部/收入/支出；「我垫的」已换成账户筛选', () => {
    for (const text of ['全部', '收入', '支出']) {
      expect(page).toContain(text);
    }
    // 收入/支出走 direction，不另造后端没有的参数
    expect(page).toContain("direction: 'INCOME'");
    expect(page).toContain("direction: 'EXPENSE'");
    // 2026-11-19：会计概念「我垫的」下线，改成「钱从哪个账户进出」
    expect(page).not.toContain('我垫的');
    expect(page).not.toContain('payerType');
  });

  it('按账户筛：全部 + 五个账户，带 account 参数并重置分页', () => {
    expect(page).toContain('AccountPicker');
    expect(page).toContain('selectedAccount');
    expect(page).toContain('account: selectedAccount.value');
    // 筛选不写「上次用的账户」，否则筛一下明细就把记账默认值改了
    expect(page).toContain(':remember="false"');
    expect(page).toContain('allow-all');
    // 切账户必须重置分页，否则第 2 页会拼到新筛选后面
    const selectBlock =
      page.match(/function selectAccount[\s\S]*?\n\}/)?.[0] || '';
    expect(selectBlock).toContain('load({ reset: true })');
    // 非法账户（深链手改参数）当「全部」处理
    expect(selectBlock).toContain('isFinanceAccountCode');
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

  it('报销杂费行有「报销杂费」标签，并能打开报销详情', () => {
    // 后端明细已经会返回报销杂费行，来源类型不能漏
    expect(api).toContain("'REIMBURSEMENT'");
    expect(page).toContain("entry.sourceType === 'REIMBURSEMENT'");
    expect(page).toContain('报销杂费');
    expect(page).toContain('/pages/staff-purchasing/reimbursement/detail');
    // 详情页参数是 id（报销单 id），不是 claimNumber
    expect(page).toContain('?id=${encodeURIComponent(sourceId)}');
    expect(page).toContain('entry.sourceId');
  });

  it('触底加载更多，到底提示没有更多了', () => {
    expect(page).toContain('onReachBottom');
    expect(page).toContain('loadMore');
    expect(page).toContain('hasMore');
    expect(page).toContain('pageSize');
    expect(page).toContain('没有更多了');
    expect(page).toContain('加载中');
    // 没有下一页的判断看后端最后一批是否给满，去重后不会永远「还能加载」
    expect(page).toContain('lastBatchSize');
  });

  it('分页按 id 去重，不会出现重复行', () => {
    expect(page).toContain('seen.has(item.id)');
    expect(page).toContain('entries.value.slice()');
  });

  it('按月份取数，并在顶部写明区间', () => {
    // 首页月报点进来带 month，明细必须按整月请求
    expect(page).toContain('monthParam');
    expect(page).toContain('month: monthParam.value');
    expect(page).toContain('periodLabel');
    expect(page).toContain('本月至今');
    // 末一天按真实月份算，不是写死 30 日
    expect(page).toContain('new Date(Date.UTC(year, month, 0))');
  });

  it('月份 chip 默认本月，可切最近三个月并重置分页', () => {
    expect(page).toContain('月份 ·');
    expect(page).toContain('本月');
    expect(page).toContain('monthChipLabel');
    expect(page).toContain('monthPanelOpen');
    expect(page).toContain('recentMonthChips');
    // 最近三个月必须裁到起账月，不能选到 2026-11 之前
    expect(page).toContain('FINANCE_START_MONTH');
    expect(page).toContain('selectMonth');

    const selectBlock = page.match(/function selectMonth[\s\S]*?\n\}/)?.[0] || '';
    expect(selectBlock).toContain('monthParam.value = value');
    expect(selectBlock).toContain('load({ reset: true })');
    // 月份面板和类别面板互斥，不能叠在一起
    expect(page).toContain('if (monthPanelOpen.value) categoryPanelOpen.value = false');
    expect(page).toContain('if (categoryPanelOpen.value) monthPanelOpen.value = false');
  });

  it('历史订单退款行在标题后标「历史单」', () => {
    expect(page).toContain('entry.isRefund && entry.isHistorical');
    expect(page).toContain('历史单');
    expect(page).toContain('entry-historical');
    expect(page).toContain('entry-title-row');
    // 金色小标签，和红色「退款」区分开
    expect(page).toContain('$staff-gold-ink');
    expect(page).toContain('$staff-gold-soft');
  });

  it('有类别筛选，按类别字典 id 聚合并带 category 请求', () => {
    expect(page).toContain('类别');
    expect(page).toContain('全部类别');
    expect(page).toContain('categoryOptions');
    expect(page).toContain('selectedCategory');
    expect(page).toContain('collectCategories');
    expect(page).toContain('category: selectedCategory.value');
    // 收入类别没有字典 id，不能混进支出类别筛选
    expect(page).toContain('item.categoryId');
  });

  it('每行写明账户名与类别名（都用后端给的显示名）', () => {
    expect(page).toContain('entry.payerAccountLabel');
    expect(page).toContain('entry-account');
    expect(page).toContain('entry.categoryLabel');
    // 类别标签跟着类别字典改名走，页面不再自己维护 code → 中文
    expect(page).not.toContain('CATEGORY_LABELS');
    expect(page).not.toContain('公司账户');
  });

  it('空态一句话 + 回财务首页', () => {
    expect(page).toContain('还没有收支记录');
    expect(page).toContain('回财务首页');
    expect(page).toContain('/pages/staff-finance/index');
  });

  it('金额带正负，日期和类别标签都在一行里', () => {
    expect(page).toContain('formatMoney');
    expect(page).toContain('occurredAt');
    expect(page).toContain('entry.categoryLabel');
    expect(page).toContain('formatDate');
  });

  it('API 层封装 listEntries 并支持账户筛选', () => {
    expect(api).toContain('listEntries');
    expect(api).toContain("url: '/admin/finance/entries'");
    expect(api).toContain('FinanceEntriesPage');
    // 后端筛选参数是 account（不再是 payerType）
    expect(api).toContain('account?: FinanceAccountCode');
    // 明细行的字段与新后端一致
    const entryType =
      api.match(/export interface FinanceEntry \{[\s\S]*?\n\}/)?.[0] || '';
    for (const field of [
      'categoryId',
      'categoryLabel',
      'payerAccount',
      'payerAccountLabel',
    ]) {
      expect(entryType).toContain(field);
    }
  });

  it('首页三个大数可点，带 query 进明细', () => {
    // 收入/支出带 direction；结余不带，进去就是全部
    expect(home).toContain("openEntries('INCOME')");
    expect(home).toContain("openEntries('EXPENSE')");
    expect(home).toContain("goEntries()");
    expect(home).toContain('uni.navigateTo');

    // 完整月份必须把 month 一起带上，否则明细和首页月报对不上
    const openBlock = home.match(/function openEntries[\s\S]*?\n\}/)?.[0] || '';
    expect(openBlock).toContain('isFullMonth.value');
    expect(openBlock).toContain('month=${activeView.value}');
    expect(openBlock).toContain('direction=${direction}');
    expect(openBlock).toContain('/pages/staff-finance/entries${query}');
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
