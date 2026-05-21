import { request } from './api';

const CURRENT_APP_ID_FALLBACK = 'wx92924e25093f8f18';

export function getCurrentMiniProgramAppId(): string {
  try {
    const accountInfo = uni.getAccountInfoSync?.();
    return accountInfo?.miniProgram?.appId || CURRENT_APP_ID_FALLBACK;
  } catch (error) {
    return CURRENT_APP_ID_FALLBACK;
  }
}

export function getStoredUser(): any | null {
  try {
    const stored = uni.getStorageSync('user') || uni.getStorageSync('userInfo');
    if (!stored) return null;
    return typeof stored === 'string' ? JSON.parse(stored) : stored;
  } catch (error) {
    return null;
  }
}

export function isStoredPhoneBound(): boolean {
  const user = getStoredUser();
  return !!user?.phone || user?.phoneBound === true;
}

export function getCurrentPagePathWithQuery(): string {
  try {
    const pages = getCurrentPages();
    const current = pages[pages.length - 1] as any;
    if (!current) return '/pages/home/index';
    const route = current.route?.startsWith('/')
      ? current.route
      : `/${current.route || 'pages/home/index'}`;
    const options = current.options || {};
    const query = Object.keys(options)
      .map(
        (key) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(options[key])}`,
      )
      .join('&');
    return query ? `${route}?${query}` : route;
  } catch (error) {
    return '/pages/home/index';
  }
}

export async function ensurePhoneBound(): Promise<boolean> {
  if (!uni.getStorageSync('token')) {
    uni.navigateTo({ url: '/pages/login/index' });
    return false;
  }

  if (isStoredPhoneBound()) {
    return true;
  }

  try {
    const response = await request({
      url: '/users/me',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    });
    const user = response.data;
    if (user) {
      uni.setStorageSync('user', user);
    }
    if (user?.phone || user?.phoneBound) {
      return true;
    }
  } catch (error) {
    console.warn('[Account] Failed to refresh user before phone check:', error);
  }

  const redirect = encodeURIComponent(getCurrentPagePathWithQuery());
  uni.navigateTo({ url: `/pages/phone-bind/index?redirect=${redirect}` });
  return false;
}
