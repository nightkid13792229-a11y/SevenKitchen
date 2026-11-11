/**
 * 单笔发货的提交（2026-11-11）。
 *
 * 鲜食单和补剂单的发货接口不一样，但**做完的事一模一样**：
 *   1. 调各自后台的「发货」接口（正常发货要带单号/承运商/运费，自用单不用）；
 *   2. 正常发货再把物流信息上报微信 —— 不上报的话，顾客微信里的订单
 *      会一直停在「待发货」，钱也一直冻着。
 *
 * 这段以前在鲜食发货抽屉里写死了一份、补剂详情页没有；
 * 现在收成一份，两个入口共用，补剂因此也拿到了微信同步。
 */

import { request } from '../utils/api';
import { staffSupplementOrderApi } from './staff-supplement-orders';

export type StaffShipKind = 'food' | 'supplement';

export interface StaffShipPayload {
  shippingType: 'NORMAL' | 'NOT_REQUIRED';
  trackingNumber?: string;
  carrierCode?: string;
  actualShippingFee?: number;
}

/** 微信发货信息同步的结果：成功 / 失败 / 不用同步（自用单） */
export type WechatShipSync = 'ok' | 'failed' | 'skipped';

export interface StaffShipResult {
  wechat: WechatShipSync;
  /** 失败/跳过时给一句可读的原因，页面只在需要时展示 */
  wechatMessage?: string;
}

/**
 * 提交一笔发货。失败一律抛错（页面统一 toast error.message）。
 *
 * @param kind 鲜食单还是补剂单，决定走哪个后台接口
 * @param orderId 订单 id（不是订单号）
 */
export async function submitStaffShipment(
  kind: StaffShipKind,
  orderId: string,
  payload: StaffShipPayload,
): Promise<StaffShipResult> {
  // 硬锁（2026-11-10）：服务端必须能查到「这个号对着这单收货人核过」。
  // 2026-11-11 复审后改成默认强制，这里声明只是保持老接口兼容。
  const data = {
    ...payload,
    ...(payload.shippingType === 'NORMAL' ? { enforceWaybillCheck: true } : {}),
  };

  if (kind === 'supplement') {
    const response = await staffSupplementOrderApi.ship(orderId, data as any);
    if (response.code !== 0) {
      throw new Error(response.message || '发货失败');
    }
    if (payload.shippingType === 'NOT_REQUIRED') {
      return { wechat: 'skipped' };
    }
    /**
     * 补剂单的微信上报由后台在发货那一刻做完（2026-11-11），
     * 结果跟着响应回来 —— 不再单独发一次请求，避免把微信那次「重新发货」机会用掉。
     */
    const upload = (response.data as any)?.wechatShippingUpload as
      | { success?: boolean; skipped?: boolean; message?: string }
      | undefined;
    if (upload) {
      if (upload.success === false) {
        return { wechat: 'failed', wechatMessage: upload.message };
      }
      return { wechat: upload.skipped ? 'skipped' : 'ok' };
    }
    /**
     * 后台没带这个字段（老版本 / 降级）：**不许**在这里补一次上报 ——
     * 补剂单没有「已上报」标记，重复调会用掉微信唯一一次重新发货的机会；
     * 而且上报接口对查不到的 id 只是返回 skipped 不报错，会变成「假成功」。
     * 宁可如实说没同步，让员工去后台补。
     */
    return {
      wechat: 'failed',
      wechatMessage: '后台没有返回微信同步结果，请到网页后台补同步',
    };
  } else {
    await request({
      url: `/admin/orders/${orderId}/ship`,
      method: 'POST',
      data,
    });
  }

  if (payload.shippingType === 'NOT_REQUIRED') {
    return { wechat: 'skipped' };
  }

  try {
    await request({
      url: `/staff/shipping/orders/${orderId}/wechat-shipping-upload`,
      method: 'POST',
      suppressErrorToast: true,
    });
    return { wechat: 'ok' };
  } catch (error: any) {
    return {
      wechat: 'failed',
      wechatMessage: error?.message || '微信发货信息同步失败',
    };
  }
}
