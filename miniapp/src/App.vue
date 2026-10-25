<template>
  <view id="app">
    <!-- Uni-app root -->
  </view>
</template>

<script setup lang="ts">
import { onLaunch, onShow } from "@dcloudio/uni-app";
import { getToken, markTokenReady, request } from "./utils/api";
import { setBaseUrl } from "./utils/config";
import { migrateLegacyDevBaseUrl } from "./utils/runtime-base-url";

const CUSTOMER_SERVICE_PENDING_TARGET_KEY = "customer_service_pending_target";
const CUSTOMER_SERVICE_PENDING_TARGET_MAX_AGE_MS = 10 * 60 * 1000;
const CUSTOMER_SERVICE_PENDING_TARGET_COOLDOWN_MS = 8 * 1000;

/**
 * 冷启动的第一轮 onShow 不处理客服待跳转。
 *
 * 待跳转只应该用于"用户在 App 内向客服发消息 → 去微信聊天 → 返回小程序"
 * 这个前后台切换场景。若冷启动也处理，历史遗留 target 会让用户
 * "打开小程序 → 首页一闪 → 自动进订单页"（2026-10-20 线上问题）。
 */
let hasShownOnce = false;

function getCurrentRouteWithQuery(): string {
  try {
    const pages = getCurrentPages();
    const current = pages[pages.length - 1] as any;
    if (!current?.route) return "";
    const options = current.options || {};
    const query = Object.keys(options)
      .filter((key) => options[key] !== undefined && options[key] !== null && options[key] !== "")
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(options[key]))}`)
      .join("&");
    return `/${current.route}${query ? `?${query}` : ""}`;
  } catch (error) {
    return "";
  }
}

/**
 * 客服卡片历史数据里，定制订单也可能被写成通用订单详情路径
 * （/pages/order-detail/index?id=CR...）。通用页只认商品订单，
 * 打开就是空白；这里统一改到定制订单详情。
 */
function normalizeCustomerServiceTarget(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const [rawPath, rawQuery = ""] = raw.split("?");
  if (rawPath !== "/pages/order-detail/index") return raw;
  const match = rawQuery.match(/(?:^|&)id=([^&]+)/);
  const orderId = match ? decodeURIComponent(match[1]) : "";
  if (!String(orderId).startsWith('CR')) return raw;
  return `/pages/custom-recipe/order-detail?orderId=${encodeURIComponent(orderId)}`;
}

function navigateCustomerServicePendingTarget() {
  try {
    const pending = uni.getStorageSync(CUSTOMER_SERVICE_PENDING_TARGET_KEY);
    if (!pending?.url || !pending?.createdAt) return;

    const now = Date.now();
    if (now - Number(pending.createdAt) > CUSTOMER_SERVICE_PENDING_TARGET_MAX_AGE_MS) {
      uni.removeStorageSync(CUSTOMER_SERVICE_PENDING_TARGET_KEY);
      return;
    }

    if (now - Number(pending.lastHandledAt || 0) < CUSTOMER_SERVICE_PENDING_TARGET_COOLDOWN_MS) {
      return;
    }

    const targetUrl = normalizeCustomerServiceTarget(String(pending.url || ""));
    if (!targetUrl) {
      uni.removeStorageSync(CUSTOMER_SERVICE_PENDING_TARGET_KEY);
      return;
    }
    if (getCurrentRouteWithQuery() === targetUrl) {
      uni.removeStorageSync(CUSTOMER_SERVICE_PENDING_TARGET_KEY);
      return;
    }

    /**
     * 一次性消费：读取后立刻删掉。
     * 以前只更新 lastHandledAt、不删除，导致每次 onShow/冷启动都会再跳一次，
     * 目标页失效时看起来就是"首页一闪 → 空白订单页"（2026-10-20 修）。
     */
    uni.removeStorageSync(CUSTOMER_SERVICE_PENDING_TARGET_KEY);

    setTimeout(() => {
      uni.navigateTo({
        url: targetUrl,
        fail: (error) => {
          console.warn("[App] customer service pending target navigation failed:", error);
        },
      });
    }, 350);
  } catch (error) {
    console.warn("[App] customer service pending target check failed:", error);
  }
}

onLaunch(() => {
  try {
    const deviceInfo = uni.getDeviceInfo();
    const platformLower = deviceInfo?.platform?.toLowerCase() || "";

    // Auto-fix: Migrate legacy local dev ports in storage
    const storedBaseUrl = uni.getStorageSync("api_base_url");
    if (storedBaseUrl) {
      const migratedBaseUrl = migrateLegacyDevBaseUrl(storedBaseUrl);
      if (migratedBaseUrl && migratedBaseUrl !== storedBaseUrl) {
        setBaseUrl(migratedBaseUrl);
      }
    }

    // Auto-configure for real device debugging: use production URL
    // 如果是真机调试模式，且Storage中没有配置baseUrl，自动设置生产环境URL
    const isRealDevice = platformLower === "android" || platformLower === "ios";
    if (isRealDevice && !uni.getStorageSync("api_base_url")) {
      const prodUrl = "https://api.sevenkitchen.cloud/api/v1";
      setBaseUrl(prodUrl);
    }
  } catch (err) {
    console.warn("Failed to prepare startup config:", err);
  }

  /**
   * 游客模式：不自动登录，但**要校验本地 token 是否还有效**。
   *
   * 之前只判断“有没有 token”，过期/失效 token 会被首页和我的页当成已登录，
   * 它们再各自打受保护接口 → 401 → 弹“请先登录”，页面状态却要等到
   * 下一次 onShow 才更新（首页 Banner 因此一直不出来）。
   *
   * 这里用一次静默的 /users/me 校验：401 时 API 层会清 token 并广播
   * `auth:expired`；请求本身不弹错误 toast，登录态由页面的登录界面表达。
   */
  const token = getToken();
  if (token) {
    void request({
      url: "/users/me",
      method: "GET",
      quiet: true,
      suppressErrorToast: true,
    }).catch(() => undefined);
  }
  // 无论有没有 token 都标记 ready，让页面可以正常加载
  markTokenReady();
});

onShow(() => {
  if (!hasShownOnce) {
    hasShownOnce = true;
    // 冷启动先丢弃上一次会话遗留的客服待跳转，避免自动跳空白页
    uni.removeStorageSync(CUSTOMER_SERVICE_PENDING_TARGET_KEY);
    return;
  }
  navigateCustomerServicePendingTarget();

  // 这里原本会调用 promptPhoneBindingIfNeeded()：任何页面、每次从后台切回小程序，
  // 都会强制弹出手机号绑定（且不允许取消）。但手机号在下单与支付中都不是必需的
  // （微信支付靠账号身份取 openid，物流面单用收货地址里的收货人电话），
  // 因此改为「只在真正需要的那一刻」按需强制，见结算页提交订单时。
});
</script>

<style>
/* App全局样式 */
/* SevenKitchen 设计规范（高级质感风 · 深墨绿 + 金色）
   所有页面统一从这里取色，后续页面改造沿用同一套变量 */
page {
  --sk-bg: #f0f3e9;             /* 页面背景：淡草绿米色 */
  --sk-surface: #fbfcf7;        /* 卡片表面：微绿白 */
  --sk-primary: #1e3a2f;        /* 主色：深墨绿 */
  --sk-primary-strong: #24493a; /* 主色亮阶（渐变用） */
  --sk-primary-deep: #14291f;   /* 主色暗阶（渐变用） */
  --sk-primary-tint: #eef3ea;   /* 主色浅底 */
  --sk-gold: #b08d4f;           /* 点缀金 */
  --sk-gold-bright: #d8bc85;    /* 亮金（深绿底上使用） */
  /* 图标规则：深绿容器上的图形用金色，浅色表面上的图形用墨绿 */
  --sk-gold-soft: #f6efe0;      /* 金浅底 */
  --sk-ink: #26261f;            /* 主文字 */
  --sk-ink-2: #6b6653;          /* 次要文字：暖绿灰 */
  --sk-ink-3: #968f6d;          /* 弱文字：暖金灰 */
  --sk-line: #e3e6d4;           /* 分隔线：暖绿 */
  --sk-danger: #b4553f;         /* 警示/排除色 */
  --sk-danger-soft: #f7e9e3;    /* 警示浅底 */
  --sk-radius-card: 28rpx;      /* 卡片圆角 */
  --sk-radius-badge: 12rpx;     /* 小徽章/小容器圆角 */
  --sk-radius-pill: 999rpx;     /* 胶囊圆角（标签/按钮/头像） */
  background-color: var(--sk-bg, #f0f3e9);
  font-size: 14px;
}

button {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
  margin: 0;
}

button::after {
  border: none;
}
</style>
