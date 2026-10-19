/**
 * 底部「我的」红点的共享缓存（2026-10-19）。
 *
 * 自定义 tabBar 是原生组件，不能直接 import 页面里的 ref；
 * 页面拿到未读数后写入 storage，tabBar 在 show/refresh 时读取。
 */
export const UNREAD_MESSAGE_COUNT_KEY = 'unread_message_count';

export function storeUnreadMessageCount(value: unknown): number {
  const count = Number(value);
  const normalized = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  try {
    uni.setStorageSync(UNREAD_MESSAGE_COUNT_KEY, normalized);
  } catch {
    // storage 失败不阻塞页面；tabBar 最多不显示红点
  }
  return normalized;
}

export function readUnreadMessageCount(): number {
  try {
    const count = Number(uni.getStorageSync(UNREAD_MESSAGE_COUNT_KEY));
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  } catch {
    return 0;
  }
}
