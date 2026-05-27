<template>
  <view id="app">
    <!-- Uni-app root -->
  </view>
</template>

<script setup lang="ts">
import { onLaunch, onShow } from "@dcloudio/uni-app";
import { getToken, markTokenReady } from "./utils/api";
import { promptPhoneBindingIfNeeded } from "./utils/account";
import { setBaseUrl } from "./utils/config";
import { migrateLegacyDevBaseUrl } from "./utils/runtime-base-url";

const CUSTOMER_SERVICE_PENDING_TARGET_KEY = "customer_service_pending_target";
const CUSTOMER_SERVICE_PENDING_TARGET_MAX_AGE_MS = 10 * 60 * 1000;
const CUSTOMER_SERVICE_PENDING_TARGET_COOLDOWN_MS = 8 * 1000;

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

    const targetUrl = String(pending.url || "");
    if (!targetUrl || getCurrentRouteWithQuery() === targetUrl) return;

    uni.setStorageSync(CUSTOMER_SERVICE_PENDING_TARGET_KEY, {
      ...pending,
      lastHandledAt: now,
    });

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

  // 游客模式：不再自动登录
  // 只检查是否有token，不执行登录逻辑
  const token = getToken();
  if (token) {
    markTokenReady();
  } else {
    // 即使没有token也标记为ready，让页面可以正常加载
    markTokenReady();
  }
});

onShow(() => {
  navigateCustomerServicePendingTarget();

  setTimeout(() => {
    promptPhoneBindingIfNeeded();
  }, 500);
});
</script>

<style>
/* App全局样式 */
page {
  background-color: #f5f5f5;
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
