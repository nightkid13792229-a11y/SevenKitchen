import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('消息页 · 异常与未读一致性（2026-10-26）', () => {
  const page = read('src/pages/messages/index.vue');
  const template = page.slice(0, page.indexOf('<script setup'));
  const api = read('src/api/messages.ts');

  it('★ 首次/下拉/加载更多都有失败状态和重试，不再冒充空列表', () => {
    expect(template).toContain('消息加载失败');
    expect(template).toContain('重新加载');
    expect(template).toContain('loadError');
    expect(template).toContain('加载失败，点击重试');
    expect(page).toContain('try {');
    expect(page).toContain('await loadFirstPage();');
    expect(page).toContain('uni.stopPullDownRefresh();');
    expect(page).toContain('} finally {');
  });

  it('★「全部已读」只有接口成功才清本地', () => {
    expect(page).toContain('if (readingAll.value) return');
    expect(page).toContain('await markAllMessagesRead();');
    expect(page).not.toContain('.catch(() => 0)');
    expect(page).not.toContain('changed >= 0');
    expect(page).toContain("'全部已读失败，请重试'");
  });

  it('★ 登录失效立刻切登录态', () => {
    expect(page).toContain('AUTH_EXPIRED_EVENT');
    expect(page).toContain('uni.$on(AUTH_EXPIRED_EVENT, handleAuthExpired)');
    expect(page).toContain('uni.$off(AUTH_EXPIRED_EVENT, handleAuthExpired)');
    expect(page).toContain('function handleAuthExpired');
  });

  it('★ 从其他页面返回重拉第一页，未读数和列表一致', () => {
    expect(page).toContain('hasShownOnce');
    expect(page).toContain('void loadFirstPage();');
    expect(page).toContain('if (!hasShownOnce)');
  });

  it('★ 加载更多有锁、去重和失败重试', () => {
    expect(page).toContain('loadingMore');
    expect(page).toContain('loadMoreError');
    expect(page).toContain('new Set(messages.value.map((item) => item.id))');
    expect(page).toContain('offset.value += result.items.length');
  });

  it('★ 未读数失败保留旧值，不再归零', () => {
    expect(api).toContain('fetchUnreadMessageCountStrict');
    expect(page).toContain('fetchUnreadMessageCountStrict');
    expect(page).toContain('console.warn(\'[Messages] 刷新未读数失败:\'');
    // catch 里不能调用 store 归零
    const refreshBlock = page.slice(
      page.indexOf('async function refreshUnread'),
      page.indexOf('async function loadFirstPage'),
    );
    const catchBlock = refreshBlock.slice(refreshBlock.indexOf('catch (error)'));
    expect(catchBlock).toContain('console.warn');
    expect(catchBlock).not.toContain('storeUnreadMessageCount(0)');
  });

  it('★ 单条已读失败回滚，物流链接带订单号', () => {
    expect(page).toContain('previousUnread');
    expect(page).toContain('已读状态未保存');
    expect(page).toContain('item.read = false');
    expect(page).toContain('/pages/order-shipping-notice/index?orderId=${id}');
  });
});
