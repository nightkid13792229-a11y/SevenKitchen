import { request } from "./api";

const CURRENT_APP_ID_FALLBACK = "wx92924e25093f8f18";
const PHONE_BIND_SKIP_ROUTES = new Set([
  "pages/login/index",
  "pages/phone-bind/index",
  "pages/profile-setup/index",
]);

/**
 * 购买链路上"延后绑定手机号"的页面。
 *
 * 首单路径修剪（2026-09-18）：登录弹窗里的强制绑手机已移除，
 * 但 App.onShow 这里还有一道 showCancel:false 的强制弹窗。
 * 如果它发生在顾客刚进订购页、还没看到价格的时候，就是一次无谓的打断。
 *
 * 这些页面属于"顾客正在做购买决策"的过程，手机号在这时并不被需要；
 * 真正需要它的是结算页——那里由 ensurePhoneBound() 强制，跑不掉。
 * 因此在这些页面不弹，把这一步后移到结算。
 */
const PHONE_BIND_DEFER_ROUTES = new Set([
  "pages/recipe-detail/index",
  "pages/recipe-order/index",
  "pages/recipe-diy/index",
  "pages/diy-sheet/index",
]);
let phoneBindPrompting = false;

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
    const stored = uni.getStorageSync("user") || uni.getStorageSync("userInfo");
    if (!stored) return null;
    return typeof stored === "string" ? JSON.parse(stored) : stored;
  } catch (error) {
    return null;
  }
}

export function isStoredPhoneBound(): boolean {
  const user = getStoredUser();
  return !!user?.phone || user?.phoneBound === true;
}

function isAccountMissingPhone(user: any): boolean {
  if (!user) return false;
  return !user.phone && user.phoneBound !== true;
}

function getCurrentRoute(): string {
  try {
    const pages = getCurrentPages();
    const current = pages[pages.length - 1] as any;
    return current?.route || "";
  } catch (error) {
    return "";
  }
}

export function getCurrentPagePathWithQuery(): string {
  try {
    const pages = getCurrentPages();
    const current = pages[pages.length - 1] as any;
    if (!current) return "/pages/home/index";
    const route = current.route?.startsWith("/")
      ? current.route
      : `/${current.route || "pages/home/index"}`;
    const options = current.options || {};
    const query = Object.keys(options)
      .map(
        (key) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(options[key])}`,
      )
      .join("&");
    return query ? `${route}?${query}` : route;
  } catch (error) {
    return "/pages/home/index";
  }
}

export async function ensurePhoneBound(): Promise<boolean> {
  if (!uni.getStorageSync("token")) {
    uni.navigateTo({ url: "/pages/login/index" });
    return false;
  }

  if (isStoredPhoneBound()) {
    return true;
  }

  try {
    const response = await request({
      url: "/users/me",
      method: "GET",
      quiet: true,
      suppressErrorToast: true,
    });
    const user = response.data;
    if (user) {
      uni.setStorageSync("user", user);
    }
    if (user?.phone || user?.phoneBound) {
      return true;
    }
  } catch (error) {
    console.warn("[Account] Failed to refresh user before phone check:", error);
  }

  const redirect = encodeURIComponent(getCurrentPagePathWithQuery());
  uni.navigateTo({ url: `/pages/phone-bind/index?redirect=${redirect}` });
  return false;
}

export async function promptPhoneBindingIfNeeded(): Promise<boolean> {
  if (phoneBindPrompting) return false;
  if (!uni.getStorageSync("token")) return false;

  const currentRoute = getCurrentRoute();
  if (PHONE_BIND_SKIP_ROUTES.has(currentRoute)) {
    return false;
  }
  // 购买链路进行中：把绑手机后移到结算页，不在这里打断
  if (PHONE_BIND_DEFER_ROUTES.has(currentRoute)) {
    return false;
  }

  let user = getStoredUser();
  if (user && !isAccountMissingPhone(user)) {
    return false;
  }

  try {
    const response = await request({
      url: "/users/me",
      method: "GET",
      quiet: true,
      suppressErrorToast: true,
    });
    if (response.data) {
      user = response.data;
      uni.setStorageSync("user", user);
    }
  } catch (error) {
    console.warn(
      "[Account] Failed to refresh user before phone prompt:",
      error,
    );
    return false;
  }

  if (!isAccountMissingPhone(user)) {
    return false;
  }

  const redirect = encodeURIComponent(getCurrentPagePathWithQuery());
  phoneBindPrompting = true;
  uni.showModal({
    title: "手机号快捷登录",
    content:
      "手机号仅用于账号识别、历史资料同步、订单履约和售后服务。完成后可同步旧版资料，并继续使用下单、支付、订单和售后功能。",
    showCancel: false,
    confirmText: "继续",
    success: () => {
      uni.navigateTo({
        url: `/pages/phone-bind/index?redirect=${redirect}`,
        complete: () => {
          setTimeout(() => {
            phoneBindPrompting = false;
          }, 800);
        },
      });
    },
    fail: () => {
      phoneBindPrompting = false;
    },
  });

  return true;
}
