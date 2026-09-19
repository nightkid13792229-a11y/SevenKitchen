/**
 * 成品鲜食链路 · 转化漏斗埋点
 *
 * 背景（2026-09-18）：小程序此前只有狗狗档案的事件埋点，成品链路上一个都没有，
 * 导致「首页 → 详情 → 点买成品 → 登录 → 建档 → 订购页 → 结算 → 支付」
 * 每一步流失多少完全靠猜。
 *
 * 设计原则：
 *   1. **绝不影响主流程**：上报失败只记 console，不 toast、不重试、不阻塞跳转；
 *   2. 允许匿名：登录前的浏览与点击同样采集，否则漏斗前半段永远是空的；
 *   3. 用 sessionId 把「匿名段」和「登录后」串成同一条漏斗。
 */

import { request } from './api';

const FUNNEL_SESSION_KEY = 'funnel_session_id';

export interface FunnelEventPayload {
  /** 事件名，建议用 动词_对象，如 tap_buy / price_ready */
  eventName: string;
  /** 步骤名，便于按顺序统计流失 */
  step?: string;
  recipeId?: string | null;
  dogId?: string | null;
  orderId?: string | null;
  entrySource?: string | null;
  properties?: Record<string, any>;
}

/** 会话内稳定的标识：用于把匿名访问与登录后的行为串起来 */
function getSessionId(): string {
  try {
    const existing = uni.getStorageSync(FUNNEL_SESSION_KEY);
    if (existing && typeof existing === 'string') return existing;

    const generated = `fs_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    uni.setStorageSync(FUNNEL_SESSION_KEY, generated);
    return generated;
  } catch (error) {
    return '';
  }
}

/**
 * 上报一个漏斗事件（fire-and-forget）。
 * 调用方不需要 await，也不需要处理失败。
 */
export function trackFunnelEvent(payload: FunnelEventPayload): void {
  try {
    void request({
      url: '/analytics/funnel/events',
      method: 'POST',
      data: {
        eventName: payload.eventName,
        step: payload.step,
        sessionId: getSessionId(),
        recipeId: payload.recipeId || undefined,
        dogId: payload.dogId || undefined,
        orderId: payload.orderId || undefined,
        entrySource: payload.entrySource || undefined,
        properties: payload.properties,
      },
      quiet: true,
      suppressErrorToast: true,
    }).catch(() => {
      /* 埋点失败不影响业务 */
    });
  } catch (error) {
    console.warn('[Funnel] track failed:', error);
  }
}
