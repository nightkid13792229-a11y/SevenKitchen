/**
 * 站内消息中心 · API（2026-10-18）
 *
 * 三个接口：列表 / 未读数 / 标记已读。
 *
 * ⚠️ **所有接口都不接受 customerId 参数** —— 后端从 token 取。
 * 消息是私密的，接受前端传 id 等于改个数字就能看别人的。
 */

import { request } from '@/utils/api';

export type MessageCategory = 'DELIVERY' | 'AFTERSALE' | 'SHIPPING' | 'SYSTEM';

export interface CustomerMessage {
  id: string;
  category: string;
  title: string;
  body: string;
  linkType: string | null;
  linkId: string | null;
  read: boolean;
  createdAt: string;
}

export interface MessageListResult {
  total: number;
  hasMore: boolean;
  items: CustomerMessage[];
}

/** 消息列表。`category` 为空表示"全部" */
export async function fetchMessages(params: {
  category?: string | null;
  limit?: number;
  offset?: number;
}): Promise<MessageListResult> {
  const res = await request({
    url: '/messages',
    method: 'GET',
    data: {
      ...(params.category ? { category: params.category } : {}),
      ...(params.limit ? { limit: params.limit } : {}),
      ...(params.offset ? { offset: params.offset } : {}),
    },
    quiet: true,
  } as any);
  return (
    (res?.data as MessageListResult) || { total: 0, hasMore: false, items: [] }
  );
}

/**
 * 未读数严格版：失败会抛错。
 *
 * 消息页需要知道“失败”而不是把 0 当成真实未读；首页/「我的」可以
 * 继续用下面的宽松版（失败静默 0，不让红点接口影响主页面）。
 */
export async function fetchUnreadMessageCountStrict(): Promise<number> {
  const res = await request({
    url: '/messages/unread-count',
    method: 'GET',
    quiet: true,
    suppressErrorToast: true,
  } as any);
  const count = Number((res?.data as any)?.count);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/** 未读数（首页铃铛 / 我的红点） */
export async function fetchUnreadMessageCount(): Promise<number> {
  try {
    return await fetchUnreadMessageCountStrict();
  } catch (error) {
    // 红点拿不到不该打扰顾客 —— 静默返回 0
    console.warn('[Messages] 读取未读数失败:', error);
    return 0;
  }
}

/** 标记一条已读 */
export async function markMessageRead(id: string): Promise<boolean> {
  const res = await request({
    url: `/messages/${encodeURIComponent(id)}/read`,
    method: 'POST',
    quiet: true,
    suppressErrorToast: true,
  } as any);
  return Boolean((res?.data as any)?.changed);
}

/** 全部已读 */
export async function markAllMessagesRead(): Promise<number> {
  const res = await request({
    url: '/messages/read-all',
    method: 'POST',
    quiet: true,
    suppressErrorToast: true,
  } as any);
  return Number((res?.data as any)?.changed) || 0;
}
