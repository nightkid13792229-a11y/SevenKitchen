import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');

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

  it('有固定费用整月计入的说明', () => {
    expect(page).toContain('已含本月固定费用');
    expect(page).toContain('RENT');
    expect(page).toContain('PAYROLL');
    expect(page).toContain('SOCIAL_INSURANCE');
    expect(page).toContain('TAX');
  });

  it('有待确认线下收款的提醒入口', () => {
    expect(page).toContain('线下收款待确认');
    expect(page).toContain('pendingOfflineConfirmCount');
    // 旧 /pages/staff-orders/index 已下线，入口指向订单中心
    expect(page).toContain('/pages/staff-order-center/index');
  });

  it('有钱花在哪和最多 7 类的合并规则', () => {
    expect(page).toContain('钱花在哪');
    expect(page).toContain('categories.length > 7');
    expect(page).toContain('OTHER_MERGED');
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
    expect(workbench).toContain("icon: '/static/ui-icons/reimbursement.png'");
    expect(workbench).toContain("url: '/pages/staff-finance/index'");
  });
});
