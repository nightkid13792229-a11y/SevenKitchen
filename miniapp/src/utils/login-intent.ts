/**
 * 登录意图（pending login intent）
 *
 * 背景：顾客在食谱详情页点「买成品」-> 提示登录 -> 如果选择「暂不登录，先逛逛」，
 * 原来的实现在跳回首页后就把"想买"的意图丢了，等下次登录只能落到首页。
 *
 * 这里把目标页暂存起来，下次登录成功后自动续上（避免顾客重新走一遍找食谱的路径）。
 * 与客服的 pending target 机制思路一致，但用途独立，因此单独存放。
 */

const PENDING_LOGIN_REDIRECT_KEY = 'pending_login_redirect';
/** 24 小时有效，避免很久以后登录被跳到一个陈旧的页面 */
const PENDING_LOGIN_REDIRECT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PendingLoginRedirect {
  url: string;
  createdAt: number;
}

/** 记录一个待续上的登录后跳转目标 */
export function setPendingLoginRedirect(url: string): void {
  const target = String(url || '').trim();
  if (!target) return;
  try {
    uni.setStorageSync(PENDING_LOGIN_REDIRECT_KEY, {
      url: target,
      createdAt: Date.now(),
    } satisfies PendingLoginRedirect);
  } catch (error) {
    console.warn('[LoginIntent] Failed to persist pending redirect:', error);
  }
}

/** 读取并清除待续上的登录后跳转目标（一次性） */
export function consumePendingLoginRedirect(): string {
  try {
    const pending = uni.getStorageSync(PENDING_LOGIN_REDIRECT_KEY) as
      | PendingLoginRedirect
      | undefined;
    if (!pending?.url || !pending?.createdAt) return '';

    uni.removeStorageSync(PENDING_LOGIN_REDIRECT_KEY);

    if (Date.now() - Number(pending.createdAt) > PENDING_LOGIN_REDIRECT_MAX_AGE_MS) {
      return '';
    }
    return String(pending.url);
  } catch (error) {
    console.warn('[LoginIntent] Failed to read pending redirect:', error);
    return '';
  }
}

/** 清除待续上的登录意图（例如用户主动放弃） */
export function clearPendingLoginRedirect(): void {
  try {
    uni.removeStorageSync(PENDING_LOGIN_REDIRECT_KEY);
  } catch (error) {
    console.warn('[LoginIntent] Failed to clear pending redirect:', error);
  }
}
