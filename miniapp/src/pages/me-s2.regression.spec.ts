import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('我的页 · 订单汇总/登录/清理（2026-10-25）', () => {
  const page = read('src/pages/me/index.vue');
  const template = page.slice(0, page.indexOf('<script setup'));

  it('★「已完成」进入 COMPLETED，不再用不存在的 RECEIVED', () => {
    expect(template).toContain("goToOrders('COMPLETED')");
    expect(template).not.toContain("goToOrders('RECEIVED')");
  });

  it('★ 三类订单汇总走 /orders/summary，总数和五个角标同一份数据', () => {
    expect(page).toContain('url: "/orders/summary"');
    expect(page).toContain('loadOrderSummary');
    expect(page).toContain('orderSummaryTotal');
    expect(page).toContain('orderSummaryLoaded');
    expect(page).toContain('orderSummaryError');
    expect(page).not.toContain('loadOrderCounts');
    expect(template).toContain('我的订单');
    expect(template).toContain('totalOrderCount');
  });

  it('★ 网络失败不把有 token 的用户踢成未登录，给资料重试', () => {
    expect(page).toContain('isLoggedIn = ref(Boolean(getToken()))');
    expect(page).toContain('profileLoadFailed');
    expect(page).toContain('retryLoadUserInfo');
    expect(page).toContain('isAuthError');
    expect(page).toContain('isInitialLoad');
  });

  it('★ 退出/401/测试模式恢复失败都清干净账号痕迹', () => {
    expect(page).toContain('function clearUserSessionState');
    expect(page).toContain('handleAuthExpired');
    expect(page).toContain('clearUserSessionState();');
    expect(page).toContain('testIdentityPanelVisible && canUseTestIdentityPanel()');
    expect(page).toContain('unreadMessageCount.value = storeUnreadMessageCount(0)');
    expect(page).toContain('resetRecipeDesignerEntry()');
    expect(page).toContain('uni.navigateTo({ url: "/pages/login/index" })');
  });

  it('★ 资料/汇总请求有先后保护，旧响应不覆盖新状态', () => {
    expect(page).toContain('profileRequestSeq');
    expect(page).toContain('summaryRequestSeq');
    expect(page).toContain('seq !== profileRequestSeq');
    expect(page).toContain('seq !== summaryRequestSeq');
  });
});
