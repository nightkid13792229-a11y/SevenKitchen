import { request } from "./api";

export const LEGACY_APP_ID = "wx2c1e8f1a2d7c2406";
export const NEW_MINIAPP_APP_ID = "wx92924e25093f8f18";
export const NEW_MINIAPP_HOME_PATH = "pages/home/index";
export const NEW_MINIAPP_MIGRATION_PATH = "pages/migration/index";
export const NEW_MINIAPP_NAME = "赛文的食堂";

const ORDER_BLOCKED_ROUTES = new Set([
  "pages/cart/index",
  "pages/checkout/index",
  "pages/order-config/index",
  "pages/recipe-order/index",
]);

let routeGuarding = false;

export function isLegacyOrderBlockedRoute(route?: string): boolean {
  if (!route) return false;
  return ORDER_BLOCKED_ROUTES.has(route.replace(/^\//, ""));
}

export function getCurrentRoute(): string {
  try {
    const pages = getCurrentPages();
    const current = pages[pages.length - 1] as any;
    return current?.route || "";
  } catch (error) {
    return "";
  }
}

export function openNewMiniProgram(): Promise<void> {
  return Promise.reject(
    new Error("旧版小程序暂不支持自动打开新版，请手动搜索新版小程序"),
  );
}

export function copyNewMiniappName() {
  uni.setClipboardData({
    data: NEW_MINIAPP_NAME,
    success: () => {
      uni.showToast({ title: "已复制新版名称", icon: "success" });
    },
  });
}

export function openLegacyMigrationEntry(): void {
  uni.setStorageSync("legacyMigrationOverlayRequested", Date.now());
  uni.switchTab({ url: "/pages/home/index" });
}

export function isLegacyMigrationConfirmed(user: any): boolean {
  if (hasNoSyncableLegacyData(user)) {
    return false;
  }
  return (
    user?.legacyMigrationCompleted === true ||
    user?.legacyMigrationStatus === "CONFIRMED" ||
    user?.legacyMigration?.completed === true ||
    user?.legacyMigration?.status === "CONFIRMED"
  );
}

export function hasNoSyncableLegacyData(user: any): boolean {
  return (
    user?.legacyMigration?.noSyncableData === true ||
    user?.legacyMigration?.outcome === "NO_LEGACY_DATA"
  );
}

export async function refreshLegacyMigrationState(): Promise<any | null> {
  if (!uni.getStorageSync("token")) {
    return null;
  }

  const response = await request({
    url: "/auth/migration/legacy-status",
    method: "GET",
    quiet: true,
    suppressErrorToast: true,
  });
  const legacyMigration = response.data;
  if (!legacyMigration) {
    return null;
  }

  try {
    const storedUser = uni.getStorageSync("user") || {};
    const user =
      typeof storedUser === "string" ? JSON.parse(storedUser) : storedUser;
    uni.setStorageSync("user", {
      ...user,
      legacyMigrationStatus: legacyMigration.status,
      legacyMigrationCompleted: legacyMigration.completed === true,
      noSyncableLegacyData: legacyMigration.noSyncableData === true,
      legacyMigration,
    });
  } catch (error) {
    console.warn("Failed to cache legacy migration status:", error);
  }

  return legacyMigration;
}

export function showNoLegacyDataPrompt(): Promise<void> {
  return new Promise((resolve) => {
    uni.showModal({
      title: "未发现旧版资料",
      content: `系统没有在旧版账号中发现可同步的历史资料。请在微信搜索“${NEW_MINIAPP_NAME}”继续使用新版小程序。`,
      confirmText: "复制名称",
      cancelText: "知道了",
      success: (res) => {
        if (res.confirm) copyNewMiniappName();
      },
      complete: () => resolve(),
    });
  });
}

export function showMigrationCompletedPrompt(): Promise<void> {
  return new Promise((resolve) => {
    uni.showModal({
      title: "资料已同步完成",
      content: `你的旧版资料已经同步到新版小程序。请在微信搜索“${NEW_MINIAPP_NAME}”继续使用。`,
      confirmText: "复制名称",
      cancelText: "知道了",
      success: (res) => {
        if (res.confirm) copyNewMiniappName();
      },
      complete: () => resolve(),
    });
  });
}

export async function promptOpenNewMiniProgram(
  content = "旧版小程序仅保留资料迁移入口。请先填写迁移手机号，再到新版小程序完成授权确认。",
): Promise<void> {
  return new Promise((resolve) => {
    uni.showModal({
      title: "先完成迁移确认",
      content,
      confirmText: "去迁移",
      cancelText: "稍后",
      success: async (res) => {
        if (!res.confirm) return;
        openLegacyMigrationEntry();
      },
      complete: () => resolve(),
    });
  });
}

export async function promptLegacyMigrationStatusIfNeeded(
  user?: any,
): Promise<void> {
  let legacyMigration = user?.legacyMigration || null;
  if (!legacyMigration && (user?.phone || user?.phoneBound)) {
    try {
      legacyMigration = await refreshLegacyMigrationState();
    } catch (error) {
      console.warn("Failed to refresh legacy migration status:", error);
    }
  }

  if (isLegacyMigrationConfirmed({ ...user, legacyMigration })) {
    await showMigrationCompletedPrompt();
    return;
  }
  if (hasNoSyncableLegacyData({ ...user, legacyMigration })) {
    await showNoLegacyDataPrompt();
    return;
  }

  await promptOpenNewMiniProgram(
    "旧版小程序后续仅作为资料迁移入口。请先填写迁移手机号，再到新版小程序授权同一个手机号并确认同步。",
  );
}

export function blockLegacyOrdering(action = "相关功能"): void {
  uni.setStorageSync("legacyMigrationOverlayRequested", Date.now());
}

export function guardLegacyOrderingRoute(): boolean {
  const route = getCurrentRoute();
  if (!isLegacyOrderBlockedRoute(route) || routeGuarding) {
    return false;
  }

  routeGuarding = true;
  blockLegacyOrdering("旧版相关页面");
  setTimeout(() => {
    uni.switchTab({
      url: "/pages/home/index",
      complete: () => {
        routeGuarding = false;
      },
    });
  }, 300);

  return true;
}

export function shouldShowMigrationPrompt(user: any): boolean {
  if (!user || user.role === "STAFF" || user.role === "ADMIN") {
    return false;
  }
  return !!user.phone || user.phoneBound === true;
}
