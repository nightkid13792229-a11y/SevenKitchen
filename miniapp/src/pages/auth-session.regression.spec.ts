import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

/**
 * 冷启动登录态（2026-10-25 修）
 *
 * 现象：体验版进入首页先弹 2 秒「请先登录」，首页登录 Banner 不出来；
 * 切到「我的」也显示未登录并再弹一次；返回首页 Banner 才出现。
 *
 * 根因：本地存着失效 token，页面先把它当成已登录；受保护接口 401 后
 * API 层清 token，但页面的本地 isLoggedIn 没跟着变，等下一次 onShow 才更新。
 */
describe('冷启动登录态 · 401 立即同步页面', () => {
  const api = read('src/utils/api.ts');
  const app = read('src/App.vue');
  const home = read('src/pages/home/index.vue');
  const me = read('src/pages/me/index.vue');
  const designerApi = read('src/api/recipe-designer.ts');

  it('API 层 401 清 token 后广播 auth:expired', () => {
    expect(api).toContain("export const AUTH_EXPIRED_EVENT = 'auth:expired'");
    expect(api).toContain('uni.$emit');
    expect(api).toContain('AUTH_EXPIRED_EVENT');
  });

  it('冷启动先静默校验 token，不再只判断“有没有 token”', () => {
    expect(app).toContain("url: \"/users/me\"");
    expect(app).toContain('suppressErrorToast: true');
    expect(app).toContain('markTokenReady');
  });

  it('首页订阅 401 事件，立即显示登录 Banner，并静默 /dogs', () => {
    expect(home).toContain('AUTH_EXPIRED_EVENT');
    expect(home).toContain('uni.$on(AUTH_EXPIRED_EVENT, handleAuthExpired)');
    expect(home).toContain('uni.$off(AUTH_EXPIRED_EVENT, handleAuthExpired)');
    expect(home).toContain('handleAuthExpired');
    expect(home).toContain('suppressErrorToast: true');
  });

  it('我的页订阅 401 事件，且没有 token 时不打受保护接口', () => {
    expect(me).toContain('AUTH_EXPIRED_EVENT');
    expect(me).toContain('uni.$on(AUTH_EXPIRED_EVENT, handleAuthExpired)');
    expect(me).toContain('uni.$off(AUTH_EXPIRED_EVENT, handleAuthExpired)');
    // onShow 里先取 token，再决定是否 loadUserInfo / designer access
    const onShow = me.slice(me.indexOf('onShow(() => {'));
    const tokenIndex = onShow.indexOf('const token = getToken()');
    const userInfoIndex = onShow.indexOf('loadUserInfo()');
    const designerIndex = onShow.indexOf('loadRecipeDesignerEntry()');
    expect(tokenIndex).toBeGreaterThan(-1);
    expect(userInfoIndex).toBeGreaterThan(tokenIndex);
    expect(designerIndex).toBeGreaterThan(tokenIndex);
    expect(me).toContain('suppressErrorToast: true');
  });

  it('设计器入口读取失败不弹登录 toast', () => {
    expect(designerApi).toContain("url: '/recipe-designer/customer-access'");
    expect(designerApi).toContain('suppressErrorToast: true');
  });
});
