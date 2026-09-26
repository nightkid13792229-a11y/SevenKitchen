/**
 * 定制食谱订单 · 微信支付
 *
 * 与补剂订单同一套流程：发起支付 → 调起微信支付 → 同步支付结果。
 * 支付通道未配置（或用户没有微信身份）时返回 MANUAL，
 * 由页面降级为「加微信客服人工付款」，订单本身照常成立。
 */

import { request } from './api';

export type CustomRecipePayParams = {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
};

export type CustomRecipePayOutcome =
  /** 已支付成功 */
  | 'PAID'
  /** 支付通道不可用，已转为人工确认收款 */
  | 'MANUAL'
  /** 用户在微信支付面板取消了 */
  | 'CANCELLED'
  /** 订单已关闭（超时自动关单等） */
  | 'CLOSED'
  /** 其它失败（网络等） */
  | 'FAILED';

/** 发起微信支付，拿小程序调起支付所需参数 */
export function payCustomRecipeOrder(orderId: string) {
  return request<{
    status: string;
    amountTotal: number;
    payParams: CustomRecipePayParams | null;
  }>({
    url: `/custom-recipe/orders/${encodeURIComponent(orderId)}/pay`,
    method: 'POST',
    quiet: true,
  } as any);
}

/** 主动查询支付结果（回调丢失时兜底） */
export function syncCustomRecipePayment(orderId: string) {
  return request<{ status: string; paid: boolean; tradeState: string | null }>({
    url: `/custom-recipe/orders/${encodeURIComponent(orderId)}/sync-payment`,
    method: 'POST',
    quiet: true,
  } as any);
}

export async function runCustomRecipePayment(
  orderId: string,
): Promise<CustomRecipePayOutcome> {
  let payParams: CustomRecipePayParams | null = null;

  try {
    const payRes = await payCustomRecipeOrder(orderId);
    if (payRes.code !== 0 || !payRes.data) {
      return 'MANUAL';
    }
    if (payRes.data.status === 'PAID') {
      return 'PAID';
    }
    if (payRes.data.status === 'CANCELLED') {
      return 'CLOSED';
    }
    payParams = payRes.data.payParams;
  } catch (error: any) {
    // 订单已关闭：不要再引导用户去加客服付款
    const message = String(error?.message || '');
    if (message.includes('已关闭') || message.includes('超过支付时间')) {
      return 'CLOSED';
    }
    // 支付未启用、配置不全、缺少微信身份等：走人工确认收款，不影响订单成立
    console.warn('[CustomRecipePayment] 发起微信支付失败，降级为人工确认:', error);
    return 'MANUAL';
  }

  if (!payParams) {
    return 'MANUAL';
  }

  const payResult = await new Promise<CustomRecipePayOutcome>((resolve) => {
    uni.requestPayment({
      provider: 'wxpay',
      timeStamp: payParams!.timeStamp,
      nonceStr: payParams!.nonceStr,
      package: payParams!.package,
      signType: payParams!.signType as any,
      paySign: payParams!.paySign,
      success: () => resolve('PAID'),
      fail: (err: any) => {
        const message = String(err && err.errMsg ? err.errMsg : '');
        resolve(message.includes('cancel') ? 'CANCELLED' : 'FAILED');
      },
    } as any);
  });

  if (payResult !== 'PAID') {
    return payResult;
  }

  // 微信回调可能延迟，主动同步一次做兜底
  try {
    await syncCustomRecipePayment(orderId);
  } catch (error) {
    console.warn('[CustomRecipePayment] 支付结果同步失败，等待回调:', error);
  }

  return 'PAID';
}
