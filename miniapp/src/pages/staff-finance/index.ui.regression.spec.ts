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

describe('财务首页', () => {
  const page = read('./index.vue');
  const api = read('../../api/staff-finance.ts');
  const pagesJson = read('../../pages.json');
  const workbench = read('../staff-workbench/index.vue');

  it('首屏是「你赚了」而不是「我花了」', () => {
    expect(page).toContain('这个月到现在，你赚了');
    expect(page).toContain('结余');
    expect(page).not.toContain('我花了');
  });

  it('固定费用按月份口径说明，为 0 时引导去生成', () => {
    expect(page).toContain('该月已含固定费用');
    expect(page).toContain('本月已含固定费用');
    expect(page).toContain('本月固定费用还没生成');
    expect(page).toContain('= 收入 − 支出，固定费用还没生成');
    expect(page).toContain('heroCaption');
    // 不能再出现「已含本月固定费用 ¥0」这种和上面「已扣房租工资」打架的写法
    expect(page).not.toContain('已含本月固定费用');
    // 2026-11-19 起汇总按类别字典出数，没有枚举 code，按种子类别名识别
    for (const label of ['房租', '水电', '宽带', '工资', '社保', '税费']) {
      expect(page).toContain(label);
    }
    expect(page).not.toContain('SOCIAL_INSURANCE');
  });

  it('负结余用深绿底上读得清的浅红警示，并给一句人话', () => {
    expect(page).toContain('balanceNegative');
    expect(page).toContain('hero-amount--negative');
    expect(page).toContain('这个月花得比收得多，先看房租和工资那几笔是不是漏录');

    const warningRed = page.match(
      /\$staff-danger-on-brand:\s*(#[0-9a-fA-F]{6})/,
    )?.[1];
    expect(warningRed).toBeTruthy();
    // 深绿主卡 #1E3A2F 上的浅红，正文级别必须 ≥ 4.5:1
    expect(contrast(warningRed!, '#1e3a2f')).toBeGreaterThanOrEqual(4.5);
  });

  it('月份 chip 触控高度达到员工端规范的 88rpx', () => {
    const chipRule = page.match(/\.chip\s*\{[^}]*\}/)?.[0] || '';
    expect(chipRule).toContain('min-height: 88rpx');
    expect(chipRule).toContain('padding: 0 28rpx');
  });

  it('历史订单退款单独列示，为 0 时不显示', () => {
    expect(page).toContain('historicalRefundTotal');
    expect(page).toContain('v-if="historicalRefundTotal > 0"');
    expect(page).toContain('其中历史订单退款');
    expect(page).toContain('¥{{ formatMoney(historicalRefundTotal) }}');
    expect(page).toContain('（起账日前的单）');

    // 深绿主卡上的金色：$staff-gold-ink 对 #1E3A2F 只有 2:1，
    // 按警示红的先例另取浅金，小号文字必须 ≥ 4.5:1
    const refundGold = page.match(
      /\$staff-gold-on-brand:\s*(#[0-9a-fA-F]{6})/,
    )?.[1];
    expect(refundGold).toBeTruthy();
    expect(contrast(refundGold!, '#1e3a2f')).toBeGreaterThanOrEqual(4.5);
  });

  it('有待确认线下收款的提醒入口', () => {
    expect(page).toContain('线下收款待确认');
    expect(page).toContain('pendingOfflineConfirmCount');
    // 旧 /pages/staff-orders/index 已下线，入口指向订单中心
    expect(page).toContain('/pages/staff-order-center/index');
  });

  it('钱花在哪：按金额取前 7 类，其余合并成一条「其他」', () => {
    expect(page).toContain('钱花在哪');
    expect(page).toContain('categories.length > 7');
    // 前 7 类保留，第 8 类起合并（「其他」只是显示层聚合，不是记账类别）
    expect(page).toContain('categories.slice(0, 7)');
    expect(page).toContain('categories.slice(7)');
    expect(page).toContain('OTHER_MERGED');
    expect(page).toContain("label: '其他'");
  });

  it('汇总元素是 {categoryId,label,amount}，不再读枚举 code', () => {
    const bars = page.match(/const spendBars[\s\S]*?\n\}\)/)?.[0] || '';
    expect(bars).toContain('row.categoryId');
    expect(bars).toContain('row.label');
    expect(bars).not.toContain('key: row.category,');
    const api = read('../../api/staff-finance.ts');
    const amountType =
      api.match(/export interface FinanceExpenseCategoryAmount[\s\S]*?\n\}/)?.[0] ||
      '';
    for (const field of ['categoryId', 'label', 'amount']) {
      expect(amountType).toContain(field);
    }
  });

  it('有记一笔与固定费用两个入口', () => {
    expect(page).toContain('记一笔');
    expect(page).toContain('/pages/staff-finance/manual-entry');
    expect(page).toContain('固定费用');
    expect(page).toContain('/pages/staff-finance/bills');
    expect(page).toContain('查看全部收支明细');
    expect(page).toContain('/pages/staff-finance/entries');
  });

  it('切到完整月份就是月报，并给出与上月的对比', () => {
    expect(page).toContain('完整月份');
    expect(page).toContain('比上月');
    expect(page).toContain('月起账');
    expect(page).toContain('previousDashboard');
  });

  it('onShow 重新拉数，失败有错误态和重试，不白屏', () => {
    expect(page).toContain('onShow');
    expect(page).toContain('重试');
    expect(page).toContain('财务数据加载失败');
    expect(page).toContain('skeleton');
  });

  it('非 ADMIN 直接输地址先拦下，不发请求', () => {
    expect(page).toContain("getStoredUser()?.role !== 'ADMIN'");
    expect(page).toContain('权限不足');
    expect(page).toContain('navigateBack');
    expect(page).toContain("url: '/pages/staff-workbench/index'");

    const onShowBlock = page.match(/onShow\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || '';
    expect(onShowBlock).toContain('getStoredUser()');
    expect(onShowBlock).toContain('load()');
    expect(
      onShowBlock.indexOf("getStoredUser()?.role !== 'ADMIN'"),
    ).toBeLessThan(onShowBlock.indexOf('load()'));
  });

  it('API 层封装 dashboard 并解包统一响应', () => {
    expect(api).toContain('staffFinanceApi');
    expect(api).toContain('getDashboard');
    expect(api).toContain("url: '/admin/finance/dashboard'");
    expect(api).toContain('requestData');
  });

  it('分包注册财务首页', () => {
    expect(pagesJson).toContain('"root": "pages/staff-finance"');
    expect(pagesJson).toContain('"navigationBarTitleText": "财务"');
  });

  it('工作台财务入口只给 ADMIN 显示', () => {
    expect(workbench).toContain("getStoredUser()?.role === 'ADMIN'");
    expect(workbench).toContain("title: '财务'");
    // 财务不再和报销共用 reimbursement 图标
    expect(workbench).toContain("icon: '/static/ui-icons/orders.png'");
    expect(workbench).toContain("url: '/pages/staff-finance/index'");
  });
});
